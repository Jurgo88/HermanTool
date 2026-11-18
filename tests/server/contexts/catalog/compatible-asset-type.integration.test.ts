// Integration tests for 20261119090000_catalog_compatible_asset_type
// against a real Postgres: canonical pair storage, composite tenant FKs,
// the symmetric compatibleIds round trip (D-62, FR-33).
//
// Self-skips when NUXT_DATABASE_URL is not set. Point it at a local or
// rehearsal database, never at production: it truncates tables.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import type postgres from 'postgres'
import { createDatabaseClient } from '../../../../server/utils/db'
import { createMonetaryAmount, type TenantId } from '../../../../server/contexts/_shared'
import { createPostgresCatalogRepository } from '../../../../server/contexts/catalog/repository'
import { createAssetType, updateAssetType } from '../../../../server/contexts/catalog/asset-type'

const databaseUrl = process.env.NUXT_DATABASE_URL ?? ''

const operatorId = '55555555-5555-5555-5555-555555555555'

describe.skipIf(!databaseUrl)('CompatibleAssetType migration (integration)', () => {
  let sql: postgres.Sql
  let tenantA: TenantId
  let tenantB: TenantId

  const make = (name: string, tenantId: TenantId, compatibleIds?: number[]) =>
    createAssetType(createPostgresCatalogRepository(sql), {
      tenantId,
      operatorId,
      name,
      description: '',
      dayRate: createMonetaryAmount(2000),
      depositAmount: createMonetaryAmount(10000),
      compatibleIds,
    })

  beforeEach(async () => {
    sql = createDatabaseClient(databaseUrl)
    await sql`
      truncate table asset_status_events, asset_tags, assets, asset_type_compatibilities,
        asset_type_accessories, asset_type_use_areas, asset_types restart identity cascade
    `
    const [{ id: seededTenantId }] = await sql<
      { id: string }[]
    >`select id from tenants order by created_at limit 1`
    tenantA = seededTenantId as TenantId
    const [{ id: secondTenantId }] = await sql<
      { id: string }[]
    >`insert into tenants default values returning id`
    tenantB = secondTenantId as TenantId
  })

  afterEach(async () => {
    await sql`delete from asset_type_compatibilities where tenant_id = ${tenantB}`
    await sql`delete from asset_types where tenant_id = ${tenantB}`
    await sql`delete from tenants where id = ${tenantB}`
  })

  afterAll(async () => {
    await sql?.end()
  })

  it('stores a pair once in canonical order and reads it from both sides', async () => {
    const washer = await make('Vysokotlakový čistič', tenantA)
    const surface = await make('Nadstavec na plochy', tenantA, [washer.id])
    const repo = createPostgresCatalogRepository(sql)

    await updateAssetType(repo, {
      tenantId: tenantA,
      assetTypeId: washer.id,
      operatorId,
      compatibleIds: [surface.id],
    })

    const rows = await sql`select asset_type_a_id, asset_type_b_id from asset_type_compatibilities`
    expect(rows).toEqual([{ asset_type_a_id: washer.id, asset_type_b_id: surface.id }])
    expect((await repo.getAssetType(tenantA, washer.id))?.compatibleIds).toEqual([surface.id])
    expect((await repo.getAssetType(tenantA, surface.id))?.compatibleIds).toEqual([washer.id])
  })

  it('refuses a cross-Tenant, self or reversed link at the schema level (FR-33)', async () => {
    const foreign = await make('Cudzí čistič', tenantB)
    const washer = await make('Vysokotlakový čistič', tenantA)
    const surface = await make('Nadstavec na plochy', tenantA)
    const [low, high] = [washer.id, foreign.id].sort((a, b) => a - b)

    await expect(
      sql`insert into asset_type_compatibilities (tenant_id, asset_type_a_id, asset_type_b_id, created_by_operator_id)
          values (${tenantA}, ${low!}, ${high!}, ${operatorId})`,
    ).rejects.toThrow()
    await expect(
      sql`insert into asset_type_compatibilities (tenant_id, asset_type_a_id, asset_type_b_id, created_by_operator_id)
          values (${tenantA}, ${washer.id}, ${washer.id}, ${operatorId})`,
    ).rejects.toThrow()
    await expect(
      sql`insert into asset_type_compatibilities (tenant_id, asset_type_a_id, asset_type_b_id, created_by_operator_id)
          values (${tenantA}, ${surface.id}, ${washer.id}, ${operatorId})`,
    ).rejects.toThrow()
  })

  it('has RLS enabled with no policies on the link table', async () => {
    const [row] = await sql<{ relrowsecurity: boolean }[]>`
      select relrowsecurity from pg_class where relname = 'asset_type_compatibilities'
    `
    expect(row?.relrowsecurity).toBe(true)
    const [policies] = await sql<{ count: string }[]>`
      select count(*)::text as count from pg_policies where tablename = 'asset_type_compatibilities'
    `
    expect(policies?.count).toBe('0')
  })
})
