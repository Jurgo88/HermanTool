// Integration test for getSeededTenantId (D-01) against a real
// Postgres — self-skips when NUXT_DATABASE_URL is not set, matching
// every other integration suite in this repo.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import type postgres from 'postgres'
import { createDatabaseClient } from '../../../server/utils/db'
import { getSeededTenantId } from '../../../server/utils/tenant'

const databaseUrl = process.env.NUXT_DATABASE_URL ?? ''

describe.skipIf(!databaseUrl)('getSeededTenantId (integration)', () => {
  let sql: postgres.Sql
  let extraTenantId: string

  beforeEach(async () => {
    sql = createDatabaseClient(databaseUrl)
  })

  afterEach(async () => {
    if (extraTenantId) await sql`delete from tenants where id = ${extraTenantId}`
  })

  afterAll(async () => {
    await sql?.end()
  })

  it('returns the oldest Tenant row even when others exist (D-01: exactly one real Tenant)', async () => {
    const seededBefore = await getSeededTenantId(sql)

    const [{ id }] = await sql<{ id: string }[]>`insert into tenants default values returning id`
    extraTenantId = id

    const seededAfter = await getSeededTenantId(sql)

    expect(seededAfter).toBe(seededBefore)
  })
})
