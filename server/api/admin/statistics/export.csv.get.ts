import { getAssetTypeStatistics, toStatisticsCsv } from '../../../contexts/utilisation-reporting'
import { requireOperator } from '../../../utils/operator-session'
import {
  STATISTICS_CSV_HEADERS,
  createStatisticsDeps,
  parseReportingRange,
  translateStatisticsError,
} from '../../../utils/statistics-deps'

// S-25 CSV for the accountant (D-63, D-21; issue #211): the per-AssetType
// table for the chosen range, UTF-8 with BOM, amount and currency columns.
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const range = parseReportingRange(getQuery(event))
  const { source } = createStatisticsDeps(event)
  try {
    const { period, assetTypes } = await getAssetTypeStatistics(source, {
      tenantId: operator.tenantId,
      range,
    })
    setResponseHeaders(event, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="statistiky-${period.startDay}-${period.endDay}.csv"`,
      'cache-control': 'no-store',
    })
    return toStatisticsCsv(period, assetTypes, STATISTICS_CSV_HEADERS)
  } catch (err) {
    translateStatisticsError(err)
  }
})
