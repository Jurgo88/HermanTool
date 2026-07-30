// Overdue & NoShow derivation (D-17, FR-28, FR-29, FR-30, W6, W7; issue
// #16). Both are DERIVED — neither is stored, neither emits a domain
// event (FR-28, P1: Reservation and Possession are separate clocks that
// never own each other). This file composes Availability & Reservation
// (the commercial clock) and Handover & Possession (the physical clock)
// at the composition root, since neither context may import the other
// just to support this query (D-02) — mirrors
// server/utils/operator-counter-views.ts exactly.
//
// Sending the actual reminder (the "notify the Customer on a schedule"
// half of FR-29) is issue #36 (Milestone 8, Notification — not built).
// This file only answers the query; nothing here sends anything.
import type { AssetRegistryRepository } from '../contexts/asset-registry'
import type { AvailabilityReservationRepository, Reservation } from '../contexts/availability-reservation'
import type { HandoverPossessionRepository, RentalAgreement } from '../contexts/handover-possession'
import type { TenantId } from '../contexts/_shared'

export interface OverdueNoShowViewsDeps {
  availabilityRepo: AvailabilityReservationRepository
  handoverRepo: HandoverPossessionRepository
  assetRegistryRepo: AssetRegistryRepository
}

export interface OverdueEntry {
  reservation: Reservation
  rentalAgreement: RentalAgreement
  daysOverdue: number
  // Finding 12's fix for FR-29: the earliest day this Asset's continued
  // absence makes confirmed demand exceed Rentable supply for its
  // AssetType. Null means "unaffected" within the scan horizon —
  // ranked last, per Finding 12's proposed wording, not urgent right now.
  shortfallDay: string | null
}

export interface NoShowEntry {
  reservation: Reservation
}

function addOneDay(day: string): string {
  const date = new Date(`${day}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

function daysBetween(from: string, to: string): number {
  const fromMs = new Date(`${from}T00:00:00.000Z`).getTime()
  const toMs = new Date(`${to}T00:00:00.000Z`).getTime()
  return Math.round((toMs - fromMs) / 86_400_000)
}

// How far forward to look for a shortfall day before calling an Asset
// "unaffected" (Finding 12). Pilot-scale pragmatic horizon, not a domain
// invariant — same spirit as PENDING_EXPIRY_MINUTES's own placeholder
// framing in server/contexts/availability-reservation/reservation.ts.
const SHORTFALL_SCAN_HORIZON_DAYS = 90

async function findShortfallDay(
  deps: Pick<OverdueNoShowViewsDeps, 'availabilityRepo' | 'assetRegistryRepo'>,
  params: { tenantId: TenantId; assetTypeId: number; from: string },
): Promise<string | null> {
  const rentable = await deps.assetRegistryRepo.getRentableCount(params.tenantId, params.assetTypeId)
  let day = params.from
  for (let i = 0; i < SHORTFALL_SCAN_HORIZON_DAYS; i++) {
    // Strictly EXCEEDS, not merely meets, capacity (FR-29/Finding 12: "demand
    // exceed supply"). Reservations already confirmed at <= rentable count
    // were valid commitments under D-08 at the time they were made; equal to
    // capacity is full utilisation, not a shortfall this Asset's absence causes.
    const active = await deps.availabilityRepo.countActiveReservations(params.tenantId, params.assetTypeId, day)
    if (active > rentable) return day
    day = addOneDay(day)
  }
  return null
}

// FR-28/FR-29/D-17: an Overdue is a RentalAgreement whose Possession has
// outlived its Reservation's RentalPeriod — handoverInAt still null,
// past the period's own end day. Ranked by shortfallDay ascending, with
// null (unaffected) last (Finding 12) — never by days late, which FR-29
// explicitly rejects as the ranking key.
export async function listOverdue(
  deps: OverdueNoShowViewsDeps,
  params: { tenantId: TenantId; today: string },
): Promise<OverdueEntry[]> {
  const { tenantId, today } = params
  const candidates = await deps.availabilityRepo.listReservationsEndedBefore(tenantId, today)

  const entries: OverdueEntry[] = []
  const shortfallByAssetType = new Map<number, string | null>()

  for (const reservation of candidates) {
    const rentalAgreement = await deps.handoverRepo.getRentalAgreementByReservation(tenantId, reservation.id)
    if (!rentalAgreement || rentalAgreement.handoverInAt) continue // never handed out, or already back

    if (!shortfallByAssetType.has(reservation.assetTypeId)) {
      const shortfallDay = await findShortfallDay(deps, { tenantId, assetTypeId: reservation.assetTypeId, from: today })
      shortfallByAssetType.set(reservation.assetTypeId, shortfallDay)
    }

    entries.push({
      reservation,
      rentalAgreement,
      daysOverdue: daysBetween(reservation.period.endDay, today),
      shortfallDay: shortfallByAssetType.get(reservation.assetTypeId)!,
    })
  }

  return entries.sort((a, b) => {
    if (a.shortfallDay === b.shortfallDay) return a.reservation.id - b.reservation.id
    if (a.shortfallDay === null) return 1
    if (b.shortfallDay === null) return -1
    return a.shortfallDay < b.shortfallDay ? -1 : 1
  })
}

// FR-28/FR-30/D-17, W7: a Reservation whose RentalPeriod began without a
// HandoverOut. Stays one for as long as no HandoverOut exists, however
// many days have passed — no automatic timeout (D-17). Does NOT release
// the RentalDays; that would be W11's cancellation policy (OQ #1,
// launch-blocking, untouched here).
export async function listNoShows(
  deps: Pick<OverdueNoShowViewsDeps, 'availabilityRepo' | 'handoverRepo'>,
  params: { tenantId: TenantId; today: string },
): Promise<NoShowEntry[]> {
  const { tenantId, today } = params
  const candidates = await deps.availabilityRepo.listReservationsStartedOnOrBefore(tenantId, today)

  const entries: NoShowEntry[] = []
  for (const reservation of candidates) {
    const rentalAgreement = await deps.handoverRepo.getRentalAgreementByReservation(tenantId, reservation.id)
    if (rentalAgreement) continue // already handed out — not a NoShow
    entries.push({ reservation })
  }
  return entries
}
