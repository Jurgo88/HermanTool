// In-memory stand-in for PaymentsRepository, used by payment.test.ts and
// tests/server/utils/payment-webhook-flow.test.ts so the domain logic in
// server/contexts/payments/payment.ts and
// server/utils/payment-webhook-flow.ts is exercised without a database
// (Part 4 §14.2). Mirrors the real Postgres repository's tenant-scoping
// and guarded-transition semantics, same convention as
// tests/server/contexts/availability-reservation/fake-repository.ts.
import type { NewPayment, PaymentsRepository } from '../../../../server/contexts/payments/repository'
import type { Payment, PaymentStatus } from '../../../../server/contexts/payments/types'

interface State {
  payments: Payment[]
  nextId: number
}

export interface FakePaymentsRepository extends PaymentsRepository {
  allPayments(): Payment[]
}

export function createFakePaymentsRepository(): FakePaymentsRepository {
  const state: State = { payments: [], nextId: 1 }

  function build(target: State): FakePaymentsRepository {
    return {
      allPayments() {
        return target.payments.map((p) => ({ ...p }))
      },

      async insertPayment(tenantId, { reservationGroupId, amount, providerReference }: NewPayment) {
        const now = new Date()
        const payment: Payment = {
          id: target.nextId++,
          tenantId,
          reservationGroupId,
          amount: { ...amount },
          status: 'pending',
          providerReference,
          providerPaymentReference: null,
          createdAt: now,
          updatedAt: now,
        }
        target.payments.push(payment)
        return { ...payment }
      },

      async getPayment(tenantId, id) {
        const payment = target.payments.find((p) => p.tenantId === tenantId && p.id === id)
        return payment ? { ...payment } : null
      },

      async getPaymentByProviderReference(tenantId, providerReference) {
        const payment = target.payments.find(
          (p) => p.tenantId === tenantId && p.providerReference === providerReference,
        )
        return payment ? { ...payment } : null
      },

      async listPaymentsForGroup(tenantId, reservationGroupId) {
        return target.payments
          .filter((p) => p.tenantId === tenantId && p.reservationGroupId === reservationGroupId)
          .map((p) => ({ ...p }))
      },

      async transitionPaymentStatus(tenantId, id, { from, to, providerPaymentReference }) {
        const payment = target.payments.find((p) => p.tenantId === tenantId && p.id === id && p.status === from)
        if (!payment) return null
        payment.status = to as PaymentStatus
        payment.updatedAt = new Date()
        if (providerPaymentReference) payment.providerPaymentReference = providerPaymentReference
        return { ...payment }
      },

      async transaction(fn) {
        return fn(build(target))
      },
    }
  }

  return build(state)
}
