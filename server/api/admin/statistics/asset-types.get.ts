import { getAssetTypeStatistics } from '../../../contexts/utilisation-reporting'
import { requireOperator } from '../../../utils/operator-session'
import {
  createStatisticsDeps,
  parseReportingRange,
  translateStatisticsError,
} from '../../../utils/statistics-deps'

// S-25 per-AssetType detail for a month, a year or a custom range (D-63,
// D-38, D-12; issue #211). Zod-validated range; Tenant from the session.
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const range = parseReportingRange(getQuery(event))
  const { source } = createStatisticsDeps(event)
  try {
    return await getAssetTypeStatistics(source, { tenantId: operator.tenantId, range })
  } catch (err) {
    translateStatisticsError(err)
  }
})
