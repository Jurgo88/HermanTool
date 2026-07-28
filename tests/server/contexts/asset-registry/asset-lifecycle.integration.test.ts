// Integration tests for the Asset Registry migration
// (supabase/migrations/20260721120000_asset_registry_foundation.sql)
// against a real Postgres — the constraints that a fake repository
// cannot prove: the partial unique indexes backing FR-26's rebind
// behaviour, and the actual foreign keys and RLS posture.
//
// Self-skips when NUXT_DATABASE_URL is not set (no live database is
// reachable in CI today, matching the existing db-health tests). Point
// it at the R-05 rehearsal Supabase project, never at production, before
// running this file locally.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import type postgres from 'postgres'
import { createDatabaseClient } from '../../../../server/utils/db'
import type { TenantId } from '../../../../server/contexts/_shared'
import { createPostgresAssetRegistryRepository } from '../../../../server/contexts/asset-registry/repository'
import {
  bindAssetTag,
  markAssetRentable,
  registerAsset,
} from '../../../../server/contexts/asset-registry/asset-lifecycle'
import { AssetNotFoundError, TagAlreadyBoundError } from '../../../../server/contexts/asset-registry/types'

const databaseUrl = process.env.NUXT_DATABASE_URL ?? ''

describe.skipIf(!databaseUrl)('Asset Registry migration (integration)', () => {
  let sql: postgres.Sql
  let tenantA: TenantId
  let tenantB: TenantId
  let assetTypeInA: number
  // The attribution FK to auth.users (20260728100000, backfilling D-22's
  // TODO now that the two real Operator seats exist) means a fabricated
  // crypto.randomUUID() no longer satisfies referential integrity — this
  // must be one of the two real seeded operator ids.
  let operatorId: string

  beforeEach(async () => {
    sql = createDatabaseClient(databaseUrl)

    await sql`truncate table asset_status_events, asset_tags, assets, asset_types restart identity cascade`

    const [{ id: seededOperatorId }] = await sql<
      { id: string }[]
    >`select id from operators order by created_at limit 1`
    operatorId = seededOperatorId

    // order by created_at: with more than one Tenant row present (e.g. a
    // prior run of this suite that failed before its afterEach cleanup),
    // `limit 1` alone has no guaranteed order — the oldest row is the one
    // the very first migration seeded (D-01: exactly one Tenant).
    const [{ id: seededTenantId }] = await sql<
      { id: string }[]
    >`select id from tenants order by created_at limit 1`
    tenantA = seededTenantId as TenantId

    // A second Tenant row for the isolation assertion only — nothing in
    // Asset Registry's own API creates Tenants (D-01: no onboarding
    // surface); this is test setup, not a code path the app exposes.
    // Removed in afterEach below so repeated runs against a real
    // database don't accumulate orphan Tenant rows.
    const [{ id: secondTenantId }] = await sql<{
      id: string
    }[]>`insert into tenants default values returning id`
    tenantB = secondTenantId as TenantId

    const [{ id: assetTypeId }] = await sql<{ id: number }[]>`
      insert into asset_types (tenant_id) values (${tenantA}) returning id
    `
    assetTypeInA = assetTypeId
  })

  afterEach(async () => {
    await sql`delete from tenants where id = ${tenantB}`
  })

  afterAll(async () => {
    await sql?.end()
  })

  it('enforces the AssetType foreign key and tenant scoping (FR-25, FR-33)', async () => {
    const repo = createPostgresAssetRegistryRepository(sql)

    const asset = await registerAsset(repo, {
      tenantId: tenantA,
      assetTypeId: assetTypeInA,
      operatorId,
    })

    expect(asset.status).toBe('unavailable')
    await expect(
      markAssetRentable(repo, { tenantId: tenantB, assetId: asset.id, operatorId }),
    ).rejects.toThrow(AssetNotFoundError)
  })

  it('enforces the partial unique index: a tag_code can only be actively bound once (FR-26)', async () => {
    const repo = createPostgresAssetRegistryRepository(sql)

    const assetOne = await registerAsset(repo, {
      tenantId: tenantA,
      assetTypeId: assetTypeInA,
      operatorId,
    })
    const assetTwo = await registerAsset(repo, {
      tenantId: tenantA,
      assetTypeId: assetTypeInA,
      operatorId,
    })

    await bindAssetTag(repo, {
      tenantId: tenantA,
      assetId: assetOne.id,
      tagCode: 'TAG-DUP',
      operatorId,
    })

    await expect(
      bindAssetTag(repo, {
        tenantId: tenantA,
        assetId: assetTwo.id,
        tagCode: 'TAG-DUP',
        operatorId,
      }),
    ).rejects.toThrow(TagAlreadyBoundError)
  })

  it('rebinding unbinds the previous active tag rather than allowing two active rows (FR-26)', async () => {
    const repo = createPostgresAssetRegistryRepository(sql)

    const asset = await registerAsset(repo, {
      tenantId: tenantA,
      assetTypeId: assetTypeInA,
      operatorId,
    })

    await bindAssetTag(repo, { tenantId: tenantA, assetId: asset.id, tagCode: 'TAG-OLD', operatorId })
    await bindAssetTag(repo, { tenantId: tenantA, assetId: asset.id, tagCode: 'TAG-NEW', operatorId })

    const activeTags = await sql`
      select tag_code from asset_tags where asset_id = ${asset.id} and unbound_at is null
    `
    expect(activeTags).toHaveLength(1)
    expect(activeTags[0]?.tag_code).toBe('TAG-NEW')
  })

  it('has RLS enabled with no policies, so anon/authenticated have no access', async () => {
    const rows = await sql<{ relrowsecurity: boolean }[]>`
      select relrowsecurity from pg_class
      where relname in ('assets', 'asset_types', 'asset_status_events', 'asset_tags')
    `
    expect(rows).toHaveLength(4)
    expect(rows.every((r) => r.relrowsecurity)).toBe(true)

    const policyCount = await sql<{ count: string }[]>`
      select count(*)::text as count from pg_policies
      where tablename in ('assets', 'asset_types', 'asset_status_events', 'asset_tags')
    `
    expect(policyCount[0]?.count).toBe('0')
  })
})
