import { requireOperator } from '../../../utils/operator-session'
import { getTenantSettings } from '../../../utils/tenant-settings'
import { TENANT_TIME_ZONE, createToolRecommendationDeps } from '../../../utils/tool-recommendation-deps'

// S-27 (D-64; #214): this month's spend on AI recommendations next to the
// cap in force. The spend is in the provider's currency (USD) and says so;
// the cap check counts one dollar as one euro (OQ #34).
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const { sql, repo, configured, model } = createToolRecommendationDeps(event)
  const [settings, spentMicroUnits] = await Promise.all([
    getTenantSettings(sql, operator.tenantId),
    repo.sumCostThisMonth(operator.tenantId, TENANT_TIME_ZONE),
  ])
  return {
    configured,
    model,
    spent: { microUnits: spentMicroUnits, currency: 'USD' as const },
    cap: settings.recommendationMonthlyCap,
    capIsDefault: settings.recommendationCapIsDefault,
  }
})
