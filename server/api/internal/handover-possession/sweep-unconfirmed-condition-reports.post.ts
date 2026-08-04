import { sweepUnconfirmedConditionReports } from '../../../contexts/handover-possession'
import { createHandoverPossessionDeps } from '../../../utils/handover-possession-deps'
import { requireInternalJobSecret } from '../../../utils/internal-job-session'
import { runScheduledJob } from '../../../utils/job-run-ledger'
import { getSeededTenantId } from '../../../utils/tenant'

// D-40, issue #78/IR-10: called on a schedule by GitHub Actions
// (.github/workflows/sweep-unconfirmed-condition-reports.yml), never by
// a human — requireInternalJobSecret gates this, not requireOperator,
// mirroring ../reservations/sweep-expired.post.ts (FR-08) exactly.
export default defineEventHandler(async (event) => {
  requireInternalJobSecret(event)

  const { repo, conditionsGateway, sql, close } = createHandoverPossessionDeps(event)
  try {
    const tenantId = await getSeededTenantId(sql)
    return await runScheduledJob(sql, { tenantId, jobName: 'unconfirmed_condition_report_sweep' }, async () => {
      const confirmed = await sweepUnconfirmedConditionReports(repo, conditionsGateway, { tenantId })
      return { processedCount: confirmed.length, result: { confirmedCount: confirmed.length } }
    })
  } finally {
    await close()
  }
})
