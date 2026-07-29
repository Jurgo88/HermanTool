// Payments' data access, kept behind a narrow interface so the domain
// logic in ./payment.ts is testable without a database (Part 4 §14.2),
// mirroring every other context's repository shape. Every method takes
// `tenantId` as its first parameter (FR-33).
import type postgres from 'postgres'
import type { CurrencyCode, MonetaryAmount, TenantId } from '../_shared'
import type { Payment, PaymentStatus } from './types'

export interface NewPayment {
  reservationGroupId: number
  amount: MonetaryAmount
  providerReference: string
}

export interface PaymentsRepository {
  insertPayment(tenantId: TenantId, params: NewPayment): Promise<Payment>
  getPayment(tenantId: TenantId, id: number): Promise<Payment | null>
  getPaymentByProviderReference(tenantId: TenantId, providerReference: string): Promise<Payment | null>
  listPaymentsForGroup(tenantId: TenantId, reservationGroupId: number): Promise<Payment[]>

  // Guarded transitions, mirroring Availability & Reservation's
  // transitionReservationState: succeeds only if the row is currently in
  // `from`, returns null otherwise (already transitioned by a concurrent
  // webhook retry, or observed a stale state) — the caller decides what
  // that means, this method never throws for it.
  transitionPaymentStatus(
    tenantId: TenantId,
    id: number,
    params: { from: PaymentStatus; to: PaymentStatus; providerPaymentReference?: string },
  ): Promise<Payment | null>

  transaction<T>(fn: (repo: PaymentsRepository) => Promise<T>): Promise<T>
}

interface PaymentRow {
  id: number
  tenant_id: string
  reservation_group_id: number
  amount_cents: number
  currency: CurrencyCode
  status: PaymentStatus
  provider_reference: string
  provider_payment_reference: string | null
  created_at: Date
  updated_at: Date
}

function mapPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    tenantId: row.tenant_id as TenantId,
    reservationGroupId: row.reservation_group_id,
    amount: { amount: row.amount_cents, currency: row.currency },
    status: row.status,
    providerReference: row.provider_reference,
    providerPaymentReference: row.provider_payment_reference,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function createPostgresPaymentsRepository(sql: postgres.Sql | postgres.TransactionSql): PaymentsRepository {
  return {
    async insertPayment(tenantId, { reservationGroupId, amount, providerReference }) {
      const rows = await sql<PaymentRow[]>`
        insert into payments (tenant_id, reservation_group_id, amount_cents, currency, provider_reference)
        values (${tenantId}, ${reservationGroupId}, ${amount.amount}, ${amount.currency}, ${providerReference})
        returning *
      `
      return mapPayment(rows[0]!)
    },

    async getPayment(tenantId, id) {
      const rows = await sql<PaymentRow[]>`
        select * from payments where tenant_id = ${tenantId} and id = ${id}
      `
      return rows[0] ? mapPayment(rows[0]) : null
    },

    async getPaymentByProviderReference(tenantId, providerReference) {
      const rows = await sql<PaymentRow[]>`
        select * from payments where tenant_id = ${tenantId} and provider_reference = ${providerReference}
      `
      return rows[0] ? mapPayment(rows[0]) : null
    },

    async listPaymentsForGroup(tenantId, reservationGroupId) {
      const rows = await sql<PaymentRow[]>`
        select * from payments
        where tenant_id = ${tenantId} and reservation_group_id = ${reservationGroupId}
        order by id
      `
      return rows.map(mapPayment)
    },

    async transitionPaymentStatus(tenantId, id, { from, to, providerPaymentReference }) {
      const rows = await sql<PaymentRow[]>`
        update payments
        set status = ${to},
            updated_at = now(),
            provider_payment_reference = coalesce(${providerPaymentReference ?? null}, provider_payment_reference)
        where tenant_id = ${tenantId} and id = ${id} and status = ${from}
        returning *
      `
      return rows[0] ? mapPayment(rows[0]) : null
    },

    async transaction<T>(fn: (repo: PaymentsRepository) => Promise<T>) {
      // See Asset Registry's repository for why this guard exists:
      // `TransactionSql` has no `.begin()` — nothing here ever calls
      // `.transaction()` on an already-transaction-bound repo.
      if (!('begin' in sql)) {
        throw new Error('Nested transactions are not supported — this repository is already bound to one.')
      }
      return sql.begin((trx) => fn(createPostgresPaymentsRepository(trx))) as Promise<T>
    },
  }
}
