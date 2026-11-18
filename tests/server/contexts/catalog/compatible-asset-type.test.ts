import { beforeEach, describe, expect, it } from 'vitest'
import { createMonetaryAmount, type TenantId } from '../../../../server/contexts/_shared'
import {
  createAssetType,
  listBrowsableAssetTypes,
  listPublishedCompatibleOf,
  publishAssetType,
  updateAssetType,
} from '../../../../server/contexts/catalog/asset-type'
import {
  AssetTypeNotFoundError,
  CompatibleWithAccessoryError,
  CompatibleWithItselfError,
} from '../../../../server/contexts/catalog/types'
import { createFakeCatalogRepository } from './fake-repository'

const tenantA = '11111111-1111-1111-1111-111111111111' as TenantId
const tenantB = '22222222-2222-2222-2222-222222222222' as TenantId
const operatorId = '33333333-3333-3333-3333-333333333333'

let repo: ReturnType<typeof createFakeCatalogRepository>

function make(
  name: string,
  extra: { principalIds?: number[]; compatibleIds?: number[]; tenantId?: TenantId } = {},
) {
  return createAssetType(repo, {
    tenantId: extra.tenantId ?? tenantA,
    operatorId,
    name,
    description: '',
    dayRate: createMonetaryAmount(2000),
    depositAmount: createMonetaryAmount(10000),
    principalIds: extra.principalIds,
    compatibleIds: extra.compatibleIds,
  })
}

const link = (assetTypeId: number, compatibleIds: number[], tenantId: TenantId = tenantA) =>
  updateAssetType(repo, { tenantId, assetTypeId, operatorId, compatibleIds })

const publish = (assetTypeId: number, tenantId: TenantId = tenantA) =>
  publishAssetType(repo, { tenantId, assetTypeId, operatorId })

const compatibleOf = async (id: number, tenantId: TenantId = tenantA) =>
  (await repo.getAssetType(tenantId, id))!.compatibleIds

beforeEach(() => {
  repo = createFakeCatalogRepository()
})

describe('CompatibleAssetType link (D-62)', () => {
  it('is symmetric: a link made from either side is visible from both', async () => {
    const washer = await make('Vysokotlakový čistič')
    const surface = await make('Nadstavec na plochy')

    await link(surface.id, [washer.id])

    expect(await compatibleOf(surface.id)).toEqual([washer.id])
    expect(await compatibleOf(washer.id)).toEqual([surface.id])
  })

  it('stores a pair once — linking again from the other side duplicates nothing', async () => {
    const washer = await make('Vysokotlakový čistič')
    const surface = await make('Nadstavec na plochy')

    await link(surface.id, [washer.id, washer.id])
    await link(washer.id, [surface.id])

    expect(await compatibleOf(surface.id)).toEqual([washer.id])
    expect(await compatibleOf(washer.id)).toEqual([surface.id])
  })

  it('replaces the set from one side and removes the link from both', async () => {
    const washer = await make('Vysokotlakový čistič')
    const surface = await make('Nadstavec na plochy')
    const brush = await make('Rotačná kefa')
    await link(washer.id, [surface.id, brush.id])

    await link(washer.id, [brush.id])

    expect(await compatibleOf(washer.id)).toEqual([brush.id])
    expect(await compatibleOf(surface.id)).toEqual([])
    expect(await compatibleOf(brush.id)).toEqual([washer.id])
  })

  it('refuses a link to itself', async () => {
    const washer = await make('Vysokotlakový čistič')
    await expect(link(washer.id, [washer.id])).rejects.toThrow(CompatibleWithItselfError)
  })

  it('refuses an AssetType from another Tenant as not found (FR-33)', async () => {
    const foreign = await make('Cudzí čistič', { tenantId: tenantB })
    const surface = await make('Nadstavec na plochy')

    await expect(link(surface.id, [foreign.id])).rejects.toThrow(AssetTypeNotFoundError)
    expect(await compatibleOf(foreign.id, tenantB)).toEqual([])
  })

  it('never links an Accessory (D-57 unchanged), from either side', async () => {
    const speaker = await make('JBL PartyBox 720')
    const microphone = await make('Mikrofón', { principalIds: [speaker.id] })
    const stand = await make('Stojan')

    await expect(link(stand.id, [microphone.id])).rejects.toThrow(CompatibleWithAccessoryError)
    await expect(link(microphone.id, [stand.id])).rejects.toThrow(CompatibleWithAccessoryError)
  })

  it('refuses turning a linked AssetType into an Accessory without clearing its links', async () => {
    const speaker = await make('JBL PartyBox 720')
    const washer = await make('Vysokotlakový čistič')
    const surface = await make('Nadstavec na plochy', { compatibleIds: [washer.id] })

    await expect(
      updateAssetType(repo, {
        tenantId: tenantA,
        assetTypeId: surface.id,
        operatorId,
        principalIds: [speaker.id],
      }),
    ).rejects.toThrow(CompatibleWithAccessoryError)

    // Clearing in the same save is allowed.
    await updateAssetType(repo, {
      tenantId: tenantA,
      assetTypeId: surface.id,
      operatorId,
      principalIds: [speaker.id],
      compatibleIds: [],
    })
    expect(await compatibleOf(washer.id)).toEqual([])
  })

  it('leaves both AssetTypes listed in S-01 — unlike an Accessory', async () => {
    const washer = await make('Vysokotlakový čistič')
    const surface = await make('Nadstavec na plochy', { compatibleIds: [washer.id] })
    await publish(washer.id)
    await publish(surface.id)

    const browsable = await listBrowsableAssetTypes(repo, { tenantId: tenantA })
    expect(browsable.map((a) => a.id).sort()).toEqual([washer.id, surface.id].sort())
  })
})

describe('listPublishedCompatibleOf (S-02, D-62)', () => {
  it('returns published compatible AssetTypes from either side', async () => {
    const washer = await make('Vysokotlakový čistič')
    const surface = await make('Nadstavec na plochy', { compatibleIds: [washer.id] })
    await publish(washer.id)
    await publish(surface.id)

    expect(
      (await listPublishedCompatibleOf(repo, { tenantId: tenantA, assetTypeId: surface.id })).map(
        (a) => a.id,
      ),
    ).toEqual([washer.id])
    expect(
      (await listPublishedCompatibleOf(repo, { tenantId: tenantA, assetTypeId: washer.id })).map(
        (a) => a.id,
      ),
    ).toEqual([surface.id])
  })

  it('never suggests an unpublished AssetType', async () => {
    const washer = await make('Vysokotlakový čistič')
    const surface = await make('Nadstavec na plochy', { compatibleIds: [washer.id] })
    await publish(surface.id)

    expect(
      await listPublishedCompatibleOf(repo, { tenantId: tenantA, assetTypeId: surface.id }),
    ).toEqual([])
  })

  it("never reads another Tenant's links (FR-33)", async () => {
    const washer = await make('Vysokotlakový čistič')
    const surface = await make('Nadstavec na plochy', { compatibleIds: [washer.id] })
    await publish(washer.id)
    await publish(surface.id)

    expect(
      await listPublishedCompatibleOf(repo, { tenantId: tenantB, assetTypeId: surface.id }),
    ).toEqual([])
  })
})
