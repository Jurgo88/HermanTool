// The S-02 month calendar (D-58; FR-02, FR-03, D-38). A read for display,
// never an enforcement: D-33's conditional hold at checkout remains the
// only authority, so this needs no transaction and may race.
//
// Levels are derived facts (FR-28 treatment, D-47), computed here so the
// browser neither does date arithmetic (D-51) nor sees unit counts.
import type { TenantId } from '../_shared'
import type { AvailabilityReservationRepository, CapacitySource } from './repository'
import { eachDayOfMonth, monthOfDay, shiftMonth, weekdayOf } from './rental-period'
import { getAvailableCount } from './reservation'

export type AvailabilityLevel = 'free' | 'last' | 'none'

export interface AvailabilityDay {
  day: string
  weekday: number
  // false before today: a RentalPeriod cannot start in the past.
  selectable: boolean
  // null for days that are not selectable — there is nothing to offer.
  level: AvailabilityLevel | null
}

export interface AvailabilityMonth {
  month: string
  // null when the previous month is entirely in the past.
  previousMonth: string | null
  nextMonth: string
  days: AvailabilityDay[]
}

// "last" means exactly one unit left of several: with a pool of one,
// every free day would otherwise read as "last", which says nothing.
export function availabilityLevel(available: number, pool: number): AvailabilityLevel {
  if (available <= 0) return 'none'
  if (available === 1 && pool > 1) return 'last'
  return 'free'
}

export async function getAvailabilityMonth(
  repo: AvailabilityReservationRepository,
  getRentablePoolCount: CapacitySource,
  params: { tenantId: TenantId; assetTypeId: number; month: string; today: string },
): Promise<AvailabilityMonth> {
  const { tenantId, assetTypeId, month, today } = params
  const days = eachDayOfMonth(month)

  // D-38: the pool is a fact about the units, not the day — read once and
  // reused, so every day is measured against the same capacity.
  const pool = await getRentablePoolCount(tenantId, assetTypeId)
  const poolOnce: CapacitySource = async () => pool

  const calendar = await Promise.all(
    days.map(async (day): Promise<AvailabilityDay> => {
      const selectable = day >= today
      if (!selectable) return { day, weekday: weekdayOf(day), selectable, level: null }
      const available = await getAvailableCount(repo, poolOnce, { tenantId, assetTypeId, day })
      return { day, weekday: weekdayOf(day), selectable, level: availabilityLevel(available, pool) }
    }),
  )

  const previousMonth = shiftMonth(month, -1)
  return {
    month,
    previousMonth: previousMonth >= monthOfDay(today) ? previousMonth : null,
    nextMonth: shiftMonth(month, 1),
    days: calendar,
  }
}
