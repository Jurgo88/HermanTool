// Domain types for Handover & Possession [MVP · CORE] — ScanEvent
// resolution only (P3, FR-17, FR-45; issue #22). See ./index.ts for the
// context's boundary and citations. RentalAgreement, Possession,
// DepositObligation and ConditionReport are NOT modelled here — they
// belong to the issues that react to a resolved HandoverOut/HandoverIn,
// not to resolution itself.
import type { Asset } from '../asset-registry'
import type { MonetaryAmount, TenantId } from '../_shared'

// FR-17, P3: an intent, not a transition. Recorded unconditionally for
// every scan, whatever it resolves to — including a bare "show me this
// asset" lookup (FR-45). No `place` field: A-01 fixes exactly one
// physical pickup location, so modelling a location that never varies
// would be optionality this system doesn't get to spend for free (P8).
export interface ScanEvent {
  id: number
  tenantId: TenantId
  assetId: number
  operatorId: string
  occurredAt: Date
}

// P3: "a scan must resolve to exactly one meaningful domain event given
// the asset's current state." 'handover_out' (Asset is Rentable) and
// 'handover_in' (Asset is InPossession) are the two transition intents;
// everything else (UnderInspection, Unavailable, Retired) resolves to
// 'asset_lookup' — FR-45's "outside a handover" fallback — never an
// error. This union IS the resolution; nothing downstream re-derives it
// from `asset.status` independently.
export type ScanResolution =
  | { kind: 'handover_out'; asset: Asset; scanEvent: ScanEvent }
  | { kind: 'handover_in'; asset: Asset; scanEvent: ScanEvent }
  | { kind: 'asset_lookup'; asset: Asset; scanEvent: ScanEvent }

export class HandoverPossessionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

// A scanned AssetTag has no active binding — a torn-off tag, a typo'd
// code, or a stale one from a rebind (FR-26). Distinct from Asset
// Registry's own tag errors: this is "the tag scanned means nothing
// right now," not a registration-time conflict.
export class ScanEventTagNotBoundError extends HandoverPossessionError {
  constructor(tagCode: string) {
    super(`AssetTag "${tagCode}" has no active binding — nothing to resolve.`)
  }
}

// D-13, W4, FR-22: the contract that comes into being at HandoverOut,
// binding one Customer, one Asset and one Reservation. A ReservationGroup
// covering n AssetTypes produces n HandoverOut events and n
// RentalAgreements, never one — the group never becomes an agreement.
// `termsVersion` is copied from the ReservationGroup at creation time
// (the version accepted pre-payment, D-35) so a later change to what
// "current terms" means never retroactively changes what this Agreement
// was formed under.
//
// Possession is NOT modelled as its own stored entity — P1's "derived,
// never stored" extended to this context's own physical clock: it is
// the period between handoverOutAt and a nullable handoverInAt. A null
// handoverInAt means Possession is still open.
export interface RentalAgreement {
  id: number
  tenantId: TenantId
  reservationId: number
  customerId: number
  assetId: number
  operatorId: string
  termsVersion: string
  handoverOutAt: Date
  handoverInAt: Date | null
}

export type ConditionReportStage = 'handover_out' | 'handover_in'

// FR-19: captured at each end of every rental. `photoObjectKeys` points
// into R2's `conditions` bucket (D-27 — backed up, unlike `evidence`).
export interface ConditionReport {
  id: number
  tenantId: TenantId
  rentalAgreementId: number
  stage: ConditionReportStage
  photoObjectKeys: string[]
  operatorId: string
  capturedAt: Date
}

// D-07/FR-21: an attestation that cash changed hands. The platform moves
// no deposit money and must not represent that it did — there is no
// Payments involvement anywhere in this type or in what creates it.
export interface DepositTaken {
  id: number
  tenantId: TenantId
  rentalAgreementId: number
  amount: MonetaryAmount
  operatorId: string
  takenAt: Date
}

// FR-14: "HandoverOut is refused without a successful IdentityVerification."
export class IdentityVerificationRequiredError extends HandoverPossessionError {
  constructor(customerId: number) {
    super(`Customer ${customerId} has no successful IdentityVerification — HandoverOut is refused (FR-14).`)
  }
}

// A Reservation must be Confirmed before HandoverOut — Pending, Expired
// or Cancelled all refuse (there is no partial-payment or speculative
// handover concept anywhere in this domain).
export class ReservationNotConfirmedError extends HandoverPossessionError {
  constructor(reservationId: number) {
    super(`Reservation ${reservationId} is not Confirmed — HandoverOut is refused.`)
  }
}

// Integrity guard: the Customer performing HandoverOut must belong to
// the same ReservationGroup as the Reservation being handed over — a
// mismatch means the counter interaction mixed up two different
// Customers, not a fact about either one.
export class CustomerReservationMismatchError extends HandoverPossessionError {
  constructor(customerId: number, reservationId: number) {
    super(`Customer ${customerId} does not belong to the ReservationGroup for Reservation ${reservationId}.`)
  }
}

// P3/FR-17: the scan resolved to something other than 'handover_out' —
// most commonly the chosen Asset was not actually Rentable (already
// InPossession, UnderInspection, Unavailable or Retired). The Operator
// picked the wrong physical unit; this is not an error in the domain
// logic, it is the domain logic correctly refusing a divergent scan.
export class UnexpectedScanResolutionError extends HandoverPossessionError {
  constructor(assetId: number, kind: string) {
    super(`Scanning Asset ${assetId} resolved to '${kind}', not 'handover_out' — the Asset is not Rentable.`)
  }
}

// FR-18: instance choice happens at the counter, but the chosen instance
// must still be of the Reservation's own AssetType — D-04 defers WHICH
// unit, never WHICH type.
export class AssetTypeMismatchError extends HandoverPossessionError {
  constructor(assetId: number, reservationId: number) {
    super(`Asset ${assetId}'s AssetType does not match Reservation ${reservationId}'s reserved AssetType (FR-18).`)
  }
}

// FR-19: "A ConditionReport with photographs is captured at each end of
// every rental." Zero photographs is not a ConditionReport.
export class EmptyConditionReportError extends HandoverPossessionError {
  constructor() {
    super('A ConditionReport requires at least one photograph (FR-19).')
  }
}
