import { markAssetReturnedToPool } from '../../../../contexts/handover-possession'
import { createAvailabilityReservationDeps } from '../../../../utils/availability-reservation-deps'
import {
  createHandoverPossessionDeps,
  getRentalAgreementIdParam,
  translateHandoverPossessionError,
} from '../../../../utils/handover-possession-deps'
import { requireOperator } from '../../../../utils/operator-session'

// D-09: "the RentalPeriod's final day is consumed and the Asset rejoins
// the pool on X+1." An explicit Operator action — the Asset stays
// UnderInspection, refused from returning to the pool, until that day
// arrives, regardless of when Settlement completed. Composes
// Availability & Reservation's published interface here (D-02) to read
// the Reservation's RentalPeriod; Handover & Possession's own domain
// module never imports it for this — see
// server/contexts/handover-possession/handover-in.ts's module doc.
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const rentalAgreementId = getRentalAgreementIdParam(event)

  const handover = createHandoverPossessionDeps(event)
  const availability = createAvailabilityReservationDeps(event)

  try {
    return await markAssetReturnedToPool(
      { repo: handover.repo, assetRegistryRepo: handover.assetRegistryRepo, availabilityRepo: availability.repo },
      { tenantId: operator.tenantId, rentalAgreementId, operatorId: operator.id },
    )
  } catch (err) {
    translateHandoverPossessionError(err)
  } finally {
    await Promise.all([handover.close(), availability.close()])
  }
})
