import { describe, expect, it } from 'vitest'
import Stripe from 'stripe'
import { createStripePaymentGateway } from '../../../../server/contexts/payments/gateway'
import {
  PaymentProviderUnavailableError,
  ProviderWebhookSignatureInvalidError,
} from '../../../../server/contexts/payments/types'

describe('createStripePaymentGateway without a configured key', () => {
  const gateway = createStripePaymentGateway({ secretKey: '', webhookSecret: '' })

  it('starting a hosted checkout fails with the typed provider error', async () => {
    await expect(
      gateway.createHostedCheckoutSession({
        reservationGroupId: 1,
        amount: { amount: 1000, currency: 'EUR' },
        successUrl: 'http://localhost:3000/success',
        cancelUrl: 'http://localhost:3000/cancel',
      }),
    ).rejects.toBeInstanceOf(PaymentProviderUnavailableError)
  })

  it('a webhook is refused as unverified', () => {
    expect(() => gateway.parseWebhookEvent('{}', 't=1,v1=x')).toThrow(
      ProviderWebhookSignatureInvalidError,
    )
  })

  it('closing a hosted checkout reports it may still complete', async () => {
    await expect(gateway.expireHostedCheckoutSession('cs_test_x')).resolves.toBe(false)
  })
})

// FR-10, #244: genuinely signed events (the SDK's own test signer, no
// network) — only a PAID checkout is reported as completed.
describe('parseWebhookEvent: completed is not paid', () => {
  const webhookSecret = 'whsec_test_secret'
  const gateway = createStripePaymentGateway({ secretKey: 'sk_test_offline', webhookSecret })
  const signer = new Stripe('sk_test_offline')

  function signed(type: string, object: Record<string, unknown>) {
    const payload = JSON.stringify({
      id: 'evt_test',
      object: 'event',
      type,
      data: { object: { id: 'cs_test_1', object: 'checkout.session', ...object } },
    })
    return {
      payload,
      header: signer.webhooks.generateTestHeaderString({ payload, secret: webhookSecret }),
    }
  }

  const parse = (type: string, object: Record<string, unknown>) => {
    const { payload, header } = signed(type, object)
    return gateway.parseWebhookEvent(payload, header)
  }

  it('reports a paid checkout as completed, with its payment reference', () => {
    expect(
      parse('checkout.session.completed', { payment_status: 'paid', payment_intent: 'pi_1' }),
    ).toEqual({
      type: 'checkout_completed',
      providerReference: 'cs_test_1',
      providerPaymentReference: 'pi_1',
    })
  })

  it('ignores a completed checkout whose payment has not arrived (delayed method)', () => {
    expect(
      parse('checkout.session.completed', { payment_status: 'unpaid', payment_intent: 'pi_1' }),
    ).toEqual({ type: 'unrecognized' })
  })

  it('reports a delayed payment that later succeeded as completed', () => {
    expect(
      parse('checkout.session.async_payment_succeeded', {
        payment_status: 'paid',
        payment_intent: 'pi_2',
      }),
    ).toEqual({
      type: 'checkout_completed',
      providerReference: 'cs_test_1',
      providerPaymentReference: 'pi_2',
    })
  })

  it('ignores a delayed payment that failed, and any other event', () => {
    expect(parse('checkout.session.async_payment_failed', { payment_status: 'unpaid' })).toEqual({
      type: 'unrecognized',
    })
    expect(parse('checkout.session.expired', { payment_status: 'unpaid' })).toEqual({
      type: 'unrecognized',
    })
  })

  it('still refuses a payload signed with another secret', () => {
    const payload = JSON.stringify({
      id: 'evt_x',
      object: 'event',
      type: 'checkout.session.completed',
    })
    const header = signer.webhooks.generateTestHeaderString({ payload, secret: 'whsec_other' })
    expect(() => gateway.parseWebhookEvent(payload, header)).toThrow(
      ProviderWebhookSignatureInvalidError,
    )
  })
})
