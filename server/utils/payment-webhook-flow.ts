// The composition root for D-37 / Finding 3's payment-after-expiry
// handling: the ONE place in the codebase allowed to import both
// Payments' and Availability & Reservation's published interfaces,
// because confirming a ReservationGroup after a successful payment is
// cross-context orchestration that belongs to neither context alone
// (each context's own index.ts explicitly forbids importing the other).
//
// Kept as a plain, injectable function — not embedded in the webhook
// route handler — so the D-37 reacquire-fail-refunds-automatically path
// (Finding 3's proposed improvement, the highest-severity finding this
// milestone answers) is unit-testable against fakes, the same way
// server/contexts/availability-reservation/reservation.ts is tested
// without a database.
import type { TenantId } from '../contexts/_shared'
import {
  confirmReservationGroup,
  ReservationGroupReacquireFailedError,
  type AvailabilityReservationRepository,
} from '../contexts/availability-reservation'
import {
  applyPaymentSucceeded,
  refundPayment,
  type Payment,
  type PaymentGateway,
  type PaymentsRepository,
  type ProviderWebhookEvent,
} from '../contexts/payments'

export type PaymentWebhookOutcome =
  | { outcome: 'ignored' }
  | { outcome: 'already_processed'; payment: Payment }
  | { outcome: 'confirmed'; payment: Payment }
  | { outcome: 'refunded'; payment: Payment; failedReservationIds: number[] }

export interface PaymentWebhookDeps {
  tenantId: TenantId
  paymentsRepo: PaymentsRepository
  gateway: PaymentGateway
  availabilityRepo: AvailabilityReservationRepository
}

// Test-only instrumentation seam (IR-11's own concurrency proof,
// mirroring server/contexts/availability-reservation/reservation.ts's
// AcquisitionHooks/OQ #23 exactly). No-op in production. Exists so a
// test can force genuine interleaving between two webhook deliveries —
// pausing one after it has read the Payment but before the atomic
// transition — rather than relying on network-timing luck to exercise
// that interleaving.
export interface WebhookProcessingHooks {
  afterPaymentRead?: (params: { paymentId: number; status: string }) => Promise<void> | void
}

// FR-10/D-37: on a completed checkout, PaymentReceived confirms every
// Reservation in the group. Idempotent against Stripe's own webhook
// retries — a Payment already succeeded or refunded is reported as
// `already_processed` rather than re-run, since confirmReservationGroup
// is not safe to call twice against a group that may have moved on.
//
// IR-11 (Part 5 Finding 3): the guard is applyPaymentSucceeded's own
// atomic status transition, not a read of `payment.status` before
// calling it. Two genuinely concurrent deliveries of the same webhook
// event — Stripe's at-least-once retry semantics permit this, and its
// retry-on-timeout behaviour makes it likely precisely when this
// function is slow — can both read the SAME 'pending' row. Only one
// wins the transition; applyPaymentSucceeded's outcome tells THIS call
// whether it was the winner, and only the winner proceeds to
// confirmReservationGroup. This is the same class of defect D-33 closes
// on the reservation side, left open one context over until now.
//
// D-37/Finding 3: if confirmReservationGroup reports the RentalDays
// could not be re-acquired after expiry, the refund here is automatic —
// "a refund for a reservation that never confirmed is a payment error,
// not a cancellation" (Finding 3), so this does NOT require OQ #1.
export async function applyProviderWebhookEvent(
  deps: PaymentWebhookDeps,
  event: ProviderWebhookEvent,
  hooks?: WebhookProcessingHooks,
): Promise<PaymentWebhookOutcome> {
  if (event.type !== 'checkout_completed') return { outcome: 'ignored' }

  const { tenantId, paymentsRepo, gateway, availabilityRepo } = deps
  const payment = await paymentsRepo.getPaymentByProviderReference(tenantId, event.providerReference)
  // No matching Payment row: not a session this Tenant's flow created
  // (e.g. a misdirected or stale test event) — nothing to do, and
  // nothing to error about.
  if (!payment) return { outcome: 'ignored' }
  await hooks?.afterPaymentRead?.({ paymentId: payment.id, status: payment.status })

  const result = await applyPaymentSucceeded(paymentsRepo, {
    tenantId,
    payment,
    providerPaymentReference: event.providerPaymentReference,
  })
  if (result.outcome === 'already_processed') {
    return { outcome: 'already_processed', payment: result.payment }
  }

  const succeeded = result.payment
  try {
    await confirmReservationGroup(availabilityRepo, { tenantId, reservationGroupId: succeeded.reservationGroupId })
    return { outcome: 'confirmed', payment: succeeded }
  } catch (err) {
    if (err instanceof ReservationGroupReacquireFailedError) {
      const refunded = await refundPayment(paymentsRepo, gateway, { tenantId, payment: succeeded })
      return { outcome: 'refunded', payment: refunded, failedReservationIds: err.failedReservationIds }
    }
    throw err
  }
}
