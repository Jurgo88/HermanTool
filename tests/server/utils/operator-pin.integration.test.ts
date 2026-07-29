// Integration tests for the Operator PIN migration
// (supabase/migrations/20260730130000_operator_pin.sql) against a real
// Postgres — proves setOperatorPin/verifyOperatorPin round-trip through
// the actual `pin_salt`/`pin_hash` columns.
//
// Uses the real seeded Operator seat rather than inserting a new one:
// `operators.id` is a foreign key to `auth.users`, and creating a real
// auth.users row needs the Supabase Auth admin API, not a migration test
// (same constraint operator-identity.integration.test.ts documents).
// Resets the seeded Operator's PIN columns back to null afterward so
// this suite leaves no residue on a seat a human actually uses.
//
// Self-skips when NUXT_DATABASE_URL is not set, matching every other
// integration suite in this repo.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type postgres from 'postgres'
import { createDatabaseClient } from '../../../server/utils/db'
import type { TenantId } from '../../../server/contexts/_shared'
import { createPostgresOperatorRepository } from '../../../server/utils/operators'
import { InvalidPinError, setOperatorPin, verifyOperatorPin } from '../../../server/utils/operator-pin'

const databaseUrl = process.env.NUXT_DATABASE_URL ?? ''

describe.skipIf(!databaseUrl)('Operator PIN migration (integration)', () => {
  let sql: postgres.Sql
  let tenantId: TenantId
  let operatorId: string

  beforeEach(async () => {
    sql = createDatabaseClient(databaseUrl)

    const [{ id: seededTenantId }] = await sql<{ id: string }[]>`
      select id from tenants order by created_at limit 1
    `
    tenantId = seededTenantId as TenantId

    const [{ id: seededOperatorId }] = await sql<{ id: string }[]>`
      select id from operators order by created_at limit 1
    `
    operatorId = seededOperatorId
  })

  afterEach(async () => {
    await sql`update operators set pin_salt = null, pin_hash = null where id = ${operatorId}`
    await sql?.end()
  })

  it('round-trips a PIN through real Postgres and resolves the Operator (F8, Finding 8)', async () => {
    const repo = createPostgresOperatorRepository(sql)

    await setOperatorPin(repo, operatorId, '4321')
    const resolved = await verifyOperatorPin(repo, tenantId, '4321')

    expect(resolved.id).toBe(operatorId)
  })

  it('refuses a non-matching PIN even after one is set', async () => {
    const repo = createPostgresOperatorRepository(sql)
    await setOperatorPin(repo, operatorId, '4321')

    await expect(verifyOperatorPin(repo, tenantId, '0000')).rejects.toThrow(InvalidPinError)
  })

  it('persists pin_salt/pin_hash as columns distinct from each other', async () => {
    const repo = createPostgresOperatorRepository(sql)
    await setOperatorPin(repo, operatorId, '4321')

    const rows = await sql<{ pin_salt: string; pin_hash: string }[]>`
      select pin_salt, pin_hash from operators where id = ${operatorId}
    `
    expect(rows[0]?.pin_salt).toBeTruthy()
    expect(rows[0]?.pin_hash).toBeTruthy()
    expect(rows[0]?.pin_salt).not.toBe(rows[0]?.pin_hash)
  })
})
