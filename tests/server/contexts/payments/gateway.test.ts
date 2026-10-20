import { describe, expect, it } from 'vitest'
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
