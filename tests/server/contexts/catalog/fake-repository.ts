// In-memory stand-in for CatalogRepository, used by asset-type.test.ts
// so the domain logic in server/contexts/catalog/asset-type.ts is
// exercised without a database (Part 4 §14.2). Mirrors the real Postgres
// repository's tenant-scoping behaviour: every lookup filters by
// tenantId, exactly like the `where tenant_id = ...` clause in the real
// queries.
import type { CatalogRepository, NewAssetType } from '../../../../server/contexts/catalog/repository'
import type { AssetType } from '../../../../server/contexts/catalog/types'

export function createFakeCatalogRepository(): CatalogRepository {
  const assetTypes: AssetType[] = []
  let nextId = 1

  return {
    async getAssetType(tenantId, assetTypeId) {
      const assetType = assetTypes.find((a) => a.tenantId === tenantId && a.id === assetTypeId)
      return assetType ? { ...assetType } : null
    },

    async insertAssetType(tenantId, params: NewAssetType) {
      const assetType: AssetType = {
        id: nextId++,
        tenantId,
        name: params.name,
        description: params.description,
        dayRate: params.dayRate,
        depositAmount: params.depositAmount,
        published: false,
      }
      assetTypes.push(assetType)
      return { ...assetType }
    },

    async updatePublicationState(tenantId, assetTypeId, published) {
      const assetType = assetTypes.find((a) => a.tenantId === tenantId && a.id === assetTypeId)
      if (!assetType) throw new Error('fake repository: asset type not found')
      assetType.published = published
      return { ...assetType }
    },
  }
}
