// Handover & Possession [MVP · CORE] — owns RentalAgreement, HandoverOut,
// HandoverIn, Possession, DepositObligation, DepositTaken/DepositReturned,
// and ConditionReport. The heart of the system. Part 1 §4; D-05, D-07,
// D-10.
//
// Dependency direction (Part 1 §4 context map): downstream of
// Availability & Reservation, Asset Registry and Customer Identity &
// Compliance; upstream of Notification. Must never import those upstream
// contexts' internals — only their published interfaces — and must never
// import Notification at all.
//
// Every RentalAgreement and Possession is an aggregate root and MUST
// carry `tenantId: TenantId` (D-01, P2 — see ../_shared/tenant.ts).
// DepositObligation amounts are MonetaryAmount values (D-21 — see
// ../_shared/monetary-amount.ts). Possession and ConditionReport history
// is append-only (D-10) — never overwrite a past attestation, append a
// superseding one.
//
// Currently implements ONLY ScanEvent resolution (P3, FR-17, FR-45; issue
// #22) — the primary counter interaction and the foundation everything
// else in this context reacts to. RentalAgreement, Possession,
// DepositObligation and ConditionReport are NOT modelled yet; that is
// #23's (HandoverOut workflow) and #24's (HandoverIn & Settlement) job.
// FR-20's paired-evidence rule and F8's per-Operator PIN re-confirmation
// (CLAUDE.md KNOWN GAPS) apply to that future work — re-read them before
// building any attestation flow.
export type { ScanEvent, ScanResolution } from './types'

export { HandoverPossessionError, ScanEventTagNotBoundError } from './types'

export type { HandoverPossessionRepository, NewScanEvent } from './repository'
export { createPostgresHandoverPossessionRepository } from './repository'

export { resolveScanEvent } from './scan-resolution'
