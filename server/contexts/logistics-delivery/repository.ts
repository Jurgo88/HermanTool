// Logistics & Delivery's data access (D-66). Every method takes the Tenant
// first (FR-33), as in every other context.
import type postgres from 'postgres'
import type { MonetaryAmount, TenantId } from '../_shared'
import {
  DeliveryFeeAlreadyAttestedError,
  DeliveryFeeCorrectionError,
  type Delivery,
  type DeliveryFeePayment,
  type DeliveryFeePaymentMethod,
  type DeliveryLeg,
  type DeliveryZoneMunicipality,
  type TimeWindow,
} from './types'

export interface NewDelivery {
  reservationGroupId: number
  leg: DeliveryLeg
  timeWindow: TimeWindow
  outsideZone: boolean
  municipalityId: number | null
  address: string
  fee: MonetaryAmount | null
}

export interface LogisticsDeliveryRepository {
  listZone(tenantId: TenantId): Promise<DeliveryZoneMunicipality[]>
  getZoneMunicipality(tenantId: TenantId, id: number): Promise<DeliveryZoneMunicipality | null>
  insertZoneMunicipality(
    tenantId: TenantId,
    params: { name: string; operatorId: string },
  ): Promise<DeliveryZoneMunicipality>
  markZoneMunicipalityRemoved(tenantId: TenantId, id: number, operatorId: string): Promise<void>

  insertDelivery(tenantId: TenantId, params: NewDelivery): Promise<Delivery>
  getDelivery(tenantId: TenantId, id: number): Promise<Delivery | null>
  listDeliveriesForGroup(tenantId: TenantId, reservationGroupId: number): Promise<Delivery[]>
  setOutsideZonePrice(
    tenantId: TenantId,
    id: number,
    params: { distanceKm: number; fee: MonetaryAmount; operatorId: string },
  ): Promise<Delivery>

  insertFeePayment(
    tenantId: TenantId,
    params: {
      deliveryId: number
      amount: MonetaryAmount
      method: DeliveryFeePaymentMethod
      operatorId: string
      supersedesId: number | null
      correctionReason: string | null
    },
  ): Promise<DeliveryFeePayment>
  listFeePayments(tenantId: TenantId, deliveryId: number): Promise<DeliveryFeePayment[]>

  // #237: a corrected km re-prices the leg and attests in one transaction.
  transaction<T>(fn: (repo: LogisticsDeliveryRepository) => Promise<T>): Promise<T>
}

interface DeliveryRow {
  id: number
  tenant_id: string
  reservation_group_id: number
  leg: DeliveryLeg
  time_window: TimeWindow
  outside_zone: boolean
  municipality_id: number | null
  address: string
  fee_cents: number | null
  fee_currency: MonetaryAmount['currency']
  distance_km: number | null
  priced_by_operator_id: string | null
  priced_at: Date | null
}

const mapDelivery = (row: DeliveryRow): Delivery => ({
  id: row.id,
  tenantId: row.tenant_id as TenantId,
  reservationGroupId: row.reservation_group_id,
  leg: row.leg,
  timeWindow: row.time_window,
  outsideZone: row.outside_zone,
  municipalityId: row.municipality_id,
  address: row.address,
  fee: row.fee_cents === null ? null : { amount: row.fee_cents, currency: row.fee_currency },
  distanceKm: row.distance_km,
  pricedByOperatorId: row.priced_by_operator_id,
  pricedAt: row.priced_at,
})

interface PaymentRow {
  id: number
  tenant_id: string
  delivery_id: number
  amount_cents: number
  currency: MonetaryAmount['currency']
  method: DeliveryFeePaymentMethod
  operator_id: string
  attested_at: Date
  supersedes_id: number | null
  correction_reason: string | null
}

const mapPayment = (row: PaymentRow): DeliveryFeePayment => ({
  id: row.id,
  tenantId: row.tenant_id as TenantId,
  deliveryId: row.delivery_id,
  amount: { amount: row.amount_cents, currency: row.currency },
  method: row.method,
  operatorId: row.operator_id,
  attestedAt: row.attested_at,
  supersedesId: row.supersedes_id,
  correctionReason: row.correction_reason,
})

// Postgres unique_violation: the one-original index or supersedes-once.
const isUniqueViolation = (err: unknown) => (err as { code?: string })?.code === '23505'

