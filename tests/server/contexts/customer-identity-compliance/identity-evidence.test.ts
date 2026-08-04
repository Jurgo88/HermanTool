import { beforeEach, describe, expect, it } from 'vitest'
import type { TenantId } from '../../../../server/contexts/_shared'
import { createCustomer } from '../../../../server/contexts/customer-identity-compliance/customer'
import {
  computeRetentionDeadline,
  confirmIdentityEvidenceUpload,
  generateIdentityEvidenceReadUrl,
  requestIdentityEvidenceUpload,
  sweepUnconfirmedIdentityEvidence,
} from '../../../../server/contexts/customer-identity-compliance/identity-evidence'
import { UPLOAD_URL_TTL_SECONDS } from '../../../../server/contexts/customer-identity-compliance/r2-gateway'
import { MAX_EVIDENCE_UPLOAD_SIZE_BYTES } from '../../../../server/contexts/_shared'
import {
  CustomerNotFoundError,
  IdentityEvidenceErasedError,
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

  it('refuses to mint a read URL for erased IdentityEvidence (FR-16) rather than pointing at a deleted object', async () => {
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
    await repo.markIdentityEvidenceErased(tenantA, evidence.id, new Date())

    await expect(
      generateIdentityEvidenceReadUrl(repo, gateway, { tenantId: tenantA, identityEvidenceId: evidence.id, operatorId: 'op-1' }),
    ).rejects.toThrow(IdentityEvidenceErasedError)
  })
})

describe('confirmIdentityEvidenceUpload (D-40)', () => {
  let repo: FakeCustomerIdentityComplianceRepository
  let gateway: FakeIdentityEvidenceStorageGateway
  let evidenceId: number

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
    const evidence = await repo.insertIdentityEvidence(tenantA, {
      customerId: customer.id,
      objectKey: 'obj-1',
      retentionDeadline: new Date(Date.now() + 86_400_000),
    })
    evidenceId = evidence.id
  })

  it('confirms once the object is present in the bucket', async () => {
    gateway.objectStats.set('obj-1', { exists: true, contentLength: 1024 })

    const result = await confirmIdentityEvidenceUpload(repo, gateway, { tenantId: tenantA, identityEvidenceId: evidenceId })

    expect(result).toEqual({ outcome: 'confirmed', identityEvidence: expect.objectContaining({ id: evidenceId }) })
    const stored = await repo.getIdentityEvidence(tenantA, evidenceId)
    expect(stored?.confirmedAt).not.toBeNull()
  })

  it('reports not_yet_uploaded rather than confirming a row naming an absent object -- the whole point of D-40', async () => {
    // gateway.objectStats has no entry for 'obj-1' -- the fake's
    // documented default is "does not exist".
    const result = await confirmIdentityEvidenceUpload(repo, gateway, { tenantId: tenantA, identityEvidenceId: evidenceId })

    expect(result).toEqual({ outcome: 'not_yet_uploaded' })
    const stored = await repo.getIdentityEvidence(tenantA, evidenceId)
    expect(stored?.confirmedAt).toBeNull()
  })

  it('deletes and refuses an oversized object rather than confirming it (D-40 second obligation, OQ #26)', async () => {
    gateway.objectStats.set('obj-1', { exists: true, contentLength: MAX_EVIDENCE_UPLOAD_SIZE_BYTES + 1 })

    const result = await confirmIdentityEvidenceUpload(repo, gateway, { tenantId: tenantA, identityEvidenceId: evidenceId })

    expect(result).toEqual({ outcome: 'oversized', contentLength: MAX_EVIDENCE_UPLOAD_SIZE_BYTES + 1 })
    expect(gateway.deletedObjectKeys).toEqual(['obj-1'])
    const stored = await repo.getIdentityEvidence(tenantA, evidenceId)
    expect(stored?.confirmedAt).toBeNull()
  })

  it('is idempotent: confirming an already-confirmed row succeeds without a second HEAD or a second write', async () => {
    gateway.objectStats.set('obj-1', { exists: true, contentLength: 1024 })
    await confirmIdentityEvidenceUpload(repo, gateway, { tenantId: tenantA, identityEvidenceId: evidenceId })
    gateway.statCalls.length = 0

    const result = await confirmIdentityEvidenceUpload(repo, gateway, { tenantId: tenantA, identityEvidenceId: evidenceId })

    expect(result.outcome).toBe('confirmed')
    expect(gateway.statCalls).toHaveLength(0)
  })

  it('refuses for unknown IdentityEvidence', async () => {
    await expect(
      confirmIdentityEvidenceUpload(repo, gateway, { tenantId: tenantA, identityEvidenceId: 999 }),
    ).rejects.toThrow(IdentityEvidenceNotFoundError)
  })

  it('refuses to confirm erased IdentityEvidence', async () => {
    await repo.markIdentityEvidenceErased(tenantA, evidenceId, new Date())

    await expect(
      confirmIdentityEvidenceUpload(repo, gateway, { tenantId: tenantA, identityEvidenceId: evidenceId }),
    ).rejects.toThrow(IdentityEvidenceErasedError)
  })
})

describe('sweepUnconfirmedIdentityEvidence (D-40)', () => {
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

  it('confirms an unconfirmed row past the presigned URL lifetime whose object DID arrive -- the tab-closed-after-upload case', async () => {
    const evidence = await repo.insertIdentityEvidence(tenantA, {
      customerId,
      objectKey: 'obj-late',
      retentionDeadline: new Date(Date.now() + 86_400_000),
    })
    gateway.objectStats.set('obj-late', { exists: true, contentLength: 1024 })

    const now = new Date(Date.now() + (UPLOAD_URL_TTL_SECONDS + 60) * 1000)
    const confirmed = await sweepUnconfirmedIdentityEvidence(repo, gateway, { tenantId: tenantA, now })

    expect(confirmed.map((e) => e.id)).toEqual([evidence.id])
    const stored = await repo.getIdentityEvidence(tenantA, evidence.id)
    expect(stored?.confirmedAt).not.toBeNull()
  })

  it('leaves a genuinely abandoned row unconfirmed -- never deletes it (P1, append-only)', async () => {
    const evidence = await repo.insertIdentityEvidence(tenantA, {
      customerId,
      objectKey: 'obj-abandoned',
      retentionDeadline: new Date(Date.now() + 86_400_000),
    })
    // No gateway.objectStats entry -- the upload never happened.

    const now = new Date(Date.now() + (UPLOAD_URL_TTL_SECONDS + 60) * 1000)
    const confirmed = await sweepUnconfirmedIdentityEvidence(repo, gateway, { tenantId: tenantA, now })

    expect(confirmed).toHaveLength(0)
    const stored = await repo.getIdentityEvidence(tenantA, evidence.id)
    expect(stored?.confirmedAt).toBeNull()
    expect(repo.allIdentityEvidence()).toHaveLength(1) // not deleted
  })

  it('does not touch a row still within the presigned URL lifetime -- it may yet be confirmed by the client itself', async () => {
    const evidence = await repo.insertIdentityEvidence(tenantA, {
      customerId,
      objectKey: 'obj-fresh',
      retentionDeadline: new Date(Date.now() + 86_400_000),
    })
    gateway.objectStats.set('obj-fresh', { exists: true, contentLength: 1024 })

    const confirmed = await sweepUnconfirmedIdentityEvidence(repo, gateway, { tenantId: tenantA })

    expect(confirmed).toHaveLength(0)
    const stored = await repo.getIdentityEvidence(tenantA, evidence.id)
    expect(stored?.confirmedAt).toBeNull()
  })
})
