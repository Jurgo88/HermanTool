import { recordTermsAcceptance } from '../../../contexts/availability-reservation'
import {
  createAvailabilityReservationDeps,
  getReservationGroupIdParam,
  translateAvailabilityReservationError,
} from '../../../utils/availability-reservation-deps'
import { acceptTermsBodySchema } from '../../../utils/availability-reservation-validation'
import { requireCheckoutGroupCookie } from '../../../utils/checkout-session'
import { getSeededTenantId } from '../../../utils/tenant'

// D-35, FR-09: records terms acceptance on the ReservationGroup before
// payment may start. Public, gated by the checkout-group cookie
// (server/utils/checkout-session.ts) rather than by an Operator/Customer
// session — this is the same browser that just ran checkout.post.ts.
export default defineEventHandler(async (event) => {
  const reservationGroupId = getReservationGroupIdParam(event)
  requireCheckoutGroupCookie(event, reservationGroupId)

  const body = await readValidatedBody(event, acceptTermsBodySchema.parse)
  const { repo, sql, close } = createAvailabilityReservationDeps(event)

  try {
    const tenantId = await getSeededTenantId(sql)
    return await recordTermsAcceptance(repo, { tenantId, reservationGroupId, termsVersion: body.termsVersion })
  } catch (err) {
    translateAvailabilityReservationError(err)
  } finally {
    await close()
  }
})
