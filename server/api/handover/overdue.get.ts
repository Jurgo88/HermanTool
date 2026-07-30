import { listOverdue } from '../../utils/overdue-noshow-views'
import { createAvailabilityReservationDeps } from '../../utils/availability-reservation-deps'
import { createHandoverPossessionDeps } from '../../utils/handover-possession-deps'
import { requireOperator } from '../../utils/operator-session'

function todayAsRentalDay(): string {
  return new Date().toISOString().slice(0, 10)
}

// FR-28, FR-29, D-17, W6: Overdue is derived, never stored. Ranked by
// the earliest day this Asset's continued absence causes confirmed
// demand to exceed Rentable supply for its AssetType (Finding 12's fix
// for FR-29) — never by days late. Read-only; no PIN reconfirmation
// (F8/FR-36 gates money/evidence-bearing attestations only).
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)

  const availability = createAvailabilityReservationDeps(event)
  const handover = createHandoverPossessionDeps(event)

  try {
    const overdue = await listOverdue(
      { availabilityRepo: availability.repo, handoverRepo: handover.repo, assetRegistryRepo: handover.assetRegistryRepo },
      { tenantId: operator.tenantId, today: todayAsRentalDay() },
    )
    return { overdue }
  } finally {
    await Promise.all([availability.close(), handover.close()])
  }
})
