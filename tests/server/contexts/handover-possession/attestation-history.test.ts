import { beforeEach, describe, expect, it } from 'vitest'
import type { TenantId } from '../../../../server/contexts/_shared'
import { getAssetAttestationHistory } from '../../../../server/contexts/handover-possession/attestation-history'
import { createFakeAssetRegistryRepository, type FakeAssetRegistryRepository } from '../asset-registry/fake-repository'
import { createFakeHandoverPossessionRepository, type FakeHandoverPossessionRepository } from './fake-repository'

const tenantA = '11111111-1111-1111-1111-111111111111' as TenantId
const operatorId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

describe('getAssetAttestationHistory (FR-43)', () => {
  let assetRegistry: FakeAssetRegistryRepository
  let repo: FakeHandoverPossessionRepository
  let assetId: number

  beforeEach(async () => {
    assetRegistry = createFakeAssetRegistryRepository()
    repo = createFakeHandoverPossessionRepository(assetRegistry)
    const asset = await assetRegistry.insertAsset(tenantA, { assetTypeId: 1, status: 'rentable', operatorId })
    assetId = asset.id
  })

  it('returns an empty history for an Asset never handed out', async () => {
    const history = await getAssetAttestationHistory(repo, { tenantId: tenantA, assetId })
    expect(history).toEqual([])
  })

  it('returns one entry per RentalAgreement, each with its ConditionReports and deposit attestations', async () => {
    const now = new Date()
    const agreement = await repo.insertRentalAgreement(tenantA, {
      reservationId: 1,
      customerId: 1,
      assetId,
      operatorId,
      termsVersion: 'v1',
      handoverOutAt: now,
      handoverOutRecordedAt: now,
      handoverOutBackdateReason: null,
    })
    await repo.insertConditionReport(tenantA, {
      rentalAgreementId: agreement.id,
      stage: 'handover_out',
      photoObjectKeys: ['obj-1'],
      operatorId,
      capturedAt: now,
      recordedAt: now,
    })
    await repo.insertDepositTaken(tenantA, {
      rentalAgreementId: agreement.id,
      amount: { amount: 5000, currency: 'EUR' },
      operatorId,
      takenAt: now,
      recordedAt: now,
    })

    const history = await getAssetAttestationHistory(repo, { tenantId: tenantA, assetId })

    expect(history).toHaveLength(1)
    expect(history[0]!.rentalAgreement.id).toBe(agreement.id)
    expect(history[0]!.conditionReports).toHaveLength(1)
    expect(history[0]!.depositTaken?.amount.amount).toBe(5000)
    expect(history[0]!.depositReturned).toBeNull()
  })

  it('lists multiple past RentalAgreements for the same Asset, oldest first', async () => {
    const earlier = new Date('2026-01-01T00:00:00.000Z')
    const later = new Date('2026-02-01T00:00:00.000Z')

    const second = await repo.insertRentalAgreement(tenantA, {
      reservationId: 2,
      customerId: 2,
      assetId,
      operatorId,
      termsVersion: 'v1',
      handoverOutAt: later,
      handoverOutRecordedAt: later,
      handoverOutBackdateReason: null,
    })
    const first = await repo.insertRentalAgreement(tenantA, {
      reservationId: 1,
      customerId: 1,
      assetId,
      operatorId,
      termsVersion: 'v1',
      handoverOutAt: earlier,
      handoverOutRecordedAt: earlier,
      handoverOutBackdateReason: null,
    })

    const history = await getAssetAttestationHistory(repo, { tenantId: tenantA, assetId })

    expect(history.map((entry) => entry.rentalAgreement.id)).toEqual([first.id, second.id])
  })
})
