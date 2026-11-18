import { todayRentalDay } from '../../../contexts/availability-reservation'
import { getRevenueByMonth } from '../../../contexts/utilisation-reporting'
import { requireOperator } from '../../../utils/operator-session'
import { createStatisticsDeps } from '../../../utils/statistics-deps'

// S-25 chart: confirmed online revenue for the last twelve months (D-63,
// P6, D-21; issue #211).
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const { source } = createStatisticsDeps(event)
  return getRevenueByMonth(source, { tenantId: operator.tenantId, today: todayRentalDay() })
})
