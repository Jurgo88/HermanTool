// The S-02 calendar against real Postgres: the D-38 obligation that an
// InPossession Asset still counts toward the pool, so a HandoverOut does
// not turn other days into "last" or "none".
//
// Self-skips when NUXT_DATABASE_URL is not set. Point it at the R-05
// rehearsal Supabase project, never at production: it truncates tables.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type postgres from 'postgres'
import { createDatabaseClient } from '../../../../server/utils/db'
import type { TenantId } from '../../../../server/contexts/_shared'
import { createPostgresAvailabilityReservationRepository } from '../../../../server/contexts/availability-reservation/repository'
import { getAvailabilityMonth } from '../../../../server/contexts/availability-reservation/availability-calendar'
import { checkoutReservationGroup } from '../../../../server/contexts/availability-reservation/reservation'

const databaseUrl = process.env.NUXT_DATABASE_URL ?? ''

describe.skipIf(!databaseUrl)('Availability month calendar (integration)', () => {
  let sql: postgres.Sql
  let tenantId: TenantId
  let operatorId: string
  let drillTypeId: number

  async function seedAssets(status: string, count: number) {
    for (let i = 0; i < count; i++) {
      await sql`
        insert into assets (tenant_id, asset_type_id, status, registered_by_operator_id, status_changed_by_operator_id)
        values (${tenantId}, ${drillTypeId}, ${status}, ${operatorId}, ${operatorId})
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
    const [{ id }] = await sql<
      { id: number }[]
    >`insert into asset_types (tenant_id) values (${tenantId}) returning id`
    drillTypeId = id
  })

  afterEach(async () => {
    await sql?.end()
  })

  const levels = async () => {
    const repo = createPostgresAvailabilityReservationRepository(sql)
    const month = await repo.transaction((trx, getPool) =>
      getAvailabilityMonth(trx, getPool, {
        tenantId,
        assetTypeId: drillTypeId,
        month: '2026-10',
        today: '2026-10-01',
      }),
    )
    return new Map(month.days.map((d) => [d.day, d.level]))
  }

  it('counts InPossession Assets in the pool, so other days stay free (D-38)', async () => {
    // Both units are out today. Read as the literal Rentable count the
    // pool would be 0 and every day "none"; read as D-38's pool, every day
    // without a Reservation of its own is free.
    await seedAssets('in_possession', 2)

    expect((await levels()).get('2026-10-20')).toBe('free')
  })

  it('shows last and none as Reservations take the pool', async () => {
    await seedAssets('rentable', 2)
    const repo = createPostgresAvailabilityReservationRepository(sql)
    const day = { startDay: '2026-10-20', endDay: '2026-10-20' }
    await checkoutReservationGroup(repo, {
      tenantId,
      lines: [{ assetTypeId: drillTypeId, period: day }],
    })
    expect((await levels()).get('2026-10-20')).toBe('last')

    await checkoutReservationGroup(repo, {
      tenantId,
      lines: [{ assetTypeId: drillTypeId, period: day }],
    })
    const after = await levels()
    expect(after.get('2026-10-20')).toBe('none')
    expect(after.get('2026-10-21')).toBe('free')
  })
})
