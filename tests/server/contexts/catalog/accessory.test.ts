import { beforeEach, describe, expect, it } from 'vitest'
import { createMonetaryAmount, type TenantId } from '../../../../server/contexts/_shared'
import {
  createAssetType,
  getPublishedAssetType,
  listBrowsableAssetTypes,
  listPublishedAccessoriesOf,
  publishAssetType,
  updateAssetType,
} from '../../../../server/contexts/catalog/asset-type'
import {
  AccessoryChainError,
  AccessoryOfItselfError,
  AssetTypeNotFoundError,
} from '../../../../server/contexts/catalog/types'
import { createFakeCatalogRepository } from './fake-repository'

const tenantA = '11111111-1111-1111-1111-111111111111' as TenantId
const tenantB = '22222222-2222-2222-2222-222222222222' as TenantId
const operatorId = '33333333-3333-3333-3333-333333333333'

let repo: ReturnType<typeof createFakeCatalogRepository>

function make(name: string, extra: { principalIds?: number[]; tenantId?: TenantId } = {}) {
  return createAssetType(repo, {
    tenantId: extra.tenantId ?? tenantA,
    operatorId,
    name,
    description: '',
    dayRate: createMonetaryAmount(500),
    depositAmount: createMonetaryAmount(2500),
    principalIds: extra.principalIds,
  })
}

const publish = (assetTypeId: number) =>
  publishAssetType(repo, { tenantId: tenantA, assetTypeId, operatorId })

beforeEach(() => {
  repo = createFakeCatalogRepository()
})

describe('Accessory link (D-57)', () => {
  it('links an Accessory to several principals, deduplicated', async () => {
    const hammer = await make('Bosch GBH 2-26 DFR')
    const combi = await make('Aku kombinované kladivo PKHAP 205 A1')

    const bits = await make('Sada vrtákov', { principalIds: [combi.id, hammer.id, hammer.id] })

    expect(bits.principalIds).toEqual([hammer.id, combi.id].sort((a, b) => a - b))
  })

  it('refuses a principal from another Tenant as not found (FR-33)', async () => {
    const foreign = await make('JBL PartyBox 720', { tenantId: tenantB })
    await expect(make('Mikrofón', { principalIds: [foreign.id] })).rejects.toThrow(
      AssetTypeNotFoundError,
    )
  })

  it('refuses an Accessory of itself', async () => {
    const table = await make('Pracovný stôl')
    await expect(
      updateAssetType(repo, {
        tenantId: tenantA,
        assetTypeId: table.id,
        operatorId,
        principalIds: [table.id],
      }),
    ).rejects.toThrow(AccessoryOfItselfError)
  })

  it('keeps Accessories one level deep', async () => {
    const speaker = await make('JBL PartyBox 720')
    const microphone = await make('Mikrofón', { principalIds: [speaker.id] })

    // An Accessory cannot be a principal…
    await expect(make('Stojan na mikrofón', { principalIds: [microphone.id] })).rejects.toThrow(
      AccessoryChainError,
    )
    // …and a principal with Accessories cannot become an Accessory.
    const other = await make('LED svetelná lišta')
    await expect(
      updateAssetType(repo, {
        tenantId: tenantA,
        assetTypeId: speaker.id,
        operatorId,
        principalIds: [other.id],
      }),
    ).rejects.toThrow(AccessoryChainError)
  })

  it('unlinks with an empty set, which makes it a listed AssetType again', async () => {
    const saw = await make('Skracovacia a pokosová píla PZKS')
    const table = await make('Pracovný stôl', { principalIds: [saw.id] })
    await publish(saw.id)
    await publish(table.id)

    expect((await listBrowsableAssetTypes(repo, { tenantId: tenantA })).map((a) => a.id)).toEqual([
      saw.id,
    ])

    await updateAssetType(repo, {
      tenantId: tenantA,
      assetTypeId: table.id,
      operatorId,
      principalIds: [],
    })

    expect(
      (await listBrowsableAssetTypes(repo, { tenantId: tenantA })).map((a) => a.id).sort(),
    ).toEqual([saw.id, table.id].sort())
  })
})

describe('Visitor reads (S-01, S-02)', () => {
  it('never lists an Accessory on its own and gives it no page of its own', async () => {
    const speaker = await make('JBL PartyBox 720')
    const microphone = await make('Mikrofón', { principalIds: [speaker.id] })
    await publish(speaker.id)
    await publish(microphone.id)

    const listed = await listBrowsableAssetTypes(repo, { tenantId: tenantA })
    expect(listed.map((a) => a.id)).toEqual([speaker.id])
    await expect(
      getPublishedAssetType(repo, { tenantId: tenantA, assetTypeId: microphone.id }),
    ).rejects.toThrow(AssetTypeNotFoundError)
  })

  it("offers only published Accessories on the principal's page", async () => {
    const speaker = await make('JBL PartyBox 720')
    const microphone = await make('Mikrofón', { principalIds: [speaker.id] })
    await make('Batéria', { principalIds: [speaker.id] })
    await publish(speaker.id)
    await publish(microphone.id)

    const offered = await listPublishedAccessoriesOf(repo, {
      tenantId: tenantA,
      principalId: speaker.id,
    })
    expect(offered.map((a) => a.id)).toEqual([microphone.id])
  })
})
