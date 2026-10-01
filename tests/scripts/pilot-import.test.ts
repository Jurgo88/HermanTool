import { beforeEach, describe, expect, it } from 'vitest'
import type { TenantId } from '../../server/contexts/_shared'
import { listAssetTypes, listClassification } from '../../server/contexts/catalog'
import type { PilotCatalogRow } from '../../scripts/lib/pilot-catalog-csv'
import { readPilotCatalog } from '../../scripts/lib/pilot-catalog-csv'
import {
  applyPilotImport,
  planPilotImport,
  readExistingCatalog,
} from '../../scripts/lib/pilot-import'
import { createFakeCatalogRepository } from '../server/contexts/catalog/fake-repository'
import {
  createFakeAssetRegistryRepository,
  type FakeAssetRegistryRepository,
} from '../server/contexts/asset-registry/fake-repository'

const tenantId = '11111111-1111-1111-1111-111111111111' as TenantId
const operatorId = '33333333-3333-3333-3333-333333333333'

function row(overrides: Partial<PilotCatalogRow>): PilotCatalogRow {
  return {
    key: 'x',
    name: 'X',
    powerSource: null,
    useAreas: [],
    principalKey: null,
    dayRateEuros: 15,
    depositEuros: 75,
    quantity: 1,
    sourceImage: null,
    description: '',
    includedContents: '',
    handlingNotice: '',
    specifications: [],
    ...overrides,
  }
}

const hammer = row({
  key: 'hammer',
  name: 'Bosch GBH',
  powerSource: 'Elektrina',
  useAreas: ['Stavba'],
  quantity: 2,
})
const bits = row({
  key: 'bits',
  name: 'Sada vrtákov',
  useAreas: ['Stavba'],
  principalKey: 'hammer',
  dayRateEuros: 5,
  depositEuros: 25,
})
const mower = row({ key: 'mower', name: 'STIGA', powerSource: 'Benzín', useAreas: ['Záhrada'] })

const nothing = {
  assetTypeNames: new Set<string>(),
  powerSources: new Set<string>(),
  useAreas: new Set<string>(),
}

describe('planPilotImport (D-60)', () => {
  it('orders filters as the mockups do and puts principals before Accessories', () => {
    const plan = planPilotImport([bits, mower, hammer], nothing)

    expect(plan.powerSources).toEqual(['Elektrina', 'Benzín'])
    expect(plan.useAreas).toEqual(['Záhrada', 'Stavba'])
    expect(plan.assetTypes.map((r) => r.key)).toEqual(['mower', 'hammer', 'bits'])
  })

  it('skips what already exists, by name', () => {
    const plan = planPilotImport([hammer, bits, mower], {
      assetTypeNames: new Set(['Bosch GBH']),
      powerSources: new Set(['Elektrina']),
      useAreas: new Set(['Stavba']),
    })

    expect(plan.assetTypes.map((r) => r.key)).toEqual(['mower', 'bits'])
    expect(plan.skipped).toEqual(['Bosch GBH'])
    expect(plan.powerSources).toEqual(['Benzín'])
    expect(plan.useAreas).toEqual(['Záhrada'])
  })

  it('plans the whole reviewed pilot catalog', () => {
    const plan = planPilotImport(readPilotCatalog('docs/catalog-source/pilot-catalog.csv'), nothing)
    expect(plan.assetTypes).toHaveLength(48)
    expect(plan.powerSources).toEqual(['Aku', 'Elektrina', 'Benzín'])
    expect(plan.useAreas).toEqual([
      'Čerpadlá',
      'Záhrada',
      'Stavba',
      'Čistenie',
      'Práca s drevom',
      'Búracie práce',
      'Zábava',
    ])
  })
})

describe('applyPilotImport (D-60, FR-25, FR-34)', () => {
  let catalog: ReturnType<typeof createFakeCatalogRepository>
  let assetRegistry: FakeAssetRegistryRepository

  beforeEach(() => {
    catalog = createFakeCatalogRepository()
    assetRegistry = createFakeAssetRegistryRepository()
    // The Catalog fake numbers AssetTypes from 1; Asset Registry checks
    // the AssetType exists before registering units against it.
    for (let id = 1; id <= 10; id++) assetRegistry.seedAssetType(tenantId, id)
  })

  const run = async (rows: PilotCatalogRow[]) => {
    const plan = planPilotImport(rows, await readExistingCatalog(catalog, tenantId))
    return applyPilotImport(
      { catalog, assetRegistry },
      { tenantId, operatorId, rows, plan, shippedImages: ['hammer.webp'], publish: true },
    )
  }

  it('creates classification, priced AssetTypes, images, the Accessory link and tagged Assets, attributed', async () => {
    const result = await run([hammer, bits, mower])

    expect(result).toEqual({ createdAssetTypes: 3, registeredAssets: 4 })
    expect(assetRegistry.allTags()).toHaveLength(4)

    const byName = new Map((await listAssetTypes(catalog, { tenantId })).map((a) => [a.name, a]))
    expect(byName.get('Bosch GBH')).toMatchObject({
      dayRate: { amount: 1500, currency: 'EUR' },
      depositAmount: { amount: 7500, currency: 'EUR' },
      imageFile: 'hammer.webp',
      published: true,
      createdByOperatorId: operatorId,
    })
    expect(byName.get('STIGA')?.imageFile).toBeNull()
    expect(byName.get('Sada vrtákov')?.principalIds).toEqual([byName.get('Bosch GBH')!.id])
    expect(
      (await listClassification(catalog, { tenantId, kind: 'useArea' })).map((e) => e.label),
    ).toEqual(['Záhrada', 'Stavba'])
  })

  it('is a no-op the second time', async () => {
    await run([hammer, bits, mower])
    const again = await run([hammer, bits, mower])

    expect(again).toEqual({ createdAssetTypes: 0, registeredAssets: 0 })
    expect(await listAssetTypes(catalog, { tenantId })).toHaveLength(3)
    expect(assetRegistry.allTags()).toHaveLength(4)
  })

  it('links a new Accessory to a principal imported by an earlier run', async () => {
    await run([hammer])
    await run([hammer, bits])

    const byName = new Map((await listAssetTypes(catalog, { tenantId })).map((a) => [a.name, a]))
    expect(byName.get('Sada vrtákov')?.principalIds).toEqual([byName.get('Bosch GBH')!.id])
  })
})
