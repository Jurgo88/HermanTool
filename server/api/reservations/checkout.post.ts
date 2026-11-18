import { checkoutReservationGroup } from '../../contexts/availability-reservation'
import {
  assertNoActiveOnSiteGroupForContact,
  createCustomer,
  createPostgresMarketingConsentRepository,
  recordCheckoutMarketingConsent,
  CustomerIdentityComplianceError,
} from '../../contexts/customer-identity-compliance'
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
import { MARKETING_CONSENT_TEXT_VERSION } from '#shared/marketing-consent'
import { listActiveOnSiteContacts } from '../../utils/on-site-payment'
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
    // D-65: at most one active on-site group per contact (normalised e-mail
    // or phone), checked before anything is held. FR-33: this Tenant only.
    if (body.paymentMethod === 'on_site') {
      assertNoActiveOnSiteGroupForContact(
        body.customer,
        await listActiveOnSiteContacts(availability.sql, tenantId),
      )
    }
    const { group, reservations } = await checkoutReservationGroup(availability.repo, {
      tenantId,
      lines: body.lines,
      paymentMethod: body.paymentMethod,
    })
    const customer = await createCustomer(customerIdentity.repo, {
      tenantId,
      reservationGroupId: group.id,
      ...body.customer,
    })

    // #216: recorded with the Customer, only on an explicit yes, with the
    // version of the text shown — refused if the page showed another one.
    await recordCheckoutMarketingConsent(createPostgresMarketingConsentRepository(availability.sql), {
      tenantId,
      customerId: customer.id,
      email: body.customer.email,
      consent: body.marketingConsent,
      shownVersion: body.marketingConsentVersion,
      currentVersion: MARKETING_CONSENT_TEXT_VERSION,
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
