import { requireInternalJobSecret } from '../../../utils/internal-job-session'
import { createAvailabilityReservationDeps } from '../../../utils/availability-reservation-deps'
import { getSeededTenantId } from '../../../utils/tenant'
import { sweepExpiredReservations } from '../../../contexts/availability-reservation'

// D-25 §14.2, Finding 3, FR-08: called on a schedule by GitHub Actions
// (.github/workflows/sweep-expired-reservations.yml), never by a human —
// requireInternalJobSecret gates this, not requireOperator. D-01:
// resolves the single seeded Tenant, matching every other route with no
// Operator/Customer session to derive one from.
export default defineEventHandler(async (event) => {
  requireInternalJobSecret(event)

  const { repo, sql, close } = createAvailabilityReservationDeps(event)
  try {
    const tenantId = await getSeededTenantId(sql)
    const expired = await sweepExpiredReservations(repo, { tenantId })
    return { sweptCount: expired.length, reservationIds: expired.map((r) => r.id) }
  } finally {
    await close()
  }
})
