import { beforeEach, describe, expect, it } from 'vitest'
import type { TenantId } from '../../../../server/contexts/_shared'
import {
  availabilityLevel,
  getAvailabilityMonth,
} from '../../../../server/contexts/availability-reservation/availability-calendar'
import {
  eachDayOfMonth,
  InvalidMonthError,
  shiftMonth,
  todayRentalDay,
  weekdayOf,
} from '../../../../server/contexts/availability-reservation/rental-period'
import { checkoutReservationGroup } from '../../../../server/contexts/availability-reservation/reservation'
import {
  createFakeAvailabilityReservationRepository,
  type FakeAvailabilityReservationRepository,
} from './fake-repository'

const tenantA = '11111111-1111-1111-1111-111111111111' as TenantId
const DRILL = 1
const SAW = 2

describe('month arithmetic (D-12: RentalPeriod owns it)', () => {
  it('enumerates every day of a month, leap years included', () => {
    expect(eachDayOfMonth('2026-10')).toHaveLength(31)
    expect(eachDayOfMonth('2028-02').at(-1)).toBe('2028-02-29')
    expect(eachDayOfMonth('2026-02').at(-1)).toBe('2026-02-28')
  })

  it('shifts across year boundaries', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })

  it('numbers weekdays Monday 1 … Sunday 7', () => {
    expect(weekdayOf('2026-10-05')).toBe(1)
    expect(weekdayOf('2026-10-11')).toBe(7)
  })

  it('refuses a malformed month', () => {
    for (const bad of ['2026-13', '2026-1', '26-10', '2026-10-01']) {
      expect(() => eachDayOfMonth(bad)).toThrow(InvalidMonthError)
    }
  })
})

describe('todayRentalDay (A-04)', () => {
  it('is the Bratislava calendar day, not the UTC one', () => {
    // 22:30 UTC on 30 Sep is 00:30 on 1 Oct in Bratislava (CEST, UTC+2).
    expect(todayRentalDay(new Date('2026-09-30T22:30:00Z'))).toBe('2026-10-01')
    // 23:30 UTC on 31 Jan is 00:30 on 1 Feb in Bratislava (CET, UTC+1).
    expect(todayRentalDay(new Date('2026-01-31T23:30:00Z'))).toBe('2026-02-01')
    expect(todayRentalDay(new Date('2026-10-01T10:00:00Z'))).toBe('2026-10-01')
  })
})

describe('availabilityLevel (D-58)', () => {
  it('is none when nothing is free', () => {
    expect(availabilityLevel(0, 3)).toBe('none')
    expect(availabilityLevel(0, 0)).toBe('none')
  })

  it('is last only for the final unit of several', () => {
    expect(availabilityLevel(1, 3)).toBe('last')
    expect(availabilityLevel(1, 1)).toBe('free')
    expect(availabilityLevel(2, 3)).toBe('free')
  })
})

describe('getAvailabilityMonth (D-58, FR-03)', () => {
  let repo: FakeAvailabilityReservationRepository

  beforeEach(() => {
    repo = createFakeAvailabilityReservationRepository()
    repo.seedCapacity(DRILL, 2)
    repo.seedCapacity(SAW, 1)
  })

  const month = (assetTypeId: number, monthKey = '2026-10', today = '2026-10-01') =>
    repo.transaction((trx, getPool) =>
      getAvailabilityMonth(trx, getPool, {
        tenantId: tenantA,
        assetTypeId,
        month: monthKey,
        today,
      }),
    )

  it('derives free / last / none per day from the pool minus active Reservations', async () => {
    await checkoutReservationGroup(repo, {
      tenantId: tenantA,
      lines: [{ assetTypeId: DRILL, period: { startDay: '2026-10-05', endDay: '2026-10-06' } }],
    })
    await checkoutReservationGroup(repo, {
      tenantId: tenantA,
      lines: [{ assetTypeId: DRILL, period: { startDay: '2026-10-06', endDay: '2026-10-06' } }],
    })

    const levels = new Map((await month(DRILL)).days.map((d) => [d.day, d.level]))
    expect(levels.get('2026-10-04')).toBe('free')
    expect(levels.get('2026-10-05')).toBe('last')
    expect(levels.get('2026-10-06')).toBe('none')
    expect(levels.get('2026-10-07')).toBe('free')
  })

  it('never says "last" for a pool of one', async () => {
    const days = (await month(SAW)).days
    expect(days.every((d) => d.level === 'free')).toBe(true)
  })

  it('marks days before today as not selectable, with no level', async () => {
    const days = (await month(DRILL, '2026-10', '2026-10-15')).days
    expect(days.find((d) => d.day === '2026-10-14')).toMatchObject({
      selectable: false,
      level: null,
    })
    expect(days.find((d) => d.day === '2026-10-15')).toMatchObject({
      selectable: true,
      level: 'free',
    })
  })

  it('gives weekdays and the neighbouring months, with no way back into the past', async () => {
    const current = await month(DRILL, '2026-10', '2026-10-15')
    expect(current.days[0]).toMatchObject({ day: '2026-10-01', weekday: 4 })
    expect(current.previousMonth).toBeNull()
    expect(current.nextMonth).toBe('2026-11')

    const next = await month(DRILL, '2026-11', '2026-10-15')
    expect(next.previousMonth).toBe('2026-10')
  })
})
