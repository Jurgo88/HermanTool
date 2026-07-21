// Payments [MVP · generic] — owns the online rental fee charge and its
// refunds, behind an anti-corruption layer so the provider's vocabulary
// never leaks into the domain. Does NOT own the deposit (D-07 —
// DepositObligation lives in Handover & Possession). Part 1 §4; D-26.
//
// Dependency direction (Part 1 §4 context map): upstream of Availability
// & Reservation. Must never import it, and must never let a Stripe
// concept (payment intent, session, etc.) leak past this context's
// published interface.
//
// Every Payment is an aggregate root and MUST carry `tenantId: TenantId`
// (D-01, P2 — see ../_shared/tenant.ts). Amounts are MonetaryAmount
// values (D-21 — see ../_shared/monetary-amount.ts). The Tenant's own
// Stripe account is used (D-26) — never the developer's.
//
// Scaffold only (issue: project skeleton). No domain logic yet — this
// file is the context's published interface, currently empty. F1 —
// terms acceptance before payment — is a launch-blocking KNOWN GAP
// (CLAUDE.md); re-read it and D-35 before building the checkout/payment
// flow.
export {}
