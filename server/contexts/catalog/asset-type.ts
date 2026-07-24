// Catalog domain logic (D-03; FR-01, FR-35).
//
// Publication gates FR-01/FR-02: only a published AssetType is visible to
// a Visitor. An AssetType always has a name — the migration defaults the
// column to '' purely for safe backfill of the pre-existing stub rows;
// creating one through this module requires a non-empty name.
import type { TenantId } from '../_shared'
import type { CatalogRepository } from './repository'
import { AssetTypeNameRequiredError, AssetTypeNotFoundError, type AssetType } from './types'

async function requireAssetType(
  repo: CatalogRepository,
  tenantId: TenantId,
  assetTypeId: number,
): Promise<AssetType> {
  const assetType = await repo.getAssetType(tenantId, assetTypeId)
  if (!assetType) throw new AssetTypeNotFoundError(assetTypeId)
  return assetType
}

export async function createAssetType(
  repo: CatalogRepository,
  params: {
    tenantId: TenantId
    name: string
    description: string
    dayRate: AssetType['dayRate']
    depositAmount: AssetType['depositAmount']
  },
): Promise<AssetType> {
  const { tenantId, name, description, dayRate, depositAmount } = params

  if (name.trim().length === 0) throw new AssetTypeNameRequiredError()

  return repo.insertAssetType(tenantId, { name, description, dayRate, depositAmount })
}

export async function publishAssetType(
  repo: CatalogRepository,
  params: { tenantId: TenantId; assetTypeId: number },
): Promise<AssetType> {
  const { tenantId, assetTypeId } = params

  await requireAssetType(repo, tenantId, assetTypeId)
  return repo.updatePublicationState(tenantId, assetTypeId, true)
}

export async function unpublishAssetType(
  repo: CatalogRepository,
  params: { tenantId: TenantId; assetTypeId: number },
): Promise<AssetType> {
  const { tenantId, assetTypeId } = params

  await requireAssetType(repo, tenantId, assetTypeId)
  return repo.updatePublicationState(tenantId, assetTypeId, false)
}
