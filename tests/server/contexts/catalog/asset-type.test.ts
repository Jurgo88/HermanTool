import { beforeEach, describe, expect, it } from 'vitest'
import { createMonetaryAmount, type TenantId } from '../../../../server/contexts/_shared'
import { AssetTypeNameRequiredError, AssetTypeNotFoundError } from '../../../../server/contexts/catalog/types'
import {
  createAssetType,
  listAssetTypes,
  listPublishedAssetTypes,
  publishAssetType,
  unpublishAssetType,
  updateAssetType,
} from '../../../../server/contexts/catalog/asset-type'
import { createFakeCatalogRepository } from './fake-repository'

// Valid-looking uuids, same lesson as Asset Registry: nobody should copy
// a fixture like 'tenant-1' into real code assuming it's an acceptable
// TenantId value.
const tenantA = '11111111-1111-1111-1111-111111111111' as TenantId
const tenantB = '22222222-2222-2222-2222-222222222222' as TenantId
const operatorId = '33333333-3333-3333-3333-333333333333'
const otherOperatorId = '44444444-4444-4444-4444-444444444444'

const dayRate = createMonetaryAmount(1500)
const depositAmount = createMonetaryAmount(5000)

describe('createAssetType', () => {
  it('creates an unpublished AssetType with the given name, description and amounts (FR-01)', async () => {
    const repo = createFakeCatalogRepository()

    const assetType = await createAssetType(repo, {
      tenantId: tenantA,
      operatorId,
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
      createdByOperatorId: operatorId,
      updatedByOperatorId: operatorId,
    })
  })

  it('rejects an empty name (W1: a Visitor distinguishes AssetTypes by name)', async () => {
    const repo = createFakeCatalogRepository()

    await expect(
      createAssetType(repo, { tenantId: tenantA, operatorId, name: '', description: '', dayRate, depositAmount }),
    ).rejects.toThrow(AssetTypeNameRequiredError)
  })

  it('rejects a whitespace-only name', async () => {
    const repo = createFakeCatalogRepository()

    await expect(
      createAssetType(repo, {
        tenantId: tenantA,
        operatorId,
        name: '   ',
        description: '',
        dayRate,
        depositAmount,
      }),
    ).rejects.toThrow(AssetTypeNameRequiredError)
  })

  it('keeps currency alongside every amount, never a bare number (D-21)', async () => {
    const repo = createFakeCatalogRepository()

    const assetType = await createAssetType(repo, {
      tenantId: tenantA,
      operatorId,
      name: 'Rotary hammer, 5kg',
      description: '',
      dayRate,
      depositAmount,
    })

    expect(assetType.dayRate).toEqual({ amount: 1500, currency: 'EUR' })
    expect(assetType.depositAmount).toEqual({ amount: 5000, currency: 'EUR' })
  })
})

describe('listAssetTypes', () => {
  it('only lists AssetTypes belonging to the given Tenant (FR-33)', async () => {
    const repo = createFakeCatalogRepository()
    await createAssetType(repo, {
      tenantId: tenantA,
      operatorId,
      name: 'Rotary hammer, 5kg',
      description: '',
      dayRate,
      depositAmount,
    })
    await createAssetType(repo, {
      tenantId: tenantB,
      operatorId,
      name: 'Circular saw',
      description: '',
      dayRate,
      depositAmount,
    })

    const assetTypes = await listAssetTypes(repo, { tenantId: tenantA })

    expect(assetTypes).toHaveLength(1)
    expect(assetTypes[0]?.name).toBe('Rotary hammer, 5kg')
  })
})

describe('listPublishedAssetTypes', () => {
  it('excludes unpublished AssetTypes (FR-02: a Visitor sees published only)', async () => {
    const repo = createFakeCatalogRepository()
    const unpublished = await createAssetType(repo, {
      tenantId: tenantA,
      operatorId,
      name: 'Rotary hammer, 5kg',
      description: '',
      dayRate,
      depositAmount,
    })
    const published = await createAssetType(repo, {
      tenantId: tenantA,
      operatorId,
      name: 'Circular saw',
      description: '',
      dayRate,
      depositAmount,
    })
    await publishAssetType(repo, { tenantId: tenantA, assetTypeId: published.id, operatorId })

    const assetTypes = await listPublishedAssetTypes(repo, { tenantId: tenantA })

    expect(assetTypes.map((a) => a.id)).toEqual([published.id])
    expect(assetTypes.map((a) => a.id)).not.toContain(unpublished.id)
  })

  it('only lists published AssetTypes belonging to the given Tenant (FR-33)', async () => {
    const repo = createFakeCatalogRepository()
    const assetTypeInA = await createAssetType(repo, {
      tenantId: tenantA,
      operatorId,
      name: 'Rotary hammer, 5kg',
      description: '',
      dayRate,
      depositAmount,
    })
    await publishAssetType(repo, { tenantId: tenantA, assetTypeId: assetTypeInA.id, operatorId })

    const assetTypeInB = await createAssetType(repo, {
      tenantId: tenantB,
      operatorId,
      name: 'Circular saw',
      description: '',
      dayRate,
      depositAmount,
    })
    await publishAssetType(repo, { tenantId: tenantB, assetTypeId: assetTypeInB.id, operatorId })

    const assetTypes = await listPublishedAssetTypes(repo, { tenantId: tenantA })

    expect(assetTypes.map((a) => a.id)).toEqual([assetTypeInA.id])
  })
})

