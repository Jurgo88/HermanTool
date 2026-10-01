// Integration tests for 20261001090000_catalog_classification_and_content
// against a real Postgres — what the fake repository cannot prove: the
// composite tenant FKs, the partial unique label index, the soft-removal
// attribution check, jsonb/array round trips and RLS on the new tables.
//
// Self-skips when NUXT_DATABASE_URL is not set. Point it at the R-05
// rehearsal Supabase project, never at production: it truncates tables.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import type postgres from 'postgres'
import { createDatabaseClient } from '../../../../server/utils/db'
import { createMonetaryAmount, type TenantId } from '../../../../server/contexts/_shared'
import { createPostgresCatalogRepository } from '../../../../server/contexts/catalog/repository'
import { createAssetType, updateAssetType } from '../../../../server/contexts/catalog/asset-type'
import {
  createClassificationEntry,
  listClassification,
  removeClassificationEntry,
  reorderClassification,
} from '../../../../server/contexts/catalog/classification'
import {
  ClassificationInUseError,
  UseAreaNotFoundError,
} from '../../../../server/contexts/catalog/types'

const databaseUrl = process.env.NUXT_DATABASE_URL ?? ''

const operatorId = '55555555-5555-5555-5555-555555555555'

describe.skipIf(!databaseUrl)('Catalog classification migration (integration)', () => {
  let sql: postgres.Sql
  let tenantA: TenantId
  let tenantB: TenantId

  const base = () => ({
    tenantId: tenantA,
    operatorId,
    name: 'Aku reťazová píla PPAGHS 20-Li A1',
    description: '',
    dayRate: createMonetaryAmount(1500),
    depositAmount: createMonetaryAmount(7500),
  })

  beforeEach(async () => {
    sql = createDatabaseClient(databaseUrl)

    await sql`
      truncate table asset_status_events, asset_tags, assets, asset_type_use_areas, asset_types,
        power_sources, use_areas restart identity cascade
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
    await sql`delete from asset_type_use_areas where tenant_id = ${tenantB}`
    await sql`delete from asset_types where tenant_id = ${tenantB}`
    await sql`delete from power_sources where tenant_id = ${tenantB}`
    await sql`delete from use_areas where tenant_id = ${tenantB}`
    await sql`delete from tenants where id = ${tenantB}`
  })

  afterAll(async () => {
    await sql?.end()
  })

  it('round-trips classification and D-55 content through Postgres', async () => {
    const repo = createPostgresCatalogRepository(sql)
    const power = await createClassificationEntry(repo, {
      tenantId: tenantA,
      kind: 'powerSource',
      label: 'Aku',
      operatorId,
    })
    const garden = await createClassificationEntry(repo, {
      tenantId: tenantA,
      kind: 'useArea',
      label: 'Záhrada',
      operatorId,
    })
    const wood = await createClassificationEntry(repo, {
      tenantId: tenantA,
      kind: 'useArea',
      label: 'Práca s drevom',
      operatorId,
    })

    const created = await createAssetType(repo, {
      ...base(),
      powerSourceId: power.id,
      useAreaIds: [wood.id, garden.id],
      specifications: [
        { label: 'Max. dĺžka rezu', value: 'cca 19 cm' },
        { label: 'Max. rýchlosť reťaze', value: '8 m/s' },
      ],
      includedContents: '1× batéria',
      imageFile: 'aku-retazova-pila-ppaghs-20-li-a1.webp',
    })

    const reread = await repo.getAssetType(tenantA, created.id)
    expect(reread).toMatchObject({
      powerSourceId: power.id,
      useAreaIds: [garden.id, wood.id],
      specifications: [
        { label: 'Max. dĺžka rezu', value: 'cca 19 cm' },
        { label: 'Max. rýchlosť reťaze', value: '8 m/s' },
      ],
      includedContents: '1× batéria',
      imageFile: 'aku-retazova-pila-ppaghs-20-li-a1.webp',
    })

    const cleared = await updateAssetType(repo, {
      tenantId: tenantA,
      assetTypeId: created.id,
      operatorId,
      powerSourceId: null,
      imageFile: null,
      useAreaIds: [garden.id],
    })
    expect(cleared).toMatchObject({ powerSourceId: null, imageFile: null, useAreaIds: [garden.id] })
  })

  it('refuses a cross-Tenant link at the schema level (FR-33)', async () => {
    const repo = createPostgresCatalogRepository(sql)
    const foreignArea = await createClassificationEntry(repo, {
      tenantId: tenantB,
      kind: 'useArea',
      label: 'Záhrada',
      operatorId,
    })
    const foreignPower = await createClassificationEntry(repo, {
      tenantId: tenantB,
      kind: 'powerSource',
      label: 'Aku',
      operatorId,
    })
    const assetType = await createAssetType(repo, base())

    await expect(
      sql`insert into asset_type_use_areas (tenant_id, asset_type_id, use_area_id)
          values (${tenantA}, ${assetType.id}, ${foreignArea.id})`,
    ).rejects.toThrow()
    await expect(
      sql`update asset_types set power_source_id = ${foreignPower.id} where id = ${assetType.id}`,
    ).rejects.toThrow()
  })

  it('rolls the whole update back when a UseArea is invalid', async () => {
    const repo = createPostgresCatalogRepository(sql)
    const garden = await createClassificationEntry(repo, {
      tenantId: tenantA,
      kind: 'useArea',
      label: 'Záhrada',
      operatorId,
    })
    const assetType = await createAssetType(repo, { ...base(), useAreaIds: [garden.id] })

    await expect(
      updateAssetType(repo, {
        tenantId: tenantA,
        assetTypeId: assetType.id,
        operatorId,
        description: 'zmenené',
        useAreaIds: [999_999],
      }),
    ).rejects.toThrow(UseAreaNotFoundError)

    expect(await repo.getAssetType(tenantA, assetType.id)).toMatchObject({
      description: '',
      useAreaIds: [garden.id],
    })
  })

  it('refuses removal in use, soft-removes with attribution, and frees the label (D-54, FR-34)', async () => {
    const repo = createPostgresCatalogRepository(sql)
    const area = await createClassificationEntry(repo, {
      tenantId: tenantA,
      kind: 'useArea',
      label: 'Zábava',
      operatorId,
    })
    const assetType = await createAssetType(repo, { ...base(), useAreaIds: [area.id] })

    await expect(
      removeClassificationEntry(repo, {
        tenantId: tenantA,
        kind: 'useArea',
        id: area.id,
        operatorId,
      }),
    ).rejects.toThrow(ClassificationInUseError)

    await updateAssetType(repo, {
      tenantId: tenantA,
      assetTypeId: assetType.id,
      operatorId,
      useAreaIds: [],
    })
    await removeClassificationEntry(repo, {
      tenantId: tenantA,
      kind: 'useArea',
      id: area.id,
      operatorId,
    })

    const [row] = await sql<{ removed_at: Date | null; removed_by_operator_id: string | null }[]>`
      select removed_at, removed_by_operator_id from use_areas where id = ${area.id}
    `
    expect(row?.removed_at).not.toBeNull()
    expect(row?.removed_by_operator_id).toBe(operatorId)
    await expect(
      createClassificationEntry(repo, {
        tenantId: tenantA,
        kind: 'useArea',
        label: 'Zábava',
        operatorId,
      }),
    ).resolves.toMatchObject({ label: 'Zábava' })
  })

  it('refuses a removal without attribution at the schema level', async () => {
    const repo = createPostgresCatalogRepository(sql)
    const power = await createClassificationEntry(repo, {
      tenantId: tenantA,
      kind: 'powerSource',
      label: 'Aku',
      operatorId,
    })

    await expect(
      sql`update power_sources set removed_at = now() where id = ${power.id}`,
    ).rejects.toThrow()
  })

  it('reorders atomically', async () => {
    const repo = createPostgresCatalogRepository(sql)
    const a = await createClassificationEntry(repo, {
      tenantId: tenantA,
      kind: 'useArea',
      label: 'A',
      operatorId,
    })
    const b = await createClassificationEntry(repo, {
      tenantId: tenantA,
      kind: 'useArea',
      label: 'B',
      operatorId,
    })

    await reorderClassification(repo, {
      tenantId: tenantA,
      kind: 'useArea',
      sequence: [b.id, a.id],
      operatorId,
    })

    const list = await listClassification(repo, { tenantId: tenantA, kind: 'useArea' })
    expect(list.map((e) => e.label)).toEqual(['B', 'A'])
  })

  it('has RLS enabled with no policies on every new table', async () => {
    for (const table of ['power_sources', 'use_areas', 'asset_type_use_areas']) {
      const [row] = await sql<
        { relrowsecurity: boolean }[]
      >`select relrowsecurity from pg_class where relname = ${table}`
      expect(row?.relrowsecurity).toBe(true)
      const [policies] = await sql<{ count: string }[]>`
        select count(*)::text as count from pg_policies where tablename = ${table}
      `
      expect(policies?.count).toBe('0')
    }
  })
})
