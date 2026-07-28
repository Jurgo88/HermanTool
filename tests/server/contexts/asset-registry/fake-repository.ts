// In-memory stand-in for AssetRegistryRepository, used by
// asset-lifecycle.test.ts so the domain logic in
// server/contexts/asset-registry/asset-lifecycle.ts is exercised without a
// database (Part 4 §14.2). Mirrors the real Postgres repository's
// tenant-scoping behaviour: every lookup filters by tenantId, exactly like
// the `where tenant_id = ...` clause in the real queries.
import type { TenantId } from '../../../../server/contexts/_shared'
import type {
  AssetRegistryRepository,
  NewAssetStatusEvent,
} from '../../../../server/contexts/asset-registry/repository'
import type { Asset, AssetStatusEvent, AssetTag } from '../../../../server/contexts/asset-registry/types'

interface FakeAssetType {
  id: number
  tenantId: TenantId
}

interface State {
  assetTypes: FakeAssetType[]
  assets: Asset[]
  statusEvents: AssetStatusEvent[]
  tags: AssetTag[]
  nextAssetId: number
  nextStatusEventId: number
  nextTagId: number
}

function cloneState(state: State): State {
  return {
    assetTypes: [...state.assetTypes],
    assets: state.assets.map((a) => ({ ...a })),
    statusEvents: state.statusEvents.map((e) => ({ ...e })),
    tags: state.tags.map((t) => ({ ...t })),
    nextAssetId: state.nextAssetId,
    nextStatusEventId: state.nextStatusEventId,
    nextTagId: state.nextTagId,
  }
}

export interface FakeAssetRegistryRepository extends AssetRegistryRepository {
  seedAssetType(tenantId: TenantId, id: number): void
  allStatusEvents(): AssetStatusEvent[]
  allTags(): AssetTag[]
}

export function createFakeAssetRegistryRepository(): FakeAssetRegistryRepository {
  const state: State = {
    assetTypes: [],
    assets: [],
    statusEvents: [],
    tags: [],
    nextAssetId: 1,
    nextStatusEventId: 1,
    nextTagId: 1,
  }

  function build(target: State): FakeAssetRegistryRepository {
    return {
      seedAssetType(tenantId, id) {
        target.assetTypes.push({ tenantId, id })
      },

      allStatusEvents() {
        return [...target.statusEvents]
      },

      allTags() {
        return [...target.tags]
      },

      async assetTypeExists(tenantId, assetTypeId) {
        return target.assetTypes.some((t) => t.tenantId === tenantId && t.id === assetTypeId)
      },

      async getRentableCount(tenantId, assetTypeId) {
        return target.assets.filter(
          (a) => a.tenantId === tenantId && a.assetTypeId === assetTypeId && a.status === 'rentable',
        ).length
      },

      async getAsset(tenantId, assetId) {
        const asset = target.assets.find((a) => a.tenantId === tenantId && a.id === assetId)
        return asset ? { ...asset } : null
      },

      async insertAsset(tenantId, { assetTypeId, status, operatorId }) {
        const now = new Date()
        const asset: Asset = {
          id: target.nextAssetId++,
          tenantId,
          assetTypeId,
          status,
          registeredAt: now,
          registeredByOperatorId: operatorId,
          statusChangedAt: now,
          statusChangedByOperatorId: operatorId,
          statusChangeReason: null,
        }
        target.assets.push(asset)
        return { ...asset }
      },

      async updateAssetStatus(tenantId, assetId, { status, operatorId, reason }) {
        const asset = target.assets.find((a) => a.tenantId === tenantId && a.id === assetId)
        if (!asset) throw new Error('fake repository: asset not found')
        asset.status = status
        asset.statusChangedAt = new Date()
        asset.statusChangedByOperatorId = operatorId
        asset.statusChangeReason = reason
        return { ...asset }
      },

      async insertStatusEvent(tenantId, event: NewAssetStatusEvent) {
        const now = new Date()
        const record: AssetStatusEvent = {
          id: target.nextStatusEventId++,
          tenantId,
          assetId: event.assetId,
          fromStatus: event.fromStatus,
          toStatus: event.toStatus,
          reason: event.reason,
          occurredAt: now,
          recordedAt: now,
          operatorId: event.operatorId,
        }
        target.statusEvents.push(record)
        return { ...record }
      },

      async getActiveTagForAsset(tenantId, assetId) {
        const tag = target.tags.find(
          (t) => t.tenantId === tenantId && t.assetId === assetId && t.unboundAt === null,
        )
        return tag ? { ...tag } : null
      },

      async getActiveTagBinding(tenantId, tagCode) {
        const tag = target.tags.find(
          (t) => t.tenantId === tenantId && t.tagCode === tagCode && t.unboundAt === null,
        )
        return tag ? { ...tag } : null
      },

      async insertAssetTag(tenantId, { assetId, tagCode, operatorId }) {
        const tag: AssetTag = {
          id: target.nextTagId++,
          tenantId,
          assetId,
          tagCode,
          boundAt: new Date(),
          boundByOperatorId: operatorId,
          unboundAt: null,
          unboundByOperatorId: null,
        }
        target.tags.push(tag)
        return { ...tag }
      },

      async unbindAssetTag(tenantId, tagId, operatorId) {
        const tag = target.tags.find((t) => t.tenantId === tenantId && t.id === tagId && t.unboundAt === null)
        if (!tag) return
        tag.unboundAt = new Date()
        tag.unboundByOperatorId = operatorId
      },

      async transaction(fn) {
        const snapshot = cloneState(target)
        try {
          return await fn(build(target))
        } catch (err) {
          Object.assign(target, cloneState(snapshot))
          throw err
        }
      },
    }
  }

  return build(state)
}