export function createPostgresLogisticsDeliveryRepository(
  sql: postgres.Sql | postgres.TransactionSql,
): LogisticsDeliveryRepository {
  return {
    async listZone(tenantId) {
      const rows = await sql<{ id: number; tenant_id: string; name: string }[]>`
        select id, tenant_id, name from delivery_zone_municipalities
        where tenant_id = ${tenantId} and removed_at is null
        order by name
      `
      return rows.map((r) => ({ id: r.id, tenantId: r.tenant_id as TenantId, name: r.name }))
    },
    async getZoneMunicipality(tenantId, id) {
      const rows = await sql<{ id: number; tenant_id: string; name: string }[]>`
        select id, tenant_id, name from delivery_zone_municipalities
        where tenant_id = ${tenantId} and id = ${id} and removed_at is null
      `
      const r = rows[0]
      return r ? { id: r.id, tenantId: r.tenant_id as TenantId, name: r.name } : null
    },
    async insertZoneMunicipality(tenantId, { name, operatorId }) {
      const rows = await sql<{ id: number; tenant_id: string; name: string }[]>`
        insert into delivery_zone_municipalities (tenant_id, name, created_by_operator_id)
        values (${tenantId}, ${name}, ${operatorId})
        returning id, tenant_id, name
      `
      const r = rows[0]!
      return { id: r.id, tenantId: r.tenant_id as TenantId, name: r.name }
    },
    async markZoneMunicipalityRemoved(tenantId, id, operatorId) {
      await sql`
        update delivery_zone_municipalities
        set removed_at = now(), removed_by_operator_id = ${operatorId}
        where tenant_id = ${tenantId} and id = ${id} and removed_at is null
      `
    },
    async insertDelivery(tenantId, p) {
      const rows = await sql<DeliveryRow[]>`
        insert into deliveries (
          tenant_id, reservation_group_id, leg, time_window, outside_zone, municipality_id,
          address, fee_cents, fee_currency
        ) values (
          ${tenantId}, ${p.reservationGroupId}, ${p.leg}, ${p.timeWindow}, ${p.outsideZone},
          ${p.municipalityId}, ${p.address}, ${p.fee?.amount ?? null}, ${p.fee?.currency ?? 'EUR'}
        )
        returning *
      `
      return mapDelivery(rows[0]!)
    },
    async getDelivery(tenantId, id) {
      const rows = await sql<DeliveryRow[]>`
        select * from deliveries where tenant_id = ${tenantId} and id = ${id}
      `
      return rows[0] ? mapDelivery(rows[0]) : null
    },
    async listDeliveriesForGroup(tenantId, reservationGroupId) {
      const rows = await sql<DeliveryRow[]>`
        select * from deliveries
        where tenant_id = ${tenantId} and reservation_group_id = ${reservationGroupId}
        order by leg
      `
      return rows.map(mapDelivery)
    },
    async setOutsideZonePrice(tenantId, id, { distanceKm, fee, operatorId }) {
      const rows = await sql<DeliveryRow[]>`
        update deliveries
        set distance_km = ${distanceKm}, fee_cents = ${fee.amount}, fee_currency = ${fee.currency},
          priced_by_operator_id = ${operatorId}, priced_at = now()
        where tenant_id = ${tenantId} and id = ${id} and outside_zone
        returning *
      `
      return mapDelivery(rows[0]!)
    },
    async insertFeePayment(tenantId, p) {
      try {
        const rows = await sql<PaymentRow[]>`
          insert into delivery_fee_payments (
            tenant_id, delivery_id, amount_cents, currency, method, operator_id,
            supersedes_id, correction_reason
          ) values (
            ${tenantId}, ${p.deliveryId}, ${p.amount.amount}, ${p.amount.currency}, ${p.method},
            ${p.operatorId}, ${p.supersedesId}, ${p.correctionReason}
          )
          returning *
        `
        return mapPayment(rows[0]!)
      } catch (err) {
        // A concurrent attestation won the race the domain's read could not see.
        if (isUniqueViolation(err)) {
          throw p.supersedesId === null
            ? new DeliveryFeeAlreadyAttestedError(p.deliveryId)
            : new DeliveryFeeCorrectionError('only the attestation in force can be corrected')
        }
        throw err
      }
    },
    async listFeePayments(tenantId, deliveryId) {
      const rows = await sql<PaymentRow[]>`
        select * from delivery_fee_payments
        where tenant_id = ${tenantId} and delivery_id = ${deliveryId}
        order by id
      `
      return rows.map(mapPayment)
    },
    async transaction<T>(fn: (repo: LogisticsDeliveryRepository) => Promise<T>) {
      // Already bound to a transaction: run inline (no nested begin).
      if (!('begin' in sql)) return fn(createPostgresLogisticsDeliveryRepository(sql))
      // begin<T> returns UnwrapPromiseArray<T>, which is T for a non-array T.
      return sql.begin((trx) => fn(createPostgresLogisticsDeliveryRepository(trx))) as Promise<T>
    },
  }
}
