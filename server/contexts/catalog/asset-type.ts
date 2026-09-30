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
import { classificationNotFound } from './classification'
import type { AssetTypeContent, CatalogRepository } from './repository'
import {
  AssetTypeNameRequiredError,
  AssetTypeNotFoundError,
  InvalidImageFileError,
  InvalidSpecificationError,
  type AssetType,
} from './types'

// D-56: a bare file name produced by the image pipeline — lowercase
// kebab-case .webp, never a path, URL or anything that could escape
// public/catalog/.
const IMAGE_FILE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*\.webp$/

async function requireAssetType(
  repo: CatalogRepository,
  tenantId: TenantId,
  assetTypeId: number,
): Promise<AssetType> {
  const assetType = await repo.getAssetType(tenantId, assetTypeId)
  if (!assetType) throw new AssetTypeNotFoundError(assetTypeId)
  return assetType
}

// Normalises D-55 text (trimmed) and verifies every D-54 reference exists
// in the same Tenant — the composite FKs are the backstop, this is what
// turns a bad id into a typed error instead of a constraint violation.
async function validateContent(
  repo: CatalogRepository,
  tenantId: TenantId,
  content: AssetTypeContent,
): Promise<AssetTypeContent> {
  const result: AssetTypeContent = { ...content }

  if (content.powerSourceId != null) {
    const entry = await repo.getClassificationEntry(tenantId, 'powerSource', content.powerSourceId)
    if (!entry) throw classificationNotFound('powerSource', content.powerSourceId)
  }

  if (content.useAreaIds !== undefined) {
    const unique = [...new Set(content.useAreaIds)]
    for (const useAreaId of unique) {
      const entry = await repo.getClassificationEntry(tenantId, 'useArea', useAreaId)
      if (!entry) throw classificationNotFound('useArea', useAreaId)
    }
    result.useAreaIds = unique
  }

  if (content.specifications !== undefined) {
    result.specifications = content.specifications.map(({ label, value }) => {
      const specification = { label: label.trim(), value: value.trim() }
      if (!specification.label || !specification.value) throw new InvalidSpecificationError()
      return specification
    })
  }

  if (content.includedContents !== undefined)
    result.includedContents = content.includedContents.trim()
  if (content.handlingNotice !== undefined) result.handlingNotice = content.handlingNotice.trim()

  if (content.imageFile != null && !IMAGE_FILE_PATTERN.test(content.imageFile)) {
    throw new InvalidImageFileError(content.imageFile)
  }

  return result
}

export async function listAssetTypes(
  repo: CatalogRepository,
  params: { tenantId: TenantId },
): Promise<AssetType[]> {
  return repo.listAssetTypes(params.tenantId)
}

// FR-02, W1: what a Visitor may browse — published AssetTypes only, no
// identification required and no record created for the caller (P2 §7).
export async function listPublishedAssetTypes(
  repo: CatalogRepository,
  params: { tenantId: TenantId },
): Promise<AssetType[]> {
  return repo.listPublishedAssetTypes(params.tenantId)
}

// S-02 (D-58): an unpublished AssetType is indistinguishable from a
// missing one to a Visitor.
export async function getPublishedAssetType(
  repo: CatalogRepository,
  params: { tenantId: TenantId; assetTypeId: number },
): Promise<AssetType> {
  const assetType = await repo.getAssetType(params.tenantId, params.assetTypeId)
  if (!assetType || !assetType.published) throw new AssetTypeNotFoundError(params.assetTypeId)
  return assetType
}

export async function createAssetType(
  repo: CatalogRepository,
  params: AssetTypeContent & {
    tenantId: TenantId
    operatorId: string
    name: string
    description: string
    dayRate: AssetType['dayRate']
    depositAmount: AssetType['depositAmount']
  },
): Promise<AssetType> {
  const { tenantId, operatorId, name, description, dayRate, depositAmount, ...content } = params

  if (name.trim().length === 0) throw new AssetTypeNameRequiredError()

  return repo.transaction(async (trx) => {
    const validated = await validateContent(trx, tenantId, content)
    return trx.insertAssetType(tenantId, {
      name,
      description,
      dayRate,
      depositAmount,
      operatorId,
      ...validated,
    })
  })
}

export async function updateAssetType(
  repo: CatalogRepository,
  params: AssetTypeContent & {
    tenantId: TenantId
    assetTypeId: number
    operatorId: string
    name?: string
    description?: string
    dayRate?: AssetType['dayRate']
    depositAmount?: AssetType['depositAmount']
  },
): Promise<AssetType> {
  const {
    tenantId,
    assetTypeId,
    operatorId,
    name,
    description,
    dayRate,
    depositAmount,
    ...content
  } = params

  if (name !== undefined && name.trim().length === 0) throw new AssetTypeNameRequiredError()

  return repo.transaction(async (trx) => {
    await requireAssetType(trx, tenantId, assetTypeId)
    const validated = await validateContent(trx, tenantId, content)
    return trx.updateAssetType(tenantId, assetTypeId, {
      operatorId,
      name,
      description,
      dayRate,
      depositAmount,
      ...validated,
    })
  })
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
