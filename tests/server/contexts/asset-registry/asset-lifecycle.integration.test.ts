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
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
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
  // operator_id columns are `uuid` (see the migration's D-22 TODO on the
  // attribution columns) — a non-uuid string fails at insert against real
  // Postgres even though the fake repository in asset-lifecycle.test.ts
  // doesn't validate the format.
  let operatorId: string

  beforeEach(async () => {
    sql = createDatabaseClient(databaseUrl)
    operatorId = crypto.randomUUID()

    await sql`truncate table asset_status_events, asset_tags, assets, asset_types restart identity cascade`

    const [{ id: seededTenantId }] = await sql<{ id: string }[]>`select id from tenants limit 1`
    tenantA = seededTenantId as TenantId

    // A second Tenant row for the isolation assertion only — nothing in
    // Asset Registry's own API creates Tenants (D-01: no onboarding
    // surface); this is test setup, not a code path the app exposes.
    const [{ id: secondTenantId }] = await sql<{
      id: string
    }[]>`insert into tenants default values returning id`
    tenantB = secondTenantId as TenantId

    const [{ id: assetTypeId }] = await sql<{ id: number }[]>`
      insert into asset_types (tenant_id) values (${tenantA}) returning id
    `
    assetTypeInA = assetTypeId
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
