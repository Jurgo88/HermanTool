// Job-run ledger (D-41, Part 4 §16.2; issue #74/IR-06). Not owned by any
// bounded context -- it is platform housekeeping, not a domain event
// (Part 2's catalogue does not carry it, nothing reacts to it) -- so it
// lives here rather than inside server/contexts/*, mirroring
// ./overdue-noshow-views.ts's own "composition-root concern, not one
// context's" placement.
import type postgres from 'postgres'
import type { TenantId } from '../contexts/_shared'

// The closed set of scheduled jobs, matching every internal endpoint
// that exists today plus 'database_backup' (D-32, IR-04 -- not built
// yet, pre-added so that issue doesn't need a second migration).
export type JobName =
  | 'expiry_sweep'
  | 'evidence_erasure'
  | 'pickup_reminder_dispatch'
  | 'return_reminder_dispatch'
  | 'overdue_reminder_dispatch'
  | 'database_backup'

export type JobOutcome = 'success' | 'failure'

export interface JobRun {
  id: number
  tenantId: TenantId
  jobName: JobName
  startedAt: Date
  finishedAt: Date
  outcome: JobOutcome
  processedCount: number
  errorMessage: string | null
}

export interface JobRunStatus {
  jobName: JobName
  latestRun: JobRun | null
  latestSuccessfulRun: JobRun | null
}

interface JobRunRow {
  id: number
  tenant_id: string
  job_name: JobName
  started_at: Date
  finished_at: Date
  outcome: JobOutcome
  processed_count: number
  error_message: string | null
}

function mapJobRun(row: JobRunRow): JobRun {
  return {
    id: row.id,
    tenantId: row.tenant_id as TenantId,
    jobName: row.job_name,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    outcome: row.outcome,
    processedCount: row.processed_count,
    errorMessage: row.error_message,
  }
}

async function recordJobRun(
  sql: postgres.Sql,
  params: {
    tenantId: TenantId
    jobName: JobName
    startedAt: Date
    finishedAt: Date
    outcome: JobOutcome
    processedCount: number
    errorMessage: string | null
  },
): Promise<void> {
  await sql`
    insert into job_runs (
      tenant_id, job_name, started_at, finished_at, outcome, processed_count, error_message
    ) values (
      ${params.tenantId}, ${params.jobName}, ${params.startedAt}, ${params.finishedAt},
      ${params.outcome}, ${params.processedCount}, ${params.errorMessage}
    )
  `
}

// Wraps a scheduled job's own work so that EVERY invocation writes a
// ledger row, success or failure -- a job that throws is exactly the
// silent-failure case D-41 exists to close, so recording only successes
// would miss it. Rethrows after recording: the HTTP response (500) and
// GitHub Actions' own run history are unaffected by this -- the ledger
// is a second, owner-visible signal alongside them (D-29's Sentry Crons
// is a third, once IR-05 lands).
export async function runScheduledJob<T>(
  sql: postgres.Sql,
  params: { tenantId: TenantId; jobName: JobName },
  fn: () => Promise<{ processedCount: number; result: T }>,
): Promise<T> {
  const startedAt = new Date()
  try {
    const { processedCount, result } = await fn()
    await recordJobRun(sql, {
      tenantId: params.tenantId,
      jobName: params.jobName,
      startedAt,
      finishedAt: new Date(),
      outcome: 'success',
      processedCount,
      errorMessage: null,
    })
    return result
  } catch (err) {
    await recordJobRun(sql, {
      tenantId: params.tenantId,
      jobName: params.jobName,
      startedAt,
      finishedAt: new Date(),
      outcome: 'failure',
      processedCount: 0,
      errorMessage: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}

const ALL_JOB_NAMES: JobName[] = [
  'expiry_sweep',
  'evidence_erasure',
  'pickup_reminder_dispatch',
  'return_reminder_dispatch',
  'overdue_reminder_dispatch',
  'database_backup',
]

// FR-40/FR-44: one entry per known job, even one that has never run
// (both fields null) -- the owner should see "never run" as clearly as
// a stale date, not have the job silently absent from the page.
export async function getJobRunStatuses(sql: postgres.Sql, tenantId: TenantId): Promise<JobRunStatus[]> {
  const [latestRows, latestSuccessRows] = await Promise.all([
    sql<JobRunRow[]>`
      select distinct on (job_name) *
      from job_runs
      where tenant_id = ${tenantId}
      order by job_name, started_at desc
    `,
    sql<JobRunRow[]>`
      select distinct on (job_name) *
      from job_runs
      where tenant_id = ${tenantId} and outcome = 'success'
      order by job_name, started_at desc
    `,
  ])

  const latestByJob = new Map(latestRows.map((row) => [row.job_name, mapJobRun(row)]))
  const latestSuccessByJob = new Map(latestSuccessRows.map((row) => [row.job_name, mapJobRun(row)]))

  return ALL_JOB_NAMES.map((jobName) => ({
    jobName,
    latestRun: latestByJob.get(jobName) ?? null,
    latestSuccessfulRun: latestSuccessByJob.get(jobName) ?? null,
  }))
}
