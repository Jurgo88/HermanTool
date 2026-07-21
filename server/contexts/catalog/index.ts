// Catalog [MVP] — owns AssetType: the bookable kind, description, day
// rate, deposit amount, and publication status. Part 1 §4 "Catalog";
// D-03 (Catalog kept separate from Asset Registry).
//
// Dependency direction (Part 1 §4 context map): Catalog is upstream of
// Availability & Reservation. It must never import from it.
//
// Every AssetType is an aggregate root and MUST carry `tenantId:
// TenantId` (D-01, P2 — see ../_shared/tenant.ts). Its day rate and
// deposit amount are MonetaryAmount values (D-21 — see
// ../_shared/monetary-amount.ts), never bare numbers.
//
// Scaffold only (issue: project skeleton). No domain logic yet — this
// file is the context's published interface, currently empty.
export {}
