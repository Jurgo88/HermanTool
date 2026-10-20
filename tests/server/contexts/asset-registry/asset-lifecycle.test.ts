import { beforeEach, describe, expect, it } from 'vitest'
import type { TenantId } from '../../../../server/contexts/_shared'
import {
  AssetAlreadyActivatedError,
  AssetNotFoundError,
  AssetNotTaggedError,
  AssetRetiredError,
  AssetTypeNotFoundError,
  TagAlreadyBoundError,
} from '../../../../server/contexts/asset-registry/types'
import {
  bindAssetTag,
  cancelAssetRegistration,
  REGISTRATION_CANCELLED_REASON,
  markAssetRentable,
  markAssetUnavailable,
  registerAsset,
  retireAsset,
} from '../../../../server/contexts/asset-registry/asset-lifecycle'
import { createFakeAssetRegistryRepository, type FakeAssetRegistryRepository } from './fake-repository'

// The fake repository doesn't validate format — tenantId/operatorId are
// real uuid columns in the migration, but the domain layer's types are
// plain strings, so the fake correctly doesn't enforce that. These are
// still valid-looking uuids anyway, purely so nobody copies a fixture
// like 'operator-1' into real code assuming it's an acceptable value.
const tenantA = '11111111-1111-1111-1111-111111111111' as TenantId
const tenantB = '22222222-2222-2222-2222-222222222222' as TenantId
const operatorId = '33333333-3333-3333-3333-333333333333'

describe('registerAsset', () => {
  let repo: FakeAssetRegistryRepository

  beforeEach(() => {
    repo = createFakeAssetRegistryRepository()
    repo.seedAssetType(tenantA, 1)
  })

  it('defaults a newly registered Asset to unavailable, not rentable (FR-27, W9)', async () => {
    const asset = await registerAsset(repo, { tenantId: tenantA, assetTypeId: 1, operatorId })

    expect(asset.status).toBe('unavailable')
  })

  it('records the registration as a status event with a null from_status (D-10)', async () => {
    const asset = await registerAsset(repo, { tenantId: tenantA, assetTypeId: 1, operatorId })

    const events = repo.allStatusEvents().filter((e) => e.assetId === asset.id)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      fromStatus: null,
      toStatus: 'unavailable',
      operatorId,
    })
  })

  it('rejects an AssetType that does not exist for the Tenant (FR-33)', async () => {
    await expect(
      registerAsset(repo, { tenantId: tenantA, assetTypeId: 999, operatorId }),
    ).rejects.toThrow(AssetTypeNotFoundError)
  })

  it('rejects an AssetType that belongs to a different Tenant (FR-33)', async () => {
    await expect(
      registerAsset(repo, { tenantId: tenantB, assetTypeId: 1, operatorId }),
    ).rejects.toThrow(AssetTypeNotFoundError)
  })
})

describe('bindAssetTag', () => {
  let repo: FakeAssetRegistryRepository

  beforeEach(() => {
    repo = createFakeAssetRegistryRepository()
    repo.seedAssetType(tenantA, 1)
  })

  it('binds a tag_code supplied by the caller, never generating one (F10)', async () => {
    const asset = await registerAsset(repo, { tenantId: tenantA, assetTypeId: 1, operatorId })

    const tag = await bindAssetTag(repo, {
      tenantId: tenantA,
      assetId: asset.id,
      tagCode: 'TAG-0001',
      operatorId,
    })

    expect(tag.tagCode).toBe('TAG-0001')
    expect(tag.unboundAt).toBeNull()
  })

  it('rebinding auto-unbinds the Asset\'s previous active tag (FR-26)', async () => {
    const asset = await registerAsset(repo, { tenantId: tenantA, assetTypeId: 1, operatorId })
    const firstTag = await bindAssetTag(repo, {
      tenantId: tenantA,
      assetId: asset.id,
      tagCode: 'TAG-OLD',
      operatorId,
    })

    const secondTag = await bindAssetTag(repo, {
      tenantId: tenantA,
      assetId: asset.id,
      tagCode: 'TAG-NEW',
      operatorId,
    })

    const allTags = repo.allTags()
    const oldTagRow = allTags.find((t) => t.id === firstTag.id)!
    expect(oldTagRow.unboundAt).not.toBeNull()
    expect(secondTag.unboundAt).toBeNull()
    expect(secondTag.tagCode).toBe('TAG-NEW')
  })

  it('rejects binding a tag_code already actively bound to a different Asset', async () => {
    const assetOne = await registerAsset(repo, { tenantId: tenantA, assetTypeId: 1, operatorId })
    const assetTwo = await registerAsset(repo, { tenantId: tenantA, assetTypeId: 1, operatorId })

    await bindAssetTag(repo, {
      tenantId: tenantA,
      assetId: assetOne.id,
      tagCode: 'TAG-SHARED',
      operatorId,
    })

    await expect(
      bindAssetTag(repo, {
        tenantId: tenantA,
        assetId: assetTwo.id,
        tagCode: 'TAG-SHARED',
        operatorId,
      }),
    ).rejects.toThrow(TagAlreadyBoundError)
  })

  it('rejects binding a tag to an Asset belonging to a different Tenant (FR-33)', async () => {
    const asset = await registerAsset(repo, { tenantId: tenantA, assetTypeId: 1, operatorId })

    await expect(
      bindAssetTag(repo, { tenantId: tenantB, assetId: asset.id, tagCode: 'TAG-X', operatorId }),
    ).rejects.toThrow(AssetNotFoundError)
  })
})

