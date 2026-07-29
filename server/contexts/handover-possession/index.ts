// Handover & Possession [MVP · CORE] — owns RentalAgreement, HandoverOut,
// HandoverIn, Possession, DepositObligation, DepositTaken/DepositReturned,
// and ConditionReport. The heart of the system. Part 1 §4; D-04, D-05,
// D-07, D-10.
//
// Dependency direction (Part 1 §4 context map): downstream of
// Availability & Reservation, Asset Registry and Customer Identity &
// Compliance — this context's own domain modules (see ./handover-out.ts)
// import all three directly. Must never import Catalog (the deposit
// amount is resolved by the HTTP route composing Catalog, never looked
// up here) and must never import Notification at all (upstream of it).
//
// Every RentalAgreement is an aggregate root and carries
// `tenantId: TenantId` (D-01, P2). DepositTaken amounts are
// MonetaryAmount values (D-21). Possession is NOT its own stored
// entity — it is the period between a RentalAgreement's handoverOutAt
// and a nullable handoverInAt (P1: derived, never stored, extended from
// Overdue/NoShow to this context's own physical clock).
//
// Implements ScanEvent resolution (P3, FR-17, FR-45; issue #22) and the
// HandoverOut workflow (D-04, D-05, FR-14, FR-15, FR-18, FR-19, FR-21,
// FR-22, W4; issue #23). HandoverIn & Settlement (#24), attestation
// correction (#25), and LostAsset declaration (#26) are separate, later
// issues. FR-20's paired-evidence rule (no DepositReturned deduction
// without both ConditionReports) and F8's per-Operator PIN
// re-confirmation (CLAUDE.md KNOWN GAPS) apply to that future work —
// re-read them before building it.
export type {
  ConditionReport,
  ConditionReportStage,
  DepositTaken,
  RentalAgreement,
  ScanEvent,
  ScanResolution,
} from './types'

export {
  AssetTypeMismatchError,
  CustomerReservationMismatchError,
  EmptyConditionReportError,
  HandoverPossessionError,
  IdentityVerificationRequiredError,
  ReservationNotConfirmedError,
  ScanEventTagNotBoundError,
  UnexpectedScanResolutionError,
} from './types'

export type {
  HandoverPossessionRepository,
  NewConditionReport,
  NewDepositTaken,
  NewRentalAgreement,
  NewScanEvent,
} from './repository'
export { createPostgresHandoverPossessionRepository } from './repository'

export type { ConditionReportStorageGateway } from './r2-gateway'
export { createR2ConditionReportGateway } from './r2-gateway'

export { resolveScanEvent } from './scan-resolution'

export type { PerformHandoverOutDeps, PerformHandoverOutParams, PerformHandoverOutResult } from './handover-out'
export { performHandoverOut } from './handover-out'
