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

// D-10, FR-24, Finding 9: the shape of a backdated correction — supplied
// instead of letting occurredAt default to now(). `reason` is mandatory
// at the type level, matching FR-15/FR-20's established "a reason is not
// optional once you're claiming an exception" pattern in this context.
export interface AttestationBackdate {
  occurredAt: Date
  reason: string
}

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
// D-10, FR-24, Finding 9: every attestation carries both an occurred-at
// time (when the fact was physically true — backdatable, for the
// "Operator forgot to scan" repair) and a recorded-at time (when the
// system actually learned about it — always real, never backdated).
// Derivations (Availability, Overdue, NoShow, D-09's pool-return day
// math) are always computed over occurred-at, never recorded-at.
// `handoverOutAt`/`handoverInAt` ARE the occurred-at times — unchanged
// in name and meaning for every existing reader of this type — with a
// recordedAt/backdateReason companion added alongside each. A non-null
// backdateReason is what distinguishes a corrected entry from an
// ordinary live scan (recordedAt === occurredAt, backdateReason null).
export interface RentalAgreement {
  id: number
  tenantId: TenantId
  reservationId: number
  customerId: number
  assetId: number
  operatorId: string
  termsVersion: string
  handoverOutAt: Date
  handoverOutRecordedAt: Date
  handoverOutBackdateReason: string | null
  handoverInAt: Date | null
  handoverInRecordedAt: Date | null
  handoverInBackdateReason: string | null
  // FR-23/D-19: the SettlementCompleted "event" is this timestamp, not a
  // dispatched message — there is no second consumer yet (Customer
  // Identity & Compliance's retention re-anchoring is #32's job), so
  // there is nothing to publish to. A future #32 reads this field
  // directly rather than this context maintaining an event bus nobody
  // listens to.
  settlementCompletedAt: Date | null
  // D-09: distinct from settlement — an Asset can be settled (deposit
  // resolved) same-day, but must not rejoin the pool until the day
  // after its RentalPeriod's final day. Null until
  // markAssetReturnedToPool succeeds.
  returnedToPoolAt: Date | null
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
  // D-10/Finding 9: capturedAt is the occurred-at time (backdated to
  // match a corrected HandoverOut/HandoverIn's own occurredAt when this
  // report belongs to one); recordedAt is always real.
  capturedAt: Date
  recordedAt: Date
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
  // D-10/Finding 9: takenAt is the occurred-at time (backdated alongside
  // a corrected HandoverOut); recordedAt is always real.
  takenAt: Date
  recordedAt: Date
}

// D-07/FR-21/W5/W8: the counterpart attestation at Settlement.
// `deductionReason` is null for a full return; non-null iff `amount` is
// less than what DepositTaken recorded (FR-20's "deduction" — enforced
// in ./handover-in.ts's completeSettlement, backed by the migration's
// check constraint). No dispute workflow, no case, no escalation (W8) —
// this attestation plus attribution is the product's entire
// contribution to a disagreement.
export interface DepositReturned {
  id: number
  tenantId: TenantId
  rentalAgreementId: number
  amount: MonetaryAmount
  deductionReason: string | null
  operatorId: string
  // D-10/Finding 9: structural parity with every other attestation in
  // this context. No backdating action is wired up for Settlement in
  // this issue (only HandoverOut/HandoverIn are the two named repairs) —
  // returnedAt and recordedAt are always equal for now.
  returnedAt: Date
  recordedAt: Date
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

export class RentalAgreementNotFoundError extends HandoverPossessionError {
  constructor(identifier: number) {
    super(`RentalAgreement ${identifier} does not exist for this Tenant.`)
  }
}

// HandoverIn's own guard: the scanned Asset has no currently open
// RentalAgreement (handoverInAt still null) — either it was never
// handed out, or it already came back once (D-04/D-13: an Asset holds
// at most one open Agreement at a time).
export class NoOpenRentalAgreementError extends HandoverPossessionError {
  constructor(assetId: number) {
    super(`Asset ${assetId} has no open RentalAgreement — nothing to hand in.`)
  }
}

// Settlement's own guard: HandoverIn must have happened first — there is
// no settling a Possession that never closed.
export class RentalAgreementNotHandedInError extends HandoverPossessionError {
  constructor(rentalAgreementId: number) {
    super(`RentalAgreement ${rentalAgreementId} has not been handed in yet — nothing to settle.`)
  }
}

export class RentalAgreementAlreadySettledError extends HandoverPossessionError {
  constructor(rentalAgreementId: number) {
    super(`RentalAgreement ${rentalAgreementId} has already been settled.`)
  }
}

// A returned amount greater than what DepositTaken recorded is not a
// deduction, it is a data error — there is nothing to attest to here.
export class DepositReturnExceedsTakenError extends HandoverPossessionError {
  constructor(rentalAgreementId: number) {
    super(`DepositReturned amount exceeds the DepositTaken amount for RentalAgreement ${rentalAgreementId}.`)
  }
}

// FR-20, P1 corollary: "A DepositReturned carrying a deduction is
// rejected unless both ConditionReports exist for that Asset and
// RentalAgreement." No exceptions — the outbound report protects the
// Customer, the inbound report protects the Operator, and a deduction
// backed by only one of them is an assertion, not a case.
export class DeductionRequiresPairedConditionReportsError extends HandoverPossessionError {
  constructor(rentalAgreementId: number) {
    super(
      `RentalAgreement ${rentalAgreementId} is missing a HandoverOut or HandoverIn ConditionReport — ` +
        'a deduction cannot be recorded without both (FR-20).',
    )
  }
}

// FR-15-style guard, extended to DepositReturned: a deduction without a
// reason is an amount with no explanation attached to it.
export class DeductionReasonRequiredError extends HandoverPossessionError {
  constructor() {
    super('A DepositReturned carrying a deduction must record a reason.')
  }
}

// D-09: "the RentalPeriod's final day is consumed and the Asset rejoins
// the pool on X+1." Thrown by markAssetReturnedToPool when called before
// that day has arrived — the Asset stays UnderInspection regardless of
// whether Settlement has already completed; the two are deliberately
// independent (Settlement can happen same-day, the pool return cannot).
export class AssetNotYetReturnableError extends HandoverPossessionError {
  constructor(assetId: number, readyDay: string) {
    super(`Asset ${assetId} cannot rejoin the pool until ${readyDay} (D-09).`)
  }
}

export class SettlementNotCompleteError extends HandoverPossessionError {
  constructor(rentalAgreementId: number) {
    super(`RentalAgreement ${rentalAgreementId} has not been settled yet — the Asset cannot rejoin the pool.`)
  }
}

// D-10, FR-24, Finding 9: "every attestation is correctable... with a
// reason and attribution." A backdated HandoverOut/HandoverIn — the two
// named repairs — requires the reason; there is no such thing as a
// silent correction.
export class BackdateReasonRequiredError extends HandoverPossessionError {
  constructor(kind: 'handover_out' | 'handover_in') {
    super(`A backdated ${kind === 'handover_out' ? 'HandoverOut' : 'HandoverIn'} correction must record a reason (FR-24).`)
  }
}
