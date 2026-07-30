import { resolveCustomerAccessLink } from '../../../contexts/customer-identity-compliance'
import { createAvailabilityReservationDeps } from '../../../utils/availability-reservation-deps'
import {
  createCustomerIdentityComplianceDeps,
  customerAccessLinkNotFoundError,
  getCustomerAccessTokenParam,
} from '../../../utils/customer-identity-compliance-deps'
import { getSeededTenantId } from '../../../utils/tenant'

// D-23, FR-39, issue #31: "view the booking" — the first of exactly two
// capabilities this token grants (the other is submitting
// IdentityEvidence, see ./[token]/identity-evidence.post.ts). No
// Operator/Customer session — the token itself is the credential (D-14:
// no accounts). Composes Availability & Reservation directly at this
// route (D-02) — the same pattern
// server/api/handover/customers/[customerId]/identity-evidence.post.ts
// already uses for its own cross-context read.
export default defineEventHandler(async (event) => {
  const token = getCustomerAccessTokenParam(event)
  const customerIdentity = createCustomerIdentityComplianceDeps(event)
  const availability = createAvailabilityReservationDeps(event)

  try {
    const tenantId = await getSeededTenantId(customerIdentity.sql)

    const link = await resolveCustomerAccessLink(customerIdentity.repo, { tenantId, token })
    if (!link) customerAccessLinkNotFoundError()

    const customer = await customerIdentity.repo.getCustomer(tenantId, link.customerId)
    // Unreachable via FK integrity — kept as a checked invariant.
    if (!customer) customerAccessLinkNotFoundError()

    const reservations = await availability.repo.listReservationsForGroup(tenantId, customer.reservationGroupId)

    // FR-39's own scope: "view the booking" — never internal fields, and
    // never anything from IdentityEvidence (NFR-06: this token cannot
    // read evidence back).
    return {
      customer: { name: customer.name },
      reservations: reservations.map((r) => ({
        id: r.id,
        assetTypeId: r.assetTypeId,
        period: r.period,
        state: r.state,
      })),
    }
  } finally {
    await Promise.all([customerIdentity.close(), availability.close()])
  }
})
