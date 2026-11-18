import { beforeEach, describe, expect, it } from 'vitest'
import {
  createMonetaryAmount,
  type MonetaryAmount,
  type TenantId,
} from '../../../../server/contexts/_shared'
import { getAvailabilityMonth } from '../../../../server/contexts/availability-reservation/availability-calendar'
import {
  checkoutReservationGroup,
  confirmReservationGroup,
  getAvailableCountsForPeriod,
} from '../../../../server/contexts/availability-reservation/reservation'
import {
  allocateByWeight,
  getAssetTypeStatistics,
  getRevenueByMonth,
  getStatisticsOverview,
  resolveReportingRange,
  sumByCurrency,
  toStatisticsCsv,
} from '../../../../server/contexts/utilisation-reporting/statistics'
import {
  InvalidReportingRangeError,
  type ReportedPayment,
  type ReportingSource,
} from '../../../../server/contexts/utilisation-reporting/types'
import {
  createFakeAvailabilityReservationRepository,
  type FakeAvailabilityReservationRepository,
} from '../availability-reservation/fake-repository'

const tenantA = '11111111-1111-1111-1111-111111111111' as TenantId
const tenantB = '22222222-2222-2222-2222-222222222222' as TenantId
const DRILL = 1
const SAW = 2

// Pools per Tenant stand in for Asset Registry's D-38 count: the drill has
// two units, one of which is out with a Customer right now — it still
// counts, because InPossession is part of the pool.
interface TenantData {
  pools: Map<number, number>
  payments: ReportedPayment[]
  openEndDays: string[]
  deposits: MonetaryAmount[]
}

let repo: FakeAvailabilityReservationRepository
let data: Map<TenantId, TenantData>

function fakeSource(): ReportingSource {
  const of = (tenantId: TenantId) => data.get(tenantId)!
  return {
    async listAssetTypes() {
      return [
        { id: DRILL, name: 'Vŕtačka', dayRate: createMonetaryAmount(1500) },
        { id: SAW, name: 'Píla', dayRate: createMonetaryAmount(500) },
      ]
    },
    readPoolCount: async (tenantId, assetTypeId) => of(tenantId).pools.get(assetTypeId) ?? 0,
    availablePerDay: (tenantId, assetTypeId, period) =>
      getAvailableCountsForPeriod(repo, async (t, a) => of(t).pools.get(a) ?? 0, {
        tenantId,
        assetTypeId,
        period,
      }),
    async listConfirmedReservationsOverlapping(tenantId, period) {
      return repo
        .allReservations()
        .filter(
          (r) =>
            r.tenantId === tenantId &&
            r.state === 'confirmed' &&
            r.period.startDay <= period.endDay &&
            r.period.endDay >= period.startDay,
        )
    },
    async listConfirmedReservationsOfGroups(tenantId, groupIds) {
      return repo
        .allReservations()
        .filter(
          (r) =>
            r.tenantId === tenantId &&
            r.state === 'confirmed' &&
            groupIds.includes(r.reservationGroupId),
        )
    },
    async listConfirmedPayments(tenantId, period) {
      return of(tenantId).payments.filter((p) => p.day >= period.startDay && p.day <= period.endDay)
    },
    listOpenPossessionEndDays: async (tenantId) => of(tenantId).openEndDays,
    listHeldDeposits: async (tenantId) => of(tenantId).deposits,
  }
}

async function reserve(
  tenantId: TenantId,
  lines: { assetTypeId: number; startDay: string; endDay: string }[],
) {
  repo.seedCapacity(DRILL, data.get(tenantId)!.pools.get(DRILL) ?? 0)
  repo.seedCapacity(SAW, data.get(tenantId)!.pools.get(SAW) ?? 0)
  const { group } = await checkoutReservationGroup(repo, {
    tenantId,
    lines: lines.map(({ assetTypeId, startDay, endDay }) => ({
      assetTypeId,
      period: { startDay, endDay },
    })),
  })
  await confirmReservationGroup(repo, { tenantId, reservationGroupId: group.id })
  return group.id
}

beforeEach(() => {
  repo = createFakeAvailabilityReservationRepository()
  data = new Map([
    [
      tenantA,
      {
        pools: new Map([
          [DRILL, 2],
          [SAW, 1],
        ]),
        payments: [],
        openEndDays: [],
        deposits: [],
      },
    ],
    [tenantB, { pools: new Map([[DRILL, 5]]), payments: [], openEndDays: [], deposits: [] }],
  ])
})

