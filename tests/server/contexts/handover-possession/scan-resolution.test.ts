import { beforeEach, describe, expect, it } from 'vitest'
import type { TenantId } from '../../../../server/contexts/_shared'
import type { AssetStatus } from '../../../../server/contexts/asset-registry'
import { resolveScanEvent } from '../../../../server/contexts/handover-possession/scan-resolution'
import { ScanEventTagNotBoundError } from '../../../../server/contexts/handover-possession/types'
import { createFakeAssetRegistryRepository, type FakeAssetRegistryRepository } from '../asset-registry/fake-repository'
import { createFakeHandoverPossessionRepository, type FakeHandoverPossessionRepository } from './fake-repository'

const tenantA = '11111111-1111-1111-1111-111111111111' as TenantId
const tenantB = '22222222-2222-2222-2222-222222222222' as TenantId
const operatorId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

describe('resolveScanEvent', () => {
  let assetRegistry: FakeAssetRegistryRepository
  let repo: FakeHandoverPossessionRepository

  beforeEach(() => {
    assetRegistry = createFakeAssetRegistryRepository()
    repo = createFakeHandoverPossessionRepository(assetRegistry)
    assetRegistry.seedAssetType(tenantA, 1)
  })

  async function seedAsset(status: AssetStatus, tagCode: string, tenantId: TenantId = tenantA) {
    const asset = await assetRegistry.insertAsset(tenantId, { assetTypeId: 1, status, operatorId })
    await assetRegistry.insertAssetTag(tenantId, { assetId: asset.id, tagCode, operatorId })
    return asset
  }

  it('resolves a scan of a Rentable Asset to handover_out (P3, FR-17)', async () => {
    const asset = await seedAsset('rentable', 'TAG-1')

    const resolution = await resolveScanEvent(repo, assetRegistry, {
      tenantId: tenantA,
      tagCode: 'TAG-1',
      operatorId,
    })

    expect(resolution.kind).toBe('handover_out')
    expect(resolution.asset.id).toBe(asset.id)
  })

  it('resolves a scan of an InPossession Asset to handover_in (P3, FR-17)', async () => {
    await seedAsset('in_possession', 'TAG-2')

    const resolution = await resolveScanEvent(repo, assetRegistry, {
      tenantId: tenantA,
      tagCode: 'TAG-2',
      operatorId,
    })

    expect(resolution.kind).toBe('handover_in')
  })

  it.each(['under_inspection', 'unavailable', 'retired'] satisfies AssetStatus[])(
    'resolves a scan of a %s Asset to asset_lookup, never an error (FR-45)',
    async (status) => {
      await seedAsset(status, `TAG-${status}`)

      const resolution = await resolveScanEvent(repo, assetRegistry, {
        tenantId: tenantA,
        tagCode: `TAG-${status}`,
        operatorId,
      })

      expect(resolution.kind).toBe('asset_lookup')
    },
  )

  it('records a ScanEvent for every scan, regardless of resolution (FR-17: recorded as an intent)', async () => {
    await seedAsset('unavailable', 'TAG-3')

    await resolveScanEvent(repo, assetRegistry, { tenantId: tenantA, tagCode: 'TAG-3', operatorId })

    expect(repo.allScanEvents()).toHaveLength(1)
  })

  it('refuses a tagCode with no active binding', async () => {
    await expect(
      resolveScanEvent(repo, assetRegistry, { tenantId: tenantA, tagCode: 'UNKNOWN', operatorId }),
    ).rejects.toThrow(ScanEventTagNotBoundError)
  })

  it('never resolves a tag bound under a different Tenant (FR-33)', async () => {
    await seedAsset('rentable', 'TAG-4', tenantB)

    await expect(
      resolveScanEvent(repo, assetRegistry, { tenantId: tenantA, tagCode: 'TAG-4', operatorId }),
    ).rejects.toThrow(ScanEventTagNotBoundError)
  })
})
