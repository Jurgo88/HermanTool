// OnSitePayment (D-65; issue #215): the Operator's attestation that a
// ReservationGroup's rental fee was received at the counter through the
// Tenant's own eKasa — cash, card terminal or QR. Like DepositTaken (D-07,
// P6) it is an attestation, not a transaction: the platform moves no money
// and issues no receipt. Payments stays the context of confirmed online
// money; this lives in Handover & Possession, next to the deposit.
//
// Append-only (D-10). A mistake is corrected by a new attestation that
// names the one it supersedes and says why (P1) — never by an edit.
//
// HandoverOut refuses a group whose rental fee is neither paid online nor
// attested here (assertRentalFeeSettled), by the same pattern as D-35's
// terms check.
import type postgres from 'postgres'
import type { MonetaryAmount, TenantId } from '../_shared'
import { createMonetaryAmount } from '../_shared'
import type { PaymentMethod, ReservationGroup } from '../availability-reservation'
import { HandoverPossessionError } from './types'

export type OnSitePaymentMethod = 'cash' | 'card_terminal' | 'qr'

export interface OnSitePayment {
  id: number
  tenantId: TenantId
  reservationGroupId: number
  amount: MonetaryAmount
  method: OnSitePaymentMethod
  operatorId: string
  attestedAt: Date
  supersedesId: number | null
  correctionReason: string | null
}

export interface NewOnSitePayment {
  reservationGroupId: number
  amount: MonetaryAmount
  method: OnSitePaymentMethod
  operatorId: string
  supersedesId: number | null
  correctionReason: string | null
}

export interface OnSitePaymentRepository {
  insertOnSitePayment(tenantId: TenantId, params: NewOnSitePayment): Promise<OnSitePayment>
  listOnSitePaymentsForGroup(
    tenantId: TenantId,
    reservationGroupId: number,
  ): Promise<OnSitePayment[]>
}

export class OnSitePaymentNotExpectedError extends HandoverPossessionError {
  constructor(reservationGroupId: number) {
    super(
      `ReservationGroup ${reservationGroupId} is paid online; there is no on-site payment to attest.`,
    )
  }
}

export class OnSitePaymentAlreadyAttestedError extends HandoverPossessionError {
  constructor(reservationGroupId: number) {
    super(
      `ReservationGroup ${reservationGroupId} already has an on-site payment; correct it with a new attestation that supersedes it.`,
    )
  }
}

export class OnSitePaymentCorrectionError extends HandoverPossessionError {
  constructor(detail: string) {
    super(`On-site payment correction refused: ${detail}.`)
  }
}

// D-65: HandoverOut refused — the rental fee is neither paid online nor
// attested on site.
export class RentalFeeNotSettledError extends HandoverPossessionError {
  constructor(reservationGroupId: number) {
    super(
      `ReservationGroup ${reservationGroupId}'s rental fee is neither paid online nor attested on site (D-65).`,
    )
  }
}

// The attestation in force: the one no later attestation supersedes.
export function currentOnSitePayment(payments: OnSitePayment[]): OnSitePayment | null {
  const superseded = new Set(
    payments.map((p) => p.supersedesId).filter((id): id is number => id !== null),
  )
  const current = payments.filter((p) => !superseded.has(p.id))
  return current.sort((a, b) => b.id - a.id)[0] ?? null
}

export async function attestOnSitePayment(
  repo: OnSitePaymentRepository,
  params: {
    tenantId: TenantId
    group: Pick<ReservationGroup, 'id' | 'paymentMethod'>
    amount: MonetaryAmount
    method: OnSitePaymentMethod
    // The PIN-resolved Operator (D-16, D-48, F8, FR-34).
    operatorId: string
    correction?: { supersedesId: number; reason: string }
  },
): Promise<OnSitePayment> {
  const { tenantId, group, amount, method, operatorId, correction } = params
  if (group.paymentMethod !== 'on_site') throw new OnSitePaymentNotExpectedError(group.id)
  createMonetaryAmount(amount.amount, amount.currency) // D-21: a real amount with its currency

  const current = currentOnSitePayment(await repo.listOnSitePaymentsForGroup(tenantId, group.id))
  if (!correction) {
    if (current) throw new OnSitePaymentAlreadyAttestedError(group.id)
  } else {
    if (!correction.reason.trim()) throw new OnSitePaymentCorrectionError('a reason is required')
    if (!current || current.id !== correction.supersedesId) {
      throw new OnSitePaymentCorrectionError('only the attestation in force can be corrected')
    }
  }

  return repo.insertOnSitePayment(tenantId, {
    reservationGroupId: group.id,
    amount,
    method,
    operatorId,
    supersedesId: correction?.supersedesId ?? null,
    correctionReason: correction ? correction.reason.trim() : null,
  })
}

// D-65's HandoverOut guard. An online group reaches Confirmed only once its
// Payment succeeded (FR-10), so Confirmed already means paid; an on-site
// group reaches Confirmed by e-mail, so it needs the attestation.
export async function assertRentalFeeSettled(
  repo: OnSitePaymentRepository,
  params: { tenantId: TenantId; reservationGroupId: number; paymentMethod: PaymentMethod },
): Promise<void> {
  if (params.paymentMethod === 'online') return
  const current = currentOnSitePayment(
    await repo.listOnSitePaymentsForGroup(params.tenantId, params.reservationGroupId),
  )
  if (!current) throw new RentalFeeNotSettledError(params.reservationGroupId)
}

interface OnSitePaymentRow {
  id: number
  tenant_id: string
  reservation_group_id: number
  amount_cents: number
  currency: MonetaryAmount['currency']
  method: OnSitePaymentMethod
  operator_id: string
  attested_at: Date
  supersedes_id: number | null
  correction_reason: string | null
}

function mapRow(row: OnSitePaymentRow): OnSitePayment {
  return {
    id: row.id,
    tenantId: row.tenant_id as TenantId,
    reservationGroupId: row.reservation_group_id,
    amount: { amount: row.amount_cents, currency: row.currency },
    method: row.method,
    operatorId: row.operator_id,
    attestedAt: row.attested_at,
    supersedesId: row.supersedes_id,
    correctionReason: row.correction_reason,
  }
}

export function createPostgresOnSitePaymentRepository(
  sql: postgres.Sql | postgres.TransactionSql,
): OnSitePaymentRepository {
  return {
    async insertOnSitePayment(tenantId, params) {
      const rows = await sql<OnSitePaymentRow[]>`
        insert into on_site_payments (
          tenant_id, reservation_group_id, amount_cents, currency, method, operator_id,
          supersedes_id, correction_reason
        ) values (
          ${tenantId}, ${params.reservationGroupId}, ${params.amount.amount}, ${params.amount.currency},
          ${params.method}, ${params.operatorId}, ${params.supersedesId}, ${params.correctionReason}
        )
        returning *
      `
      return mapRow(rows[0]!)
    },

    async listOnSitePaymentsForGroup(tenantId, reservationGroupId) {
      const rows = await sql<OnSitePaymentRow[]>`
        select * from on_site_payments
        where tenant_id = ${tenantId} and reservation_group_id = ${reservationGroupId}
        order by id
      `
      return rows.map(mapRow)
    },
  }
}
