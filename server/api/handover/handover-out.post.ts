import { z } from 'zod'
import { AssetTypeNotFoundError } from '../../contexts/catalog'
import { performHandoverOut, ReservationNotConfirmedError } from '../../contexts/handover-possession'
import { createAvailabilityReservationDeps } from '../../utils/availability-reservation-deps'
import { createCatalogDeps } from '../../utils/catalog-deps'
import { createCustomerIdentityComplianceDeps } from '../../utils/customer-identity-compliance-deps'
import { createHandoverPossessionDeps, translateHandoverPossessionError } from '../../utils/handover-possession-deps'
import { requireOperator } from '../../utils/operator-session'

const bodySchema = z.object({
  tagCode: z.string().min(1),
  reservationId: z.number().int().positive(),
  customerId: z.number().int().positive(),
  conditionPhotoContentTypes: z.array(z.string().min(1)).min(1),
})

// D-04, D-05, FR-14, FR-15, FR-18, FR-19, FR-21, FR-22, W4: "the thirty
// seconds the whole product exists to make fast." Operator-authenticated
// — this is a counter action, not a Customer-facing one.
//
// Resolves the deposit amount from Catalog here, at the route, and hands
// it to performHandoverOut as an already-authoritative value —
// Handover & Possession's own domain module never imports Catalog (see
// server/contexts/handover-possession/handover-out.ts's module doc) and
// never trusts a client-supplied amount.
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const body = await readValidatedBody(event, bodySchema.parse)

  const availability = createAvailabilityReservationDeps(event)
  const catalog = createCatalogDeps(event)
  const customerIdentity = createCustomerIdentityComplianceDeps(event)
  const handover = createHandoverPossessionDeps(event)

  try {
    const reservation = await availability.repo.getReservation(operator.tenantId, body.reservationId)
    if (!reservation) throw new ReservationNotConfirmedError(body.reservationId)

    const assetType = await catalog.repo.getAssetType(operator.tenantId, reservation.assetTypeId)
    if (!assetType) throw new AssetTypeNotFoundError(reservation.assetTypeId)

    return await performHandoverOut(
      {
        repo: handover.repo,
        availabilityRepo: availability.repo,
        identityRepo: customerIdentity.repo,
        conditionsGateway: handover.conditionsGateway,
      },
      {
        tenantId: operator.tenantId,
        tagCode: body.tagCode,
        reservationId: body.reservationId,
        customerId: body.customerId,
        operatorId: operator.id,
        depositAmount: assetType.depositAmount,
        conditionPhotoContentTypes: body.conditionPhotoContentTypes,
      },
    )
  } catch (err) {
    if (err instanceof AssetTypeNotFoundError) {
      throw createError({ statusCode: 404, statusMessage: err.message })
    }
    translateHandoverPossessionError(err)
  } finally {
    await Promise.all([availability.close(), catalog.close(), customerIdentity.close(), handover.close()])
  }
})
