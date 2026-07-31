// Integration tests for the QR tag code sequence
// (supabase/migrations/20260731130000_asset_tag_code_sequence.sql)
// against a real Postgres, mirroring
// tests/server/contexts/asset-registry/asset-lifecycle.integration.test.ts.
//
// Self-skips when NUXT_DATABASE_URL is not set, matching every other
// integration suite in this repo.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type postgres from 'postgres'
import { createDatabaseClient } from '../../../../server/utils/db'
import type { TenantId } from '../../../../server/contexts/_shared'
import { bulkRegisterAssets } from '../../../../server/contexts/asset-registry/bulk-registration'
import { createPostgresAssetRegistryRepository } from '../../../../server/contexts/asset-registry/repository'

const databaseUrl = process.env.NUXT_DATABASE_URL ?? ''

describe.skipIf(!databaseUrl)('QR tag code sequence (integration)', () => {
  let sql: postgres.Sql
  let tenantId: TenantId
  let operatorId: string
  let assetTypeId: number

  beforeEach(async () => {
    sql = createDatabaseClient(databaseUrl)

    await sql`truncate table asset_status_events, asset_tags, assets, asset_types restart identity cascade`

    const [{ id: seededOperatorId }] = await sql<{ id: string }[]>`
      select id from operators order by created_at limit 1
    `
    operatorId = seededOperatorId

    const [{ id: seededTenantId }] = await sql<{ id: string }[]>`
      select id from tenants order by created_at limit 1
    `
    tenantId = seededTenantId as TenantId

    const [{ id: insertedAssetTypeId }] = await sql<{ id: number }[]>`
      insert into asset_types (tenant_id) values (${tenantId}) returning id
    `
    assetTypeId = insertedAssetTypeId
  })

  afterEach(async () => {
    await sql?.end()
  })

  it('produces strictly increasing, never-repeating values from asset_tag_code_seq', async () => {
    const repo = createPostgresAssetRegistryRepository(sql)
    const first = await repo.nextTagCodeNumber(tenantId)
    const second = await repo.nextTagCodeNumber(tenantId)
    expect(second).toBeGreaterThan(first)
  })

  it('end-to-end: bulkRegisterAssets registers N Assets with N distinct, freshly bound tag codes', async () => {
    const repo = createPostgresAssetRegistryRepository(sql)

    const units = await bulkRegisterAssets(repo, {
      tenantId,
      operatorId,
      lines: [{ assetTypeId, quantity: 5 }],
    })

    expect(units).toHaveLength(5)
    const tagCodes = units.map((u) => u.tag.tagCode)
    expect(new Set(tagCodes).size).toBe(5)
    expect(tagCodes.every((code) => /^HT-\d{6}$/.test(code))).toBe(true)

    const rows = await sql<{ count: string }[]>`select count(*)::text as count from assets where tenant_id = ${tenantId}`
    expect(rows[0]?.count).toBe('5')
  })
})
