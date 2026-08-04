// Operator counter views: today's pickups and returns (FR-42, W4/W5).
// "The practical daily worklist" — composes four contexts' published
// interfaces here, at the composition root, since none of Availability &
// Reservation, Handover & Possession, Customer Identity & Compliance or
// Catalog may import each other just to support a reporting view (D-02).
// Purely additive reads: no invariant is enforced or derived beyond what
// each context's own repository already guarantees.
import type { TenantId } from '../contexts/_shared'
import type { AvailabilityReservationRepository, Reservation } from '../contexts/availability-reservation'
import type { CatalogRepository } from '../contexts/catalog'
import type { CustomerIdentityComplianceRepository } from '../contexts/customer-identity-compliance'
import type { HandoverPossessionRepository, RentalAgreement } from '../contexts/handover-possession'

export interface OperatorCounterViewsDeps {
  availabilityRepo: AvailabilityReservationRepository
  handoverRepo: HandoverPossessionRepository
  identityRepo: CustomerIdentityComplianceRepository
  catalogRepo: CatalogRepository
}

export interface TodaysPickup {
  reservation: Reservation
  assetTypeName: string
  customerName: string
  // Issue #12/IR-12: the Counter UI's HandoverOut call needs this —
  // performHandoverOut takes customerId, not a ReservationGroup id.
  // Null in the same "don't disappear the row" spirit as the name
  // fallbacks below, though in practice D-14 guarantees exactly one
  // Customer per ReservationGroup once checkout has run.
  customerId: number | null
}

export interface TodaysReturn {
  reservation: Reservation
  rentalAgreement: RentalAgreement
  assetTypeName: string
  customerName: string
  customerId: number | null
}

async function describeReservation(
  deps: OperatorCounterViewsDeps,
  tenantId: TenantId,
  reservation: Reservation,
): Promise<{ assetTypeName: string; customerName: string; customerId: number | null }> {
  const [assetType, customer] = await Promise.all([
    deps.catalogRepo.getAssetType(tenantId, reservation.assetTypeId),
    deps.identityRepo.getCustomerByReservationGroup(tenantId, reservation.reservationGroupId),
  ])
  return {
    // Falls back to the raw id rather than throwing: a worklist should
    // still show up (with a placeholder label) if a name lookup ever
    // comes back empty, not disappear the whole row.
    assetTypeName: assetType?.name ?? `AssetType ${reservation.assetTypeId}`,
    customerName: customer?.name ?? `ReservationGroup ${reservation.reservationGroupId}`,
    customerId: customer?.id ?? null,
  }
}

// FR-42: Confirmed Reservations starting `today` that have not yet been
// handed out — the customers an Operator expects to walk in today.
export async function listTodaysPickups(
  deps: OperatorCounterViewsDeps,
  params: { tenantId: TenantId; today: string },
): Promise<TodaysPickup[]> {
  const { tenantId, today } = params
  const reservations = await deps.availabilityRepo.listReservationsStartingOn(tenantId, today)

  const pickups: TodaysPickup[] = []
  for (const reservation of reservations) {
    const existingAgreement = await deps.handoverRepo.getRentalAgreementByReservation(tenantId, reservation.id)
    if (existingAgreement) continue // already handed out — not a pending pickup

    const described = await describeReservation(deps, tenantId, reservation)
    pickups.push({ reservation, ...described })
  }
  return pickups
}

// FR-42: Confirmed Reservations ending `today` whose Asset has been
// handed out but not yet handed back — the customers an Operator
// expects to see return today.
export async function listTodaysReturns(
  deps: OperatorCounterViewsDeps,
  params: { tenantId: TenantId; today: string },
): Promise<TodaysReturn[]> {
  const { tenantId, today } = params
  const reservations = await deps.availabilityRepo.listReservationsEndingOn(tenantId, today)

  const returns: TodaysReturn[] = []
  for (const reservation of reservations) {
    const rentalAgreement = await deps.handoverRepo.getRentalAgreementByReservation(tenantId, reservation.id)
    if (!rentalAgreement || rentalAgreement.handoverInAt) continue // never handed out, or already back

    const described = await describeReservation(deps, tenantId, reservation)
    returns.push({ reservation, rentalAgreement, ...described })
  }
  return returns
}
