#!/usr/bin/env node
// Nightly backup (D-32, Part 4 §14.9; issue #72/IR-04). Runs as a
// GitHub Actions step (.github/workflows/nightly-backup.yml), not a
// Nitro route: pg_dump and a full bucket listing both risk exceeding
// R-08's 10-second synchronous cap, and a Netlify Function has no
// pg_dump binary to shell out to. This script does both halves D-32
// asks for -- pg_dump to R2, and copying any new `conditions` bucket
// object to the same backup bucket -- and records the run under D-41's
// job ledger directly (a raw insert into job_runs, mirroring
// server/utils/job-run-ledger.ts's own shape) since this process runs
// outside the Nitro app that owns that file.
//
// The `evidence` bucket is deliberately NEVER backed up here (D-27,
// NFR-07) -- a second copy of identity documents outside the retention
// clock is exactly what D-29/NFR-08 exist to prevent for Sentry, and
// the same reasoning applies to a backup bucket.
//
// Required environment variables (see
// .github/workflows/nightly-backup.yml for where they come from):
//   DATABASE_URL          -- must be the DIRECT (session-mode, port
//                            5432) connection string, NOT Supavisor's
//                            transaction pooler (port 6543) that
//                            NUXT_DATABASE_URL/SUPABASE_DB_URL use
//                            elsewhere. pg_dump needs session-level
//                            semantics (a consistent snapshot held for
//                            the whole dump) that transaction-mode
//                            pooling does not guarantee. Verify with
//                            workflow_dispatch before trusting the
//                            schedule.
//   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT
//   R2_BUCKET_CONDITIONS  -- source bucket to back up (read-only here)
//   R2_BUCKET_BACKUPS     -- destination for both the DB dump and the
//                            conditions-bucket copy
//
// Retention is NOT enforced here. OQ #3 (the backup retention horizon
// value) is unset -- CLAUDE.md's "do NOT invent defaults" for
// launch-blocking Open Questions applies exactly as it does to
// RETENTION_WINDOW_DAYS (identity-evidence.ts). Dumps and copied
// objects accumulate in R2_BUCKET_BACKUPS indefinitely until a value
// is set and a prune step is added as a follow-up: accumulating too
// much is a storage cost, deleting too early is unrecoverable data
// loss D-11 explicitly forbids risking.
import { spawn } from 'node:child_process'
import { createGzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { createWriteStream } from 'node:fs'
import { readFile, unlink } from 'node:fs/promises'
import postgres from 'postgres'
import {
  CopyObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NotFound,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'

function requireEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

const databaseUrl = requireEnv('DATABASE_URL')
const r2AccessKeyId = requireEnv('R2_ACCESS_KEY_ID')
const r2SecretAccessKey = requireEnv('R2_SECRET_ACCESS_KEY')
const r2Endpoint = requireEnv('R2_ENDPOINT')
const bucketConditions = requireEnv('R2_BUCKET_CONDITIONS')
const bucketBackups = requireEnv('R2_BUCKET_BACKUPS')

const s3 = new S3Client({
  region: 'auto',
  endpoint: r2Endpoint,
  credentials: { accessKeyId: r2AccessKeyId, secretAccessKey: r2SecretAccessKey },
})

async function dumpDatabase() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const localPath = `/tmp/db-${timestamp}.sql.gz`
  const objectKey = `db-dumps/${timestamp}.sql.gz`

  await new Promise((resolve, reject) => {
    const pgDump = spawn('pg_dump', [databaseUrl, '--no-owner', '--no-privileges'])
    let stderr = ''
    pgDump.stderr.on('data', (chunk) => {
      stderr += chunk
      process.stderr.write(chunk)
    })
    pgDump.on('error', reject)
    pipeline(pgDump.stdout, createGzip(), createWriteStream(localPath))
      .then(() => resolve())
      .catch(reject)
    pgDump.on('exit', (code) => {
      if (code !== 0) reject(new Error(`pg_dump exited with code ${code}: ${stderr}`))
    })
  })

  const body = await readFile(localPath)
  await s3.send(new PutObjectCommand({ Bucket: bucketBackups, Key: objectKey, Body: body }))
  await unlink(localPath)
  return objectKey
}

// Idempotent against re-runs: a `conditions` object already present at
// its backup key (checked via HEAD, same D-40 idiom -- cheap to check
// against the bucket that describes it) is never re-copied. Server-side
// CopyObjectCommand, not a download+re-upload -- no egress, no local
// disk use, regardless of how large the `conditions` bucket grows.
async function backupConditionsBucket() {
  let continuationToken
  let copied = 0

  do {
    const page = await s3.send(
      new ListObjectsV2Command({ Bucket: bucketConditions, ContinuationToken: continuationToken }),
    )
    for (const object of page.Contents ?? []) {
      if (!object.Key) continue
      const destKey = `conditions-backup/${object.Key}`

      const alreadyBackedUp = await s3
        .send(new HeadObjectCommand({ Bucket: bucketBackups, Key: destKey }))
        .then(() => true)
        .catch((err) => {
          if (err instanceof NotFound) return false
          throw err
        })
      if (alreadyBackedUp) continue

      await s3.send(
        new CopyObjectCommand({
          Bucket: bucketBackups,
          Key: destKey,
          CopySource: `${bucketConditions}/${encodeURIComponent(object.Key)}`,
        }),
      )
      copied++
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined
  } while (continuationToken)

  return copied
}

// Raw insert, not server/utils/job-run-ledger.ts's runScheduledJob --
// this process is not the Nitro app, and job_name='database_backup' was
// pre-added to job_runs' check constraint by migration 20260804090000
// specifically for this issue.
async function recordJobRun(sql, startedAt, { outcome, processedCount, errorMessage }) {
  const [{ id: tenantId }] = await sql`select id from tenants order by created_at limit 1`
  await sql`
    insert into job_runs (tenant_id, job_name, started_at, finished_at, outcome, processed_count, error_message)
    values (${tenantId}, 'database_backup', ${startedAt}, ${new Date()}, ${outcome}, ${processedCount}, ${errorMessage})
  `
}

async function main() {
  const startedAt = new Date()
  const sql = postgres(databaseUrl, { prepare: false })
  try {
    const dumpKey = await dumpDatabase()
    console.log(`Database dump uploaded: ${dumpKey}`)

    const copiedCount = await backupConditionsBucket()
    console.log(`Conditions bucket objects newly backed up: ${copiedCount}`)

    await recordJobRun(sql, startedAt, { outcome: 'success', processedCount: copiedCount, errorMessage: null })
  } catch (err) {
    console.error(err)
    await recordJobRun(sql, startedAt, {
      outcome: 'failure',
      processedCount: 0,
      errorMessage: err instanceof Error ? err.message : String(err),
    })
    process.exitCode = 1
  } finally {
    await sql.end()
  }
}

await main()
