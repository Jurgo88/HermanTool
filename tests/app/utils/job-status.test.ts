import { describe, expect, it } from 'vitest'
import { failureHint, jobHealth } from '../../../app/utils/job-status'

const run = (outcome: 'success' | 'failure', errorMessage: string | null = null) => ({ outcome, errorMessage })

describe('jobHealth (S-21)', () => {
  it('reads the latest run', () => {
    expect(jobHealth({ jobName: 'expiry_sweep', latestRun: run('success') })).toBe('ok')
    expect(jobHealth({ jobName: 'expiry_sweep', latestRun: run('failure') })).toBe('failing')
    expect(jobHealth({ jobName: 'expiry_sweep', latestRun: null })).toBe('never')
  })
})

describe('failureHint (S-21: map the error, never show it)', () => {
  it('names the missing e-mail key', () => {
    const status = {
      jobName: 'pickup_reminder_dispatch',
      latestRun: run('failure', 'Missing API key. Pass it to the constructor `new Resend("re_123")`'),
    }
    expect(failureHint(status)).toBe('missingEmailKey')
  })

  it('names missing job configuration', () => {
    const status = { jobName: 'database_backup', latestRun: run('failure', 'Missing required environment variable: DATABASE_URL') }
    expect(failureHint(status)).toBe('missingJobConfig')
  })

  it('treats a backup that never ran as not configured, other never-run jobs as nothing', () => {
    expect(failureHint({ jobName: 'database_backup', latestRun: null })).toBe('backupNotConfigured')
    expect(failureHint({ jobName: 'expiry_sweep', latestRun: null })).toBeNull()
  })

  it('falls back to a general hint, and to none when the job works', () => {
    expect(failureHint({ jobName: 'expiry_sweep', latestRun: run('failure', 'connection reset') })).toBe('unknown')
    expect(failureHint({ jobName: 'expiry_sweep', latestRun: run('success') })).toBeNull()
  })
})
