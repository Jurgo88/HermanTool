import { checkoutReservationGroup } from '../../contexts/availability-reservation'
import {
  createAvailabilityReservationDeps,
  translateAvailabilityReservationError,
} from '../../utils/availability-reservation-deps'
import { checkoutReservationGroupBodySchema } from '../../utils/availability-reservation-validation'
import { issueCheckoutGroupCookie } from '../../utils/checkout-session'
import { getSeededTenantId } from '../../utils/tenant'

// W1, FR-06: entry point of the checkout flow — public, no Operator/
// Customer session (D-14: Customer has no account). Issues the httpOnly
// cookie (server/utils/checkout-session.ts) that scopes the rest of this
// browser's pre-payment flow (accept-terms, checkout-session) to the
// ReservationGroup just created.
export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, checkoutReservationGroupBodySchema.parse)
  const { repo, sql, close } = createAvailabilityReservationDeps(event)

  try {
    const tenantId = await getSeededTenantId(sql)
    const { group, reservations } = await checkoutReservationGroup(repo, { tenantId, lines: body.lines })
    issueCheckoutGroupCookie(event, group.id)
    return { reservationGroupId: group.id, reservations }
  } catch (err) {
    translateAvailabilityReservationError(err)
  } finally {
    await close()
  }
})
