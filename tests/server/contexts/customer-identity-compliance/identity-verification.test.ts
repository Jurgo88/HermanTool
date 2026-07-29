import { beforeEach, describe, expect, it } from 'vitest'
import type { TenantId } from '../../../../server/contexts/_shared'
import { createCustomer } from '../../../../server/contexts/customer-identity-compliance/customer'
import {
  hasSuccessfulIdentityVerification,
  recordIdentityVerification,
} from '../../../../server/contexts/customer-identity-compliance/identity-verification'
import {
  IdentityEvidenceCustomerMismatchError,
  IdentityEvidenceNotFoundError,
  IdentityVerificationReasonRequiredError,
} from '../../../../server/contexts/customer-identity-compliance/types'
import {
  createFakeCustomerIdentityComplianceRepository,
  type FakeCustomerIdentityComplianceRepository,
} from './fake-repository'

const tenantA = '11111111-1111-1111-1111-111111111111' as TenantId
const operatorId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

describe('recordIdentityVerification', () => {
  let repo: FakeCustomerIdentityComplianceRepository
  let customerId: number
  let evidenceId: number

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
    const evidence = await repo.insertIdentityEvidence(tenantA, {
      customerId,
      objectKey: 'obj-1',
      retentionDeadline: new Date(Date.now() + 86_400_000),
    })
    evidenceId = evidence.id
  })

  it('records a verified outcome with no reason (D-15)', async () => {
    const verification = await recordIdentityVerification(repo, {
      tenantId: tenantA,
      customerId,
      identityEvidenceId: evidenceId,
      operatorId,
      outcome: 'verified',
    })

    expect(verification.outcome).toBe('verified')
    expect(verification.reason).toBeNull()
  })

  it('records a rejected outcome with a reason (FR-15)', async () => {
    const verification = await recordIdentityVerification(repo, {
      tenantId: tenantA,
      customerId,
      identityEvidenceId: evidenceId,
      operatorId,
      outcome: 'rejected',
      reason: 'Photo does not match the person present',
    })

    expect(verification.outcome).toBe('rejected')
    expect(verification.reason).toBe('Photo does not match the person present')
  })

  it('refuses a rejected outcome with no reason (FR-15)', async () => {
    await expect(
      recordIdentityVerification(repo, {
        tenantId: tenantA,
        customerId,
        identityEvidenceId: evidenceId,
        operatorId,
        outcome: 'rejected',
      }),
    ).rejects.toThrow(IdentityVerificationReasonRequiredError)
  })

  it('refuses for unknown IdentityEvidence', async () => {
    await expect(
      recordIdentityVerification(repo, {
        tenantId: tenantA,
        customerId,
        identityEvidenceId: 999,
        operatorId,
        outcome: 'verified',
      }),
    ).rejects.toThrow(IdentityEvidenceNotFoundError)
  })

  it('refuses when the IdentityEvidence belongs to a different Customer', async () => {
    const otherCustomer = await createCustomer(repo, {
      tenantId: tenantA,
      reservationGroupId: 2,
      name: 'Peter Horváth',
      email: 'peter@example.sk',
      phone: '+421900000001',
    })

    await expect(
      recordIdentityVerification(repo, {
        tenantId: tenantA,
        customerId: otherCustomer.id,
        identityEvidenceId: evidenceId,
        operatorId,
        outcome: 'verified',
      }),
    ).rejects.toThrow(IdentityEvidenceCustomerMismatchError)
  })

  it('records a second, superseding row rather than editing the first (D-10 append-only)', async () => {
    await recordIdentityVerification(repo, {
      tenantId: tenantA,
      customerId,
      identityEvidenceId: evidenceId,
      operatorId,
      outcome: 'rejected',
      reason: 'Blurry photo',
    })
    await recordIdentityVerification(repo, {
      tenantId: tenantA,
      customerId,
      identityEvidenceId: evidenceId,
      operatorId,
      outcome: 'verified',
    })

    expect(repo.allIdentityVerifications()).toHaveLength(2)
  })
})

describe('hasSuccessfulIdentityVerification (FR-14)', () => {
  let repo: FakeCustomerIdentityComplianceRepository
  let customerId: number
  let evidenceId: number

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
    const evidence = await repo.insertIdentityEvidence(tenantA, {
      customerId,
      objectKey: 'obj-1',
      retentionDeadline: new Date(Date.now() + 86_400_000),
    })
    evidenceId = evidence.id
  })

  it('is false before any IdentityVerification is recorded', async () => {
    expect(await hasSuccessfulIdentityVerification(repo, { tenantId: tenantA, customerId })).toBe(false)
  })

  it('is false after only a rejection', async () => {
    await recordIdentityVerification(repo, {
      tenantId: tenantA,
      customerId,
      identityEvidenceId: evidenceId,
      operatorId,
      outcome: 'rejected',
      reason: 'Blurry photo',
    })

    expect(await hasSuccessfulIdentityVerification(repo, { tenantId: tenantA, customerId })).toBe(false)
  })

  it('is true after a rejection followed by a successful verification (D-15 append-only, not "latest wins")', async () => {
    await recordIdentityVerification(repo, {
      tenantId: tenantA,
      customerId,
      identityEvidenceId: evidenceId,
      operatorId,
      outcome: 'rejected',
      reason: 'Blurry photo',
    })
    await recordIdentityVerification(repo, {
      tenantId: tenantA,
      customerId,
      identityEvidenceId: evidenceId,
      operatorId,
      outcome: 'verified',
    })

    expect(await hasSuccessfulIdentityVerification(repo, { tenantId: tenantA, customerId })).toBe(true)
  })
})
