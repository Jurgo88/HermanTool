// Integration tests for the Operator identity migration
// (supabase/migrations/20260724100000_operator_identity.sql) against a
// real Postgres — schema facts a fake repository cannot prove: the
// `operators` table's foreign key to auth.users, and RLS posture.
//
// Does not attempt to create real auth.users rows (that requires the
// Supabase Auth admin API, not a migration test) or exercise the login
// flow end-to-end — that needs a real provisioned Operator seat, which
// is created by hand per D-22's scope, not by this suite. Also does not
// assert an FK backfill on Asset Registry's attribution columns — that
// is deliberately deferred to its own migration once real Operator
// seats exist everywhere tests run (see the migration's comment).
//
// Self-skips when NUXT_DATABASE_URL is not set, matching every other
// integration suite in this repo.
import { afterAll, describe, expect, it } from 'vitest'
import type postgres from 'postgres'
import { createDatabaseClient } from '../../../server/utils/db'

const databaseUrl = process.env.NUXT_DATABASE_URL ?? ''

describe.skipIf(!databaseUrl)('Operator identity migration (integration)', () => {
  let sql: postgres.Sql

  afterAll(async () => {
    await sql?.end()
  })

  it('has an operators table whose id references auth.users (D-22)', async () => {
    sql = createDatabaseClient(databaseUrl)

    const rows = await sql<{ confrelid: string }[]>`
      select confrelid::regclass::text as confrelid
      from pg_constraint
      where conrelid = 'operators'::regclass and contype = 'f'
    `
    expect(rows.map((r) => r.confrelid)).toContain('auth.users')
  })

  it('has RLS enabled on operators with no policies', async () => {
    const rows = await sql<{ relrowsecurity: boolean }[]>`
      select relrowsecurity from pg_class where relname = 'operators'
    `
    expect(rows).toHaveLength(1)
    expect(rows[0]?.relrowsecurity).toBe(true)

    const policyCount = await sql<{ count: string }[]>`
      select count(*)::text as count from pg_policies where tablename = 'operators'
    `
    expect(policyCount[0]?.count).toBe('0')
  })
})
