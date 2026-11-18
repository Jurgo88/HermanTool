import { beforeEach, describe, expect, it } from 'vitest'
import type { TenantId } from '../../../../server/contexts/_shared'
import { findNearestJointPeriods } from '../../../../server/contexts/availability-reservation/joint-availability'
import {
  addRentalDays,
  eachDayOfPeriod,
  shiftRentalPeriod,
} from '../../../../server/contexts/availability-reservation/rental-period'
import {
  checkoutReservationGroup,
  getAvailableCountsForPeriod,
} from '../../../../server/contexts/availability-reservation/reservation'
import {
  AccessoryWithoutPrincipalError,
  AssetTypeUnavailableError,
} from '../../../../server/contexts/availability-reservation/types'
import {
  createFakeAvailabilityReservationRepository,
  type FakeAvailabilityReservationRepository,
} from './fake-repository'

const tenantA = '11111111-1111-1111-1111-111111111111' as TenantId
const tenantB = '22222222-2222-2222-2222-222222222222' as TenantId

// D-62: the surface attachment suits the washer; both are standalone.
const WASHER = 1
const SURFACE = 2
// D-57 contrast: the microphone is an Accessory of the speaker.
const SPEAKER = 3
const MICROPHONE = 4

const today = '2026-10-01'
const picked = { startDay: '2026-10-10', endDay: '2026-10-11' }

let repo: FakeAvailabilityReservationRepository

const occupy = (
  assetTypeId: number,
  period: { startDay: string; endDay: string },
  tenantId = tenantA,
) => checkoutReservationGroup(repo, { tenantId, lines: [{ assetTypeId, period }] })

const nearest = (period = picked, units = 1, tenantId = tenantA) =>
  findNearestJointPeriods(repo, repo.readRentablePoolCount, {
    tenantId,
    demands: [
      { assetTypeId: SURFACE, units },
      { assetTypeId: WASHER, units: 1 },
    ],
    period,
    today,
  })

beforeEach(() => {
  repo = createFakeAvailabilityReservationRepository()
  repo.seedCapacity(WASHER, 1)
  repo.seedCapacity(SURFACE, 2)
})

describe('RentalPeriod shifting (D-12: RentalPeriod owns the arithmetic)', () => {
  it('adds and subtracts RentalDays across month and year ends', () => {
    expect(addRentalDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addRentalDays('2027-01-01', -1)).toBe('2026-12-31')
    expect(addRentalDays('2028-02-28', 1)).toBe('2028-02-29')
  })

  it('keeps a RentalPeriod length when shifting it', () => {
    const shifted = shiftRentalPeriod({ startDay: '2026-10-30', endDay: '2026-11-02' }, 3)
    expect(shifted).toEqual({ startDay: '2026-11-02', endDay: '2026-11-05' })
    expect(eachDayOfPeriod(shifted)).toHaveLength(4)
  })
})

describe('findNearestJointPeriods (D-62)', () => {
  it('offers the nearest same-length periods in which both AssetTypes are free', async () => {
    await occupy(WASHER, picked)

    const periods = await nearest()

    // Nearest first (a day later, a day earlier, two days later, …), then
    // shown in calendar order.
    expect(periods).toEqual([
      { startDay: '2026-10-08', endDay: '2026-10-09' },
      { startDay: '2026-10-12', endDay: '2026-10-13' },
      { startDay: '2026-10-13', endDay: '2026-10-14' },
    ])
  })

  it('never proposes a period in which either AssetType is over capacity (D-08, D-38)', async () => {
    await occupy(WASHER, { startDay: '2026-10-05', endDay: '2026-10-11' })
    await occupy(SURFACE, { startDay: '2026-10-12', endDay: '2026-10-14' })
    await occupy(SURFACE, { startDay: '2026-10-13', endDay: '2026-10-13' })

    const periods = await nearest()

    expect(periods.length).toBeGreaterThan(0)
    for (const period of periods) {
      for (const assetTypeId of [WASHER, SURFACE]) {
        const counts = await getAvailableCountsForPeriod(repo, repo.readRentablePoolCount, {
          tenantId: tenantA,
          assetTypeId,
          period,
        })
        expect(counts.every((c) => c.available >= 1)).toBe(true)
      }
    }
    expect(periods.some((p) => p.startDay <= '2026-10-13' && p.endDay >= '2026-10-13')).toBe(false)
  })

  it('respects the units demanded of the page AssetType', async () => {
    await occupy(WASHER, picked)
    await occupy(SURFACE, { startDay: '2026-10-07', endDay: '2026-10-09' })

    const periods = await nearest(picked, 2)

    for (const period of periods) {
      expect(period.endDay < '2026-10-07' || period.startDay > '2026-10-09').toBe(true)
    }
  })

  it('never proposes a period that starts before today', async () => {
    await occupy(WASHER, { startDay: '2026-10-02', endDay: '2026-10-20' })

    const periods = await nearest({ startDay: '2026-10-02', endDay: '2026-10-03' })

    expect(periods.every((p) => p.startDay >= today)).toBe(true)
    expect(periods[0]).toEqual({ startDay: '2026-10-21', endDay: '2026-10-22' })
  })

  it('returns nothing when no joint period exists inside the horizon', async () => {
    repo.seedCapacity(WASHER, 0)
    expect(await nearest()).toEqual([])
  })

  it("reads only the asking Tenant's Reservations (FR-33)", async () => {
    await occupy(WASHER, picked, tenantB)
    // Tenant B's hold says nothing about Tenant A's calendar.
    const periods = await findNearestJointPeriods(repo, repo.readRentablePoolCount, {
      tenantId: tenantA,
      demands: [{ assetTypeId: WASHER, units: 1 }],
      period: picked,
      today,
      limit: 1,
    })
    expect(periods).toEqual([{ startDay: '2026-10-11', endDay: '2026-10-12' }])
  })
})

describe('checkout and a CompatibleAssetType (D-62 vs D-57)', () => {
  beforeEach(() => {
    repo.seedCapacity(SPEAKER, 1)
    repo.seedCapacity(MICROPHONE, 1)
    repo.seedAccessory(MICROPHONE, [SPEAKER])
  })

  it('does not require the compatible AssetType — the attachment checks out alone', async () => {
    const { reservations } = await checkoutReservationGroup(repo, {
      tenantId: tenantA,
      lines: [{ assetTypeId: SURFACE, period: picked }],
    })
    expect(reservations.map((r) => r.assetTypeId)).toEqual([SURFACE])
  })

  it('in contrast refuses an Accessory without its principal (D-57)', async () => {
    await expect(
      checkoutReservationGroup(repo, {
        tenantId: tenantA,
        lines: [{ assetTypeId: MICROPHONE, period: picked }],
      }),
    ).rejects.toThrow(AccessoryWithoutPrincipalError)
  })

  it('adds the compatible one as an ordinary Reservation through the hold path (D-08, D-33)', async () => {
    const { group, reservations } = await checkoutReservationGroup(repo, {
      tenantId: tenantA,
      lines: [
        { assetTypeId: SURFACE, period: picked },
        { assetTypeId: WASHER, period: picked },
      ],
    })
    expect(reservations.every((r) => r.reservationGroupId === group.id)).toBe(true)
    expect(repo.getHeldCount(tenantA, WASHER, '2026-10-10')).toBe(1)

    // The washer's single unit is now held: a second group cannot take it.
    await expect(occupy(WASHER, picked)).rejects.toThrow(AssetTypeUnavailableError)
  })
})
