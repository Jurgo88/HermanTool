// Payments [MVP · generic] — owns the online rental fee charge and its
// refunds, wrapped behind an anti-corruption layer so that the provider's
// vocabulary never leaks into the domain (Part 1 §4; D-07, D-26). Does
// NOT own the deposit — DepositObligation lives in Handover & Possession,
// cash recorded rather than money processed (D-07, P6).
//
// Dependency direction (Part 1 §4 context map): upstream of Availability
// & Reservation. This module and everything it imports must NEVER import
// Availability & Reservation — confirming a ReservationGroup after a
// successful payment (D-37, Finding 3) is cross-context orchestration and
// lives at the composition root, server/utils/payment-webhook-flow.ts,
// which is the one place allowed to import both contexts' published
// interfaces.
//
// Every Payment is an aggregate root and carries `tenantId: TenantId`
// (D-01, P2). Amounts are MonetaryAmount values (D-21). The Tenant's own
// Stripe account is used (D-26) — never the developer's (D-31: the
// secret key is the Tenant's, rotation is a two-party event).
//
// NFR-05/P6: card data never enters this platform. ./gateway.ts is the
// ACL boundary and the only file permitted to import the `stripe`
// package or reference a Stripe concept by name — createHostedCheckoutSession
// redirects to the provider's own hosted page; this process only ever
// sees a result, never a card number.
//
// OQ #1 (cancellation/refund policy) is launch-blocking and unresolved —
// this context implements ONLY the D-37/Finding-3 automatic refund (a
// payment-mechanics response to a re-acquire failure, not a policy-driven
// cancellation) and does not implement any Tenant- or Customer-initiated
// refund/cancellation path.
export type { Payment, PaymentStatus } from './types'

export {
  PaymentsError,
  PaymentNotFoundError,
  PaymentNotRefundableError,
  PaymentProviderUnavailableError,
  ProviderWebhookSignatureInvalidError,
  ReservationGroupAlreadyPaidError,
} from './types'

export type { CheckoutSessionRequest, CheckoutSessionResult, PaymentGateway, ProviderWebhookEvent } from './gateway'
export { createStripePaymentGateway } from './gateway'

export type { NewPayment, PaymentsRepository } from './repository'
export { createPostgresPaymentsRepository } from './repository'

export type { ApplyPaymentSucceededOutcome } from './payment'
export { applyPaymentSucceeded, computeRentalFeeAmount, refundPayment, startPayment } from './payment'
