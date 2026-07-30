import { beforeEach, describe, expect, it } from 'vitest'
import type { TenantId } from '../../../../server/contexts/_shared'
import { createCustomer } from '../../../../server/contexts/customer-identity-compliance/customer'
import {
  eraseExpiredIdentityEvidence,
  reanchorRetentionDeadlineForCustomer,
} from '../../../../server/contexts/customer-identity-compliance/retention'
import { RetentionWindowNotConfiguredError } from '../../../../server/contexts/customer-identity-compliance/types'
import { createFakeIdentityEvidenceStorageGateway, type FakeIdentityEvidenceStorageGateway } from './fake-gateway'
import {
  createFakeCustomerIdentityComplianceRepository,
  type FakeCustomerIdentityComplianceRepository,
} from './fake-repository'

const tenantA = '11111111-1111-1111-1111-111111111111' as TenantId

describe('reanchorRetentionDeadlineForCustomer (D-36)', () => {
  let repo: FakeCustomerIdentityComplianceRepository
  let customerId: number

  beforeEach(async () => {
    repo = createFakeCustomerIdentityComplianceRepository()
    const customer = await createCustomer(repo, {
      tenantId: tenantA,
      reservationGroupId: 1,
      name: 'Jana Nováková',
      email: 'jana@example.sk',
      phone: '+421900000000',
    })
    customerId = customer.id
  })

  it('is currently blocked end-to-end by OQ #2 (CLAUDE.md: do NOT invent the retention window)', async () => {
    await repo.insertIdentityEvidence(tenantA, {
      customerId,
      objectKey: 'obj-1',
      retentionDeadline: new Date(Date.now() + 86_400_000),
    })

    await expect(
      reanchorRetentionDeadlineForCustomer(repo, { tenantId: tenantA, customerId, settledAt: new Date() }),
    ).rejects.toThrow(RetentionWindowNotConfiguredError)
  })

  it('is a no-op for a Customer with no IdentityEvidence, and still refuses per OQ #2', async () => {
    await expect(
      reanchorRetentionDeadlineForCustomer(repo, { tenantId: tenantA, customerId, settledAt: new Date() }),
    ).rejects.toThrow(RetentionWindowNotConfiguredError)
  })
})

describe('eraseExpiredIdentityEvidence (FR-16, W10)', () => {
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

  it('erases IdentityEvidence whose RetentionDeadline has passed, deletes the R2 object, and records the erasure', async () => {
    const evidence = await repo.insertIdentityEvidence(tenantA, {
      customerId,
      objectKey: 'obj-expired',
      retentionDeadline: new Date('2026-01-01T00:00:00.000Z'),
    })

    const erased = await eraseExpiredIdentityEvidence(
      { repo, gateway },
      { tenantId: tenantA, now: new Date('2026-02-01T00:00:00.000Z') },
    )

    expect(erased).toHaveLength(1)
    expect(erased[0]!.id).toBe(evidence.id)
    expect(erased[0]!.erasedAt).not.toBeNull()
    expect(gateway.deletedObjectKeys).toEqual(['obj-expired'])
  })

  it('leaves IdentityEvidence whose RetentionDeadline has not arrived yet untouched', async () => {
    await repo.insertIdentityEvidence(tenantA, {
      customerId,
      objectKey: 'obj-future',
      retentionDeadline: new Date('2026-06-01T00:00:00.000Z'),
    })

    const erased = await eraseExpiredIdentityEvidence(
      { repo, gateway },
      { tenantId: tenantA, now: new Date('2026-02-01T00:00:00.000Z') },
    )

    expect(erased).toHaveLength(0)
    expect(gateway.deletedObjectKeys).toHaveLength(0)
  })

  it('is idempotent — a second run finds nothing left to erase', async () => {
    await repo.insertIdentityEvidence(tenantA, {
      customerId,
      objectKey: 'obj-expired',
      retentionDeadline: new Date('2026-01-01T00:00:00.000Z'),
    })
    const now = new Date('2026-02-01T00:00:00.000Z')

    await eraseExpiredIdentityEvidence({ repo, gateway }, { tenantId: tenantA, now })
    const second = await eraseExpiredIdentityEvidence({ repo, gateway }, { tenantId: tenantA, now })

    expect(second).toHaveLength(0)
    expect(gateway.deletedObjectKeys).toHaveLength(1) // not called again
  })

  it('never erases across Tenants', async () => {
    await repo.insertIdentityEvidence(tenantA, {
      customerId,
      objectKey: 'obj-expired',
      retentionDeadline: new Date('2026-01-01T00:00:00.000Z'),
    })

    const otherTenant = '22222222-2222-2222-2222-222222222222' as TenantId
    const erased = await eraseExpiredIdentityEvidence(
      { repo, gateway },
      { tenantId: otherTenant, now: new Date('2026-02-01T00:00:00.000Z') },
    )

    expect(erased).toHaveLength(0)
    expect(gateway.deletedObjectKeys).toHaveLength(0)
  })
})
