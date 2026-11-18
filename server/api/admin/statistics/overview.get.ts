import { todayRentalDay } from '../../../contexts/availability-reservation'
import { getStatisticsOverview } from '../../../contexts/utilisation-reporting'
import { requireOperator } from '../../../utils/operator-session'
import { createStatisticsDeps } from '../../../utils/statistics-deps'

// S-25 overview (D-63, FR-28, D-38, P6; issue #211): read-only, scoped to
// the signed-in Operator's Tenant (FR-33). "Today" is the Tenant's local
// day from Availability & Reservation, never the browser's (D-51).
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const { source } = createStatisticsDeps(event)
  return getStatisticsOverview(source, { tenantId: operator.tenantId, today: todayRentalDay() })
})
