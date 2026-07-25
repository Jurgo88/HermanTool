// Catalog domain logic (D-03; FR-01, FR-34, FR-35, FR-37).
//
// Publication gates FR-01/FR-02: only a published AssetType is visible to
// a Visitor. An AssetType always has a name — the migration defaults the
// column to '' purely for safe backfill of the pre-existing stub rows;
// creating or renaming one through this module requires a non-empty
// name. Every write here takes a real operatorId (FR-34): there is no
// fallback to "an Operator" (D-16), and the admin surface's
// requireOperator() gate is what supplies it.
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

export async function listAssetTypes(
  repo: CatalogRepository,
  params: { tenantId: TenantId },
): Promise<AssetType[]> {
  return repo.listAssetTypes(params.tenantId)
}

export async function createAssetType(
  repo: CatalogRepository,
  params: {
    tenantId: TenantId
    operatorId: string
    name: string
    description: string
    dayRate: AssetType['dayRate']
    depositAmount: AssetType['depositAmount']
  },
): Promise<AssetType> {
  const { tenantId, operatorId, name, description, dayRate, depositAmount } = params

  if (name.trim().length === 0) throw new AssetTypeNameRequiredError()

  return repo.insertAssetType(tenantId, { name, description, dayRate, depositAmount, operatorId })
}

export async function updateAssetType(
  repo: CatalogRepository,
  params: {
    tenantId: TenantId
    assetTypeId: number
    operatorId: string
    name?: string
    description?: string
    dayRate?: AssetType['dayRate']
    depositAmount?: AssetType['depositAmount']
  },
): Promise<AssetType> {
  const { tenantId, assetTypeId, operatorId, name, description, dayRate, depositAmount } = params

  await requireAssetType(repo, tenantId, assetTypeId)
  if (name !== undefined && name.trim().length === 0) throw new AssetTypeNameRequiredError()

  return repo.updateAssetType(tenantId, assetTypeId, { operatorId, name, description, dayRate, depositAmount })
}

export async function publishAssetType(
  repo: CatalogRepository,
  params: { tenantId: TenantId; assetTypeId: number; operatorId: string },
): Promise<AssetType> {
  const { tenantId, assetTypeId, operatorId } = params

  await requireAssetType(repo, tenantId, assetTypeId)
  return repo.updatePublicationState(tenantId, assetTypeId, true, operatorId)
}

export async function unpublishAssetType(
  repo: CatalogRepository,
  params: { tenantId: TenantId; assetTypeId: number; operatorId: string },
): Promise<AssetType> {
  const { tenantId, assetTypeId, operatorId } = params

  await requireAssetType(repo, tenantId, assetTypeId)
  return repo.updatePublicationState(tenantId, assetTypeId, false, operatorId)
}
