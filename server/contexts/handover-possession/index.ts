// Handover & Possession [MVP · CORE] — owns RentalAgreement, HandoverOut,
// HandoverIn, Possession, DepositObligation, DepositTaken/DepositReturned,
// and ConditionReport. The heart of the system. Part 1 §4; D-04, D-05,
// D-07, D-09, D-10.
//
// Dependency direction (Part 1 §4 context map): downstream of
// Availability & Reservation, Asset Registry and Customer Identity &
// Compliance — this context's own domain modules (see ./handover-out.ts,
// ./handover-in.ts) import all three directly, EXCEPT Customer Identity
// & Compliance's retention-clock reaction: FR-23/D-06 require that to
// happen by event, never a direct call into the identity model, and
// since there is no event bus yet (D-19: in-process only, until a second
// consumer exists), SettlementCompleted is a timestamp field on
// RentalAgreement for a future #32 to read, not a call this context
// makes. Must never import Catalog (the deposit amount is resolved by
// the HTTP route composing Catalog, never looked up here) and must
// never import Notification at all (upstream of it).
//
// Every RentalAgreement is an aggregate root and carries
// `tenantId: TenantId` (D-01, P2). DepositTaken/DepositReturned amounts
// are MonetaryAmount values (D-21). Possession is NOT its own stored
// entity — it is the period between a RentalAgreement's handoverOutAt
// and a nullable handoverInAt (P1: derived, never stored, extended from
// Overdue/NoShow to this context's own physical clock).
//
// Implements ScanEvent resolution (P3, FR-17, FR-45; issue #22), the
// HandoverOut workflow (D-04, D-05, FR-14, FR-15, FR-18, FR-19, FR-21,
// FR-22, W4; issue #23), and HandoverIn & Settlement (D-09, FR-19,
// FR-20, FR-21, FR-23, W5, W8; issue #24). Attestation correction (#25)
// and LostAsset declaration (#26) are separate, later issues.
//
// D-09's "the Asset rejoins the pool on X+1" is markAssetReturnedToPool:
// an explicit Operator action gated by a refusal, not a scheduled
// process — mirrors D-17's Overdue handling (the system refuses or
// notices, a human acts) rather than inventing a system identity to
// attest an automated Asset status change.
export type {
  AttestationBackdate,
  ConditionReport,
  ConditionReportStage,
  DepositReturned,
  DepositTaken,
  RentalAgreement,
  ScanEvent,
  ScanResolution,
} from './types'

export {
  AssetNotYetReturnableError,
  AssetTypeMismatchError,
  BackdateReasonRequiredError,
  CustomerReservationMismatchError,
  DeductionReasonRequiredError,
  DeductionRequiresPairedConditionReportsError,
  DepositReturnExceedsTakenError,
  EmptyConditionReportError,
  HandoverPossessionError,
  IdentityVerificationRequiredError,
  NoOpenRentalAgreementError,
  RentalAgreementAlreadySettledError,
  RentalAgreementNotFoundError,
  RentalAgreementNotHandedInError,
  ReservationNotConfirmedError,
  ScanEventTagNotBoundError,
  SettlementNotCompleteError,
  UnexpectedScanResolutionError,
} from './types'

export type {
  HandoverPossessionRepository,
  NewConditionReport,
  NewDepositReturned,
  NewDepositTaken,
  NewRentalAgreement,
  NewScanEvent,
  SetHandoverInParams,
} from './repository'
export { createPostgresHandoverPossessionRepository } from './repository'

export type { ConditionReportStorageGateway } from './r2-gateway'
export { createR2ConditionReportGateway } from './r2-gateway'

export { resolveScanEvent } from './scan-resolution'

export type { PerformHandoverOutDeps, PerformHandoverOutParams, PerformHandoverOutResult } from './handover-out'
export { performHandoverOut } from './handover-out'

export type { AssetAttestationHistoryEntry } from './attestation-history'
export { getAssetAttestationHistory } from './attestation-history'

export type {
  CompleteSettlementParams,
  CompleteSettlementResult,
  MarkAssetReturnedToPoolDeps,
  PerformHandoverInDeps,
  PerformHandoverInParams,
  PerformHandoverInResult,
} from './handover-in'
export { completeSettlement, markAssetReturnedToPool, performHandoverIn } from './handover-in'
