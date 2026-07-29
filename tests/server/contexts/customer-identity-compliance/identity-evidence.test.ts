import { beforeEach, describe, expect, it } from 'vitest'
import type { TenantId } from '../../../../server/contexts/_shared'
import { createCustomer } from '../../../../server/contexts/customer-identity-compliance/customer'
import {
  computeRetentionDeadline,
  generateIdentityEvidenceReadUrl,
  requestIdentityEvidenceUpload,
} from '../../../../server/contexts/customer-identity-compliance/identity-evidence'
import {
  CustomerNotFoundError,
  IdentityEvidenceNotFoundError,
  ReservationGroupNotConfirmedError,
  RetentionWindowNotConfiguredError,
} from '../../../../server/contexts/customer-identity-compliance/types'
import { createFakeIdentityEvidenceStorageGateway, type FakeIdentityEvidenceStorageGateway } from './fake-gateway'
import {
  createFakeCustomerIdentityComplianceRepository,
  type FakeCustomerIdentityComplianceRepository,
} from './fake-repository'

const tenantA = '11111111-1111-1111-1111-111111111111' as TenantId

describe('computeRetentionDeadline', () => {
  it('refuses to compute a deadline while OQ #2 is unresolved (CLAUDE.md: do NOT invent defaults)', () => {
    expect(() => computeRetentionDeadline(new Date())).toThrow(RetentionWindowNotConfiguredError)
  })
})

describe('requestIdentityEvidenceUpload', () => {
  let repo: FakeCustomerIdentityComplianceRepository
  let gateway: FakeIdentityEvidenceStorageGateway
  let customerId: number

  beforeEach(async () => {
    repo = createFakeCustomerIdentityComplianceRepository()
    gateway = createFakeIdentityEvidenceStorageGateway()
    const customer = await createCustomer(repo, {
      tenantId: tenantA,
      reservationGroupId: 1,
      name: 'Jana Nováková',
      email: 'jana@example.sk',
      phone: '+421900000000',
    })
    customerId = customer.id
  })

  it('refuses when the ReservationGroup is not Confirmed (FR-11)', async () => {
    await expect(
      requestIdentityEvidenceUpload(repo, gateway, {
        tenantId: tenantA,
        customerId,
        reservationGroupId: 1,
        isReservationGroupConfirmed: false,
        contentType: 'image/jpeg',
      }),
    ).rejects.toThrow(ReservationGroupNotConfirmedError)

    expect(repo.allIdentityEvidence()).toHaveLength(0)
    expect(gateway.uploadUrlCalls).toHaveLength(0)
  })

  it('refuses for an unknown Customer', async () => {
    await expect(
      requestIdentityEvidenceUpload(repo, gateway, {
        tenantId: tenantA,
        customerId: 999,
        reservationGroupId: 1,
        isReservationGroupConfirmed: true,
        contentType: 'image/jpeg',
      }),
    ).rejects.toThrow(CustomerNotFoundError)
  })

  it('is currently blocked end-to-end by OQ #2, even when otherwise valid (CLAUDE.md: do NOT invent the retention window)', async () => {
    await expect(
      requestIdentityEvidenceUpload(repo, gateway, {
        tenantId: tenantA,
        customerId,
        reservationGroupId: 1,
        isReservationGroupConfirmed: true,
        contentType: 'image/jpeg',
      }),
    ).rejects.toThrow(RetentionWindowNotConfiguredError)

    // Refuses before touching the repository or the gateway — no
    // half-created IdentityEvidence row, no live presigned URL.
    expect(repo.allIdentityEvidence()).toHaveLength(0)
    expect(gateway.uploadUrlCalls).toHaveLength(0)
  })
})

describe('generateIdentityEvidenceReadUrl', () => {
  let repo: FakeCustomerIdentityComplianceRepository
  let gateway: FakeIdentityEvidenceStorageGateway

  beforeEach(() => {
    repo = createFakeCustomerIdentityComplianceRepository()
    gateway = createFakeIdentityEvidenceStorageGateway()
  })

  it('records an attributed access event for every read URL generated (NFR-06)', async () => {
    const customer = await createCustomer(repo, {
      tenantId: tenantA,
      reservationGroupId: 1,
      name: 'Jana Nováková',
      email: 'jana@example.sk',
      phone: '+421900000000',
    })
    const evidence = await repo.insertIdentityEvidence(tenantA, {
      customerId: customer.id,
      objectKey: 'obj-1',
      retentionDeadline: new Date(Date.now() + 86_400_000),
    })

    const { readUrl, accessEvent } = await generateIdentityEvidenceReadUrl(repo, gateway, {
      tenantId: tenantA,
      identityEvidenceId: evidence.id,
      operatorId: 'op-1',
    })

    expect(readUrl).toContain('obj-1')
    expect(accessEvent.operatorId).toBe('op-1')
    expect(repo.allAccessEvents()).toHaveLength(1)
  })

  it('refuses for unknown IdentityEvidence', async () => {
    await expect(
      generateIdentityEvidenceReadUrl(repo, gateway, { tenantId: tenantA, identityEvidenceId: 999, operatorId: 'op-1' }),
    ).rejects.toThrow(IdentityEvidenceNotFoundError)
  })
})
