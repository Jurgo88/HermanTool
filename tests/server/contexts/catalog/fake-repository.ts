// In-memory stand-in for CatalogRepository, used by the Catalog unit
// tests so the domain logic is exercised without a database (Part 4
// §14.2). Mirrors the real Postgres repository's tenant-scoping
// behaviour: every lookup filters by tenantId, exactly like the
// `where tenant_id = ...` clause in the real queries.
import type {
  CatalogRepository,
  NewAssetType,
} from '../../../../server/contexts/catalog/repository'
import type { AssetType, ClassificationEntry } from '../../../../server/contexts/catalog/types'

interface StoredEntry extends ClassificationEntry {
  removedByOperatorId: string | null
}

export function createFakeCatalogRepository(): CatalogRepository & {
  removedEntries: () => StoredEntry[]
} {
  const assetTypes: AssetType[] = []
  const entries: StoredEntry[] = []
  let nextId = 1
  let nextEntryId = 1

  const copy = (a: AssetType): AssetType => ({
    ...a,
    useAreaIds: [...a.useAreaIds],
    principalIds: [...a.principalIds],
    specifications: a.specifications.map((s) => ({ ...s })),
  })
  const toEntry = ({
    removedByOperatorId: _removed,
    ...entry
  }: StoredEntry): ClassificationEntry => ({ ...entry })
  const active = (tenantId: string, kind: string) =>
    entries
      .filter((e) => e.tenantId === tenantId && e.kind === kind && e.removedByOperatorId === null)
      .sort((a, b) => a.position - b.position || a.id - b.id)

  const repo: CatalogRepository & { removedEntries: () => StoredEntry[] } = {
    async getAssetType(tenantId, assetTypeId) {
      const assetType = assetTypes.find((a) => a.tenantId === tenantId && a.id === assetTypeId)
      return assetType ? copy(assetType) : null
    },

    async listAssetTypes(tenantId) {
      return assetTypes.filter((a) => a.tenantId === tenantId).map(copy)
    },

    async listPublishedAssetTypes(tenantId) {
      return assetTypes.filter((a) => a.tenantId === tenantId && a.published).map(copy)
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
        powerSourceId: params.powerSourceId ?? null,
        useAreaIds: [...(params.useAreaIds ?? [])].sort((a, b) => a - b),
        specifications: params.specifications ?? [],
        includedContents: params.includedContents ?? '',
        handlingNotice: params.handlingNotice ?? '',
        imageFile: params.imageFile ?? null,
        principalIds: [...(params.principalIds ?? [])].sort((a, b) => a - b),
        createdByOperatorId: params.operatorId,
        updatedByOperatorId: params.operatorId,
        updatedAt: new Date(),
      }
      assetTypes.push(assetType)
      return copy(assetType)
    },

    async updateAssetType(tenantId, assetTypeId, params) {
      const assetType = assetTypes.find((a) => a.tenantId === tenantId && a.id === assetTypeId)
      if (!assetType) throw new Error('fake repository: asset type not found')
      if (params.name !== undefined) assetType.name = params.name
      if (params.description !== undefined) assetType.description = params.description
      if (params.dayRate !== undefined) assetType.dayRate = params.dayRate
      if (params.depositAmount !== undefined) assetType.depositAmount = params.depositAmount
      if (params.powerSourceId !== undefined) assetType.powerSourceId = params.powerSourceId
      if (params.useAreaIds !== undefined)
        assetType.useAreaIds = [...params.useAreaIds].sort((a, b) => a - b)
      if (params.specifications !== undefined) assetType.specifications = params.specifications
      if (params.includedContents !== undefined)
        assetType.includedContents = params.includedContents
      if (params.handlingNotice !== undefined) assetType.handlingNotice = params.handlingNotice
      if (params.imageFile !== undefined) assetType.imageFile = params.imageFile
      if (params.principalIds !== undefined) {
        assetType.principalIds = [...params.principalIds].sort((a, b) => a - b)
      }
      assetType.updatedByOperatorId = params.operatorId
      assetType.updatedAt = new Date()
      return copy(assetType)
    },

    async updatePublicationState(tenantId, assetTypeId, published, operatorId) {
      const assetType = assetTypes.find((a) => a.tenantId === tenantId && a.id === assetTypeId)
      if (!assetType) throw new Error('fake repository: asset type not found')
      assetType.published = published
      assetType.updatedByOperatorId = operatorId
      assetType.updatedAt = new Date()
      return copy(assetType)
    },

    async listClassification(tenantId, kind) {
      return active(tenantId, kind).map(toEntry)
    },

    async getClassificationEntry(tenantId, kind, id) {
      const entry = active(tenantId, kind).find((e) => e.id === id)
      return entry ? toEntry(entry) : null
    },

    async insertClassificationEntry(tenantId, kind, { label, position }) {
      const entry: StoredEntry = {
        id: nextEntryId++,
        tenantId,
        kind,
        label,
        position,
        removedByOperatorId: null,
      }
      entries.push(entry)
      return toEntry(entry)
    },

    async updateClassificationEntry(tenantId, kind, id, { label, position }) {
      const entry = active(tenantId, kind).find((e) => e.id === id)
      if (!entry) throw new Error('fake repository: classification entry not found')
      if (label !== undefined) entry.label = label
      if (position !== undefined) entry.position = position
      return toEntry(entry)
    },

    async markClassificationEntryRemoved(tenantId, kind, id, operatorId) {
      const entry = active(tenantId, kind).find((e) => e.id === id)
      if (entry) entry.removedByOperatorId = operatorId
    },

    async listAssetTypeNamesUsing(tenantId, kind, id) {
      return assetTypes
        .filter(
          (a) =>
            a.tenantId === tenantId &&
            (kind === 'powerSource' ? a.powerSourceId === id : a.useAreaIds.includes(id)),
        )
        .map((a) => a.name)
        .sort()
    },

    async listAccessoryIdsOf(tenantId, principalId) {
      return assetTypes
        .filter((a) => a.tenantId === tenantId && a.principalIds.includes(principalId))
        .map((a) => a.id)
        .sort((a, b) => a - b)
    },

    async getAccessoryPrincipals(tenantId, assetTypeIds) {
      const principals = new Map<number, number[]>()
      for (const a of assetTypes) {
        if (a.tenantId === tenantId && assetTypeIds.includes(a.id) && a.principalIds.length > 0) {
          principals.set(a.id, [...a.principalIds])
        }
      }
      return principals
    },

    // No rollback: the unit tests assert on thrown errors, and every
    // domain operation validates before its first write.
    async transaction(fn) {
      return fn(repo)
    },

    removedEntries() {
      return entries.filter((e) => e.removedByOperatorId !== null)
    },
  }

  return repo
}