describe('updateAssetType', () => {
  let repo: ReturnType<typeof createFakeCatalogRepository>
  let assetTypeId: number

  beforeEach(async () => {
    repo = createFakeCatalogRepository()
    const assetType = await createAssetType(repo, {
      tenantId: tenantA,
      operatorId,
      name: 'Rotary hammer, 5kg',
      description: 'Old description',
      dayRate,
      depositAmount,
    })
    assetTypeId = assetType.id
  })

  it('updates only the given fields, leaving the rest untouched (FR-37)', async () => {
    const newDayRate = createMonetaryAmount(1800)

    const updated = await updateAssetType(repo, {
      tenantId: tenantA,
      assetTypeId,
      operatorId: otherOperatorId,
      dayRate: newDayRate,
    })

    expect(updated.dayRate).toEqual(newDayRate)
    expect(updated.description).toBe('Old description')
    expect(updated.depositAmount).toEqual(depositAmount)
  })

  it('records which Operator last touched the AssetType (FR-34: no fallback to "an Operator")', async () => {
    const updated = await updateAssetType(repo, {
      tenantId: tenantA,
      assetTypeId,
      operatorId: otherOperatorId,
      description: 'New description',
    })

    expect(updated.updatedByOperatorId).toBe(otherOperatorId)
    expect(updated.createdByOperatorId).toBe(operatorId)
  })

  it('rejects clearing the name to empty', async () => {
    await expect(
      updateAssetType(repo, { tenantId: tenantA, assetTypeId, operatorId, name: '  ' }),
    ).rejects.toThrow(AssetTypeNameRequiredError)
  })

  it('rejects updating an AssetType belonging to a different Tenant (FR-33)', async () => {
    await expect(
      updateAssetType(repo, { tenantId: tenantB, assetTypeId, operatorId, description: 'x' }),
    ).rejects.toThrow(AssetTypeNotFoundError)
  })
})

describe('publishAssetType / unpublishAssetType', () => {
  let repo: ReturnType<typeof createFakeCatalogRepository>
  let assetTypeId: number

  beforeEach(async () => {
    repo = createFakeCatalogRepository()
    const assetType = await createAssetType(repo, {
      tenantId: tenantA,
      operatorId,
      name: 'Rotary hammer, 5kg',
      description: '',
      dayRate,
      depositAmount,
    })
    assetTypeId = assetType.id
  })

  it('toggles publication state (FR-01, "either published or not")', async () => {
    const published = await publishAssetType(repo, { tenantId: tenantA, assetTypeId, operatorId })
    expect(published.published).toBe(true)

    const unpublished = await unpublishAssetType(repo, { tenantId: tenantA, assetTypeId, operatorId })
    expect(unpublished.published).toBe(false)
  })

  it('records which Operator published it (FR-34)', async () => {
    const published = await publishAssetType(repo, {
      tenantId: tenantA,
      assetTypeId,
      operatorId: otherOperatorId,
    })
    expect(published.updatedByOperatorId).toBe(otherOperatorId)
  })

  it('rejects publishing an AssetType that does not exist for the Tenant (FR-33)', async () => {
    await expect(
      publishAssetType(repo, { tenantId: tenantA, assetTypeId: 999, operatorId }),
    ).rejects.toThrow(AssetTypeNotFoundError)
  })

  it('rejects publishing an AssetType that belongs to a different Tenant (FR-33)', async () => {
    await expect(
      publishAssetType(repo, { tenantId: tenantB, assetTypeId, operatorId }),
    ).rejects.toThrow(AssetTypeNotFoundError)
  })
})
