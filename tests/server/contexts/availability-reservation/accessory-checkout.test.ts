import { beforeEach, describe, expect, it } from 'vitest'
import type { TenantId } from '../../../../server/contexts/_shared'
import {
  AccessoryWithoutPrincipalError,
  AssetTypeUnavailableError,
} from '../../../../server/contexts/availability-reservation/types'
import {
  assertAccessoriesAccompanied,
  checkoutReservationGroup,
} from '../../../../server/contexts/availability-reservation/reservation'
import {
  createFakeAvailabilityReservationRepository,
  type FakeAvailabilityReservationRepository,
} from './fake-repository'

const tenantA = '11111111-1111-1111-1111-111111111111' as TenantId

const HAMMER = 1
const COMBI = 2
const BITS = 3
const SPEAKER = 4
const MICROPHONE = 5

const week = { startDay: '2026-10-05', endDay: '2026-10-07' }
const weekend = { startDay: '2026-10-10', endDay: '2026-10-11' }
const line = (assetTypeId: number, period = week) => ({ assetTypeId, period })

// D-57: the drill-bit set belongs to either hammer; the microphone to the speaker.
const principals = new Map<number, number[]>([
  [BITS, [HAMMER, COMBI]],
  [MICROPHONE, [SPEAKER]],
])

describe('assertAccessoriesAccompanied (D-57)', () => {
  it('accepts an Accessory with its principal for the same RentalPeriod', () => {
    expect(() => assertAccessoriesAccompanied([line(HAMMER), line(BITS)], principals)).not.toThrow()
  })

  it('accepts any of several principals, counted together', () => {
    expect(() =>
      assertAccessoriesAccompanied([line(HAMMER), line(COMBI), line(BITS), line(BITS)], principals),
    ).not.toThrow()
  })

  it('refuses an Accessory alone', () => {
    expect(() => assertAccessoriesAccompanied([line(BITS)], principals)).toThrow(
      AccessoryWithoutPrincipalError,
    )
  })

  it('refuses an Accessory whose principal is for a different RentalPeriod', () => {
    expect(() =>
      assertAccessoriesAccompanied([line(HAMMER, week), line(BITS, weekend)], principals),
    ).toThrow(AccessoryWithoutPrincipalError)
  })

  it('refuses more Accessory units than principal units', () => {
    expect(() =>
      assertAccessoriesAccompanied([line(HAMMER), line(BITS), line(BITS)], principals),
    ).toThrow(AccessoryWithoutPrincipalError)
  })

  it("does not let another Accessory's principal stand in", () => {
    expect(() => assertAccessoriesAccompanied([line(SPEAKER), line(BITS)], principals)).toThrow(
      AccessoryWithoutPrincipalError,
    )
  })

  it('ignores AssetTypes that are not Accessories', () => {
    expect(() =>
      assertAccessoriesAccompanied([line(SPEAKER), line(HAMMER)], principals),
    ).not.toThrow()
  })
})

describe('checkoutReservationGroup with Accessories (D-57, D-08)', () => {
  let repo: FakeAvailabilityReservationRepository

  beforeEach(() => {
    repo = createFakeAvailabilityReservationRepository()
    for (const id of [HAMMER, COMBI, BITS, SPEAKER, MICROPHONE]) repo.seedCapacity(id, 1)
    repo.seedAccessory(BITS, [HAMMER, COMBI])
    repo.seedAccessory(MICROPHONE, [SPEAKER])
  })

  it('reserves the Accessory as its own Reservation in the same group', async () => {
    const { group, reservations } = await checkoutReservationGroup(repo, {
      tenantId: tenantA,
      lines: [line(HAMMER), line(BITS)],
    })

    expect(reservations.map((r) => r.assetTypeId).sort()).toEqual([HAMMER, BITS].sort())
    expect(reservations.every((r) => r.reservationGroupId === group.id)).toBe(true)
    expect(repo.getHeldCount(tenantA, BITS, week.startDay)).toBe(1)
  })

  it('refuses before holding anything when the Accessory is unaccompanied', async () => {
    await expect(
      checkoutReservationGroup(repo, { tenantId: tenantA, lines: [line(SPEAKER), line(BITS)] }),
    ).rejects.toThrow(AccessoryWithoutPrincipalError)

    expect(repo.allReservations()).toEqual([])
    expect(repo.getHeldCount(tenantA, SPEAKER, week.startDay)).toBe(0)
    expect(repo.getHeldCount(tenantA, BITS, week.startDay)).toBe(0)
  })

  it('still enforces D-08 on the Accessory itself', async () => {
    await checkoutReservationGroup(repo, { tenantId: tenantA, lines: [line(HAMMER), line(BITS)] })

    await expect(
      checkoutReservationGroup(repo, { tenantId: tenantA, lines: [line(COMBI), line(BITS)] }),
    ).rejects.toThrow(AssetTypeUnavailableError)
    expect(repo.getHeldCount(tenantA, COMBI, week.startDay)).toBe(0)
  })
})
