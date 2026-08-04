// Domain types for Payments [MVP · generic] (Part 1 §4, §5; D-07, D-26,
// D-37, FR-09, FR-10, NFR-05, P6). See ./index.ts for the context's
// boundary and citations.
import type { MonetaryAmount, TenantId } from '../_shared'

// D-07/P6: Payments owns the online rental fee only, never the
// DepositObligation — that is cash, recorded by Handover & Possession,
// never processed by this context.
//
// status is the domain's own vocabulary, not Stripe's: 'pending' from
// startPayment until the provider confirms or the attempt dies.
// 'succeeded' is set by the webhook flow (D-37) and is what FR-10's
// "PaymentReceived" means in this context. 'refunded' covers both the
// automatic D-37/Finding-3 reacquire-fail refund and any future
// Tenant-initiated refund (OQ #1, not built). 'failed' is a provider-side
// failure/expiry, not a domain decision.
export type PaymentStatus = 'pending' | 'succeeded' | 'refunded' | 'failed'

// providerReference/providerPaymentReference are opaque strings from this
// context's own perspective — see ./gateway.ts for why the ACL still
// stops Stripe's actual types here. One Payment per attempt; FR-09 (one
// card payment per ReservationGroup, no partial payment) is enforced by
// startPayment refusing a second attempt once one has succeeded, backed
// by the migration's partial unique index.
export interface Payment {
  id: number
  tenantId: TenantId
  reservationGroupId: number
  amount: MonetaryAmount
  status: PaymentStatus
  providerReference: string
  providerPaymentReference: string | null
  createdAt: Date
  updatedAt: Date
}

export class PaymentsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

export class PaymentNotFoundError extends PaymentsError {
  constructor(identifier: number | string) {
    super(`Payment ${identifier} does not exist for this Tenant.`)
  }
}

// FR-09: guards startPayment against a second charge attempt once a
// ReservationGroup already has a succeeded Payment — the migration's
// partial unique index is the backstop under concurrency, this is the
// domain-level guard that produces a typed error instead of a raw
// constraint violation.
export class ReservationGroupAlreadyPaidError extends PaymentsError {
  constructor(reservationGroupId: number) {
    super(`ReservationGroup ${reservationGroupId} already has a succeeded Payment (FR-09).`)
  }
}

// NFR-05/P6: thrown by the gateway when a webhook payload's signature
// does not verify — the one place this context is allowed to know a
// signature exists, because rejecting a forged webhook is what makes the
// rest of the boundary meaningful.
export class ProviderWebhookSignatureInvalidError extends PaymentsError {
  constructor() {
    super('Webhook payload failed provider signature verification.')
  }
}

// A refund was attempted against a Payment that was never in a
// refundable state (never succeeded, or already refunded).
export class PaymentNotRefundableError extends PaymentsError {
  constructor(paymentId: number, status: PaymentStatus) {
    super(`Payment ${paymentId} is ${status} and cannot be refunded.`)
  }
}

// P6/NFR-05: the anti-corruption layer's own catch-all — ./gateway.ts is
// the only file allowed to know Stripe's error shapes, and it must never
// let one escape past this boundary raw (a Customer on the public
// checkout page has no business seeing a provider's internal error
// text). Covers both "the provider rejected the request" (e.g. no/bad
// API key — this dev environment's own NUXT_STRIPE_SECRET_KEY-is-empty
// state) and "the provider accepted it but returned something we can't
// use" (gateway.ts's own "no hosted checkout URL" case).
export class PaymentProviderUnavailableError extends PaymentsError {
  constructor(cause: unknown) {
    super('The payment provider could not start a hosted checkout session.')
    this.cause = cause
  }
}
