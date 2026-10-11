import { createAvailabilityReservationDeps, getReservationGroupIdParam } from '../../../utils/availability-reservation-deps'
import { checkoutPaymentStatus } from '../../../utils/checkout-payment-status'
import { requireCheckoutGroupCookie } from '../../../utils/checkout-session'
import { createPaymentsDeps } from '../../../utils/payments-deps'
import { getSeededTenantId } from '../../../utils/tenant'

// #190, S-05: after the Customer leaves Stripe's page, the cancel page asks
// whether this group can still be paid. Only the browser that created the
// group (its checkout cookie) may ask; the answer names no Customer data.
export default defineEventHandler(async (event) => {
  const reservationGroupId = getReservationGroupIdParam(event)
  requireCheckoutGroupCookie(event, reservationGroupId)

  const availability = createAvailabilityReservationDeps(event)
  const payments = createPaymentsDeps(event)

  try {
    const tenantId = await getSeededTenantId(availability.sql)
    const [reservations, groupPayments] = await Promise.all([
      availability.repo.listReservationsForGroup(tenantId, reservationGroupId),
      payments.repo.listPaymentsForGroup(tenantId, reservationGroupId),
    ])
    if (reservations.length === 0) {
      throw createError({ statusCode: 404, statusMessage: 'ReservationGroup not found.' })
    }
    return checkoutPaymentStatus(reservations, groupPayments, new Date())
  } finally {
    await Promise.all([availability.close(), payments.close()])
  }
})
