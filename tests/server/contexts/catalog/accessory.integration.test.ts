// Integration tests for 20261001100000_catalog_accessory against a real
// Postgres: the composite tenant FKs and not-self check on the link, the
// principalIds round trip, and Availability & Reservation reading the
// link through Catalog's published interface at checkout (D-57).
//
// Self-skips when NUXT_DATABASE_URL is not set. Point it at the R-05
// rehearsal Supabase project, never at production: it truncates tables.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import type postgres from 'postgres'
import { createDatabaseClient } from '../../../../server/utils/db'
import { createMonetaryAmount, type TenantId } from '../../../../server/contexts/_shared'
import { createPostgresCatalogRepository } from '../../../../server/contexts/catalog/repository'
import { createAssetType, updateAssetType } from '../../../../server/contexts/catalog/asset-type'
import { createPostgresAvailabilityReservationRepository } from '../../../../server/contexts/availability-reservation/repository'
import { checkoutReservationGroup } from '../../../../server/contexts/availability-reservation/reservation'
import { AccessoryWithoutPrincipalError } from '../../../../server/contexts/availability-reservation/types'

const databaseUrl = process.env.NUXT_DATABASE_URL ?? ''

const operatorId = '55555555-5555-5555-5555-555555555555'

describe.skipIf(!databaseUrl)('Catalog Accessory migration (integration)', () => {
  let sql: postgres.Sql
  let tenantA: TenantId
  let tenantB: TenantId

  const make = (name: string, tenantId: TenantId, principalIds?: number[]) =>
    createAssetType(createPostgresCatalogRepository(sql), {
      tenantId,
      operatorId,
      name,
      description: '',
      dayRate: createMonetaryAmount(500),
      depositAmount: createMonetaryAmount(2500),
      principalIds,
    })

  beforeEach(async () => {
    sql = createDatabaseClient(databaseUrl)

    await sql`
      truncate table asset_status_events, asset_tags, assets, asset_type_accessories, asset_type_use_areas,
        asset_types restart identity cascade
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
    await sql`delete from asset_type_accessories where tenant_id = ${tenantB}`
    await sql`delete from asset_types where tenant_id = ${tenantB}`
    await sql`delete from tenants where id = ${tenantB}`
  })

  afterAll(async () => {
    await sql?.end()
  })

  it('round-trips principalIds and replaces them as a set', async () => {
    const hammer = await make('Bosch GBH 2-26 DFR', tenantA)
    const combi = await make('Aku kombinované kladivo PKHAP 205 A1', tenantA)
    const bits = await make('Sada vrtákov', tenantA, [combi.id, hammer.id])

    const repo = createPostgresCatalogRepository(sql)
    expect((await repo.getAssetType(tenantA, bits.id))?.principalIds).toEqual(
      [hammer.id, combi.id].sort((a, b) => a - b),
    )
    expect(await repo.listAccessoryIdsOf(tenantA, hammer.id)).toEqual([bits.id])

    await updateAssetType(repo, {
      tenantId: tenantA,
      assetTypeId: bits.id,
      operatorId,
      principalIds: [hammer.id],
    })
    expect(await repo.getAccessoryPrincipals(tenantA, [bits.id, hammer.id])).toEqual(
      new Map([[bits.id, [hammer.id]]]),
    )
  })

  it('refuses a cross-Tenant or self link at the schema level (FR-33)', async () => {
    const speaker = await make('JBL PartyBox 720', tenantB)
    const microphone = await make('Mikrofón', tenantA)

    await expect(
      sql`insert into asset_type_accessories (tenant_id, principal_asset_type_id, accessory_asset_type_id)
          values (${tenantA}, ${speaker.id}, ${microphone.id})`,
    ).rejects.toThrow()
    await expect(
      sql`insert into asset_type_accessories (tenant_id, principal_asset_type_id, accessory_asset_type_id)
          values (${tenantA}, ${microphone.id}, ${microphone.id})`,
    ).rejects.toThrow()
  })

  it('refuses an unaccompanied Accessory at checkout through the real repositories (D-57)', async () => {
    const speaker = await make('JBL PartyBox 720', tenantA)
    const microphone = await make('Mikrofón', tenantA, [speaker.id])
    const period = { startDay: '2026-10-10', endDay: '2026-10-11' }

    await expect(
      checkoutReservationGroup(createPostgresAvailabilityReservationRepository(sql), {
        tenantId: tenantA,
        lines: [{ assetTypeId: microphone.id, period }],
      }),
    ).rejects.toThrow(AccessoryWithoutPrincipalError)

    const [held] = await sql<{ count: string }[]>`select count(*)::text as count from reservations`
    expect(held?.count).toBe('0')
  })

  it('has RLS enabled with no policies on the link table', async () => {
    const [row] = await sql<{ relrowsecurity: boolean }[]>`
      select relrowsecurity from pg_class where relname = 'asset_type_accessories'
    `
    expect(row?.relrowsecurity).toBe(true)
    const [policies] = await sql<{ count: string }[]>`
      select count(*)::text as count from pg_policies where tablename = 'asset_type_accessories'
    `
    expect(policies?.count).toBe('0')
  })
})
