// Integration tests for the Availability & Reservation migration
// (supabase/migrations/20260728120000_availability_reservation_foundation.sql)
// against a real Postgres, through the same transaction-pooler
// configuration production uses (createDatabaseClient sets
// prepare: false) — deliberate, since a plain direct-connection test
// would miss exactly the class of bug (pooler-incompatible session
// state, prepared-statement mismatch) this migration exists to avoid.
//
// The centrepiece is OQ #23: two genuinely concurrent hold attempts on
// the last unit of an AssetType for the same day — exactly one must
// succeed. "Genuinely concurrent" here means adversarially interleaved
// via a test-only hook (Attempt A pauses after reading capacity but
// before its atomic increment; Attempt B is allowed to run to full
// completion; only then is A released) — this proves the atomic UPSERT
// re-checks the row's CURRENT state at increment time rather than
// trusting a stale earlier read, which a naive read-then-write
// implementation would get wrong even though it might pass a test that
// only relies on network-timing luck.
//
// Self-skips when NUXT_DATABASE_URL is not set, matching every other
// integration suite in this repo.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import type postgres from 'postgres'
import { createDatabaseClient } from '../../../../server/utils/db'
import type { TenantId } from '../../../../server/contexts/_shared'
import { createPostgresAvailabilityReservationRepository } from '../../../../server/contexts/availability-reservation/repository'
import {
  cancelReservation,
  checkoutReservationGroup,
  confirmReservationGroup,
} from '../../../../server/contexts/availability-reservation/reservation'
import { AssetTypeUnavailableError } from '../../../../server/contexts/availability-reservation/types'

const databaseUrl = process.env.NUXT_DATABASE_URL ?? ''

