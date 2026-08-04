// Payments domain logic [MVP · generic] (W2; D-07, D-26, D-37, FR-09,
// FR-10, NFR-05, P6). See ./index.ts for the context's boundary.
//
// This module never imports Availability & Reservation (see ./index.ts's
// module doc) — confirming a ReservationGroup after a successful payment
// is cross-context orchestration and lives at the composition root
// (server/utils/payment-webhook-flow.ts), not here.
import type { MonetaryAmount, TenantId } from '../_shared'
import { createMonetaryAmount } from '../_shared'
import type { PaymentGateway } from './gateway'
import type { PaymentsRepository } from './repository'
import type { Payment } from './types'
import { PaymentNotFoundError, PaymentNotRefundableError, ReservationGroupAlreadyPaidError } from './types'

// FR-09: "One card payment covers exactly one ReservationGroup. Partial
// payment is not representable." There is no per-line payment — every
// Reservation's own AssetType day-rate, multiplied by its own
// RentalPeriod length, is summed into the single amount this whole
// ReservationGroup is charged.
export function computeRentalFeeAmount(lines: { dayRate: MonetaryAmount; days: number }[]): MonetaryAmount {
  if (lines.length === 0) {
    throw new Error('Cannot compute a rental fee for an empty ReservationGroup.')
  }
  const currency = lines[0]!.dayRate.currency
  const totalCents = lines.reduce((sum, line) => {
    if (line.dayRate.currency !== currency) {
      // D-21/A-03: single currency in the pilot. A mismatch here means an
      // AssetType was priced in a currency this deployment never
      // supports — a data problem, not a rate a Customer can be charged.
      throw new Error(`Mixed currencies in one ReservationGroup: ${currency} and ${line.dayRate.currency}.`)
    }
    return sum + line.dayRate.amount * line.days
  }, 0)
  return createMonetaryAmount(totalCents, currency)
}

// W2, FR-09: starts the ReservationGroup's one and only payment attempt.
// Guards ReservationGroupAlreadyPaidError so a retried checkout-session
// request can't produce a second charge once one has already succeeded —
// the migration's partial unique index is the concurrency backstop, this
// is the domain-level guard.
export async function startPayment(
  repo: PaymentsRepository,
  gateway: PaymentGateway,
  params: {
    tenantId: TenantId
    reservationGroupId: number
    amount: MonetaryAmount
    successUrl: string
    cancelUrl: string
  },
): Promise<{ payment: Payment; redirectUrl: string }> {
  const { tenantId, reservationGroupId, amount, successUrl, cancelUrl } = params

  const existing = await repo.listPaymentsForGroup(tenantId, reservationGroupId)
  if (existing.some((p) => p.status === 'succeeded')) {
    throw new ReservationGroupAlreadyPaidError(reservationGroupId)
  }

  const session = await gateway.createHostedCheckoutSession({ reservationGroupId, amount, successUrl, cancelUrl })
  const payment = await repo.insertPayment(tenantId, {
    reservationGroupId,
    amount,
    providerReference: session.providerReference,
  })

  return { payment, redirectUrl: session.redirectUrl }
}

// IR-11 (Part 5 Finding 3, D-33's own class of defect one context over):
// the caller's decision to run a side effect exactly once — here,
// confirmReservationGroup — must be gated on WHICH concurrent delivery
// actually won the atomic transition, not merely on "is this Payment
// succeeded now". Two genuinely concurrent webhook deliveries can both
// read status='pending' and both call this function; exactly one
// transitionPaymentStatus call below wins (the row-level guard), and the
// other must be told it lost, not handed back a Payment object
// indistinguishable from the winner's. Returning a bare Payment (the
// previous shape) could not carry that distinction — see
// server/utils/payment-webhook-flow.ts, the one caller.
export type ApplyPaymentSucceededOutcome =
  | { outcome: 'already_processed'; payment: Payment }
  | { outcome: 'succeeded'; payment: Payment }

// D-37/Finding 3: marks a Payment succeeded. Idempotent against a
// duplicate webhook delivery for the same event — a Payment already
// 'succeeded' (or 'refunded': the guard below is `from: 'pending'`, so
// any other status falls through to the same already_processed path) is
// reported as such rather than re-transitioned or treated as an error,
// since Stripe's own retry semantics mean the same event can arrive more
// than once.
export async function applyPaymentSucceeded(
  repo: PaymentsRepository,
  params: { tenantId: TenantId; payment: Payment; providerPaymentReference: string | null },
): Promise<ApplyPaymentSucceededOutcome> {
  const { tenantId, payment, providerPaymentReference } = params
  if (payment.status === 'succeeded') return { outcome: 'already_processed', payment }

  const transitioned = await repo.transitionPaymentStatus(tenantId, payment.id, {
    from: 'pending',
    to: 'succeeded',
    providerPaymentReference: providerPaymentReference ?? undefined,
  })
  if (transitioned) return { outcome: 'succeeded', payment: transitioned }

  // A guard miss here means the row moved between our read and this
  // update — a concurrent delivery (or an already-refunded Payment) got
  // there first. Re-read for an accurate current Payment object, but the
  // outcome is already_processed regardless of what it now says: THIS
  // call did not perform the transition, so the caller must not run any
  // effect gated on "I am the one who confirmed this."
  const current = await repo.getPayment(tenantId, payment.id)
  if (!current) throw new PaymentNotFoundError(payment.id)
  return { outcome: 'already_processed', payment: current }
}

// D-37/Finding 3: the automatic refund path when PaymentReceived arrives
// for a ReservationGroup whose RentalDays could not be re-acquired after
// expiry. This is a payment-mechanics error, not a cancellation (Finding
// 3's proposed improvement) — it does not require OQ #1.
export async function refundPayment(
  repo: PaymentsRepository,
  gateway: PaymentGateway,
  params: { tenantId: TenantId; payment: Payment },
): Promise<Payment> {
  const { tenantId, payment } = params
  if (payment.status === 'refunded') return payment
  if (payment.status !== 'succeeded' || !payment.providerPaymentReference) {
    throw new PaymentNotRefundableError(payment.id, payment.status)
  }

  await gateway.refund(payment.providerPaymentReference, payment.amount)

  const transitioned = await repo.transitionPaymentStatus(tenantId, payment.id, {
    from: 'succeeded',
    to: 'refunded',
  })
  if (transitioned) return transitioned
  const current = await repo.getPayment(tenantId, payment.id)
  if (!current) throw new PaymentNotFoundError(payment.id)
  return current
}
