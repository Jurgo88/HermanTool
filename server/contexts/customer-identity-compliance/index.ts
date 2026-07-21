// Customer Identity & Compliance [MVP] — owns Customer,
// IdentityVerification, IdentityEvidence, and RetentionDeadline.
// Deliberately isolated because this data has a different legal
// lifecycle from everything around it. Part 1 §4; D-06, D-11.
//
// Dependency direction (Part 1 §4 context map): upstream of Handover &
// Possession. Must never import it.
//
// Every Customer and IdentityEvidence is an aggregate root and MUST
// carry `tenantId: TenantId` (D-01, P2 — see ../_shared/tenant.ts).
// IdentityEvidence MUST always carry a RetentionDeadline, set at
// creation, never absent (P7, D-11) — see CLAUDE.md KNOWN GAPS F6 for
// the still-open Customer-record retention basis, and launch-blocking
// OQ #2 for the IdentityEvidence retention window value.
//
// Scaffold only (issue: project skeleton). No domain logic yet — this
// file is the context's published interface, currently empty.
export {}
