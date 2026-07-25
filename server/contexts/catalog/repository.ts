// Catalog's data access, kept behind a narrow interface so the domain
// logic in ./asset-type.ts is testable without a database (Part 4 §14.2).
// Every method takes `tenantId` as its first parameter — FR-33's
// tenant-scoping invariant made structural, same pattern as Asset
// Registry's repository.
import type postgres from 'postgres'
import type { MonetaryAmount, TenantId } from '../_shared'
import type { AssetType } from './types'

export interface NewAssetType {
  name: string
  description: string
  dayRate: MonetaryAmount
  depositAmount: MonetaryAmount
  operatorId: string
}

export interface AssetTypeUpdate {
  operatorId: string
  name?: string
  description?: string
  dayRate?: MonetaryAmount
  depositAmount?: MonetaryAmount
}

export interface CatalogRepository {
  getAssetType(tenantId: TenantId, assetTypeId: number): Promise<AssetType | null>

  listAssetTypes(tenantId: TenantId): Promise<AssetType[]>

  insertAssetType(tenantId: TenantId, params: NewAssetType): Promise<AssetType>

  updateAssetType(tenantId: TenantId, assetTypeId: number, params: AssetTypeUpdate): Promise<AssetType>

  updatePublicationState(
    tenantId: TenantId,
    assetTypeId: number,
    published: boolean,
    operatorId: string,
  ): Promise<AssetType>
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
    createdByOperatorId: row.created_by_operator_id,
    updatedByOperatorId: row.updated_by_operator_id,
    updatedAt: row.updated_at,
  }
}

export function createPostgresCatalogRepository(sql: postgres.Sql | postgres.TransactionSql): CatalogRepository {
  return {
    async getAssetType(tenantId, assetTypeId) {
      const rows = await sql<
        AssetTypeRow[]
      >`select * from asset_types where tenant_id = ${tenantId} and id = ${assetTypeId}`
      return rows[0] ? mapAssetType(rows[0]) : null
    },

    async listAssetTypes(tenantId) {
      const rows = await sql<
        AssetTypeRow[]
      >`select * from asset_types where tenant_id = ${tenantId} order by name`
      return rows.map(mapAssetType)
    },

    async insertAssetType(tenantId, { name, description, dayRate, depositAmount, operatorId }) {
      const rows = await sql<AssetTypeRow[]>`
        insert into asset_types (
          tenant_id, name, description,
          day_rate_amount, day_rate_currency,
          deposit_amount, deposit_currency,
          created_by_operator_id, updated_by_operator_id
        ) values (
          ${tenantId}, ${name}, ${description},
          ${dayRate.amount}, ${dayRate.currency},
          ${depositAmount.amount}, ${depositAmount.currency},
          ${operatorId}, ${operatorId}
        )
        returning *
      `
      return mapAssetType(rows[0]!)
    },

    async updateAssetType(tenantId, assetTypeId, { operatorId, name, description, dayRate, depositAmount }) {
      const rows = await sql<AssetTypeRow[]>`
        update asset_types
        set
          name = coalesce(${name ?? null}, name),
          description = coalesce(${description ?? null}, description),
          day_rate_amount = coalesce(${dayRate?.amount ?? null}, day_rate_amount),
          day_rate_currency = coalesce(${dayRate?.currency ?? null}, day_rate_currency),
          deposit_amount = coalesce(${depositAmount?.amount ?? null}, deposit_amount),
          deposit_currency = coalesce(${depositAmount?.currency ?? null}, deposit_currency),
          updated_by_operator_id = ${operatorId},
          updated_at = now()
        where tenant_id = ${tenantId} and id = ${assetTypeId}
        returning *
      `
      return mapAssetType(rows[0]!)
    },

    async updatePublicationState(tenantId, assetTypeId, published, operatorId) {
      const rows = await sql<AssetTypeRow[]>`
        update asset_types
        set published = ${published}, updated_by_operator_id = ${operatorId}, updated_at = now()
        where tenant_id = ${tenantId} and id = ${assetTypeId}
        returning *
      `
      return mapAssetType(rows[0]!)
    },
  }
}