describe('reporting range (D-12: periods come from RentalPeriod)', () => {
  it('resolves a month, a year and a custom range', () => {
    expect(resolveReportingRange({ kind: 'month', month: '2026-02' })).toEqual({
      startDay: '2026-02-01',
      endDay: '2026-02-28',
    })
    expect(resolveReportingRange({ kind: 'year', year: '2026' })).toEqual({
      startDay: '2026-01-01',
      endDay: '2026-12-31',
    })
  })

  it('refuses an inverted, malformed or over-long range', () => {
    expect(() =>
      resolveReportingRange({ kind: 'custom', startDay: '2026-10-10', endDay: '2026-10-01' }),
    ).toThrow(InvalidReportingRangeError)
    expect(() => resolveReportingRange({ kind: 'month', month: '2026-13' })).toThrow(
      InvalidReportingRangeError,
    )
    expect(() =>
      resolveReportingRange({ kind: 'custom', startDay: '2025-01-01', endDay: '2026-06-30' }),
    ).toThrow(InvalidReportingRangeError)
  })
})

describe('money (D-21)', () => {
  it('sums per currency, never across currencies', () => {
    expect(sumByCurrency([createMonetaryAmount(100), createMonetaryAmount(250)])).toEqual([
      createMonetaryAmount(350),
    ])
    expect(sumByCurrency([])).toEqual([])
  })

  it('shares a Payment out so the parts add up exactly', () => {
    expect(allocateByWeight(1000, [1, 1, 1])).toEqual([334, 333, 333])
    expect(allocateByWeight(1000, [3, 1])).toEqual([750, 250])
    expect(allocateByWeight(7, [0, 0])).toEqual([4, 3])
  })
})

describe('getAssetTypeStatistics (S-25 detail)', () => {
  it('measures utilisation against the D-38 pool, not the Assets Rentable today', async () => {
    // Pool 2 for the drill even though one unit is InPossession right now.
    await reserve(tenantA, [{ assetTypeId: DRILL, startDay: '2026-10-01', endDay: '2026-10-10' }])

    const { assetTypes } = await getAssetTypeStatistics(fakeSource(), {
      tenantId: tenantA,
      range: { kind: 'month', month: '2026-10' },
    })
    const drill = assetTypes.find((a) => a.assetTypeId === DRILL)!
    expect(drill.pool).toBe(2)
    expect(drill.rentals).toBe(1)
    expect(drill.rentedDays).toBe(10)
    expect(drill.utilisation).toBeCloseTo(10 / (2 * 31))
  })

  it('counts only the days of a Reservation inside the range', async () => {
    await reserve(tenantA, [{ assetTypeId: SAW, startDay: '2026-09-28', endDay: '2026-10-03' }])

    const { assetTypes } = await getAssetTypeStatistics(fakeSource(), {
      tenantId: tenantA,
      range: { kind: 'month', month: '2026-10' },
    })
    expect(assetTypes.find((a) => a.assetTypeId === SAW)!.rentedDays).toBe(3)
  })

  it('reports unmet demand on exactly the calendar\'s "none" days', async () => {
    await reserve(tenantA, [{ assetTypeId: SAW, startDay: '2026-10-05', endDay: '2026-10-07' }])

    const { assetTypes } = await getAssetTypeStatistics(fakeSource(), {
      tenantId: tenantA,
      range: { kind: 'month', month: '2026-10' },
    })
    repo.seedCapacity(SAW, 1)
    const calendar = await getAvailabilityMonth(repo, repo.readRentablePoolCount, {
      tenantId: tenantA,
      assetTypeId: SAW,
      month: '2026-10',
      today: '2026-10-01',
    })
    const noneDays = calendar.days.filter((d) => d.level === 'none').length
    expect(assetTypes.find((a) => a.assetTypeId === SAW)!.unmetDemandDays).toBe(noneDays)
    expect(noneDays).toBe(3)
  })

  it('shares a group Payment between its AssetTypes by day rate × days', async () => {
    const groupId = await reserve(tenantA, [
      { assetTypeId: DRILL, startDay: '2026-10-01', endDay: '2026-10-02' },
      { assetTypeId: SAW, startDay: '2026-10-01', endDay: '2026-10-02' },
    ])
    data.get(tenantA)!.payments.push({
      reservationGroupId: groupId,
      amount: createMonetaryAmount(4000),
      day: '2026-09-30',
    })

    const { assetTypes } = await getAssetTypeStatistics(fakeSource(), {
      tenantId: tenantA,
      range: { kind: 'custom', startDay: '2026-09-01', endDay: '2026-10-31' },
    })
    expect(assetTypes.find((a) => a.assetTypeId === DRILL)!.revenue).toEqual([
      createMonetaryAmount(3000),
    ])
    expect(assetTypes.find((a) => a.assetTypeId === SAW)!.revenue).toEqual([
      createMonetaryAmount(1000),
    ])
  })

  it("never counts another Tenant's Reservations or Payments (FR-33)", async () => {
    const groupId = await reserve(tenantB, [
      { assetTypeId: DRILL, startDay: '2026-10-01', endDay: '2026-10-05' },
    ])
    data
      .get(tenantB)!
      .payments.push({
        reservationGroupId: groupId,
        amount: createMonetaryAmount(5000),
        day: '2026-10-01',
      })

    const { assetTypes } = await getAssetTypeStatistics(fakeSource(), {
      tenantId: tenantA,
      range: { kind: 'month', month: '2026-10' },
    })
    const drill = assetTypes.find((a) => a.assetTypeId === DRILL)!
    expect(drill.rentals).toBe(0)
    expect(drill.revenue).toEqual([])
    expect(drill.unmetDemandDays).toBe(0)
  })
})

