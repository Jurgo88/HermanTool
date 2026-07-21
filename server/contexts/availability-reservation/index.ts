// Availability & Reservation [MVP · CORE] — owns Reservation,
// ReservationGroup, and the day-granularity availability calendar. Holds
// the D-08 overbooking invariant. Part 1 §4; D-04, D-08, D-13.
//
// Dependency direction (Part 1 §4 context map): downstream of Catalog,
// Asset Registry and Payments; upstream of Handover & Possession and
// Notification. Must never import Catalog/Asset Registry/Payments
// internals — only their published interfaces — and must never import
// Handover & Possession or Notification at all.
//
// Every Reservation and ReservationGroup is an aggregate root and MUST
// carry `tenantId: TenantId` (D-01, P2 — see ../_shared/tenant.ts).
//
// Scaffold only (issue: project skeleton). No domain logic yet — this
// file is the context's published interface, currently empty. The D-08
// no-overbooking invariant and its D-33 concurrency mechanism are a
// KNOWN GAP (CLAUDE.md) — re-read D-33 and Part 4 §16 before designing
// the hold-counter mechanism, do not improvise it here.
export {}
