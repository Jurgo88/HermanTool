// Tenant policy values (D-65; later D-66), read and written at the
// composition root. Tenant & Access is [Future] in Part 1, so there is no
// context to own them yet: this is one row per Tenant, every read and write
// scoped by tenant_id (FR-33), every write attributed (FR-34).
//
// No value here is ever invented: a column the Tenant has not set is NULL
// and the feature that reads it treats NULL as "off" (OQ #31).
import type postgres from 'postgres'
import { createMonetaryAmount, type MonetaryAmount, type TenantId } from '../contexts/_shared'
import { assertValidOnlineDiscount } from '../contexts/payments'

export interface TenantSettings {
  onlinePaymentDiscountBasisPoints: number | null
  // D-66 (OQ #32): null until the Tenant sets them.
  deliveryFlatFee: MonetaryAmount | null
  deliveryPerKmRate: MonetaryAmount | null
  updatedAt: Date | null
}

export async function getTenantSettings(
  sql: postgres.Sql,
  tenantId: TenantId,
): Promise<TenantSettings> {
  const rows = await sql<
    {
      online_payment_discount_basis_points: number | null
      delivery_flat_fee_cents: number | null
      delivery_per_km_cents: number | null
      delivery_fee_currency: MonetaryAmount['currency']
      updated_at: Date
    }[]
  >`
    select online_payment_discount_basis_points, delivery_flat_fee_cents, delivery_per_km_cents,
      delivery_fee_currency, updated_at
    from tenant_settings
    where tenant_id = ${tenantId}
  `
  const row = rows[0]
  const money = (cents: number | null | undefined) =>
    cents === null || cents === undefined
      ? null
      : createMonetaryAmount(cents, row?.delivery_fee_currency ?? 'EUR')
  return {
    onlinePaymentDiscountBasisPoints: row?.online_payment_discount_basis_points ?? null,
    deliveryFlatFee: money(row?.delivery_flat_fee_cents),
    deliveryPerKmRate: money(row?.delivery_per_km_cents),
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

// D-66: the flat fee per Delivery/Collection and the per-km rate outside
// the zone, in minor units of EUR (D-21). Null clears a value (OQ #32).
export async function setDeliveryFees(
  sql: postgres.Sql,
  params: {
    tenantId: TenantId
    flatFeeCents: number | null
    perKmCents: number | null
    operatorId: string
  },
): Promise<TenantSettings> {
  for (const value of [params.flatFeeCents, params.perKmCents]) {
    if (value !== null && (!Number.isInteger(value) || value < 0)) {
      throw new Error('Delivery fees are whole, non-negative amounts in minor units.')
    }
  }
  await sql`
    insert into tenant_settings
      (tenant_id, delivery_flat_fee_cents, delivery_per_km_cents, updated_by_operator_id, updated_at)
    values (${params.tenantId}, ${params.flatFeeCents}, ${params.perKmCents}, ${params.operatorId}, now())
    on conflict (tenant_id) do update set
      delivery_flat_fee_cents = excluded.delivery_flat_fee_cents,
      delivery_per_km_cents = excluded.delivery_per_km_cents,
      updated_by_operator_id = excluded.updated_by_operator_id,
      updated_at = now()
  `
  return getTenantSettings(sql, params.tenantId)
}

export function deliverySettingsOf(settings: TenantSettings) {
  return { flatFee: settings.deliveryFlatFee, perKmRate: settings.deliveryPerKmRate }
}
