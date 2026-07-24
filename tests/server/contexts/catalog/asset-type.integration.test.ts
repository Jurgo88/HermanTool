// Integration tests for the Catalog migration
// (supabase/migrations/20260722090000_catalog_asset_type.sql) against a
// real Postgres — the constraints a fake repository cannot prove: the
// ALTER's new columns, the currency check constraint (D-21), and tenant
// scoping against real foreign keys.
//
// Self-skips when NUXT_DATABASE_URL is not set, matching the Asset
// Registry integration tests. Point it at the R-05 rehearsal Supabase
// project, never at production, before running this file locally.
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type postgres from 'postgres'
import { createDatabaseClient } from '../../../../server/utils/db'
import { createMonetaryAmount, type TenantId } from '../../../../server/contexts/_shared'
import { createPostgresCatalogRepository } from '../../../../server/contexts/catalog/repository'
import { createAssetType, publishAssetType } from '../../../../server/contexts/catalog/asset-type'
import { AssetTypeNotFoundError } from '../../../../server/contexts/catalog/types'

const databaseUrl = process.env.NUXT_DATABASE_URL ?? ''

describe.skipIf(!databaseUrl)('Catalog migration (integration)', () => {
  let sql: postgres.Sql
  let tenantA: TenantId
  let tenantB: TenantId

  beforeEach(async () => {
    sql = createDatabaseClient(databaseUrl)

    await sql`truncate table asset_status_events, asset_tags, assets, asset_types restart identity cascade`

    const [{ id: seededTenantId }] = await sql<{ id: string }[]>`select id from tenants limit 1`
    tenantA = seededTenantId as TenantId

    // A second Tenant row for the isolation assertion only — nothing in
    // Catalog's own API creates Tenants (D-01: no onboarding surface);
    // this is test setup, not a code path the app exposes.
    const [{ id: secondTenantId }] = await sql<{
      id: string
    }[]>`insert into tenants default values returning id`
    tenantB = secondTenantId as TenantId
  })

  afterAll(async () => {
    await sql?.end()
  })

  it('persists name, description, rate, deposit and publication state through the ALTER (FR-01)', async () => {
    const repo = createPostgresCatalogRepository(sql)

    const assetType = await createAssetType(repo, {
      tenantId: tenantA,
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
    })

    const published = await publishAssetType(repo, { tenantId: tenantA, assetTypeId: assetType.id })
    expect(published.published).toBe(true)
  })

  it('enforces tenant scoping: an AssetType in Tenant A is invisible to Tenant B (FR-33)', async () => {
    const repo = createPostgresCatalogRepository(sql)

    const assetType = await createAssetType(repo, {
      tenantId: tenantA,
      name: 'Rotary hammer, 5kg',
      description: '',
      dayRate: createMonetaryAmount(1500),
      depositAmount: createMonetaryAmount(5000),
    })

    await expect(
      publishAssetType(repo, { tenantId: tenantB, assetTypeId: assetType.id }),
    ).rejects.toThrow(AssetTypeNotFoundError)
  })

  it('enforces the currency check constraint (D-21)', async () => {
    const [{ id: tenantId }] = await sql<{ id: string }[]>`select id from tenants limit 1`

    await expect(
      sql`
        insert into asset_types (tenant_id, name, day_rate_currency)
        values (${tenantId}, 'Bad currency', 'CZK')
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
