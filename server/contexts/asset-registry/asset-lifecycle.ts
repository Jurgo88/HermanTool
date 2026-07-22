// Asset Registry domain logic (W9; FR-25, FR-26, FR-27, FR-34).
//
// FR-27's status enum is closed and has no "registered but not yet
// tagged" value, so `registerAsset` defaults a new Asset to `unavailable`
// rather than `rentable` — matching W9's three separate events
// (AssetRegistered, then AssetTagBound, then AssetMadeRentable).
// `markAssetRentable` is the explicit step that requires an active tag,
// so an Asset only counts toward Availability once it is actually tagged.
//
// Handover-driven transitions (InPossession, UnderInspection) belong to
// Handover & Possession and are not implemented here; that context will
// call into this module's published interface when it is built.
import type { TenantId } from '../_shared'
import type { AssetRegistryRepository } from './repository'
import {
  AssetNotFoundError,
  AssetNotTaggedError,
  AssetRetiredError,
  AssetTypeNotFoundError,
  TagAlreadyBoundError,
  type Asset,
  type AssetTag,
} from './types'

async function requireAsset(
  repo: AssetRegistryRepository,
  tenantId: TenantId,
  assetId: number,
): Promise<Asset> {
  const asset = await repo.getAsset(tenantId, assetId)
  if (!asset) throw new AssetNotFoundError(assetId)
  return asset
}

export async function registerAsset(
  repo: AssetRegistryRepository,
  params: { tenantId: TenantId; assetTypeId: number; operatorId: string },
): Promise<Asset> {
  const { tenantId, assetTypeId, operatorId } = params

  return repo.transaction(async (trx) => {
    const assetTypeExists = await trx.assetTypeExists(tenantId, assetTypeId)
    if (!assetTypeExists) throw new AssetTypeNotFoundError(assetTypeId)

    const asset = await trx.insertAsset(tenantId, {
      assetTypeId,
      status: 'unavailable',
      operatorId,
    })

    await trx.insertStatusEvent(tenantId, {
      assetId: asset.id,
      fromStatus: null,
      toStatus: asset.status,
      reason: null,
      operatorId,
    })

    return asset
  })
}

export async function bindAssetTag(
  repo: AssetRegistryRepository,
  params: { tenantId: TenantId; assetId: number; tagCode: string; operatorId: string },
): Promise<AssetTag> {
  const { tenantId, assetId, tagCode, operatorId } = params

  return repo.transaction(async (trx) => {
    await requireAsset(trx, tenantId, assetId)

    const existingBinding = await trx.getActiveTagBinding(tenantId, tagCode)
    if (existingBinding && existingBinding.assetId !== assetId) {
      throw new TagAlreadyBoundError(tagCode)
    }

    // Rebinding (FR-26): if this Asset already has an active tag — its own
    // or, harmlessly, the same tag_code re-read above — unbind it first.
    // A tag is retired by appending an unbound row, never edited in place.
    const currentTag = await trx.getActiveTagForAsset(tenantId, assetId)
    if (currentTag) {
      await trx.unbindAssetTag(tenantId, currentTag.id, operatorId)
    }

    return trx.insertAssetTag(tenantId, { assetId, tagCode, operatorId })
  })
}

export async function markAssetRentable(
  repo: AssetRegistryRepository,
  params: { tenantId: TenantId; assetId: number; operatorId: string },
): Promise<Asset> {
  const { tenantId, assetId, operatorId } = params

  return repo.transaction(async (trx) => {
    const asset = await requireAsset(trx, tenantId, assetId)
    if (asset.status === 'retired') throw new AssetRetiredError(assetId)

    const activeTag = await trx.getActiveTagForAsset(tenantId, assetId)
    if (!activeTag) throw new AssetNotTaggedError(assetId)

    const updated = await trx.updateAssetStatus(tenantId, assetId, {
      status: 'rentable',
      operatorId,
      reason: null,
    })

    await trx.insertStatusEvent(tenantId, {
      assetId,
      fromStatus: asset.status,
      toStatus: 'rentable',
      reason: null,
      operatorId,
    })

    return updated
  })
}

export async function markAssetUnavailable(
  repo: AssetRegistryRepository,
  params: { tenantId: TenantId; assetId: number; operatorId: string; reason: string },
): Promise<Asset> {
  const { tenantId, assetId, operatorId, reason } = params

  return repo.transaction(async (trx) => {
    const asset = await requireAsset(trx, tenantId, assetId)
    if (asset.status === 'retired') throw new AssetRetiredError(assetId)

    const updated = await trx.updateAssetStatus(tenantId, assetId, {
      status: 'unavailable',
      operatorId,
      reason,
    })

    await trx.insertStatusEvent(tenantId, {
      assetId,
      fromStatus: asset.status,
      toStatus: 'unavailable',
      reason,
      operatorId,
    })

    return updated
  })
}

export async function retireAsset(
  repo: AssetRegistryRepository,
  params: { tenantId: TenantId; assetId: number; operatorId: string; reason: string },
): Promise<Asset> {
  const { tenantId, assetId, operatorId, reason } = params

  return repo.transaction(async (trx) => {
    const asset = await requireAsset(trx, tenantId, assetId)
    if (asset.status === 'retired') throw new AssetRetiredError(assetId)

    const updated = await trx.updateAssetStatus(tenantId, assetId, {
      status: 'retired',
      operatorId,
      reason,
    })

    await trx.insertStatusEvent(tenantId, {
      assetId,
      fromStatus: asset.status,
      toStatus: 'retired',
      reason,
      operatorId,
    })

    return updated
  })
}
