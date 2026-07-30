import { z } from 'zod'
import { requestIdentityEvidenceUpload, resolveCustomerAccessLink } from '../../../../contexts/customer-identity-compliance'
import { createAvailabilityReservationDeps } from '../../../../utils/availability-reservation-deps'
import {
  createCustomerIdentityComplianceDeps,
  customerAccessLinkNotFoundError,
  getCustomerAccessTokenParam,
  translateCustomerIdentityComplianceError,
} from '../../../../utils/customer-identity-compliance-deps'
import { getSeededTenantId } from '../../../../utils/tenant'

const bodySchema = z.object({ contentType: z.string().min(1) })

// D-23, FR-39, D-15, FR-11, issue #31: the second (and last) capability
// this token grants — submitting IdentityEvidence, online, after payment
// (D-15). Reuses the exact same requestIdentityEvidenceUpload mechanism
// server/api/handover/customers/[customerId]/identity-evidence.post.ts
// already calls for the Operator-at-the-counter fallback channel — the
// only difference is who is holding the phone (FR-13). Currently
// unusable end-to-end regardless: OQ #2 (retention window,
// launch-blocking) makes requestIdentityEvidenceUpload refuse before
// creating anything — see identity-evidence.ts.
export default defineEventHandler(async (event) => {
  const token = getCustomerAccessTokenParam(event)
  const body = await readValidatedBody(event, bodySchema.parse)
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
    const isReservationGroupConfirmed = reservations.length > 0 && reservations.every((r) => r.state === 'confirmed')

    const { identityEvidence, uploadUrl } = await requestIdentityEvidenceUpload(
      customerIdentity.repo,
      customerIdentity.gateway,
      {
        tenantId,
        customerId: customer.id,
        reservationGroupId: customer.reservationGroupId,
        isReservationGroupConfirmed,
        contentType: body.contentType,
      },
    )

    return { identityEvidenceId: identityEvidence.id, uploadUrl }
  } catch (err) {
    translateCustomerIdentityComplianceError(err)
  } finally {
    await Promise.all([customerIdentity.close(), availability.close()])
  }
})