describe('markAssetRentable', () => {
  let repo: FakeAssetRegistryRepository

  beforeEach(() => {
    repo = createFakeAssetRegistryRepository()
    repo.seedAssetType(tenantA, 1)
  })

  it('rejects making an untagged Asset rentable', async () => {
    const asset = await registerAsset(repo, { tenantId: tenantA, assetTypeId: 1, operatorId })

    await expect(
      markAssetRentable(repo, { tenantId: tenantA, assetId: asset.id, operatorId }),
    ).rejects.toThrow(AssetNotTaggedError)
  })

  it('makes a tagged Asset rentable and records the transition', async () => {
    const asset = await registerAsset(repo, { tenantId: tenantA, assetTypeId: 1, operatorId })
    await bindAssetTag(repo, { tenantId: tenantA, assetId: asset.id, tagCode: 'TAG-1', operatorId })

    const updated = await markAssetRentable(repo, { tenantId: tenantA, assetId: asset.id, operatorId })

    expect(updated.status).toBe('rentable')
    const events = repo.allStatusEvents().filter((e) => e.assetId === asset.id)
    expect(events.at(-1)).toMatchObject({ fromStatus: 'unavailable', toStatus: 'rentable' })
  })
})

describe('terminal Retired status', () => {
  let repo: FakeAssetRegistryRepository

  beforeEach(() => {
    repo = createFakeAssetRegistryRepository()
    repo.seedAssetType(tenantA, 1)
  })

  it('rejects any status change once an Asset is Retired', async () => {
    const asset = await registerAsset(repo, { tenantId: tenantA, assetTypeId: 1, operatorId })
    await retireAsset(repo, { tenantId: tenantA, assetId: asset.id, operatorId, reason: 'lost' })

    await expect(
      markAssetUnavailable(repo, { tenantId: tenantA, assetId: asset.id, operatorId, reason: 'damaged' }),
    ).rejects.toThrow(AssetRetiredError)
  })
})

describe('Tenant isolation (FR-33)', () => {
  it('never lets one Tenant see or mutate another Tenant\'s Asset by guessing its id', async () => {
    const repo = createFakeAssetRegistryRepository()
    repo.seedAssetType(tenantA, 1)
    repo.seedAssetType(tenantB, 1)

    const assetForA = await registerAsset(repo, { tenantId: tenantA, assetTypeId: 1, operatorId })
    await registerAsset(repo, { tenantId: tenantB, assetTypeId: 1, operatorId })

    expect(await repo.getAsset(tenantB, assetForA.id)).toBeNull()
    await expect(
      markAssetRentable(repo, { tenantId: tenantB, assetId: assetForA.id, operatorId }),
    ).rejects.toThrow(AssetNotFoundError)
  })
})

