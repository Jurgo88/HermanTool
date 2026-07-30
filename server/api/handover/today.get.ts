import { listTodaysPickups, listTodaysReturns } from '../../utils/operator-counter-views'
import { createAvailabilityReservationDeps } from '../../utils/availability-reservation-deps'
import { createCatalogDeps } from '../../utils/catalog-deps'
import { createCustomerIdentityComplianceDeps } from '../../utils/customer-identity-compliance-deps'
import { createHandoverPossessionDeps } from '../../utils/handover-possession-deps'
import { requireOperator } from '../../utils/operator-session'

function todayAsRentalDay(): string {
  return new Date().toISOString().slice(0, 10)
}

// FR-42, W4/W5: "the practical daily worklist" — today's expected
// pickups and returns. Operator-authenticated; read-only, no PIN
// reconfirmation needed (F8/FR-36 only gates money/evidence-bearing
// attestations, not a report).
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)

  const availability = createAvailabilityReservationDeps(event)
  const catalog = createCatalogDeps(event)
  const customerIdentity = createCustomerIdentityComplianceDeps(event)
  const handover = createHandoverPossessionDeps(event)

  try {
    const deps = {
      availabilityRepo: availability.repo,
      handoverRepo: handover.repo,
      identityRepo: customerIdentity.repo,
      catalogRepo: catalog.repo,
    }
    const today = todayAsRentalDay()

    const [pickups, returns] = await Promise.all([
      listTodaysPickups(deps, { tenantId: operator.tenantId, today }),
      listTodaysReturns(deps, { tenantId: operator.tenantId, today }),
    ])

    return { pickups, returns }
  } finally {
    await Promise.all([availability.close(), catalog.close(), customerIdentity.close(), handover.close()])
  }
})
