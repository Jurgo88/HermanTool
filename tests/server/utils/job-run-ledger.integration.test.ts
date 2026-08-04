// Integration tests for the job-run ledger
// (supabase/migrations/20260804090000_job_run_ledger.sql, D-41,
// issue #74/IR-06) against a real Postgres.
//
// Self-skips when NUXT_DATABASE_URL is not set, matching every other
// integration suite in this repo.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type postgres from 'postgres'
import { createDatabaseClient } from '../../../server/utils/db'
import type { TenantId } from '../../../server/contexts/_shared'
import { getJobRunStatuses, runScheduledJob } from '../../../server/utils/job-run-ledger'

const databaseUrl = process.env.NUXT_DATABASE_URL ?? ''

describe.skipIf(!databaseUrl)('job-run ledger (integration)', () => {
  let sql: postgres.Sql
  let tenantId: TenantId

  beforeEach(async () => {
    sql = createDatabaseClient(databaseUrl)
    await sql`truncate table job_runs restart identity cascade`

    const [{ id: seededTenantId }] = await sql<{ id: string }[]>`
      select id from tenants order by created_at limit 1
    `
    tenantId = seededTenantId as TenantId
  })

  afterEach(async () => {
    await sql?.end()
  })

  it('runScheduledJob records a success row and returns the job function\'s result', async () => {
    const result = await runScheduledJob(sql, { tenantId, jobName: 'expiry_sweep' }, async () => ({
      processedCount: 3,
      result: { sweptCount: 3 },
    }))

    expect(result).toEqual({ sweptCount: 3 })

    const rows = await sql<{ outcome: string; processed_count: number; error_message: string | null }[]>`
      select outcome, processed_count, error_message from job_runs
      where tenant_id = ${tenantId} and job_name = 'expiry_sweep'
    `
    expect(rows).toHaveLength(1)
    expect(rows[0]?.outcome).toBe('success')
    expect(rows[0]?.processed_count).toBe(3)
    expect(rows[0]?.error_message).toBeNull()
  })

  it('runScheduledJob records a failure row and rethrows -- a thrown job is not silently unrecorded (D-41)', async () => {
    await expect(
      runScheduledJob(sql, { tenantId, jobName: 'evidence_erasure' }, async () => {
        throw new Error('R2 request timed out')
      }),
    ).rejects.toThrow('R2 request timed out')

    const rows = await sql<{ outcome: string; processed_count: number; error_message: string | null }[]>`
      select outcome, processed_count, error_message from job_runs
      where tenant_id = ${tenantId} and job_name = 'evidence_erasure'
    `
    expect(rows).toHaveLength(1)
    expect(rows[0]?.outcome).toBe('failure')
    expect(rows[0]?.processed_count).toBe(0)
    expect(rows[0]?.error_message).toBe('R2 request timed out')
  })

  it('getJobRunStatuses reports a job that has never run as null/null, not absent (FR-40)', async () => {
    const statuses = await getJobRunStatuses(sql, tenantId)

    expect(statuses).toHaveLength(8)
    const backup = statuses.find((s) => s.jobName === 'database_backup')
    expect(backup?.latestRun).toBeNull()
    expect(backup?.latestSuccessfulRun).toBeNull()
  })

  it('getJobRunStatuses distinguishes the latest run from the latest SUCCESSFUL run', async () => {
    await runScheduledJob(sql, { tenantId, jobName: 'overdue_reminder_dispatch' }, async () => ({
      processedCount: 1,
      result: null,
    }))

    await expect(
      runScheduledJob(sql, { tenantId, jobName: 'overdue_reminder_dispatch' }, async () => {
        throw new Error('SMTP unreachable')
      }),
    ).rejects.toThrow()

    const statuses = await getJobRunStatuses(sql, tenantId)
    const status = statuses.find((s) => s.jobName === 'overdue_reminder_dispatch')

    // The most recent run overall is the failure...
    expect(status?.latestRun?.outcome).toBe('failure')
    // ...but the latest SUCCESSFUL run is still the earlier one, not null.
    expect(status?.latestSuccessfulRun?.outcome).toBe('success')
    expect(status?.latestSuccessfulRun?.processedCount).toBe(1)
  })
})