describe('cancelAssetRegistration (FR-25, FR-26: a unit registered by mistake)', () => {
  let repo: FakeAssetRegistryRepository

  beforeEach(() => {
    repo = createFakeAssetRegistryRepository()
    repo.seedAssetType(tenantA, 1)
  })

  async function registeredAndTagged() {
    const asset = await registerAsset(repo, { tenantId: tenantA, assetTypeId: 1, operatorId })
    await bindAssetTag(repo, { tenantId: tenantA, assetId: asset.id, tagCode: `HT-${asset.id}`, operatorId })
    return asset
  }

  it('retires a never-activated unit, records why and who, and deletes nothing (FR-34)', async () => {
    const asset = await registeredAndTagged()

    const cancelled = await cancelAssetRegistration(repo, { tenantId: tenantA, assetId: asset.id, operatorId })

    expect(cancelled.status).toBe('retired')
    const last = repo.allStatusEvents().filter((e) => e.assetId === asset.id).at(-1)
    expect(last).toMatchObject({
      fromStatus: 'unavailable',
      toStatus: 'retired',
      reason: REGISTRATION_CANCELLED_REASON,
      operatorId,
    })
    expect(await repo.getAsset(tenantA, asset.id)).not.toBeNull()
    expect(await repo.listPendingActivation(tenantA)).toHaveLength(0)
  })

  it('refuses a unit that has been in service, even if it is unavailable again', async () => {
    const asset = await registeredAndTagged()
    await markAssetRentable(repo, { tenantId: tenantA, assetId: asset.id, operatorId })
    await markAssetUnavailable(repo, { tenantId: tenantA, assetId: asset.id, operatorId, reason: 'damaged' })

    await expect(
      cancelAssetRegistration(repo, { tenantId: tenantA, assetId: asset.id, operatorId }),
    ).rejects.toThrow(AssetAlreadyActivatedError)
    expect((await repo.getAsset(tenantA, asset.id))?.status).toBe('unavailable')
  })

  it('refuses a rentable unit and an already retired one', async () => {
    const rentable = await registeredAndTagged()
    await markAssetRentable(repo, { tenantId: tenantA, assetId: rentable.id, operatorId })
    await expect(
      cancelAssetRegistration(repo, { tenantId: tenantA, assetId: rentable.id, operatorId }),
    ).rejects.toThrow(AssetAlreadyActivatedError)

    const unit = await registeredAndTagged()
    await cancelAssetRegistration(repo, { tenantId: tenantA, assetId: unit.id, operatorId })
    await expect(
      cancelAssetRegistration(repo, { tenantId: tenantA, assetId: unit.id, operatorId }),
    ).rejects.toThrow(AssetRetiredError)
  })

  it('cannot reach another Tenant’s unit (FR-33)', async () => {
    const asset = await registeredAndTagged()

    await expect(
      cancelAssetRegistration(repo, { tenantId: tenantB, assetId: asset.id, operatorId }),
    ).rejects.toThrow(AssetNotFoundError)
  })

  it('marks only never-activated units as cancellable in the waiting list', async () => {
    const fresh = await registeredAndTagged()
    const used = await registeredAndTagged()
    await markAssetRentable(repo, { tenantId: tenantA, assetId: used.id, operatorId })
    await markAssetUnavailable(repo, { tenantId: tenantA, assetId: used.id, operatorId, reason: 'damaged' })

    const pending = await repo.listPendingActivation(tenantA)
    expect(pending.map((p) => [p.asset.id, p.neverActivated])).toEqual([
      [fresh.id, true],
      [used.id, false],
    ])
  })
})

describe('listTaggedAssets (FR-26: reprint a label)', () => {
  it('lists every unit with an active tag except retired ones, scoped by Tenant', async () => {
    const repo = createFakeAssetRegistryRepository()
    repo.seedAssetType(tenantA, 1)
    const kept = await registerAsset(repo, { tenantId: tenantA, assetTypeId: 1, operatorId })
    await bindAssetTag(repo, { tenantId: tenantA, assetId: kept.id, tagCode: 'HT-1', operatorId })
    const gone = await registerAsset(repo, { tenantId: tenantA, assetTypeId: 1, operatorId })
    await bindAssetTag(repo, { tenantId: tenantA, assetId: gone.id, tagCode: 'HT-2', operatorId })
    await cancelAssetRegistration(repo, { tenantId: tenantA, assetId: gone.id, operatorId })

    expect((await repo.listTaggedAssets(tenantA)).map((t) => t.tag.tagCode)).toEqual(['HT-1'])
    expect(await repo.listTaggedAssets(tenantB)).toEqual([])
  })
})
