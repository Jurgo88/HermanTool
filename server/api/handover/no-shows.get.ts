import { listNoShows } from '../../utils/overdue-noshow-views'
import { createAvailabilityReservationDeps } from '../../utils/availability-reservation-deps'
import { createHandoverPossessionDeps } from '../../utils/handover-possession-deps'
import { requireOperator } from '../../utils/operator-session'

function todayAsRentalDay(): string {
  return new Date().toISOString().slice(0, 10)
}

// FR-28, FR-30, D-17, W7: a NoShow is derived, never stored, and never
// releases its RentalDays automatically (that stays W11's territory,
// OQ #1, launch-blocking, untouched here). Read-only; no PIN
// reconfirmation (F8/FR-36 gates money/evidence-bearing attestations only).
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)

  const availability = createAvailabilityReservationDeps(event)
  const handover = createHandoverPossessionDeps(event)

  try {
    const noShows = await listNoShows(
      { availabilityRepo: availability.repo, handoverRepo: handover.repo },
      { tenantId: operator.tenantId, today: todayAsRentalDay() },
    )
    return { noShows }
  } finally {
    await Promise.all([availability.close(), handover.close()])
  }
})
