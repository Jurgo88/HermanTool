import { checkoutReservationGroup } from '../../contexts/availability-reservation'
import { createCustomer, CustomerIdentityComplianceError } from '../../contexts/customer-identity-compliance'
import {
  createAvailabilityReservationDeps,
  translateAvailabilityReservationError,
} from '../../utils/availability-reservation-deps'
import { checkoutReservationGroupBodySchema } from '../../utils/availability-reservation-validation'
import { issueCheckoutGroupCookie } from '../../utils/checkout-session'
import {
  createCustomerIdentityComplianceDeps,
  translateCustomerIdentityComplianceError,
} from '../../utils/customer-identity-compliance-deps'
import { getSeededTenantId } from '../../utils/tenant'

// W1, FR-06, D-14: entry point of the checkout flow — public, no
// Operator/Customer session (D-14: Customer has no account). Issues the
// httpOnly cookie (server/utils/checkout-session.ts) that scopes the
// rest of this browser's pre-payment flow (accept-terms,
// checkout-session) to the ReservationGroup just created.
//
// Composes Availability & Reservation and Customer Identity & Compliance
// at this route only — neither context imports the other (D-02). D-14's
// "the Visitor becomes a Customer" happens here because checkout
// commitment is the earliest point (and, per D-23, the only guaranteed
// one) the platform has an address to reach the Customer at.
//
// Not wrapped in one cross-context transaction: if createCustomer fails
// after checkoutReservationGroup succeeds (e.g. a malformed email slips
// past validation), the Pending hold is left in place rather than rolled
// back — it releases itself via the ordinary D-25/FR-08 expiry sweep,
// the same outcome as any other abandoned checkout (P1: the record
// diverges, the product corrects it, no saga machinery for a pilot at
// NFR-04's scale).
export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, checkoutReservationGroupBodySchema.parse)
  const availability = createAvailabilityReservationDeps(event)
  const customerIdentity = createCustomerIdentityComplianceDeps(event)

  try {
    const tenantId = await getSeededTenantId(availability.sql)
    const { group, reservations } = await checkoutReservationGroup(availability.repo, { tenantId, lines: body.lines })
    const customer = await createCustomer(customerIdentity.repo, {
      tenantId,
      reservationGroupId: group.id,
      ...body.customer,
    })

    issueCheckoutGroupCookie(event, group.id)
    return { reservationGroupId: group.id, reservations, customer: { id: customer.id } }
  } catch (err) {
    if (err instanceof CustomerIdentityComplianceError) translateCustomerIdentityComplianceError(err)
    translateAvailabilityReservationError(err)
  } finally {
    await Promise.all([availability.close(), customerIdentity.close()])
  }
})
