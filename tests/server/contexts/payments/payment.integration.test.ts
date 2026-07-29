// Integration tests for the Payments migration
// (supabase/migrations/20260729110000_payments_foundation.sql) against a
// real Postgres, through the same transaction-pooler configuration
// production uses (createDatabaseClient sets prepare: false), mirroring
// tests/server/contexts/availability-reservation/reservation.integration.test.ts.
//
// Self-skips when NUXT_DATABASE_URL is not set, matching every other
// integration suite in this repo.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type postgres from 'postgres'
import { createDatabaseClient } from '../../../../server/utils/db'
import type { TenantId } from '../../../../server/contexts/_shared'
import { createPostgresPaymentsRepository } from '../../../../server/contexts/payments/repository'

const databaseUrl = process.env.NUXT_DATABASE_URL ?? ''

describe.skipIf(!databaseUrl)('Payments migration (integration)', () => {
  let sql: postgres.Sql
  let tenantId: TenantId
  let reservationGroupId: number

  beforeEach(async () => {
    sql = createDatabaseClient(databaseUrl)

    await sql`truncate table payments restart identity cascade`
    await sql`truncate table reservations, reservation_groups, asset_type_day_holds restart identity cascade`

    const [{ id: seededTenantId }] = await sql<{ id: string }[]>`
      select id from tenants order by created_at limit 1
    `
    tenantId = seededTenantId as TenantId

    const [{ id: groupId }] = await sql<{ id: number }[]>`
      insert into reservation_groups (tenant_id) values (${tenantId}) returning id
    `
    reservationGroupId = groupId
  })

  afterEach(async () => {
    await sql?.end()
  })

  it('has RLS enabled with no policies on the payments table', async () => {
    const rows = await sql<{ relrowsecurity: boolean; relname: string }[]>`
      select relname, relrowsecurity from pg_class where relname = 'payments'
    `
    expect(rows).toHaveLength(1)
    expect(rows[0]?.relrowsecurity).toBe(true)

    const policyCount = await sql<{ count: string }[]>`
      select count(*)::text as count from pg_policies where tablename = 'payments'
    `
    expect(policyCount[0]?.count).toBe('0')
  })

  it('round-trips a Payment through insert, get, and a guarded status transition (FR-10)', async () => {
    const repo = createPostgresPaymentsRepository(sql)

    const inserted = await repo.insertPayment(tenantId, {
      reservationGroupId,
      amount: { amount: 5000, currency: 'EUR' },
      providerReference: 'sess_int_1',
    })
    expect(inserted.status).toBe('pending')

    const succeeded = await repo.transitionPaymentStatus(tenantId, inserted.id, {
      from: 'pending',
      to: 'succeeded',
      providerPaymentReference: 'pi_int_1',
    })
    expect(succeeded?.status).toBe('succeeded')
    expect(succeeded?.providerPaymentReference).toBe('pi_int_1')

    // Guard miss: the row is no longer 'pending'.
    const guardMiss = await repo.transitionPaymentStatus(tenantId, inserted.id, { from: 'pending', to: 'succeeded' })
    expect(guardMiss).toBeNull()
  })

  it('enforces provider_reference uniqueness at the database level', async () => {
    const repo = createPostgresPaymentsRepository(sql)
    await repo.insertPayment(tenantId, {
      reservationGroupId,
      amount: { amount: 5000, currency: 'EUR' },
      providerReference: 'sess_dup',
    })

    await expect(
      repo.insertPayment(tenantId, {
        reservationGroupId,
        amount: { amount: 5000, currency: 'EUR' },
        providerReference: 'sess_dup',
      }),
    ).rejects.toThrow()
  })

  it('enforces at most one succeeded Payment per ReservationGroup (FR-09)', async () => {
    const repo = createPostgresPaymentsRepository(sql)
    const first = await repo.insertPayment(tenantId, {
      reservationGroupId,
      amount: { amount: 5000, currency: 'EUR' },
      providerReference: 'sess_a',
    })
    await repo.transitionPaymentStatus(tenantId, first.id, { from: 'pending', to: 'succeeded' })

    const second = await repo.insertPayment(tenantId, {
      reservationGroupId,
      amount: { amount: 5000, currency: 'EUR' },
      providerReference: 'sess_b',
    })

    await expect(
      repo.transitionPaymentStatus(tenantId, second.id, { from: 'pending', to: 'succeeded' }),
    ).rejects.toThrow()
  })
})
