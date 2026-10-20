// S-21 (D-41, FR-40, NFR-14). How the status page reads one scheduled job:
// working, failing, or never run, and — for failures this product has
// already met — which plain hint to show. The server's error text is only
// matched here, never displayed (UI rule: map, don't show).

export type JobHealth = 'ok' | 'failing' | 'never'

export type FailureHint = 'missingEmailKey' | 'missingJobConfig' | 'backupNotConfigured' | 'unknown'

export interface JobStatusLike {
  jobName: string
  latestRun: { outcome: 'success' | 'failure'; errorMessage: string | null } | null
}

export function jobHealth(status: JobStatusLike): JobHealth {
  if (!status.latestRun) return 'never'
  return status.latestRun.outcome === 'success' ? 'ok' : 'failing'
}

export function failureHint(status: JobStatusLike): FailureHint | null {
  const health = jobHealth(status)
  // The backup records itself only once it has run, so a backup that never
  // shows up is a backup whose workflow cannot start.
  if (health === 'never') return status.jobName === 'database_backup' ? 'backupNotConfigured' : null
  if (health !== 'failing') return null
  const message = status.latestRun?.errorMessage ?? ''
  if (/resend|api key/i.test(message)) return 'missingEmailKey'
  if (/environment variable|not configured|missing required/i.test(message)) return 'missingJobConfig'
  return 'unknown'
}
