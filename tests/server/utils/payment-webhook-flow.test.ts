// Unit tests for server/utils/payment-webhook-flow.ts — the composition
// root for D-37 / Finding 3's payment-after-expiry handling, the
// highest-severity finding this milestone answers. Exercised entirely
// against fakes (no database, no Stripe), mirroring
// tests/server/contexts/availability-reservation/reservation.test.ts.
import { beforeEach, describe, expect, it } from 'vitest'
import type { TenantId } from '../../../server/contexts/_shared'
import { checkoutReservationGroup } from '../../../server/contexts/availability-reservation/reservation'
import { startPayment } from '../../../server/contexts/payments/payment'
import { applyProviderWebhookEvent } from '../../../server/utils/payment-webhook-flow'
import {
  createFakeAvailabilityReservationRepository,
  type FakeAvailabilityReservationRepository,
} from '../contexts/availability-reservation/fake-repository'
import { createFakePaymentGateway, type FakePaymentGateway } from '../contexts/payments/fake-gateway'
import { createFakePaymentsRepository, type FakePaymentsRepository } from '../contexts/payments/fake-repository'

const tenantA = '11111111-1111-1111-1111-111111111111' as TenantId
const HAMMER = 1
const DAY = '2026-03-05'

describe('applyProviderWebhookEvent', () => {
  let availabilityRepo: FakeAvailabilityReservationRepository
  let paymentsRepo: FakePaymentsRepository
  let gateway: FakePaymentGateway

  beforeEach(() => {
    availabilityRepo = createFakeAvailabilityReservationRepository()
    availabilityRepo.seedCapacity(HAMMER, 1)
    paymentsRepo = createFakePaymentsRepository()
    gateway = createFakePaymentGateway()
  })

  it('confirms every Reservation in the group on a completed checkout (FR-10)', async () => {
    const { group, reservations } = await checkoutReservationGroup(availabilityRepo, {
      tenantId: tenantA,
      lines: [{ assetTypeId: HAMMER, period: { startDay: DAY, endDay: DAY } }],
    })
    const { payment } = await startPayment(paymentsRepo, gateway, {
      tenantId: tenantA,
      reservationGroupId: group.id,
      amount: { amount: 1000, currency: 'EUR' },
      successUrl: 'https://example.test/success',
      cancelUrl: 'https://example.test/cancel',
    })

    const outcome = await applyProviderWebhookEvent(
      { tenantId: tenantA, paymentsRepo, gateway, availabilityRepo },
      { type: 'checkout_completed', providerReference: payment.providerReference, providerPaymentReference: 'pi_1' },
    )

    expect(outcome).toMatchObject({ outcome: 'confirmed' })
    if (outcome.outcome !== 'confirmed') throw new Error('unreachable')
    expect(outcome.payment.status).toBe('succeeded')

    const confirmedReservation = await availabilityRepo.getReservation(tenantA, reservations[0]!.id)
    expect(confirmedReservation?.state).toBe('confirmed')
  })

  it('refunds a second completed checkout for a group that is already paid (FR-09, #190)', async () => {
    const { group, reservations } = await checkoutReservationGroup(availabilityRepo, {
      tenantId: tenantA,
      lines: [{ assetTypeId: HAMMER, period: { startDay: DAY, endDay: DAY } }],
    })
    const params = {
      tenantId: tenantA,
      reservationGroupId: group.id,
      amount: { amount: 1000, currency: 'EUR' as const },
      successUrl: 'https://example.test/success',
      cancelUrl: 'https://example.test/cancel',
    }
    const first = await startPayment(paymentsRepo, gateway, params)
    // The provider would not close the first checkout: both get paid.
    gateway.unexpirable.add(first.payment.providerReference)
    const second = await startPayment(paymentsRepo, gateway, params)
    const deps = { tenantId: tenantA, paymentsRepo, gateway, availabilityRepo }

    const firstOutcome = await applyProviderWebhookEvent(deps, {
      type: 'checkout_completed',
      providerReference: first.payment.providerReference,
      providerPaymentReference: 'pi_first',
    })
    const secondOutcome = await applyProviderWebhookEvent(deps, {
      type: 'checkout_completed',
      providerReference: second.payment.providerReference,
      providerPaymentReference: 'pi_second',
    })

    expect(firstOutcome.outcome).toBe('confirmed')
    expect(secondOutcome.outcome).toBe('second_payment_refunded')
    expect(gateway.refundCalls).toEqual([{ providerPaymentReference: 'pi_second', amount: params.amount }])
    expect((await paymentsRepo.getPayment(tenantA, second.payment.id))?.status).toBe('refunded')
    expect((await paymentsRepo.getPayment(tenantA, first.payment.id))?.status).toBe('succeeded')
    expect((await availabilityRepo.getReservation(tenantA, reservations[0]!.id))?.state).toBe('confirmed')

    // Stripe redelivers the second event: nothing is refunded twice.
    const redelivered = await applyProviderWebhookEvent(deps, {
      type: 'checkout_completed',
      providerReference: second.payment.providerReference,
      providerPaymentReference: 'pi_second',
    })
    expect(redelivered.outcome).toBe('already_processed')
    expect(gateway.refundCalls).toHaveLength(1)
  })

  it('automatically refunds when PaymentReceived arrives too late to re-acquire the days (D-37, Finding 3)', async () => {
    // Group A's Pending window is already lapsed relative to real time —
    // built with a backdated `now` so pendingExpiresAt sits in the past.
    const backdated = new Date(Date.now() - 60 * 60 * 1000)
    const { group: groupA, reservations: reservationsA } = await checkoutReservationGroup(availabilityRepo, {
      tenantId: tenantA,
      lines: [{ assetTypeId: HAMMER, period: { startDay: DAY, endDay: DAY } }],
      now: backdated,
    })

    // Group B contends for the same (only) unit on the same day, with the
    // real clock. Reap-on-contention finds A's stale Pending, reaps it to
    // Expired, and B acquires the freed day — exactly the situation
    // Finding 3 describes: A's card is later charged for a day that is,
    // by then, someone else's.
    await checkoutReservationGroup(availabilityRepo, {
      tenantId: tenantA,
      lines: [{ assetTypeId: HAMMER, period: { startDay: DAY, endDay: DAY } }],
    })

    const { payment: paymentA } = await startPayment(paymentsRepo, gateway, {
      tenantId: tenantA,
      reservationGroupId: groupA.id,
      amount: { amount: 1000, currency: 'EUR' },
      successUrl: 'https://example.test/success',
      cancelUrl: 'https://example.test/cancel',
    })

    const outcome = await applyProviderWebhookEvent(
      { tenantId: tenantA, paymentsRepo, gateway, availabilityRepo },
      {
        type: 'checkout_completed',
        providerReference: paymentA.providerReference,
        providerPaymentReference: 'pi_2',
      },
    )

    expect(outcome).toMatchObject({ outcome: 'refunded' })
    if (outcome.outcome !== 'refunded') throw new Error('unreachable')
    expect(outcome.payment.status).toBe('refunded')
    expect(outcome.failedReservationIds).toContain(reservationsA[0]!.id)
    expect(gateway.refundCalls).toHaveLength(1)

    // A's Reservation was never resurrected into Confirmed by the failed
    // attempt — it stays Expired, matching FR-10's "partial payment /
    // partial confirmation is not a concept" extended to this failure.
    const reservationA = await availabilityRepo.getReservation(tenantA, reservationsA[0]!.id)
    expect(reservationA?.state).toBe('expired')
  })

  it('is idempotent against a redelivered webhook for an already-processed Payment', async () => {
    const { group } = await checkoutReservationGroup(availabilityRepo, {
      tenantId: tenantA,
      lines: [{ assetTypeId: HAMMER, period: { startDay: DAY, endDay: DAY } }],
    })
    const { payment } = await startPayment(paymentsRepo, gateway, {
      tenantId: tenantA,
      reservationGroupId: group.id,
      amount: { amount: 1000, currency: 'EUR' },
      successUrl: 'https://example.test/success',
      cancelUrl: 'https://example.test/cancel',
    })
    const webhookEvent = {
      type: 'checkout_completed' as const,
      providerReference: payment.providerReference,
      providerPaymentReference: 'pi_1',
    }

    await applyProviderWebhookEvent({ tenantId: tenantA, paymentsRepo, gateway, availabilityRepo }, webhookEvent)
    const second = await applyProviderWebhookEvent(
      { tenantId: tenantA, paymentsRepo, gateway, availabilityRepo },
      webhookEvent,
    )

    expect(second.outcome).toBe('already_processed')
  })

  it('ignores an event for a provider reference with no matching Payment', async () => {
    const outcome = await applyProviderWebhookEvent(
      { tenantId: tenantA, paymentsRepo, gateway, availabilityRepo },
      { type: 'checkout_completed', providerReference: 'sess_unknown', providerPaymentReference: null },
    )

    expect(outcome).toEqual({ outcome: 'ignored' })
  })

  it('ignores provider event types this domain does not act on', async () => {
    const outcome = await applyProviderWebhookEvent(
      { tenantId: tenantA, paymentsRepo, gateway, availabilityRepo },
      { type: 'unrecognized' },
    )

    expect(outcome).toEqual({ outcome: 'ignored' })
  })
})
