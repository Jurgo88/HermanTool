// Nearest RentalPeriods in which several AssetTypes all have capacity
// (D-62; issue #210). When a CompatibleAssetType is not free for the
// period a Visitor picked on S-02, the page offers the nearest periods of
// the same length in which both are — never the compatible one alone on
// another period.
//
// A read for display, like the S-02 calendar: no transaction, may race.
// D-33's conditional hold at checkout stays the only authority, so a
// suggested period can still be lost there. Capacity is the D-38 pool
// minus active Reservations, exactly as getAvailableCountsForPeriod
// computes it — a period is proposed only when every one of its days has
// at least the demanded units of every AssetType.
//
// Date arithmetic lives here and in ./rental-period.ts only (D-12).
import type { TenantId } from '../_shared'
import type { AvailabilityReservationRepository, CapacitySource } from './repository'
import {
  addRentalDays,
  eachDayOfPeriod,
  shiftRentalPeriod,
  validateRentalPeriod,
  type RentalPeriod,
} from './rental-period'
import { getAvailableCountsForPeriod } from './reservation'

// How far either side of the picked period the search looks, and how
// many periods it proposes. Presentation bounds for S-02, not business
// policy: a suggestion three months away is no longer "nearest".
export const NEAREST_JOINT_PERIODS_HORIZON_DAYS = 60
export const NEAREST_JOINT_PERIODS_LIMIT = 3

export interface JointDemand {
  assetTypeId: number
  units: number
}

export async function findNearestJointPeriods(
  repo: AvailabilityReservationRepository,
  getRentablePoolCount: CapacitySource,
  params: {
    tenantId: TenantId
    demands: JointDemand[]
    period: RentalPeriod
    today: string
    horizonDays?: number
    limit?: number
  },
): Promise<RentalPeriod[]> {
  const {
    tenantId,
    demands,
    period,
    today,
    horizonDays = NEAREST_JOINT_PERIODS_HORIZON_DAYS,
    limit = NEAREST_JOINT_PERIODS_LIMIT,
  } = params
  validateRentalPeriod(period)
  if (demands.length === 0) return []

  const earliestStart = [addRentalDays(period.startDay, -horizonDays), today].sort().at(-1)!
  const window: RentalPeriod = {
    startDay: earliestStart,
    endDay: addRentalDays(period.endDay, horizonDays),
  }
  if (window.startDay > window.endDay) return []

  // One count query per AssetType for the whole window, then a day is
  // "open" when every demand fits on it.
  const perAssetType = await Promise.all(
    demands.map((demand) =>
      getAvailableCountsForPeriod(repo, getRentablePoolCount, {
        tenantId,
        assetTypeId: demand.assetTypeId,
        period: window,
      }),
    ),
  )
  const open = new Set(
    eachDayOfPeriod(window).filter((day) =>
      perAssetType.every((counts, i) => {
        const entry = counts.find((c) => c.day === day)
        return entry !== undefined && entry.available >= demands[i]!.units
      }),
    ),
  )

  // Nearest first: one day later, one day earlier, two days later, …
  const offsets: number[] = []
  for (let distance = 1; distance <= horizonDays; distance++) offsets.push(distance, -distance)

  const found: RentalPeriod[] = []
  for (const offset of offsets) {
    const candidate = shiftRentalPeriod(period, offset)
    if (candidate.startDay < today) continue
    if (eachDayOfPeriod(candidate).every((day) => open.has(day))) found.push(candidate)
    if (found.length === limit) break
  }

  return found.sort((a, b) => a.startDay.localeCompare(b.startDay))
}
