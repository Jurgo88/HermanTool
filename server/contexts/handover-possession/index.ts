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
// Scaffold only (issue: project skeleton). No domain logic yet — this
// file is the context's published interface, currently empty. FR-20's
// paired-evidence rule (no deduction without both HandoverOut and
// HandoverIn ConditionReports) and F8's per-Operator PIN re-confirmation
// (CLAUDE.md KNOWN GAPS) apply here — re-read them before building any
// attestation flow.
export {}
