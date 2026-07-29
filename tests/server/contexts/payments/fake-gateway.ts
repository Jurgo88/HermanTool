// In-memory stand-in for PaymentGateway (server/contexts/payments/gateway.ts)
// — proves ./payment.ts and server/utils/payment-webhook-flow.ts against
// the ACL's interface without calling Stripe or verifying a real
// signature. Deliberately never imports the `stripe` package, same as
// the real gateway's callers never see a Stripe type.
import type { MonetaryAmount } from '../../../../server/contexts/_shared'
import type {
  CheckoutSessionRequest,
  PaymentGateway,
  ProviderWebhookEvent,
} from '../../../../server/contexts/payments/gateway'

export interface FakePaymentGateway extends PaymentGateway {
  createdSessions: CheckoutSessionRequest[]
  refundCalls: { providerPaymentReference: string; amount: MonetaryAmount }[]
}

export function createFakePaymentGateway(): FakePaymentGateway {
  let counter = 0
  const createdSessions: CheckoutSessionRequest[] = []
  const refundCalls: { providerPaymentReference: string; amount: MonetaryAmount }[] = []

  return {
    createdSessions,
    refundCalls,

    async createHostedCheckoutSession(request) {
      createdSessions.push(request)
      const providerReference = `sess_${++counter}`
      return { providerReference, redirectUrl: `https://provider.test/checkout/${providerReference}` }
    },

    parseWebhookEvent(rawBody, signatureHeader): ProviderWebhookEvent {
      if (!signatureHeader) throw new Error('missing signature (test fake)')
      return JSON.parse(rawBody) as ProviderWebhookEvent
    },

    async refund(providerPaymentReference, amount) {
      refundCalls.push({ providerPaymentReference, amount })
    },
  }
}
