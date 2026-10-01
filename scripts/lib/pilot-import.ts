// The pilot catalog bootstrap (D-60, FR-25; issue #154). planPilotImport
// is pure — it decides what is missing — and applyPilotImport carries the
// plan out through the Catalog and Asset Registry domain operations, so
// every rule those enforce (tenant scope, attribution, Accessory depth,
// image manifest) applies to the import exactly as to the admin surface.
//
// Idempotent by name within the Tenant: an AssetType, PowerSource or
// UseArea whose name already exists is skipped, never updated, and gets
// no new Assets. After the first run the admin surface owns the catalog.
import type { TenantId } from '../../server/contexts/_shared'
import { createMonetaryAmount } from '../../server/contexts/_shared'
import {
  createAssetType,
  createClassificationEntry,
  listAssetTypes,
  listClassification,
  publishAssetType,
  type CatalogRepository,
  type ClassificationKind,
} from '../../server/contexts/catalog'
import {
  bulkRegisterAssets,
  type AssetRegistryRepository,
} from '../../server/contexts/asset-registry'
import type { PilotCatalogRow } from './pilot-catalog-csv'

// The order the Rent Star mockups list the filters in (D-54).
const POWER_SOURCE_ORDER = ['Aku', 'Elektrina', 'Benzín']
const USE_AREA_ORDER = [
  'Čerpadlá',
  'Záhrada',
  'Stavba',
  'Čistenie',
  'Práca s drevom',
  'Búracie práce',
  'Zábava',
]

export interface ExistingCatalog {
  assetTypeNames: ReadonlySet<string>
  powerSources: ReadonlySet<string>
  useAreas: ReadonlySet<string>
}

export interface PilotImportPlan {
  powerSources: string[]
  useAreas: string[]
  // Principals before Accessories, so every principal id exists when an
  // Accessory links to it.
  assetTypes: PilotCatalogRow[]
  skipped: string[]
}

function ordered(wanted: Iterable<string>, preferred: string[]): string[] {
  const set = new Set(wanted)
  return [
    ...preferred.filter((label) => set.has(label)),
    ...[...set].filter((label) => !preferred.includes(label)),
  ]
}

export function planPilotImport(
  rows: PilotCatalogRow[],
  existing: ExistingCatalog,
): PilotImportPlan {
  const powerSources = ordered(
    rows.flatMap((row) => (row.powerSource ? [row.powerSource] : [])),
    POWER_SOURCE_ORDER,
  ).filter((label) => !existing.powerSources.has(label))
  const useAreas = ordered(
    rows.flatMap((row) => row.useAreas),
    USE_AREA_ORDER,
  ).filter((label) => !existing.useAreas.has(label))

  const fresh = rows.filter((row) => !existing.assetTypeNames.has(row.name))
  return {
    powerSources,
    useAreas,
    assetTypes: [
      ...fresh.filter((row) => !row.principalKey),
      ...fresh.filter((row) => row.principalKey),
    ],
    skipped: rows.filter((row) => existing.assetTypeNames.has(row.name)).map((row) => row.name),
  }
}

export async function readExistingCatalog(
  catalog: CatalogRepository,
  tenantId: TenantId,
): Promise<ExistingCatalog> {
  const [assetTypes, powerSources, useAreas] = await Promise.all([
    listAssetTypes(catalog, { tenantId }),
    listClassification(catalog, { tenantId, kind: 'powerSource' }),
    listClassification(catalog, { tenantId, kind: 'useArea' }),
  ])
  return {
    assetTypeNames: new Set(assetTypes.map((a) => a.name)),
    powerSources: new Set(powerSources.map((e) => e.label)),
    useAreas: new Set(useAreas.map((e) => e.label)),
  }
}

export interface PilotImportResult {
  createdAssetTypes: number
  registeredAssets: number
}

export async function applyPilotImport(
  deps: { catalog: CatalogRepository; assetRegistry: AssetRegistryRepository },
  params: {
    tenantId: TenantId
    operatorId: string
    rows: PilotCatalogRow[]
    plan: PilotImportPlan
    shippedImages: readonly string[]
    publish: boolean
  },
): Promise<PilotImportResult> {
  const { catalog, assetRegistry } = deps
  const { tenantId, operatorId, rows, plan, shippedImages, publish } = params

  for (const [kind, labels] of [
    ['powerSource', plan.powerSources],
    ['useArea', plan.useAreas],
  ] as [ClassificationKind, string[]][]) {
    for (const label of labels)
      await createClassificationEntry(catalog, { tenantId, kind, label, operatorId })
  }
  const idOf = async (kind: ClassificationKind) =>
    new Map((await listClassification(catalog, { tenantId, kind })).map((e) => [e.label, e.id]))
  const powerSourceIds = await idOf('powerSource')
  const useAreaIds = await idOf('useArea')

  // Name → id for every AssetType, existing or created, so an Accessory
  // can link to a principal that a previous run already imported.
  const assetTypeIdByKey = new Map<string, number>()
  const existingByName = new Map(
    (await listAssetTypes(catalog, { tenantId })).map((a) => [a.name, a.id]),
  )
  for (const row of rows) {
    const id = existingByName.get(row.name)
    if (id !== undefined) assetTypeIdByKey.set(row.key, id)
  }

  let registeredAssets = 0
  for (const row of plan.assetTypes) {
    const imageFile = `${row.key}.webp`
    const principalId = row.principalKey ? assetTypeIdByKey.get(row.principalKey) : undefined
    if (row.principalKey && principalId === undefined) {
      throw new Error(`${row.key}: principal "${row.principalKey}" was not imported.`)
    }

    const assetType = await createAssetType(catalog, {
      tenantId,
      operatorId,
      name: row.name,
      description: row.description,
      dayRate: createMonetaryAmount(Math.round(row.dayRateEuros * 100)),
      depositAmount: createMonetaryAmount(Math.round(row.depositEuros * 100)),
      powerSourceId: row.powerSource ? powerSourceIds.get(row.powerSource)! : null,
      useAreaIds: row.useAreas.map((label) => useAreaIds.get(label)!),
      specifications: row.specifications,
      includedContents: row.includedContents,
      handlingNotice: row.handlingNotice,
      imageFile: shippedImages.includes(imageFile) ? imageFile : null,
      principalIds: principalId === undefined ? [] : [principalId],
    })
    assetTypeIdByKey.set(row.key, assetType.id)
    if (publish)
      await publishAssetType(catalog, { tenantId, assetTypeId: assetType.id, operatorId })

    // W9: registered with fresh AssetTags, pending activation until the
    // tag is on the tool and the Operator marks it Rentable.
    const units = await bulkRegisterAssets(assetRegistry, {
      tenantId,
      operatorId,
      lines: [{ assetTypeId: assetType.id, quantity: row.quantity }],
    })
    registeredAssets += units.length
  }

  return { createdAssetTypes: plan.assetTypes.length, registeredAssets }
}
