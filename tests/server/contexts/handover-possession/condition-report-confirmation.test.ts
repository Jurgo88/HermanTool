import { beforeEach, describe, expect, it } from 'vitest'
import type { TenantId } from '../../../../server/contexts/_shared'
import { MAX_EVIDENCE_UPLOAD_SIZE_BYTES } from '../../../../server/contexts/_shared'
import {
  confirmConditionReportUpload,
  sweepUnconfirmedConditionReports,
} from '../../../../server/contexts/handover-possession/condition-report-confirmation'
import { UPLOAD_URL_TTL_SECONDS } from '../../../../server/contexts/handover-possession/r2-gateway'
import { ConditionReportNotFoundError } from '../../../../server/contexts/handover-possession/types'
import { createFakeAssetRegistryRepository } from '../asset-registry/fake-repository'
import { createFakeConditionReportStorageGateway, type FakeConditionReportStorageGateway } from './fake-conditions-gateway'
import { createFakeHandoverPossessionRepository, type FakeHandoverPossessionRepository } from './fake-repository'

const tenantA = '11111111-1111-1111-1111-111111111111' as TenantId
const operatorId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

describe('confirmConditionReportUpload (D-40)', () => {
  let repo: FakeHandoverPossessionRepository
  let gateway: FakeConditionReportStorageGateway
  let rentalAgreementId: number

  beforeEach(async () => {
    repo = createFakeHandoverPossessionRepository(createFakeAssetRegistryRepository())
    gateway = createFakeConditionReportStorageGateway()
    const agreement = await repo.insertRentalAgreement(tenantA, {
      reservationId: 1,
      customerId: 1,
      assetId: 1,
      operatorId,
      termsVersion: 'v1',
      handoverOutAt: new Date(),
      handoverOutRecordedAt: new Date(),
      handoverOutBackdateReason: null,
    })
    rentalAgreementId = agreement.id
  })

  async function insertReport(photoObjectKeys: string[]) {
    return repo.insertConditionReport(tenantA, {
      rentalAgreementId,
      stage: 'handover_out',
      photoObjectKeys,
      operatorId,
      capturedAt: new Date(),
      recordedAt: new Date(),
    })
  }

  it('confirms once EVERY photo is present in the bucket', async () => {
    const report = await insertReport(['obj-1', 'obj-2'])
    gateway.objectStats.set('obj-1', { exists: true, contentLength: 1024 })
    gateway.objectStats.set('obj-2', { exists: true, contentLength: 2048 })

    const result = await confirmConditionReportUpload(repo, gateway, { tenantId: tenantA, conditionReportId: report.id })

    expect(result.outcome).toBe('confirmed')
    const stored = await repo.getConditionReport(tenantA, report.id)
    expect(stored?.confirmedAt).not.toBeNull()
  })

  it('refuses when even ONE of several photos is missing -- a report claims all N exist', async () => {
    const report = await insertReport(['obj-1', 'obj-2'])
    gateway.objectStats.set('obj-1', { exists: true, contentLength: 1024 })
    // obj-2 has no entry -- never uploaded.

    const result = await confirmConditionReportUpload(repo, gateway, { tenantId: tenantA, conditionReportId: report.id })

    expect(result).toEqual({ outcome: 'not_yet_uploaded', missingObjectKeys: ['obj-2'] })
    const stored = await repo.getConditionReport(tenantA, report.id)
    expect(stored?.confirmedAt).toBeNull()
  })

  it('deletes only the oversized photo, not the whole report\'s objects (D-40 second obligation, OQ #26)', async () => {
    const report = await insertReport(['obj-1', 'obj-2'])
    gateway.objectStats.set('obj-1', { exists: true, contentLength: 1024 })
    gateway.objectStats.set('obj-2', { exists: true, contentLength: MAX_EVIDENCE_UPLOAD_SIZE_BYTES + 1 })

    const result = await confirmConditionReportUpload(repo, gateway, { tenantId: tenantA, conditionReportId: report.id })

    expect(result).toEqual({ outcome: 'oversized', objectKey: 'obj-2', contentLength: MAX_EVIDENCE_UPLOAD_SIZE_BYTES + 1 })
    expect(gateway.deletedObjectKeys).toEqual(['obj-2'])
    const stored = await repo.getConditionReport(tenantA, report.id)
    expect(stored?.confirmedAt).toBeNull()
  })

  it('is idempotent: confirming an already-confirmed report succeeds without re-checking the bucket', async () => {
    const report = await insertReport(['obj-1'])
    gateway.objectStats.set('obj-1', { exists: true, contentLength: 1024 })
    await confirmConditionReportUpload(repo, gateway, { tenantId: tenantA, conditionReportId: report.id })
    gateway.statCalls.length = 0

    const result = await confirmConditionReportUpload(repo, gateway, { tenantId: tenantA, conditionReportId: report.id })

    expect(result.outcome).toBe('confirmed')
    expect(gateway.statCalls).toHaveLength(0)
  })

  it('refuses for an unknown ConditionReport', async () => {
    await expect(
      confirmConditionReportUpload(repo, gateway, { tenantId: tenantA, conditionReportId: 999 }),
    ).rejects.toThrow(ConditionReportNotFoundError)
  })
})

describe('sweepUnconfirmedConditionReports (D-40)', () => {
  let repo: FakeHandoverPossessionRepository
  let gateway: FakeConditionReportStorageGateway
  let rentalAgreementId: number

  beforeEach(async () => {
    repo = createFakeHandoverPossessionRepository(createFakeAssetRegistryRepository())
    gateway = createFakeConditionReportStorageGateway()
    const agreement = await repo.insertRentalAgreement(tenantA, {
      reservationId: 1,
      customerId: 1,
      assetId: 1,
      operatorId,
      termsVersion: 'v1',
      handoverOutAt: new Date(),
      handoverOutRecordedAt: new Date(),
      handoverOutBackdateReason: null,
    })
    rentalAgreementId = agreement.id
  })

  it('confirms a report past the presigned URL lifetime whose photos DID arrive', async () => {
    const report = await repo.insertConditionReport(tenantA, {
      rentalAgreementId,
      stage: 'handover_out',
      photoObjectKeys: ['obj-late'],
      operatorId,
      capturedAt: new Date(),
      recordedAt: new Date(),
    })
    gateway.objectStats.set('obj-late', { exists: true, contentLength: 1024 })

    const now = new Date(Date.now() + (UPLOAD_URL_TTL_SECONDS + 60) * 1000)
    const confirmed = await sweepUnconfirmedConditionReports(repo, gateway, { tenantId: tenantA, now })

    expect(confirmed.map((r) => r.id)).toEqual([report.id])
  })

  it('leaves a genuinely abandoned report unconfirmed -- never deletes it (P1, append-only)', async () => {
    const report = await repo.insertConditionReport(tenantA, {
      rentalAgreementId,
      stage: 'handover_out',
      photoObjectKeys: ['obj-abandoned'],
      operatorId,
      capturedAt: new Date(),
      recordedAt: new Date(),
    })

    const now = new Date(Date.now() + (UPLOAD_URL_TTL_SECONDS + 60) * 1000)
    const confirmed = await sweepUnconfirmedConditionReports(repo, gateway, { tenantId: tenantA, now })

    expect(confirmed).toHaveLength(0)
    const stored = await repo.getConditionReport(tenantA, report.id)
    expect(stored?.confirmedAt).toBeNull()
  })
})
