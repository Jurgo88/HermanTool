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
  AccessoryChainError,
  AccessoryOfItselfError,
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

// Normalises D-55 text (trimmed) and verifies every D-54/D-57 reference
// exists in the same Tenant — the composite FKs are the backstop, this is
// what turns a bad id into a typed error instead of a constraint
// violation. `selfId` is the AssetType being updated (absent on create).
async function validateContent(
  repo: CatalogRepository,
  tenantId: TenantId,
  content: AssetTypeContent,
  selfId?: number,
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

  if (content.principalIds !== undefined) {
    const unique = [...new Set(content.principalIds)]
    if (selfId !== undefined && unique.includes(selfId)) throw new AccessoryOfItselfError(selfId)
    for (const principalId of unique) {
      const principal = await requireAssetType(repo, tenantId, principalId)
      if (principal.principalIds.length > 0) throw new AccessoryChainError(principalId)
    }
    if (unique.length > 0 && selfId !== undefined) {
      const ownAccessories = await repo.listAccessoryIdsOf(tenantId, selfId)
      if (ownAccessories.length > 0) throw new AccessoryChainError(selfId)
    }
    result.principalIds = unique
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

// S-01 (D-57, D-58): what the catalog grid lists — published, and never
// an Accessory, which is offered only on its principals' pages.
export async function listBrowsableAssetTypes(
  repo: CatalogRepository,
  params: { tenantId: TenantId },
): Promise<AssetType[]> {
  const published = await repo.listPublishedAssetTypes(params.tenantId)
  return published.filter((assetType) => assetType.principalIds.length === 0)
}

// S-02 (D-58): an unpublished AssetType is indistinguishable from a
// missing one to a Visitor, and so is an Accessory (D-57: it has no page
// of its own).
export async function getPublishedAssetType(
  repo: CatalogRepository,
  params: { tenantId: TenantId; assetTypeId: number },
): Promise<AssetType> {
  const assetType = await repo.getAssetType(params.tenantId, params.assetTypeId)
  if (!assetType || !assetType.published || assetType.principalIds.length > 0) {
    throw new AssetTypeNotFoundError(params.assetTypeId)
  }
  return assetType
}

// S-02 (D-57): the published Accessories offered on a principal's page.
export async function listPublishedAccessoriesOf(
  repo: CatalogRepository,
  params: { tenantId: TenantId; principalId: number },
): Promise<AssetType[]> {
  const ids = await repo.listAccessoryIdsOf(params.tenantId, params.principalId)
  const accessories = await Promise.all(ids.map((id) => repo.getAssetType(params.tenantId, id)))
  return accessories.filter((a): a is AssetType => a !== null && a.published)
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
    const validated = await validateContent(trx, tenantId, content, assetTypeId)
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
