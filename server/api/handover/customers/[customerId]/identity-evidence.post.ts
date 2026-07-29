import { z } from 'zod'
import { CustomerNotFoundError, requestIdentityEvidenceUpload } from '../../../../contexts/customer-identity-compliance'
import { createAvailabilityReservationDeps } from '../../../../utils/availability-reservation-deps'
import {
  createCustomerIdentityComplianceDeps,
  getCustomerIdParam,
  translateCustomerIdentityComplianceError,
} from '../../../../utils/customer-identity-compliance-deps'
import { requireOperator } from '../../../../utils/operator-session'

const bodySchema = z.object({ contentType: z.string().min(1) })

// FR-13/W3: an Operator captures IdentityEvidence at the counter as a
// fallback channel, for a Customer who paid but never uploaded online.
// Reuses the exact same requestIdentityEvidenceUpload mechanism #31's
// self-service link will call — the only difference is who is holding
// the phone. `customerId` is a route param rather than derived from a
// scan: the scan→Reservation→Customer binding is #23's job (not built
// yet), so for now an Operator identifies the Customer directly (e.g.
// by name, until #27's "today's pickups" view exists).
//
// FR-11's Confirmed-ReservationGroup check is composed here from
// Availability & Reservation's published interface — this context never
// imports it (D-02). Currently unusable end-to-end regardless: OQ #2
// (retention window, launch-blocking) makes requestIdentityEvidenceUpload
// refuse before creating anything — see identity-evidence.ts.
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const customerId = getCustomerIdParam(event)
  const body = await readValidatedBody(event, bodySchema.parse)

  const customerIdentity = createCustomerIdentityComplianceDeps(event)
  const availability = createAvailabilityReservationDeps(event)

  try {
    const customer = await customerIdentity.repo.getCustomer(operator.tenantId, customerId)
    if (!customer) throw new CustomerNotFoundError(customerId)

    const reservations = await availability.repo.listReservationsForGroup(
      operator.tenantId,
      customer.reservationGroupId,
    )
    const isReservationGroupConfirmed = reservations.length > 0 && reservations.every((r) => r.state === 'confirmed')

    const { identityEvidence, uploadUrl } = await requestIdentityEvidenceUpload(
      customerIdentity.repo,
      customerIdentity.gateway,
      {
        tenantId: operator.tenantId,
        customerId,
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
