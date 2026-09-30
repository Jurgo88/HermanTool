// Catalog's data access, kept behind a narrow interface so the domain
// logic in ./asset-type.ts is testable without a database (Part 4 §14.2).
// Every method takes `tenantId` as its first parameter — FR-33's
// tenant-scoping invariant made structural, same pattern as Asset
// Registry's repository.
import type postgres from 'postgres'
import type { MonetaryAmount, TenantId } from '../_shared'
import type { AssetType, ClassificationEntry, ClassificationKind, Specification } from './types'

export interface AssetTypeContent {
  powerSourceId?: number | null
  useAreaIds?: number[]
  specifications?: Specification[]
  includedContents?: string
  handlingNotice?: string
  imageFile?: string | null
}

export interface NewAssetType extends AssetTypeContent {
  name: string
  description: string
  dayRate: MonetaryAmount
  depositAmount: MonetaryAmount
  operatorId: string
}

export interface AssetTypeUpdate extends AssetTypeContent {
  operatorId: string
  name?: string
  description?: string
  dayRate?: MonetaryAmount
  depositAmount?: MonetaryAmount
}

export interface CatalogRepository {
  getAssetType(tenantId: TenantId, assetTypeId: number): Promise<AssetType | null>

  listAssetTypes(tenantId: TenantId): Promise<AssetType[]>

  // FR-02: what a Visitor may browse — published AssetTypes only, never
  // the admin's full list.
  listPublishedAssetTypes(tenantId: TenantId): Promise<AssetType[]>

  insertAssetType(tenantId: TenantId, params: NewAssetType): Promise<AssetType>

  // `useAreaIds`, when given, replaces the whole set. Callers wanting the
  // row update and the link replacement to commit together run this
  // inside transaction().
  updateAssetType(
    tenantId: TenantId,
    assetTypeId: number,
    params: AssetTypeUpdate,
  ): Promise<AssetType>

  updatePublicationState(
    tenantId: TenantId,
    assetTypeId: number,
    published: boolean,
    operatorId: string,
  ): Promise<AssetType>

  // D-54 lists. Removed entries are invisible to every read below.
  listClassification(tenantId: TenantId, kind: ClassificationKind): Promise<ClassificationEntry[]>

  getClassificationEntry(
    tenantId: TenantId,
    kind: ClassificationKind,
    id: number,
  ): Promise<ClassificationEntry | null>

  insertClassificationEntry(
    tenantId: TenantId,
    kind: ClassificationKind,
    params: { label: string; position: number; operatorId: string },
  ): Promise<ClassificationEntry>

  updateClassificationEntry(
    tenantId: TenantId,
    kind: ClassificationKind,
    id: number,
    params: { label?: string; position?: number; operatorId: string },
  ): Promise<ClassificationEntry>

  markClassificationEntryRemoved(
    tenantId: TenantId,
    kind: ClassificationKind,
    id: number,
    operatorId: string,
  ): Promise<void>

  listAssetTypeNamesUsing(
    tenantId: TenantId,
    kind: ClassificationKind,
    id: number,
  ): Promise<string[]>

  transaction<T>(fn: (repo: CatalogRepository) => Promise<T>): Promise<T>
}

interface AssetTypeRow {
  id: number
  tenant_id: string
  name: string
  description: string
  day_rate_amount: number
  day_rate_currency: MonetaryAmount['currency']
  deposit_amount: number
  deposit_currency: MonetaryAmount['currency']
  published: boolean
  power_source_id: number | null
  use_area_ids: number[]
  specifications: Specification[]
  included_contents: string
  handling_notice: string
  image_file: string | null
  created_by_operator_id: string | null
  updated_by_operator_id: string | null
  updated_at: Date
}

function mapAssetType(row: AssetTypeRow): AssetType {
  return {
    id: row.id,
    tenantId: row.tenant_id as TenantId,
    name: row.name,
    description: row.description,
    dayRate: { amount: row.day_rate_amount, currency: row.day_rate_currency },
    depositAmount: { amount: row.deposit_amount, currency: row.deposit_currency },
    published: row.published,
    powerSourceId: row.power_source_id,
    useAreaIds: row.use_area_ids,
    specifications: row.specifications,
    includedContents: row.included_contents,
    handlingNotice: row.handling_notice,
    imageFile: row.image_file,
    createdByOperatorId: row.created_by_operator_id,
    updatedByOperatorId: row.updated_by_operator_id,
    updatedAt: row.updated_at,
  }
}

