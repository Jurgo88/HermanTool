import { beforeEach, describe, expect, it } from 'vitest'
import type { TenantId } from '../../../../server/contexts/_shared'
import {
  applyPaymentSucceeded,
  computeRentalFeeAmount,
  refundPayment,
  startPayment,
} from '../../../../server/contexts/payments/payment'
import { PaymentNotRefundableError, ReservationGroupAlreadyPaidError } from '../../../../server/contexts/payments/types'
import { createFakePaymentGateway, type FakePaymentGateway } from './fake-gateway'
import { createFakePaymentsRepository, type FakePaymentsRepository } from './fake-repository'

const tenantA = '11111111-1111-1111-1111-111111111111' as TenantId

const startPaymentParams = {
  tenantId: tenantA,
  reservationGroupId: 1,
  amount: { amount: 5000, currency: 'EUR' as const },
  successUrl: 'https://example.test/success',
  cancelUrl: 'https://example.test/cancel',
}

describe('computeRentalFeeAmount', () => {
  it('sums dayRate x days across every line into one amount (FR-09: whole ReservationGroup, no partial payment)', () => {
    const amount = computeRentalFeeAmount([
      { dayRate: { amount: 1000, currency: 'EUR' }, days: 3 },
      { dayRate: { amount: 500, currency: 'EUR' }, days: 2 },
    ])
    expect(amount).toEqual({ amount: 4000, currency: 'EUR' })
  })

  it('refuses an empty ReservationGroup', () => {
    expect(() => computeRentalFeeAmount([])).toThrow()
  })

  it('refuses mixed currencies within one ReservationGroup (D-21, A-03)', () => {
    expect(() =>
      computeRentalFeeAmount([
        { dayRate: { amount: 1000, currency: 'EUR' }, days: 1 },
        { dayRate: { amount: 1000, currency: 'USD' as never }, days: 1 },
      ]),
    ).toThrow()
  })
})

describe('startPayment', () => {
  let repo: FakePaymentsRepository
  let gateway: FakePaymentGateway

  beforeEach(() => {
    repo = createFakePaymentsRepository()
    gateway = createFakePaymentGateway()
  })

  it('creates a pending Payment and returns the provider hosted-checkout redirect URL (D-26, NFR-05)', async () => {
    const { payment, redirectUrl } = await startPayment(repo, gateway, startPaymentParams)

    expect(payment.status).toBe('pending')
    expect(payment.reservationGroupId).toBe(1)
    expect(payment.amount).toEqual(startPaymentParams.amount)
    expect(redirectUrl).toMatch(/^https:\/\/provider\.test\/checkout\//)
  })

  it('refuses a second payment attempt once one has succeeded (FR-09: one card payment per ReservationGroup)', async () => {
    const { payment } = await startPayment(repo, gateway, startPaymentParams)
    await repo.transitionPaymentStatus(tenantA, payment.id, { from: 'pending', to: 'succeeded' })

    await expect(startPayment(repo, gateway, startPaymentParams)).rejects.toThrow(ReservationGroupAlreadyPaidError)
  })
})

describe('applyPaymentSucceeded', () => {
  let repo: FakePaymentsRepository
  let gateway: FakePaymentGateway

  beforeEach(() => {
    repo = createFakePaymentsRepository()
    gateway = createFakePaymentGateway()
  })

  it('transitions pending -> succeeded and records the provider payment reference (FR-10)', async () => {
    const { payment } = await startPayment(repo, gateway, startPaymentParams)

    const result = await applyPaymentSucceeded(repo, {
      tenantId: tenantA,
      payment,
      providerPaymentReference: 'pi_123',
    })

    expect(result.outcome).toBe('succeeded')
    expect(result.payment.status).toBe('succeeded')
    expect(result.payment.providerPaymentReference).toBe('pi_123')
  })

  it('is idempotent against a Payment already succeeded (webhook redelivery), and reports already_processed (IR-11)', async () => {
    const { payment } = await startPayment(repo, gateway, startPaymentParams)
    const first = await applyPaymentSucceeded(repo, {
      tenantId: tenantA,
      payment,
      providerPaymentReference: 'pi_123',
    })

    const second = await applyPaymentSucceeded(repo, {
      tenantId: tenantA,
      payment: first.payment,
      providerPaymentReference: 'pi_123',
    })

    // IR-11: the first call is the one that actually transitioned the
    // row; a redelivery must be told it did NOT win, so a caller gating
    // a side effect on "succeeded" (payment-webhook-flow.ts's
    // confirmReservationGroup) runs it exactly once.
    expect(first.outcome).toBe('succeeded')
    expect(second.outcome).toBe('already_processed')
    expect(second.payment).toEqual(first.payment)
  })
})

describe('refundPayment', () => {
  let repo: FakePaymentsRepository
  let gateway: FakePaymentGateway

  beforeEach(() => {
    repo = createFakePaymentsRepository()
    gateway = createFakePaymentGateway()
  })

  it('refunds a succeeded Payment through the gateway and marks it refunded (D-37, Finding 3)', async () => {
    const { payment } = await startPayment(repo, gateway, startPaymentParams)
    const { payment: succeeded } = await applyPaymentSucceeded(repo, {
      tenantId: tenantA,
      payment,
      providerPaymentReference: 'pi_123',
    })

    const refunded = await refundPayment(repo, gateway, { tenantId: tenantA, payment: succeeded })

    expect(refunded.status).toBe('refunded')
    expect(gateway.refundCalls).toEqual([{ providerPaymentReference: 'pi_123', amount: startPaymentParams.amount }])
  })

  it('refuses to refund a Payment that never succeeded', async () => {
    const { payment } = await startPayment(repo, gateway, startPaymentParams)

    await expect(refundPayment(repo, gateway, { tenantId: tenantA, payment })).rejects.toThrow(
      PaymentNotRefundableError,
    )
  })

  it('is idempotent against a Payment already refunded, and never calls the gateway twice', async () => {
    const { payment } = await startPayment(repo, gateway, startPaymentParams)
    const { payment: succeeded } = await applyPaymentSucceeded(repo, {
      tenantId: tenantA,
      payment,
      providerPaymentReference: 'pi_123',
    })
    const refunded = await refundPayment(repo, gateway, { tenantId: tenantA, payment: succeeded })

    const second = await refundPayment(repo, gateway, { tenantId: tenantA, payment: refunded })

    expect(second).toEqual(refunded)
    expect(gateway.refundCalls).toHaveLength(1)
  })
})
