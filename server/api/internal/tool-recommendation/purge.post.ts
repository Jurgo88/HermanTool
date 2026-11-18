import { purgeExpiredRecommendationRecords } from '../../../contexts/tool-recommendation'
import { requireInternalJobSecret } from '../../../utils/internal-job-session'
import { runScheduledJob } from '../../../utils/job-run-ledger'
import { getSeededTenantId } from '../../../utils/tenant'
import { createToolRecommendationDeps, utcDayOf } from '../../../utils/tool-recommendation-deps'

// D-64, D-41, FR-40 (#214): called daily by GitHub Actions
// (.github/workflows/purge-tool-recommendation-records.yml), never by a
// human. Deletes stored Visitor questions older than 90 days, visitor
// calls older than 24 hours and every earlier UTC day's HMAC secret.
// Recorded in the job-run ledger like every scheduled job.
export default defineEventHandler(async (event) => {
  requireInternalJobSecret(event)
  const { sql, repo } = createToolRecommendationDeps(event)
  const tenantId = await getSeededTenantId(sql)
  return runScheduledJob(sql, { tenantId, jobName: 'tool_recommendation_purge' }, async () => {
    const now = new Date()
    const purged = await purgeExpiredRecommendationRecords(repo, { tenantId, now, utcDay: utcDayOf(now) })
    return {
      processedCount: purged.questions + purged.visitorCalls + purged.visitorSecrets,
      result: purged,
    }
  })
})