describe('getStatisticsOverview (S-25 overview)', () => {
  it('derives Out now and Overdue now from open Possessions (FR-28)', async () => {
    data.get(tenantA)!.openEndDays = ['2026-10-14', '2026-10-15', '2026-10-20']

    const overview = await getStatisticsOverview(fakeSource(), {
      tenantId: tenantA,
      today: '2026-10-15',
    })

    expect(overview.outNow).toBe(3)
    // Ended before today, still out — the 15th is due back today, not late.
    expect(overview.overdueNow).toBe(1)
  })

  it('compares confirmed revenue this month and last, and sums held deposits', async () => {
    const a = data.get(tenantA)!
    a.payments.push(
      { reservationGroupId: 1, amount: createMonetaryAmount(2000), day: '2026-10-02' },
      { reservationGroupId: 2, amount: createMonetaryAmount(1500), day: '2026-10-20' },
      { reservationGroupId: 3, amount: createMonetaryAmount(900), day: '2026-09-30' },
    )
    a.deposits.push(createMonetaryAmount(7500), createMonetaryAmount(2500))

    const overview = await getStatisticsOverview(fakeSource(), {
      tenantId: tenantA,
      today: '2026-10-21',
    })

    expect(overview.month).toBe('2026-10')
    expect(overview.previousMonth).toBe('2026-09')
    expect(overview.revenueThisMonth).toEqual([createMonetaryAmount(3500)])
    expect(overview.revenueLastMonth).toEqual([createMonetaryAmount(900)])
    expect(overview.depositsHeld).toEqual([createMonetaryAmount(10000)])
  })

  it('counts Reservations starting this month and pool-based utilisation', async () => {
    await reserve(tenantA, [{ assetTypeId: DRILL, startDay: '2026-10-01', endDay: '2026-10-31' }])
    await reserve(tenantA, [{ assetTypeId: SAW, startDay: '2026-09-30', endDay: '2026-10-01' }])

    const overview = await getStatisticsOverview(fakeSource(), {
      tenantId: tenantA,
      today: '2026-10-05',
    })

    expect(overview.reservationsThisMonth).toBe(1)
    // 31 drill days + 1 saw day over (2 + 1) units × 31 days.
    expect(overview.utilisationThisMonth).toBeCloseTo(32 / 93)
  })
})

describe('getRevenueByMonth and CSV', () => {
  it('returns twelve months ending with the current one', async () => {
    data
      .get(tenantA)!
      .payments.push({
        reservationGroupId: 1,
        amount: createMonetaryAmount(1200),
        day: '2026-03-15',
      })

    const months = await getRevenueByMonth(fakeSource(), { tenantId: tenantA, today: '2026-10-21' })

    expect(months).toHaveLength(12)
    expect(months[0]!.month).toBe('2025-11')
    expect(months.at(-1)!.month).toBe('2026-10')
    expect(months.find((m) => m.month === '2026-03')!.revenue).toEqual([createMonetaryAmount(1200)])
  })

  it('writes a BOM, semicolons, and amount plus currency columns', () => {
    const csv = toStatisticsCsv(
      { startDay: '2026-10-01', endDay: '2026-10-31' },
      [
        {
          assetTypeId: 1,
          name: 'Píla; "ručná"',
          rentals: 2,
          rentedDays: 5,
          utilisation: 0.25,
          pool: 1,
          revenue: [createMonetaryAmount(12550)],
          unmetDemandDays: 1,
        },
      ],
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'],
    )
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toContain('2026-10-01;2026-10-31;"Píla; ""ručná""";2;5;25,0;125,50;EUR;1')
  })
})
