import { beforeEach, describe, expect, it } from 'vitest'
import { createMonetaryAmount, type TenantId } from '../../../../server/contexts/_shared'
import {
  createAssetType,
  getPublishedAssetType,
  publishAssetType,
  updateAssetType,
} from '../../../../server/contexts/catalog/asset-type'
import { createClassificationEntry } from '../../../../server/contexts/catalog/classification'
import {
  AssetTypeNotFoundError,
  InvalidImageFileError,
  InvalidSpecificationError,
  PowerSourceNotFoundError,
  UseAreaNotFoundError,
} from '../../../../server/contexts/catalog/types'
import { createFakeCatalogRepository } from './fake-repository'

const tenantA = '11111111-1111-1111-1111-111111111111' as TenantId
const tenantB = '22222222-2222-2222-2222-222222222222' as TenantId
const operatorId = '33333333-3333-3333-3333-333333333333'

let repo: ReturnType<typeof createFakeCatalogRepository>

const base = {
  tenantId: tenantA,
  operatorId,
  name: 'Ručná kotúčová píla PPHKS 1800 A1',
  description: '',
  dayRate: createMonetaryAmount(1500),
  depositAmount: createMonetaryAmount(7500),
}

beforeEach(() => {
  repo = createFakeCatalogRepository()
})

const entry = (kind: 'powerSource' | 'useArea', label: string, tenantId = tenantA) =>
  createClassificationEntry(repo, { tenantId, kind, label, operatorId })

describe('AssetType classification (D-54)', () => {
  it('defaults to no PowerSource, no UseAreas and empty content', async () => {
    const assetType = await createAssetType(repo, base)
    expect(assetType).toMatchObject({
      powerSourceId: null,
      useAreaIds: [],
      specifications: [],
      includedContents: '',
      handlingNotice: '',
      imageFile: null,
    })
  })

  it('holds at most one PowerSource and any number of UseAreas, deduplicated', async () => {
    const power = await entry('powerSource', 'Elektrina')
    const wood = await entry('useArea', 'Práca s drevom')
    const build = await entry('useArea', 'Stavba')

    const assetType = await createAssetType(repo, {
      ...base,
      powerSourceId: power.id,
      useAreaIds: [build.id, wood.id, build.id],
    })

    expect(assetType.powerSourceId).toBe(power.id)
    expect(assetType.useAreaIds).toEqual([wood.id, build.id].sort((a, b) => a - b))
  })

  it("refuses another Tenant's PowerSource or UseArea (FR-33)", async () => {
    const foreignPower = await entry('powerSource', 'Aku', tenantB)
    const foreignArea = await entry('useArea', 'Záhrada', tenantB)

    await expect(
      createAssetType(repo, { ...base, powerSourceId: foreignPower.id }),
    ).rejects.toThrow(PowerSourceNotFoundError)
    await expect(createAssetType(repo, { ...base, useAreaIds: [foreignArea.id] })).rejects.toThrow(
      UseAreaNotFoundError,
    )
  })

  it('clears the PowerSource with null and replaces the UseArea set on update', async () => {
    const power = await entry('powerSource', 'Aku')
    const garden = await entry('useArea', 'Záhrada')
    const build = await entry('useArea', 'Stavba')
    const created = await createAssetType(repo, {
      ...base,
      powerSourceId: power.id,
      useAreaIds: [garden.id],
    })

    const updated = await updateAssetType(repo, {
      tenantId: tenantA,
      assetTypeId: created.id,
      operatorId,
      powerSourceId: null,
      useAreaIds: [build.id],
    })

    expect(updated.powerSourceId).toBeNull()
    expect(updated.useAreaIds).toEqual([build.id])
  })

  it('leaves classification untouched when the update does not mention it', async () => {
    const power = await entry('powerSource', 'Aku')
    const created = await createAssetType(repo, { ...base, powerSourceId: power.id })

    const updated = await updateAssetType(repo, {
      tenantId: tenantA,
      assetTypeId: created.id,
      operatorId,
      description: 'Nový popis',
    })

    expect(updated.powerSourceId).toBe(power.id)
  })
})

describe('AssetType presentation content (D-55, D-56)', () => {
  it('stores trimmed specifications, includedContents and handlingNotice', async () => {
    const assetType = await createAssetType(repo, {
      ...base,
      specifications: [{ label: ' Príkon ', value: ' 1 800 W ' }],
      includedContents: ' 1× batéria, kotúč na rezanie ',
      handlingNotice: ' POZOR! ',
    })

    expect(assetType.specifications).toEqual([{ label: 'Príkon', value: '1 800 W' }])
    expect(assetType.includedContents).toBe('1× batéria, kotúč na rezanie')
    expect(assetType.handlingNotice).toBe('POZOR!')
  })

  it('refuses a specification without a label or a value', async () => {
    await expect(
      createAssetType(repo, { ...base, specifications: [{ label: 'Príkon', value: ' ' }] }),
    ).rejects.toThrow(InvalidSpecificationError)
    await expect(
      createAssetType(repo, { ...base, specifications: [{ label: '', value: 'x' }] }),
    ).rejects.toThrow(InvalidSpecificationError)
  })

  it('accepts a bare kebab-case .webp file name and nothing else', async () => {
    await expect(
      createAssetType(repo, { ...base, imageFile: 'kotucova-pila-pphks-1800-a1.webp' }),
    ).resolves.toMatchObject({ imageFile: 'kotucova-pila-pphks-1800-a1.webp' })
    for (const bad of [
      '../secret.webp',
      'https://cdn.example/x.webp',
      'Pila.webp',
      'pila.png',
      'a/b.webp',
    ]) {
      await expect(createAssetType(repo, { ...base, imageFile: bad })).rejects.toThrow(
        InvalidImageFileError,
      )
    }
  })
})

describe('getPublishedAssetType (S-02, FR-02)', () => {
  it('returns a published AssetType and hides an unpublished one as not found', async () => {
    const created = await createAssetType(repo, base)
    await expect(
      getPublishedAssetType(repo, { tenantId: tenantA, assetTypeId: created.id }),
    ).rejects.toThrow(AssetTypeNotFoundError)

    await publishAssetType(repo, { tenantId: tenantA, assetTypeId: created.id, operatorId })
    await expect(
      getPublishedAssetType(repo, { tenantId: tenantA, assetTypeId: created.id }),
    ).resolves.toMatchObject({
      id: created.id,
    })
    await expect(
      getPublishedAssetType(repo, { tenantId: tenantB, assetTypeId: created.id }),
    ).rejects.toThrow(AssetTypeNotFoundError)
  })
})
