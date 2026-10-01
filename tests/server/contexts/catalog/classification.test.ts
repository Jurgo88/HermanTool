import { beforeEach, describe, expect, it } from 'vitest'
import { createMonetaryAmount, type TenantId } from '../../../../server/contexts/_shared'
import {
  createClassificationEntry,
  listClassification,
  removeClassificationEntry,
  renameClassificationEntry,
  reorderClassification,
} from '../../../../server/contexts/catalog/classification'
import { createAssetType } from '../../../../server/contexts/catalog/asset-type'
import {
  ClassificationInUseError,
  ClassificationLabelRequiredError,
  ClassificationLabelTakenError,
  ClassificationSequenceMismatchError,
  PowerSourceNotFoundError,
  UseAreaNotFoundError,
} from '../../../../server/contexts/catalog/types'
import { createFakeCatalogRepository } from './fake-repository'

const tenantA = '11111111-1111-1111-1111-111111111111' as TenantId
const tenantB = '22222222-2222-2222-2222-222222222222' as TenantId
const operatorId = '33333333-3333-3333-3333-333333333333'

let repo: ReturnType<typeof createFakeCatalogRepository>

beforeEach(() => {
  repo = createFakeCatalogRepository()
})

function add(kind: 'powerSource' | 'useArea', label: string, tenantId = tenantA) {
  return createClassificationEntry(repo, { tenantId, kind, label, operatorId })
}

describe('createClassificationEntry (D-54)', () => {
  it('appends in order with a trimmed label', async () => {
    await add('useArea', ' Záhrada ')
    await add('useArea', 'Stavba')

    const list = await listClassification(repo, { tenantId: tenantA, kind: 'useArea' })
    expect(list.map((e) => [e.label, e.position])).toEqual([
      ['Záhrada', 1],
      ['Stavba', 2],
    ])
  })

  it('refuses an empty label', async () => {
    await expect(add('powerSource', '   ')).rejects.toThrow(ClassificationLabelRequiredError)
  })

  it('refuses a label already used in the same list', async () => {
    await add('powerSource', 'Aku')
    await expect(add('powerSource', 'Aku ')).rejects.toThrow(ClassificationLabelTakenError)
  })

  it('allows the same label in the other list and in another Tenant', async () => {
    await add('powerSource', 'Elektrina')
    await expect(add('useArea', 'Elektrina')).resolves.toMatchObject({ label: 'Elektrina' })
    await expect(add('powerSource', 'Elektrina', tenantB)).resolves.toMatchObject({
      label: 'Elektrina',
    })
  })
})

describe('Tenant scoping (FR-33)', () => {
  it("never lists, renames or removes another Tenant's entries", async () => {
    const entry = await add('powerSource', 'Aku', tenantB)

    expect(await listClassification(repo, { tenantId: tenantA, kind: 'powerSource' })).toEqual([])
    await expect(
      renameClassificationEntry(repo, {
        tenantId: tenantA,
        kind: 'powerSource',
        id: entry.id,
        label: 'X',
        operatorId,
      }),
    ).rejects.toThrow(PowerSourceNotFoundError)
    await expect(
      removeClassificationEntry(repo, {
        tenantId: tenantA,
        kind: 'powerSource',
        id: entry.id,
        operatorId,
      }),
    ).rejects.toThrow(PowerSourceNotFoundError)
  })
})

describe('renameClassificationEntry', () => {
  it('renames, allowing the entry to keep its own label', async () => {
    const entry = await add('useArea', 'Stavba')
    await expect(
      renameClassificationEntry(repo, {
        tenantId: tenantA,
        kind: 'useArea',
        id: entry.id,
        label: 'Stavba',
        operatorId,
      }),
    ).resolves.toMatchObject({ label: 'Stavba' })
  })

  it("refuses another entry's label", async () => {
    await add('useArea', 'Stavba')
    const other = await add('useArea', 'Záhrada')
    await expect(
      renameClassificationEntry(repo, {
        tenantId: tenantA,
        kind: 'useArea',
        id: other.id,
        label: 'Stavba',
        operatorId,
      }),
    ).rejects.toThrow(ClassificationLabelTakenError)
  })
})

describe('reorderClassification', () => {
  it('rewrites positions in the given order', async () => {
    const a = await add('useArea', 'A')
    const b = await add('useArea', 'B')
    const c = await add('useArea', 'C')

    const list = await reorderClassification(repo, {
      tenantId: tenantA,
      kind: 'useArea',
      sequence: [c.id, a.id, b.id],
      operatorId,
    })
    expect(list.map((e) => e.label)).toEqual(['C', 'A', 'B'])
  })

  it('refuses a partial, duplicated or foreign order', async () => {
    const a = await add('useArea', 'A')
    const b = await add('useArea', 'B')
    const foreign = await add('useArea', 'F', tenantB)
    const reorder = (sequence: number[]) =>
      reorderClassification(repo, { tenantId: tenantA, kind: 'useArea', sequence, operatorId })

    await expect(reorder([a.id])).rejects.toThrow(ClassificationSequenceMismatchError)
    await expect(reorder([a.id, a.id])).rejects.toThrow(ClassificationSequenceMismatchError)
    await expect(reorder([a.id, foreign.id])).rejects.toThrow(ClassificationSequenceMismatchError)
    await expect(reorder([b.id, a.id])).resolves.toHaveLength(2)
  })
})

describe('removeClassificationEntry (D-54, FR-34)', () => {
  const base = {
    tenantId: tenantA,
    operatorId,
    description: '',
    dayRate: createMonetaryAmount(1500),
    depositAmount: createMonetaryAmount(7500),
  }

  it('refuses while an AssetType uses it, naming the AssetTypes', async () => {
    const aku = await add('powerSource', 'Aku')
    const garden = await add('useArea', 'Záhrada')
    await createAssetType(repo, {
      ...base,
      name: 'Nožnice na konáre',
      powerSourceId: aku.id,
      useAreaIds: [garden.id],
    })

    const removePower = removeClassificationEntry(repo, {
      tenantId: tenantA,
      kind: 'powerSource',
      id: aku.id,
      operatorId,
    })
    await expect(removePower).rejects.toThrow(ClassificationInUseError)
    await expect(removePower).rejects.toMatchObject({ assetTypeNames: ['Nožnice na konáre'] })

    await expect(
      removeClassificationEntry(repo, {
        tenantId: tenantA,
        kind: 'useArea',
        id: garden.id,
        operatorId,
      }),
    ).rejects.toThrow(ClassificationInUseError)
  })

  it('removes an unused entry with attribution, and frees its label', async () => {
    const entry = await add('useArea', 'Zábava')

    await removeClassificationEntry(repo, {
      tenantId: tenantA,
      kind: 'useArea',
      id: entry.id,
      operatorId,
    })

    expect(await listClassification(repo, { tenantId: tenantA, kind: 'useArea' })).toEqual([])
    expect(repo.removedEntries()).toMatchObject([{ id: entry.id, removedByOperatorId: operatorId }])
    await expect(add('useArea', 'Zábava')).resolves.toMatchObject({ label: 'Zábava' })
    await expect(
      removeClassificationEntry(repo, {
        tenantId: tenantA,
        kind: 'useArea',
        id: entry.id,
        operatorId,
      }),
    ).rejects.toThrow(UseAreaNotFoundError)
  })
})
