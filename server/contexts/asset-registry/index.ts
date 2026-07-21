// Asset Registry [MVP] — owns Asset, AssetTag, and Asset lifecycle status
// (Rentable, InPossession, UnderInspection, Unavailable, Retired).
// Part 1 §4 "Asset Registry"; D-02 (contexts are modules, not services).
//
// Dependency direction (Part 1 §4 context map): Asset Registry is
// upstream of Availability & Reservation and of Handover & Possession.
// It must never import from either.
//
// Every Asset is an aggregate root and MUST carry `tenantId: TenantId`
// (D-01, P2 — see ../_shared/tenant.ts).
//
// Scaffold only (issue: project skeleton). No domain logic yet — this
// file is the context's published interface, currently empty.
export {}