interface ClassificationRow {
  id: number
  tenant_id: string
  label: string
  position: number
}

function mapClassification(kind: ClassificationKind, row: ClassificationRow): ClassificationEntry {
  return {
    id: row.id,
    tenantId: row.tenant_id as TenantId,
    kind,
    label: row.label,
    position: row.position,
  }
}

const classificationTable: Record<ClassificationKind, string> = {
  powerSource: 'power_sources',
  useArea: 'use_areas',
}

export function createPostgresCatalogRepository(
  sql: postgres.Sql | postgres.TransactionSql,
): CatalogRepository {
  // Every AssetType read goes through this, so useAreaIds is always
  // populated the same way.
  function selectAssetTypes(where: postgres.PendingQuery<postgres.Row[]>) {
    return sql<AssetTypeRow[]>`
      select a.*, coalesce(
        (select array_agg(u.use_area_id order by u.use_area_id)
         from asset_type_use_areas u
         where u.tenant_id = a.tenant_id and u.asset_type_id = a.id),
        '{}'::integer[]
      ) as use_area_ids
      from asset_types a
      where ${where}
      order by a.name
    `
  }

  async function getAssetType(tenantId: TenantId, assetTypeId: number) {
    const rows = await selectAssetTypes(sql`a.tenant_id = ${tenantId} and a.id = ${assetTypeId}`)
    return rows[0] ? mapAssetType(rows[0]) : null
  }

  async function replaceUseAreas(tenantId: TenantId, assetTypeId: number, useAreaIds: number[]) {
    await sql`
      delete from asset_type_use_areas
      where tenant_id = ${tenantId} and asset_type_id = ${assetTypeId}
    `
    if (useAreaIds.length === 0) return
    await sql`
      insert into asset_type_use_areas ${sql(
        useAreaIds.map((useAreaId) => ({
          tenant_id: tenantId,
          asset_type_id: assetTypeId,
          use_area_id: useAreaId,
        })),
      )}
    `
  }

  const repo: CatalogRepository = {
    getAssetType,

    async listAssetTypes(tenantId) {
      const rows = await selectAssetTypes(sql`a.tenant_id = ${tenantId}`)
      return rows.map(mapAssetType)
    },

    async listPublishedAssetTypes(tenantId) {
      const rows = await selectAssetTypes(sql`a.tenant_id = ${tenantId} and a.published = true`)
      return rows.map(mapAssetType)
    },

    async insertAssetType(tenantId, params) {
      const { name, description, dayRate, depositAmount, operatorId } = params
      const rows = await sql<{ id: number }[]>`
        insert into asset_types (
          tenant_id, name, description,
          day_rate_amount, day_rate_currency,
          deposit_amount, deposit_currency,
          power_source_id, specifications, included_contents, handling_notice, image_file,
          created_by_operator_id, updated_by_operator_id
        ) values (
          ${tenantId}, ${name}, ${description},
          ${dayRate.amount}, ${dayRate.currency},
          ${depositAmount.amount}, ${depositAmount.currency},
          ${params.powerSourceId ?? null}, ${sql.json(toJson(params.specifications ?? []))},
          ${params.includedContents ?? ''}, ${params.handlingNotice ?? ''}, ${params.imageFile ?? null},
          ${operatorId}, ${operatorId}
        )
        returning id
      `
      const id = rows[0]!.id
      if (params.useAreaIds) await replaceUseAreas(tenantId, id, params.useAreaIds)
      return (await getAssetType(tenantId, id))!
    },

    async updateAssetType(tenantId, assetTypeId, params) {
      const { operatorId, name, description, dayRate, depositAmount } = params
      // coalesce() cannot express "set to null", so the two clearable
      // columns carry an explicit "was this field given" flag.
      const setPowerSource = params.powerSourceId !== undefined
      const setImageFile = params.imageFile !== undefined
      const specifications =
        params.specifications === undefined ? null : sql.json(toJson(params.specifications))
      await sql`
        update asset_types
        set
          name = coalesce(${name ?? null}, name),
          description = coalesce(${description ?? null}, description),
          day_rate_amount = coalesce(${dayRate?.amount ?? null}, day_rate_amount),
          day_rate_currency = coalesce(${dayRate?.currency ?? null}, day_rate_currency),
          deposit_amount = coalesce(${depositAmount?.amount ?? null}, deposit_amount),
          deposit_currency = coalesce(${depositAmount?.currency ?? null}, deposit_currency),
          power_source_id = case when ${setPowerSource} then ${params.powerSourceId ?? null}::integer else power_source_id end,
          specifications = coalesce(${specifications}::jsonb, specifications),
          included_contents = coalesce(${params.includedContents ?? null}, included_contents),
          handling_notice = coalesce(${params.handlingNotice ?? null}, handling_notice),
          image_file = case when ${setImageFile} then ${params.imageFile ?? null}::text else image_file end,
          updated_by_operator_id = ${operatorId},
          updated_at = now()
        where tenant_id = ${tenantId} and id = ${assetTypeId}
      `
      if (params.useAreaIds) await replaceUseAreas(tenantId, assetTypeId, params.useAreaIds)
      return (await getAssetType(tenantId, assetTypeId))!
    },

    async updatePublicationState(tenantId, assetTypeId, published, operatorId) {
      await sql`
        update asset_types
        set published = ${published}, updated_by_operator_id = ${operatorId}, updated_at = now()
        where tenant_id = ${tenantId} and id = ${assetTypeId}
      `
      return (await getAssetType(tenantId, assetTypeId))!
    },

    async listClassification(tenantId, kind) {
      const rows = await sql<ClassificationRow[]>`
        select id, tenant_id, label, position from ${sql(classificationTable[kind])}
        where tenant_id = ${tenantId} and removed_at is null
        order by position, id
      `
      return rows.map((row) => mapClassification(kind, row))
    },

    async getClassificationEntry(tenantId, kind, id) {
      const rows = await sql<ClassificationRow[]>`
        select id, tenant_id, label, position from ${sql(classificationTable[kind])}
        where tenant_id = ${tenantId} and id = ${id} and removed_at is null
      `
      return rows[0] ? mapClassification(kind, rows[0]) : null
    },

    async insertClassificationEntry(tenantId, kind, { label, position, operatorId }) {
      const rows = await sql<ClassificationRow[]>`
        insert into ${sql(classificationTable[kind])}
          (tenant_id, label, position, created_by_operator_id, updated_by_operator_id)
        values (${tenantId}, ${label}, ${position}, ${operatorId}, ${operatorId})
        returning id, tenant_id, label, position
      `
      return mapClassification(kind, rows[0]!)
    },

    async updateClassificationEntry(tenantId, kind, id, { label, position, operatorId }) {
      const rows = await sql<ClassificationRow[]>`
        update ${sql(classificationTable[kind])}
        set
          label = coalesce(${label ?? null}, label),
          position = coalesce(${position ?? null}, position),
          updated_by_operator_id = ${operatorId},
          updated_at = now()
        where tenant_id = ${tenantId} and id = ${id} and removed_at is null
        returning id, tenant_id, label, position
      `
      return mapClassification(kind, rows[0]!)
    },

    async markClassificationEntryRemoved(tenantId, kind, id, operatorId) {
      await sql`
        update ${sql(classificationTable[kind])}
        set removed_at = now(), removed_by_operator_id = ${operatorId}
        where tenant_id = ${tenantId} and id = ${id} and removed_at is null
      `
    },

    async listAssetTypeNamesUsing(tenantId, kind, id) {
      const rows =
        kind === 'powerSource'
          ? await sql<{ name: string }[]>`
              select name from asset_types
              where tenant_id = ${tenantId} and power_source_id = ${id}
              order by name
            `
          : await sql<{ name: string }[]>`
              select a.name from asset_types a
              join asset_type_use_areas u on u.tenant_id = a.tenant_id and u.asset_type_id = a.id
              where a.tenant_id = ${tenantId} and u.use_area_id = ${id}
              order by a.name
            `
      return rows.map((row) => row.name)
    },

    async transaction<T>(fn: (repo: CatalogRepository) => Promise<T>) {
      // Same guard as Asset Registry's repository: a TransactionSql has
      // no begin(), and nothing here nests transactions.
      if (!('begin' in sql)) {
        throw new Error(
          'Nested transactions are not supported — this repository is already bound to one.',
        )
      }
      return sql.begin((trx) => fn(createPostgresCatalogRepository(trx))) as Promise<T>
    },
  }

  return repo
}

// sql.json() wants postgres.js's own JSONValue; Specification is a plain
// {label, value} object, so this is only a type-level widening.
function toJson(specifications: Specification[]): postgres.JSONValue {
  return specifications.map(({ label, value }) => ({ label, value }))
}
