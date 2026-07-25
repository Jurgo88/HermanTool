import { beforeEach, describe, expect, it } from 'vitest'
import { createMonetaryAmount, type TenantId } from '../../../../server/contexts/_shared'
import { AssetTypeNameRequiredError, AssetTypeNotFoundError } from '../../../../server/contexts/catalog/types'
import { createAssetType, publishAssetType, unpublishAssetType } from '../../../../server/contexts/catalog/asset-type'
import { createFakeCatalogRepository } from './fake-repository'

// Valid-looking uuids, same lesson as Asset Registry: nobody should copy
// a fixture like 'tenant-1' into real code assuming it's an acceptable
// TenantId value.
const tenantA = '11111111-1111-1111-1111-111111111111' as TenantId
const tenantB = '22222222-2222-2222-2222-222222222222' as TenantId

const dayRate = createMonetaryAmount(1500)
const depositAmount = createMonetaryAmount(5000)

describe('createAssetType', () => {
  it('creates an unpublished AssetType with the given name, description and amounts (FR-01)', async () => {
    const repo = createFakeCatalogRepository()

    const assetType = await createAssetType(repo, {
      tenantId: tenantA,
      name: 'Rotary hammer, 5kg',
      description: 'Bosch GBH 5-40, SDS-max',
      dayRate,
      depositAmount,
    })

    expect(assetType).toMatchObject({
      tenantId: tenantA,
      name: 'Rotary hammer, 5kg',
      description: 'Bosch GBH 5-40, SDS-max',
      dayRate,
      depositAmount,
      published: false,
    })
  })

  it('rejects an empty name (W1: a Visitor distinguishes AssetTypes by name)', async () => {
    const repo = createFakeCatalogRepository()

    await expect(
      createAssetType(repo, { tenantId: tenantA, name: '', description: '', dayRate, depositAmount }),
    ).rejects.toThrow(AssetTypeNameRequiredError)
  })

  it('rejects a whitespace-only name', async () => {
    const repo = createFakeCatalogRepository()

    await expect(
      createAssetType(repo, { tenantId: tenantA, name: '   ', description: '', dayRate, depositAmount }),
    ).rejects.toThrow(AssetTypeNameRequiredError)
  })

  it('keeps currency alongside every amount, never a bare number (D-21)', async () => {
    const repo = createFakeCatalogRepository()

    const assetType = await createAssetType(repo, {
      tenantId: tenantA,
      name: 'Rotary hammer, 5kg',
      description: '',
      dayRate,
      depositAmount,
    })

    expect(assetType.dayRate).toEqual({ amount: 1500, currency: 'EUR' })
    expect(assetType.depositAmount).toEqual({ amount: 5000, currency: 'EUR' })
  })
})

describe('publishAssetType / unpublishAssetType', () => {
  let repo: ReturnType<typeof createFakeCatalogRepository>
  let assetTypeId: number

  beforeEach(async () => {
    repo = createFakeCatalogRepository()
    const assetType = await createAssetType(repo, {
      tenantId: tenantA,
      name: 'Rotary hammer, 5kg',
      description: '',
      dayRate,
      depositAmount,
    })
    assetTypeId = assetType.id
  })

  it('toggles publication state (FR-01, "either published or not")', async () => {
    const published = await publishAssetType(repo, { tenantId: tenantA, assetTypeId })
    expect(published.published).toBe(true)

    const unpublished = await unpublishAssetType(repo, { tenantId: tenantA, assetTypeId })
    expect(unpublished.published).toBe(false)
  })

  it('rejects publishing an AssetType that does not exist for the Tenant (FR-33)', async () => {
    await expect(publishAssetType(repo, { tenantId: tenantA, assetTypeId: 999 })).rejects.toThrow(
      AssetTypeNotFoundError,
    )
  })

  it('rejects publishing an AssetType that belongs to a different Tenant (FR-33)', async () => {
    await expect(publishAssetType(repo, { tenantId: tenantB, assetTypeId })).rejects.toThrow(
      AssetTypeNotFoundError,
    )
  })
})
