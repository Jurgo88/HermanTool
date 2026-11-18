// Tenant policy values (D-65; later D-66), read and written at the
// composition root. Tenant & Access is [Future] in Part 1, so there is no
// context to own them yet: this is one row per Tenant, every read and write
// scoped by tenant_id (FR-33), every write attributed (FR-34).
//
// No value here is ever invented: a column the Tenant has not set is NULL
// and the feature that reads it treats NULL as "off" (OQ #31).
import type postgres from 'postgres'
import type { TenantId } from '../contexts/_shared'
import { assertValidOnlineDiscount } from '../contexts/payments'

export interface TenantSettings {
  onlinePaymentDiscountBasisPoints: number | null
  updatedAt: Date | null
}

export async function getTenantSettings(
  sql: postgres.Sql,
  tenantId: TenantId,
): Promise<TenantSettings> {
  const rows = await sql<
    { online_payment_discount_basis_points: number | null; updated_at: Date }[]
  >`
    select online_payment_discount_basis_points, updated_at from tenant_settings
    where tenant_id = ${tenantId}
  `
  const row = rows[0]
  return {
    onlinePaymentDiscountBasisPoints: row?.online_payment_discount_basis_points ?? null,
    updatedAt: row?.updated_at ?? null,
  }
}

export async function setOnlinePaymentDiscount(
  sql: postgres.Sql,
  params: { tenantId: TenantId; basisPoints: number | null; operatorId: string },
): Promise<TenantSettings> {
  assertValidOnlineDiscount(params.basisPoints)
  await sql`
    insert into tenant_settings (tenant_id, online_payment_discount_basis_points, updated_by_operator_id, updated_at)
    values (${params.tenantId}, ${params.basisPoints}, ${params.operatorId}, now())
    on conflict (tenant_id) do update set
      online_payment_discount_basis_points = excluded.online_payment_discount_basis_points,
      updated_by_operator_id = excluded.updated_by_operator_id,
      updated_at = now()
  `
  return getTenantSettings(sql, params.tenantId)
}
