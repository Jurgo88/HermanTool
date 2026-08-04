// The anti-corruption layer itself (NFR-05, P6, D-26, Part 1 "Payments"
// boundary). This is the ONLY file in the codebase allowed to import the
// `stripe` package or reference a Stripe concept by name. Every export
// here speaks in this context's own vocabulary — MonetaryAmount, opaque
// provider references, a closed ProviderWebhookEvent union — so that
// ./payment.ts, every other context, and every route stay ignorant of
// what a "payment intent" or a "checkout session" is.
//
// NFR-05 — card data never touches the platform: createHostedCheckoutSession
// returns a redirect URL to the provider's OWN hosted page (D-26). This
// process never receives a card number, a CVV, or a PAN, in a request
// body, a log line, or anywhere else — the provider's hosted page is the
// entire reason NFR-05 is achievable at all.
import Stripe from 'stripe'
import type { MonetaryAmount } from '../_shared'
import { ProviderWebhookSignatureInvalidError } from './types'

export interface CheckoutSessionRequest {
  reservationGroupId: number
  amount: MonetaryAmount
  successUrl: string
  cancelUrl: string
}

export interface CheckoutSessionResult {
  providerReference: string
  redirectUrl: string
}

// A closed union, not a passthrough of the provider's own event catalogue
// (Stripe fires dozens of event types this context has no use for) —
// `unrecognized` is the deliberate default for anything this domain
// doesn't act on, so a route never has to know the provider's event
// vocabulary to safely ignore an event.
export type ProviderWebhookEvent =
  | { type: 'checkout_completed'; providerReference: string; providerPaymentReference: string | null }
  | { type: 'unrecognized' }

// D-26/W2: the hosted-checkout provider port. `refund` takes the
// providerPaymentReference (the completed charge), not the
// providerReference (the checkout session) — Stripe refunds a
// PaymentIntent, not a Session, and this interface's job is to make that
// distinction disappear for every caller except this file.
export interface PaymentGateway {
  createHostedCheckoutSession(request: CheckoutSessionRequest): Promise<CheckoutSessionResult>
  parseWebhookEvent(rawBody: string, signatureHeader: string | undefined): ProviderWebhookEvent
  refund(providerPaymentReference: string, amount: MonetaryAmount): Promise<void>
}

export function createStripePaymentGateway(params: { secretKey: string; webhookSecret: string }): PaymentGateway {
  const stripe = new Stripe(params.secretKey)

  return {
    async createHostedCheckoutSession({ reservationGroupId, amount, successUrl, cancelUrl }) {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [
          {
            price_data: {
              currency: amount.currency.toLowerCase(),
              unit_amount: amount.amount,
              product_data: { name: `Rental fee — ReservationGroup ${reservationGroupId}` },
            },
            quantity: 1,
          },
        ],
        // Correlates a webhook event back to our own Payment row without
        // trusting the client-supplied ids in the request — metadata is
        // the provider's own tamper-evident channel for this.
        metadata: { reservationGroupId: String(reservationGroupId) },
        success_url: successUrl,
        cancel_url: cancelUrl,
      })

      if (!session.url) {
        throw new Error('Stripe did not return a hosted checkout URL.')
      }

      return { providerReference: session.id, redirectUrl: session.url }
    },

    parseWebhookEvent(rawBody, signatureHeader) {
      if (!signatureHeader) throw new ProviderWebhookSignatureInvalidError()

      let event: Stripe.Event
      try {
        event = stripe.webhooks.constructEvent(rawBody, signatureHeader, params.webhookSecret)
      } catch {
        throw new ProviderWebhookSignatureInvalidError()
      }

      if (event.type === 'checkout.session.completed') {
        // eslint-disable-next-line id-denylist -- Stripe's own SDK type name (D-34); not this codebase's domain "Session"
        const session = event.data.object as Stripe.Checkout.Session
        const providerPaymentReference =
          typeof session.payment_intent === 'string' ? session.payment_intent : (session.payment_intent?.id ?? null)
        return { type: 'checkout_completed', providerReference: session.id, providerPaymentReference }
      }

      return { type: 'unrecognized' }
    },

    async refund(providerPaymentReference, amount) {
      await stripe.refunds.create({
        payment_intent: providerPaymentReference,
        amount: amount.amount,
      })
    },
  }
}
