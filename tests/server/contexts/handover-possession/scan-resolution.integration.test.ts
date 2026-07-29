// Integration tests for the Handover & Possession ScanEvent migration
// (supabase/migrations/20260729120000_handover_possession_scan_events.sql)
// against a real Postgres, mirroring
// tests/server/contexts/availability-reservation/reservation.integration.test.ts.
//
// Self-skips when NUXT_DATABASE_URL is not set, matching every other
// integration suite in this repo.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type postgres from 'postgres'
import { createDatabaseClient } from '../../../../server/utils/db'
import type { TenantId } from '../../../../server/contexts/_shared'
import { createPostgresAssetRegistryRepository } from '../../../../server/contexts/asset-registry/repository'
import { createPostgresHandoverPossessionRepository } from '../../../../server/contexts/handover-possession/repository'
import { resolveScanEvent } from '../../../../server/contexts/handover-possession/scan-resolution'
import { ScanEventTagNotBoundError } from '../../../../server/contexts/handover-possession/types'

const databaseUrl = process.env.NUXT_DATABASE_URL ?? ''

describe.skipIf(!databaseUrl)('ScanEvent resolution migration (integration)', () => {
  let sql: postgres.Sql
  let tenantId: TenantId
  let operatorId: string
  let assetTypeId: number

  beforeEach(async () => {
    sql = createDatabaseClient(databaseUrl)

    await sql`truncate table scan_events restart identity cascade`
    await sql`truncate table asset_status_events, asset_tags, assets, asset_types restart identity cascade`

    const [{ id: seededTenantId }] = await sql<{ id: string }[]>`
      select id from tenants order by created_at limit 1
    `
    tenantId = seededTenantId as TenantId

    const [{ id: seededOperatorId }] = await sql<{ id: string }[]>`
      select id from operators order by created_at limit 1
    `
    operatorId = seededOperatorId

    const [{ id: typeId }] = await sql<{ id: number }[]>`
      insert into asset_types (tenant_id) values (${tenantId}) returning id
    `
    assetTypeId = typeId
  })

  afterEach(async () => {
    await sql?.end()
  })

  it('has RLS enabled with no policies on scan_events', async () => {
    const rows = await sql<{ relrowsecurity: boolean }[]>`
      select relrowsecurity from pg_class where relname = 'scan_events'
    `
    expect(rows).toHaveLength(1)
    expect(rows[0]?.relrowsecurity).toBe(true)

    const policyCount = await sql<{ count: string }[]>`
      select count(*)::text as count from pg_policies where tablename = 'scan_events'
    `
    expect(policyCount[0]?.count).toBe('0')
  })

  it('resolves a Rentable Asset scan to handover_out and records the ScanEvent (P3, FR-17)', async () => {
    const assetRegistryRepo = createPostgresAssetRegistryRepository(sql)
    const repo = createPostgresHandoverPossessionRepository(sql)

    const asset = await assetRegistryRepo.insertAsset(tenantId, { assetTypeId, status: 'rentable', operatorId })
    await assetRegistryRepo.insertAssetTag(tenantId, { assetId: asset.id, tagCode: 'TAG-INT-1', operatorId })

    const resolution = await resolveScanEvent(repo, assetRegistryRepo, {
      tenantId,
      tagCode: 'TAG-INT-1',
      operatorId,
    })

    expect(resolution.kind).toBe('handover_out')

    const rows = await sql<{ count: string }[]>`
      select count(*)::text as count from scan_events where asset_id = ${asset.id}
    `
    expect(rows[0]?.count).toBe('1')
  })

  it('refuses an unbound tag', async () => {
    const assetRegistryRepo = createPostgresAssetRegistryRepository(sql)
    const repo = createPostgresHandoverPossessionRepository(sql)

    await expect(
      resolveScanEvent(repo, assetRegistryRepo, { tenantId, tagCode: 'UNKNOWN', operatorId }),
    ).rejects.toThrow(ScanEventTagNotBoundError)
  })
})
