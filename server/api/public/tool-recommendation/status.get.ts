import { isRecommendationAvailable } from '../../../contexts/tool-recommendation'
import { getTenantSettings } from '../../../utils/tenant-settings'
import { getSeededTenantId } from '../../../utils/tenant'
import { TENANT_TIME_ZONE, createToolRecommendationDeps } from '../../../utils/tool-recommendation-deps'

// S-01 (D-64; #214): whether to show the "describe your job" input at all.
// Off when no key is configured, the model has no known price, the cap is
// 0, or this month's cap is reached — the filters always remain. A read:
// nothing about the Visitor is recorded.
export default defineEventHandler(async (event) => {
  const { sql, repo, model, configured } = createToolRecommendationDeps(event)
  if (!configured) return { available: false }
  const tenantId = await getSeededTenantId(sql)
  const settings = await getTenantSettings(sql, tenantId)
  const available = await isRecommendationAvailable(repo, {
    tenantId,
    configured,
    model,
    monthlyCap: settings.recommendationMonthlyCap,
    timeZone: TENANT_TIME_ZONE,
  })
  return { available }
})