describe.skipIf(!databaseUrl)('Availability & Reservation migration (integration)', () => {
  let sql: postgres.Sql
  let tenantId: TenantId
  let operatorId: string
  let hammerTypeId: number
  let scaffoldTypeId: number

  async function seedRentableAssets(assetTypeId: number, count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
      await sql`
        insert into assets (
          tenant_id, asset_type_id, status, registered_by_operator_id, status_changed_by_operator_id
        ) values (${tenantId}, ${assetTypeId}, 'rentable', ${operatorId}, ${operatorId})
      `
    }
  }

  beforeEach(async () => {
    sql = createDatabaseClient(databaseUrl)

    await sql`truncate table reservations, reservation_groups, asset_type_day_holds restart identity cascade`
    await sql`truncate table asset_status_events, asset_tags, assets, asset_types restart identity cascade`

    const [{ id: seededTenantId }] = await sql<
      { id: string }[]
    >`select id from tenants order by created_at limit 1`
    tenantId = seededTenantId as TenantId

    const [{ id: seededOperatorId }] = await sql<
      { id: string }[]
    >`select id from operators order by created_at limit 1`
    operatorId = seededOperatorId

    const [{ id: hammerId }] = await sql<{ id: number }[]>`
      insert into asset_types (tenant_id) values (${tenantId}) returning id
    `
    hammerTypeId = hammerId
    const [{ id: scaffoldId }] = await sql<{ id: number }[]>`
      insert into asset_types (tenant_id) values (${tenantId}) returning id
    `
    scaffoldTypeId = scaffoldId
  })

  afterEach(async () => {
    await sql?.end()
  })

  afterAll(async () => {
    // no shared connection kept open across the suite (each test opens
    // its own via beforeEach), nothing to close here.
  })

  it('has RLS enabled with no policies on all three new tables', async () => {
    const rows = await sql<{ relrowsecurity: boolean; relname: string }[]>`
      select relname, relrowsecurity from pg_class
      where relname in ('reservation_groups', 'reservations', 'asset_type_day_holds')
    `
    expect(rows).toHaveLength(3)
    expect(rows.every((r) => r.relrowsecurity)).toBe(true)

    const policyCount = await sql<{ count: string }[]>`
      select count(*)::text as count from pg_policies
      where tablename in ('reservation_groups', 'reservations', 'asset_type_day_holds')
    `
    expect(policyCount[0]?.count).toBe('0')
  })

  it('enforces end_day >= start_day at the database level (A-05)', async () => {
    const [{ id: groupId }] = await sql<{ id: number }[]>`
      insert into reservation_groups (tenant_id) values (${tenantId}) returning id
    `
    await expect(
      sql`
        insert into reservations (
          tenant_id, reservation_group_id, asset_type_id, start_day, end_day, pending_expires_at
        ) values (${tenantId}, ${groupId}, ${hammerTypeId}, '2026-03-07', '2026-03-05', now())
      `,
    ).rejects.toThrow()
  })

  it('OQ #23 — two genuinely concurrent hold attempts on the last unit: exactly one succeeds', async () => {
    await seedRentableAssets(hammerTypeId, 1)

    const day = '2026-03-05'
    let unblockA!: () => void
    const aGate = new Promise<void>((resolve) => {
      unblockA = resolve
    })

    const sqlA = createDatabaseClient(databaseUrl)
    const sqlB = createDatabaseClient(databaseUrl)
    const repoA = createPostgresAvailabilityReservationRepository(sqlA)
    const repoB = createPostgresAvailabilityReservationRepository(sqlB)

    try {
      const attemptA = checkoutReservationGroup(repoA, {
        tenantId,
        lines: [{ assetTypeId: hammerTypeId, period: { startDay: day, endDay: day } }],
        hooks: {
          // Pause here — after A has read capacity=1, before its atomic
          // increment — until B has been allowed to run to completion.
          afterCapacityRead: () => aGate,
        },
      })

      // Give A's first DB round trip (the capacity read) a chance to
      // actually reach the hook and start waiting on aGate before B
      // starts, so the two are provably interleaved rather than B
      // simply winning a race that never truly overlapped.
      await new Promise((resolve) => setTimeout(resolve, 50))

      const resultB = await checkoutReservationGroup(repoB, {
        tenantId,
        lines: [{ assetTypeId: hammerTypeId, period: { startDay: day, endDay: day } }],
      })
      expect(resultB.reservations[0]!.state).toBe('pending')

      unblockA()
      const resultA = await attemptA.then(
        (value) => ({ ok: true as const, value }),
        (err) => ({ ok: false as const, err }),
      )

      expect(resultA.ok).toBe(false)
      if (!resultA.ok) {
        expect(resultA.err).toBeInstanceOf(AssetTypeUnavailableError)
      }

      // Never both: exactly one Reservation exists for the day, and the
      // materialised counter reads exactly 1, never 2.
      const reservations = await sql<{ id: number }[]>`
        select id from reservations
        where tenant_id = ${tenantId} and asset_type_id = ${hammerTypeId}
          and start_day = ${day} and state = 'pending'
      `
      expect(reservations).toHaveLength(1)

      const holds = await sql<{ held_count: number }[]>`
        select held_count from asset_type_day_holds
        where tenant_id = ${tenantId} and asset_type_id = ${hammerTypeId} and rental_day = ${day}
      `
      expect(holds[0]?.held_count).toBe(1)
    } finally {
      await sqlA.end()
      await sqlB.end()
    }
  })

  it('reaps a stale unswept Pending before refusing a contended day, against real Postgres (D-33, D-25)', async () => {
    await seedRentableAssets(hammerTypeId, 1)
    const day = '2026-03-05'
    const repo = createPostgresAvailabilityReservationRepository(sql)

    const past = new Date(Date.now() - 45 * 60_000)
    const { reservations: stale } = await checkoutReservationGroup(repo, {
      tenantId,
      lines: [{ assetTypeId: hammerTypeId, period: { startDay: day, endDay: day } }],
      now: past,
    })

    const { reservations: fresh } = await checkoutReservationGroup(repo, {
      tenantId,
      lines: [{ assetTypeId: hammerTypeId, period: { startDay: day, endDay: day } }],
    })

    expect(fresh[0]!.state).toBe('pending')
    const staleRow = await sql<{ state: string }[]>`select state from reservations where id = ${stale[0]!.id}`
    expect(staleRow[0]?.state).toBe('expired')

    const holds = await sql<{ held_count: number }[]>`
      select held_count from asset_type_day_holds
      where tenant_id = ${tenantId} and asset_type_id = ${hammerTypeId} and rental_day = ${day}
    `
    expect(holds[0]?.held_count).toBe(1)
  })

  it('release-on-cancel frees the day for a subsequent checkout (D-13, W11 mechanics)', async () => {
    await seedRentableAssets(hammerTypeId, 1)
    const day = '2026-03-05'
    const repo = createPostgresAvailabilityReservationRepository(sql)

    const { reservations } = await checkoutReservationGroup(repo, {
      tenantId,
      lines: [{ assetTypeId: hammerTypeId, period: { startDay: day, endDay: day } }],
    })

    await cancelReservation(repo, { tenantId, reservationId: reservations[0]!.id })

    const holdsAfterCancel = await sql<{ held_count: number }[]>`
      select held_count from asset_type_day_holds
      where tenant_id = ${tenantId} and asset_type_id = ${hammerTypeId} and rental_day = ${day}
    `
    expect(holdsAfterCancel[0]?.held_count).toBe(0)

    const { reservations: rebooked } = await checkoutReservationGroup(repo, {
      tenantId,
      lines: [{ assetTypeId: hammerTypeId, period: { startDay: day, endDay: day } }],
    })
    expect(rebooked[0]!.state).toBe('pending')
  })

  it('rolls back every line of a multi-AssetType checkout when one line is unavailable (whole-checkout atomicity)', async () => {
    await seedRentableAssets(hammerTypeId, 1)
    // scaffoldTypeId deliberately has zero Rentable Assets.
    const repo = createPostgresAvailabilityReservationRepository(sql)

    await expect(
      checkoutReservationGroup(repo, {
        tenantId,
        lines: [
          { assetTypeId: hammerTypeId, period: { startDay: '2026-03-05', endDay: '2026-03-05' } },
          { assetTypeId: scaffoldTypeId, period: { startDay: '2026-03-05', endDay: '2026-03-05' } },
        ],
      }),
    ).rejects.toThrow(AssetTypeUnavailableError)

    const groups = await sql`select id from reservation_groups where tenant_id = ${tenantId}`
    expect(groups).toHaveLength(0)
    const holds = await sql<{ held_count: number }[]>`
      select held_count from asset_type_day_holds
      where tenant_id = ${tenantId} and asset_type_id = ${hammerTypeId} and rental_day = '2026-03-05'
    `
    expect(holds).toHaveLength(0)
  })

  it('confirmReservationGroup re-acquires and confirms after Pending expiry, against real Postgres (D-37)', async () => {
    await seedRentableAssets(hammerTypeId, 1)
    const day = '2026-03-05'
    const repo = createPostgresAvailabilityReservationRepository(sql)

    const past = new Date(Date.now() - 45 * 60_000)
    const { group } = await checkoutReservationGroup(repo, {
      tenantId,
      lines: [{ assetTypeId: hammerTypeId, period: { startDay: day, endDay: day } }],
      now: past,
    })

    const confirmed = await confirmReservationGroup(repo, { tenantId, reservationGroupId: group.id })

    expect(confirmed[0]!.state).toBe('confirmed')
    const holds = await sql<{ held_count: number }[]>`
      select held_count from asset_type_day_holds
      where tenant_id = ${tenantId} and asset_type_id = ${hammerTypeId} and rental_day = ${day}
    `
    expect(holds[0]?.held_count).toBe(1)
  })
})
