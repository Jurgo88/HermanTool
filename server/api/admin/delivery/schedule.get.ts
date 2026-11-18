import { addRentalDays, todayRentalDay } from '../../../contexts/availability-reservation'
import { requireOperator } from '../../../utils/operator-session'
import { listScheduledLegs } from '../../../utils/delivery-schedule'
import { createLogisticsDeliveryDeps } from '../../../utils/logistics-delivery-deps'

// How far ahead the Operator's list looks. Presentation, not policy.
const SCHEDULE_DAYS_AHEAD = 14

// S-29 (D-66; #217): upcoming Deliveries and Collections per day, from
// today in the Tenant's timezone (A&R does the day arithmetic, D-12).
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const { sql } = createLogisticsDeliveryDeps(event)
  const fromDay = todayRentalDay()
  return {
    fromDay,
    legs: await listScheduledLegs(sql, {
      tenantId: operator.tenantId,
      fromDay,
      toDay: addRentalDays(fromDay, SCHEDULE_DAYS_AHEAD),
    }),
  }
})
