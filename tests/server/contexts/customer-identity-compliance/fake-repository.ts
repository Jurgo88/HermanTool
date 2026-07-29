// In-memory stand-in for CustomerIdentityComplianceRepository, used by
// customer.test.ts and identity-evidence.test.ts so the domain logic in
// server/contexts/customer-identity-compliance/{customer,identity-evidence}.ts
// is exercised without a database (Part 4 §14.2), mirroring every other
// context's fake-repository.ts.
import type { TenantId } from '../../../../server/contexts/_shared'
import type {
  CustomerIdentityComplianceRepository,
  NewCustomer,
  NewIdentityEvidence,
  NewIdentityVerification,
} from '../../../../server/contexts/customer-identity-compliance/repository'
import type {
  Customer,
  IdentityEvidence,
  IdentityEvidenceAccessEvent,
  IdentityVerification,
} from '../../../../server/contexts/customer-identity-compliance/types'

interface State {
  customers: Customer[]
  identityEvidence: IdentityEvidence[]
  accessEvents: IdentityEvidenceAccessEvent[]
  identityVerifications: IdentityVerification[]
  nextCustomerId: number
  nextEvidenceId: number
  nextAccessEventId: number
  nextVerificationId: number
}

export interface FakeCustomerIdentityComplianceRepository extends CustomerIdentityComplianceRepository {
  allCustomers(): Customer[]
  allIdentityEvidence(): IdentityEvidence[]
  allAccessEvents(): IdentityEvidenceAccessEvent[]
  allIdentityVerifications(): IdentityVerification[]
}

export function createFakeCustomerIdentityComplianceRepository(): FakeCustomerIdentityComplianceRepository {
  const state: State = {
    customers: [],
    identityEvidence: [],
    accessEvents: [],
    identityVerifications: [],
    nextCustomerId: 1,
    nextEvidenceId: 1,
    nextAccessEventId: 1,
    nextVerificationId: 1,
  }

  return {
    allCustomers() {
      return state.customers.map((c) => ({ ...c }))
    },
    allIdentityEvidence() {
      return state.identityEvidence.map((e) => ({ ...e }))
    },
    allAccessEvents() {
      return state.accessEvents.map((e) => ({ ...e }))
    },
    allIdentityVerifications() {
      return state.identityVerifications.map((v) => ({ ...v }))
    },

    async insertCustomer(tenantId: TenantId, { reservationGroupId, name, email, phone }: NewCustomer) {
      const customer: Customer = {
        id: state.nextCustomerId++,
        tenantId,
        reservationGroupId,
        name,
        email,
        phone,
        createdAt: new Date(),
      }
      state.customers.push(customer)
      return { ...customer }
    },

    async getCustomer(tenantId, id) {
      const customer = state.customers.find((c) => c.tenantId === tenantId && c.id === id)
      return customer ? { ...customer } : null
    },

    async getCustomerByReservationGroup(tenantId, reservationGroupId) {
      const customer = state.customers.find(
        (c) => c.tenantId === tenantId && c.reservationGroupId === reservationGroupId,
      )
      return customer ? { ...customer } : null
    },

    async insertIdentityEvidence(tenantId: TenantId, { customerId, objectKey, retentionDeadline }: NewIdentityEvidence) {
      const evidence: IdentityEvidence = {
        id: state.nextEvidenceId++,
        tenantId,
        customerId,
        objectKey,
        retentionDeadline,
        createdAt: new Date(),
      }
      state.identityEvidence.push(evidence)
      return { ...evidence }
    },

    async getIdentityEvidence(tenantId, id) {
      const evidence = state.identityEvidence.find((e) => e.tenantId === tenantId && e.id === id)
      return evidence ? { ...evidence } : null
    },

    async insertIdentityEvidenceAccessEvent(tenantId, { identityEvidenceId, operatorId }) {
      const accessEvent: IdentityEvidenceAccessEvent = {
        id: state.nextAccessEventId++,
        tenantId,
        identityEvidenceId,
        operatorId,
        accessedAt: new Date(),
      }
      state.accessEvents.push(accessEvent)
      return { ...accessEvent }
    },

    async insertIdentityVerification(tenantId: TenantId, params: NewIdentityVerification) {
      const base = {
        id: state.nextVerificationId++,
        tenantId,
        customerId: params.customerId,
        identityEvidenceId: params.identityEvidenceId,
        operatorId: params.operatorId,
        occurredAt: new Date(),
      }
      const verification: IdentityVerification =
        params.outcome === 'rejected'
          ? { ...base, outcome: 'rejected', reason: params.reason }
          : { ...base, outcome: 'verified', reason: null }
      state.identityVerifications.push(verification)
      return { ...verification }
    },

    async hasSuccessfulIdentityVerification(tenantId, customerId) {
      return state.identityVerifications.some(
        (v) => v.tenantId === tenantId && v.customerId === customerId && v.outcome === 'verified',
      )
    },
  }
}
