// Tenant identity marker (D-01, P2 — Part 1 §1-2).
//
// Every aggregate root belongs to exactly one Tenant, from the first line
// of code, even though exactly one Tenant row exists during the pilot and
// there is no tenant-management surface (D-01). This is the one invariant
// that cannot be retrofitted: adding it later means rewriting every query
// and every authorisation rule against data already live in production.
//
// Every aggregate root's schema and domain type MUST carry a
// `tenantId: TenantId` field, and every query MUST be scoped by it
// (P2, FR-33).
export type TenantId = string & { readonly __brand: 'TenantId' }
