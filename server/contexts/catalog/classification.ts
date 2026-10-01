// PowerSource and UseArea list maintenance (D-54; FR-33, FR-34, FR-37).
// Labels are single-valued Slovak Catalog content (D-20). Classification
// is presentation data for filtering — no domain rule reads it.
import type { TenantId } from '../_shared'
import type { CatalogRepository } from './repository'
import {
  ClassificationInUseError,
  ClassificationLabelRequiredError,
  ClassificationLabelTakenError,
  ClassificationSequenceMismatchError,
  PowerSourceNotFoundError,
  UseAreaNotFoundError,
  type ClassificationEntry,
  type ClassificationKind,
} from './types'

interface KindScope {
  tenantId: TenantId
  kind: ClassificationKind
}

export function classificationNotFound(kind: ClassificationKind, id: number): Error {
  return kind === 'powerSource' ? new PowerSourceNotFoundError(id) : new UseAreaNotFoundError(id)
}

async function requireEntry(repo: CatalogRepository, { tenantId, kind }: KindScope, id: number) {
  const entry = await repo.getClassificationEntry(tenantId, kind, id)
  if (!entry) throw classificationNotFound(kind, id)
  return entry
}

async function normaliseLabel(
  repo: CatalogRepository,
  scope: KindScope,
  label: string,
  exceptId?: number,
) {
  const trimmed = label.trim()
  if (trimmed.length === 0) throw new ClassificationLabelRequiredError()
  const existing = await repo.listClassification(scope.tenantId, scope.kind)
  if (existing.some((entry) => entry.id !== exceptId && entry.label === trimmed)) {
    throw new ClassificationLabelTakenError(trimmed)
  }
  return trimmed
}

export async function listClassification(
  repo: CatalogRepository,
  params: KindScope,
): Promise<ClassificationEntry[]> {
  return repo.listClassification(params.tenantId, params.kind)
}

export async function createClassificationEntry(
  repo: CatalogRepository,
  params: KindScope & { label: string; operatorId: string },
): Promise<ClassificationEntry> {
  const { tenantId, kind, operatorId } = params
  const label = await normaliseLabel(repo, params, params.label)
  const existing = await repo.listClassification(tenantId, kind)
  const position = existing.reduce((max, entry) => Math.max(max, entry.position), 0) + 1
  return repo.insertClassificationEntry(tenantId, kind, { label, position, operatorId })
}

export async function renameClassificationEntry(
  repo: CatalogRepository,
  params: KindScope & { id: number; label: string; operatorId: string },
): Promise<ClassificationEntry> {
  const { tenantId, kind, id, operatorId } = params
  await requireEntry(repo, params, id)
  const label = await normaliseLabel(repo, params, params.label, id)
  return repo.updateClassificationEntry(tenantId, kind, id, { label, operatorId })
}

export async function reorderClassification(
  repo: CatalogRepository,
  params: KindScope & { sequence: number[]; operatorId: string },
): Promise<ClassificationEntry[]> {
  const { tenantId, kind, sequence, operatorId } = params

  return repo.transaction(async (trx) => {
    const existing = await trx.listClassification(tenantId, kind)
    const existingIds = new Set(existing.map((entry) => entry.id))
    const sameSet =
      sequence.length === existing.length &&
      new Set(sequence).size === sequence.length &&
      sequence.every((id) => existingIds.has(id))
    if (!sameSet) throw new ClassificationSequenceMismatchError()

    for (const [index, id] of sequence.entries()) {
      await trx.updateClassificationEntry(tenantId, kind, id, { position: index + 1, operatorId })
    }
    return trx.listClassification(tenantId, kind)
  })
}

export async function removeClassificationEntry(
  repo: CatalogRepository,
  params: KindScope & { id: number; operatorId: string },
): Promise<void> {
  const { tenantId, kind, id, operatorId } = params
  await requireEntry(repo, params, id)
  const usedBy = await repo.listAssetTypeNamesUsing(tenantId, kind, id)
  if (usedBy.length > 0) throw new ClassificationInUseError(usedBy)
  await repo.markClassificationEntryRemoved(tenantId, kind, id, operatorId)
}
