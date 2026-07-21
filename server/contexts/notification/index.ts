// Notification [MVP · generic] — outbound messages only: reservation
// confirmation, pickup reminder, return reminder. Deliberately stupid —
// no preference centre, no template engine, no campaign concept.
// Part 1 §4; D-28.
//
// Dependency direction (Part 1 §4 context map): downstream of Handover &
// Possession and Availability & Reservation. Must never import their
// internals — only their published interfaces. It is a leaf: no other
// MVP context may depend on Notification.
//
// Notification is stateless with respect to Tenant aggregates, but any
// record of a sent message MUST still carry `tenantId: TenantId` (D-01,
// P2 — see ../_shared/tenant.ts).
//
// Scaffold only (issue: project skeleton). No domain logic yet — this
// file is the context's published interface, currently empty.
export {}
