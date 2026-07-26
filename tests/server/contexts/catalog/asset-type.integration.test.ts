// Integration tests for the Catalog migration
// (supabase/migrations/20260722090000_catalog_asset_type.sql) against a
// real Postgres — the constraints a fake repository cannot prove: the
// ALTER's new columns, the currency check constraint (D-21), and tenant
// scoping against real foreign keys.
//
// Self-skips when NUXT_DATABASE_URL is not set, matching the Asset
// Registry integration tests. Point it at the R-05 rehearsal Supabase
// project, never at production, before running this file locally.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import type postgres from 'postgres'
import { createDatabaseClient } from '../../../../server/utils/db'
import { createMonetaryAmount, type TenantId } from '../../../../server/contexts/_shared'
import { createPostgresCatalogRepository } from '../../../../server/contexts/catalog/repository'
import { createAssetType, publishAssetType } from '../../../../server/contexts/catalog/asset-type'
import { AssetTypeNotFoundError } from '../../../../server/contexts/catalog/types'

const databaseUrl = process.env.NUXT_DATABASE_URL ?? ''

// A fabricated uuid, not a real auth.users row — safe because the
// attribution columns have no FK yet (deliberately deferred, see the
// 20260725090000_catalog_operator_attribution migration).
const operatorId = '55555555-5555-5555-5555-555555555555'

describe.skipIf(!databaseUrl)('Catalog migration (integration)', () => {
  let sql: postgres.Sql
  let tenantA: TenantId
  let tenantB: TenantId

  beforeEach(async () => {
    sql = createDatabaseClient(databaseUrl)

    await sql`truncate table asset_status_events, asset_tags, assets, asset_types restart identity cascade`

    // order by created_at: with more than one Tenant row present (e.g. a
    // prior run of this suite that failed before its afterEach cleanup),
    // `limit 1` alone has no guaranteed order — the oldest row is the one
    // the very first migration seeded (D-01: exactly one Tenant).
    const [{ id: seededTenantId }] = await sql<
      { id: string }[]
    >`select id from tenants order by created_at limit 1`
    tenantA = seededTenantId as TenantId

    // A second Tenant row for the isolation assertion only — nothing in
    // Catalog's own API creates Tenants (D-01: no onboarding surface);
    // this is test setup, not a code path the app exposes. Removed in
    // afterEach below so repeated runs against a real database don't
    // accumulate orphan Tenant rows.
    const [{ id: secondTenantId }] = await sql<{
      id: string
    }[]>`insert into tenants default values returning id`
    tenantB = secondTenantId as TenantId
  })

  afterEach(async () => {
    await sql`delete from tenants where id = ${tenantB}`
  })

  afterAll(async () => {
    await sql?.end()
  })

  it('persists name, description, rate, deposit and publication state through the ALTER (FR-01)', async () => {
    const repo = createPostgresCatalogRepository(sql)

    const assetType = await createAssetType(repo, {
      tenantId: tenantA,
      operatorId,
      name: 'Rotary hammer, 5kg',
      description: 'Bosch GBH 5-40, SDS-max',
      dayRate: createMonetaryAmount(1500),
      depositAmount: createMonetaryAmount(5000),
    })

    expect(assetType).toMatchObject({
      name: 'Rotary hammer, 5kg',
      description: 'Bosch GBH 5-40, SDS-max',
      dayRate: { amount: 1500, currency: 'EUR' },
      depositAmount: { amount: 5000, currency: 'EUR' },
      published: false,
      createdByOperatorId: operatorId,
      updatedByOperatorId: operatorId,
    })

    const published = await publishAssetType(repo, { tenantId: tenantA, assetTypeId: assetType.id, operatorId })
    expect(published.published).toBe(true)
  })

  it('enforces tenant scoping: an AssetType in Tenant A is invisible to Tenant B (FR-33)', async () => {
    const repo = createPostgresCatalogRepository(sql)

    const assetType = await createAssetType(repo, {
      tenantId: tenantA,
      operatorId,
      name: 'Rotary hammer, 5kg',
      description: '',
      dayRate: createMonetaryAmount(1500),
      depositAmount: createMonetaryAmount(5000),
    })

    await expect(
      publishAssetType(repo, { tenantId: tenantB, assetTypeId: assetType.id, operatorId }),
    ).rejects.toThrow(AssetTypeNotFoundError)
  })

  it('enforces the currency check constraint (D-21)', async () => {
    await expect(
      sql`
        insert into asset_types (tenant_id, name, day_rate_currency)
        values (${tenantA}, 'Bad currency', 'CZK')
      `,
    ).rejects.toThrow()
  })

  it('has RLS enabled with no policies, so anon/authenticated have no access', async () => {
    const rows = await sql<{ relrowsecurity: boolean }[]>`
      select relrowsecurity from pg_class where relname = 'asset_types'
    `
    expect(rows).toHaveLength(1)
    expect(rows[0]?.relrowsecurity).toBe(true)

    const policyCount = await sql<{ count: string }[]>`
      select count(*)::text as count from pg_policies where tablename = 'asset_types'
    `
    expect(policyCount[0]?.count).toBe('0')
  })
})
