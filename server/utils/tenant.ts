import type postgres from 'postgres'
import type { TenantId } from '../contexts/_shared'

// D-01: exactly one Tenant during the pilot, no onboarding surface.
// Public (Visitor) routes have no session to resolve a Tenant from —
// unlike an Operator route, which gets it from requireOperator() — so
// this returns the single seeded Tenant. `order by created_at`, not
// `limit 1` alone: the oldest row is the one the first migration
// seeded, deterministic even if other Tenant rows exist.
export async function getSeededTenantId(sql: postgres.Sql): Promise<TenantId> {
  const [row] = await sql<{ id: string }[]>`select id from tenants order by created_at limit 1`
  return row!.id as TenantId
}
