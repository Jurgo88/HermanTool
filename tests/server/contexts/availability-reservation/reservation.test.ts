import { beforeEach, describe, expect, it } from 'vitest'
import type { TenantId } from '../../../../server/contexts/_shared'
import {
  AssetTypeUnavailableError,
  EmptyReservationGroupError,
  ReservationGroupNotFoundError,
  ReservationGroupReacquireFailedError,
  ReservationNotActiveError,
  ReservationNotFoundError,
} from '../../../../server/contexts/availability-reservation/types'
import { InvalidRentalPeriodError } from '../../../../server/contexts/availability-reservation/rental-period'
import {
  cancelReservation,
  checkoutReservationGroup,
  confirmReservationGroup,
  getAvailableCount,
  sweepExpiredReservations,
} from '../../../../server/contexts/availability-reservation/reservation'
import {
  createFakeAvailabilityReservationRepository,
  type FakeAvailabilityReservationRepository,
} from './fake-repository'

const tenantA = '11111111-1111-1111-1111-111111111111' as TenantId
const tenantB = '22222222-2222-2222-2222-222222222222' as TenantId

const HAMMER = 1
const SCAFFOLD = 2

describe('checkoutReservationGroup', () => {
  let repo: FakeAvailabilityReservationRepository

  beforeEach(() => {
    repo = createFakeAvailabilityReservationRepository()
    repo.seedCapacity(HAMMER, 1)
    repo.seedCapacity(SCAFFOLD, 1)
  })

  it('produces one ReservationGroup and n Pending Reservations for n AssetTypes (D-13, FR-06, FR-07)', async () => {
    const { group, reservations } = await checkoutReservationGroup(repo, {
      tenantId: tenantA,
      lines: [
        { assetTypeId: HAMMER, period: { startDay: '2026-03-05', endDay: '2026-03-07' } },
        { assetTypeId: SCAFFOLD, period: { startDay: '2026-03-05', endDay: '2026-03-12' } },
      ],
    })

    expect(reservations).toHaveLength(2)
    expect(reservations.every((r) => r.reservationGroupId === group.id)).toBe(true)
    expect(reservations.every((r) => r.state === 'pending')).toBe(true)
  })

  it('holds exactly the RentalPeriod\'s inclusive days, and no more (D-09, A-05)', async () => {
    await checkoutReservationGroup(repo, {
      tenantId: tenantA,
      lines: [{ assetTypeId: HAMMER, period: { startDay: '2026-03-05', endDay: '2026-03-07' } }],
    })

    expect(repo.getHeldCount(tenantA, HAMMER, '2026-03-05')).toBe(1)
    expect(repo.getHeldCount(tenantA, HAMMER, '2026-03-06')).toBe(1)
    expect(repo.getHeldCount(tenantA, HAMMER, '2026-03-07')).toBe(1)
    // D-09: the Asset rejoins the pool the day AFTER the RentalPeriod —
    // the 8th must never be held by this Reservation.
    expect(repo.getHeldCount(tenantA, HAMMER, '2026-03-08')).toBe(0)
  })

  it('refuses a checkout with no lines (D-13)', async () => {
    await expect(checkoutReservationGroup(repo, { tenantId: tenantA, lines: [] })).rejects.toThrow(
      EmptyReservationGroupError,
    )
  })

  it('refuses an inverted RentalPeriod (A-05)', async () => {
    await expect(
      checkoutReservationGroup(repo, {
        tenantId: tenantA,
        lines: [{ assetTypeId: HAMMER, period: { startDay: '2026-03-07', endDay: '2026-03-05' } }],
      }),
    ).rejects.toThrow(InvalidRentalPeriodError)
  })

  it('refuses a day with no Rentable capacity left (D-08, strict, no buffer)', async () => {
    await checkoutReservationGroup(repo, {
      tenantId: tenantA,
      lines: [{ assetTypeId: HAMMER, period: { startDay: '2026-03-05', endDay: '2026-03-05' } }],
    })

    await expect(
      checkoutReservationGroup(repo, {
        tenantId: tenantA,
        lines: [{ assetTypeId: HAMMER, period: { startDay: '2026-03-05', endDay: '2026-03-05' } }],
      }),
    ).rejects.toThrow(AssetTypeUnavailableError)
  })

  it('rolls back every line in the checkout when any single line fails (whole-checkout atomicity)', async () => {
    // Exhaust SCAFFOLD's only unit on 12 March first.
    await checkoutReservationGroup(repo, {
      tenantId: tenantA,
      lines: [{ assetTypeId: SCAFFOLD, period: { startDay: '2026-03-12', endDay: '2026-03-12' } }],
    })

    await expect(
      checkoutReservationGroup(repo, {
        tenantId: tenantA,
        lines: [
          { assetTypeId: HAMMER, period: { startDay: '2026-03-05', endDay: '2026-03-07' } },
          { assetTypeId: SCAFFOLD, period: { startDay: '2026-03-12', endDay: '2026-03-12' } },
        ],
      }),
    ).rejects.toThrow(AssetTypeUnavailableError)

    // HAMMER's line succeeded before SCAFFOLD's failed — its hold and
    // Reservation row must not survive the rollback.
    expect(repo.getHeldCount(tenantA, HAMMER, '2026-03-05')).toBe(0)
    expect(repo.allReservations().filter((r) => r.assetTypeId === HAMMER)).toHaveLength(0)
  })

  it('reaps a stale unswept Pending before refusing a contended day (D-33 reap-on-contention, D-25 lazy expiry)', async () => {
    // Comfortably past PENDING_EXPIRY_MINUTES (30) so pendingExpiresAt
    // (past + 30min) is itself already in the past, not just close to now.
    const past = new Date(Date.now() - 45 * 60_000)
    const { reservations: stale } = await checkoutReservationGroup(repo, {
      tenantId: tenantA,
      lines: [{ assetTypeId: HAMMER, period: { startDay: '2026-03-05', endDay: '2026-03-05' } }],
      now: past,
    })
    expect(stale[0]!.state).toBe('pending')

    const { reservations: fresh } = await checkoutReservationGroup(repo, {
      tenantId: tenantA,
      lines: [{ assetTypeId: HAMMER, period: { startDay: '2026-03-05', endDay: '2026-03-05' } }],
    })

    expect(fresh[0]!.state).toBe('pending')
    const staleAfter = await repo.getReservation(tenantA, stale[0]!.id)
    expect(staleAfter!.state).toBe('expired')
    // Exactly one hold outstanding for the day — the reaped Reservation's
    // hold was released, not left inflating the count alongside the new one.
    expect(repo.getHeldCount(tenantA, HAMMER, '2026-03-05')).toBe(1)
  })

  it('never lets Tenant B\'s checkout consume Tenant A\'s Rentable capacity or vice versa (FR-33)', async () => {
    await checkoutReservationGroup(repo, {
      tenantId: tenantA,
      lines: [{ assetTypeId: HAMMER, period: { startDay: '2026-03-05', endDay: '2026-03-05' } }],
    })

    // Same AssetType id, different Tenant, same capacity seed (capacities
    // aren't tenant-scoped in this fake's seeding, matching a real
    // Rentable count query which is itself tenant-scoped per FR-33) —
    // Tenant B's own unit is untouched by Tenant A's hold.
    const { reservations } = await checkoutReservationGroup(repo, {
      tenantId: tenantB,
      lines: [{ assetTypeId: HAMMER, period: { startDay: '2026-03-05', endDay: '2026-03-05' } }],
    })
    expect(reservations[0]!.state).toBe('pending')
  })
})

describe('confirmReservationGroup', () => {
  let repo: FakeAvailabilityReservationRepository

  beforeEach(() => {
    repo = createFakeAvailabilityReservationRepository()
    repo.seedCapacity(HAMMER, 1)
  })

  it('confirms every Reservation in the group on payment (FR-10)', async () => {
    const { group } = await checkoutReservationGroup(repo, {
      tenantId: tenantA,
      lines: [{ assetTypeId: HAMMER, period: { startDay: '2026-03-05', endDay: '2026-03-07' } }],
    })

    const confirmed = await confirmReservationGroup(repo, { tenantId: tenantA, reservationGroupId: group.id })

    expect(confirmed).toHaveLength(1)
    expect(confirmed[0]!.state).toBe('confirmed')
  })

  it('rejects a ReservationGroup that does not exist for the Tenant', async () => {
    await expect(
      confirmReservationGroup(repo, { tenantId: tenantA, reservationGroupId: 999 }),
    ).rejects.toThrow(ReservationGroupNotFoundError)
  })

  it('re-acquires and confirms a Reservation whose Pending window already lapsed (D-37, Finding 3)', async () => {
    // Comfortably past PENDING_EXPIRY_MINUTES (30) so pendingExpiresAt
    // (past + 30min) is itself already in the past, not just close to now.
    const past = new Date(Date.now() - 45 * 60_000)
    const { group } = await checkoutReservationGroup(repo, {
      tenantId: tenantA,
      lines: [{ assetTypeId: HAMMER, period: { startDay: '2026-03-05', endDay: '2026-03-05' } }],
      now: past,
    })

    const confirmed = await confirmReservationGroup(repo, { tenantId: tenantA, reservationGroupId: group.id })

    expect(confirmed[0]!.state).toBe('confirmed')
    expect(repo.getHeldCount(tenantA, HAMMER, '2026-03-05')).toBe(1)
  })

  it('confirms nothing in the group if re-acquiring any one Reservation fails (whole-group atomicity)', async () => {
    // Comfortably past PENDING_EXPIRY_MINUTES (30) so pendingExpiresAt
    // (past + 30min) is itself already in the past, not just close to now.
    const past = new Date(Date.now() - 45 * 60_000)
    const { group } = await checkoutReservationGroup(repo, {
      tenantId: tenantA,
      lines: [{ assetTypeId: HAMMER, period: { startDay: '2026-03-05', endDay: '2026-03-05' } }],
      now: past,
    })

    // A second Customer takes the only unit while the first Reservation's
    // window is lapsed but unswept — this is the day the first payment's
    // re-acquire attempt will find gone.
    await checkoutReservationGroup(repo, {
      tenantId: tenantA,
      lines: [{ assetTypeId: HAMMER, period: { startDay: '2026-03-05', endDay: '2026-03-05' } }],
    })

    await expect(
      confirmReservationGroup(repo, { tenantId: tenantA, reservationGroupId: group.id }),
    ).rejects.toThrow(ReservationGroupReacquireFailedError)
  })
})

describe('cancelReservation (mechanics only — D-13, W11 workflow deliberately unbuilt)', () => {
  let repo: FakeAvailabilityReservationRepository

  beforeEach(() => {
    repo = createFakeAvailabilityReservationRepository()
    repo.seedCapacity(HAMMER, 1)
  })

  it('releases a Pending Reservation\'s held days and marks it Cancelled', async () => {
    const { reservations } = await checkoutReservationGroup(repo, {
      tenantId: tenantA,
      lines: [{ assetTypeId: HAMMER, period: { startDay: '2026-03-05', endDay: '2026-03-06' } }],
    })

    const cancelled = await cancelReservation(repo, { tenantId: tenantA, reservationId: reservations[0]!.id })

    expect(cancelled.state).toBe('cancelled')
    expect(repo.getHeldCount(tenantA, HAMMER, '2026-03-05')).toBe(0)
    expect(repo.getHeldCount(tenantA, HAMMER, '2026-03-06')).toBe(0)
  })

  it('releases a Confirmed Reservation\'s held days too', async () => {
    const { group, reservations } = await checkoutReservationGroup(repo, {
      tenantId: tenantA,
      lines: [{ assetTypeId: HAMMER, period: { startDay: '2026-03-05', endDay: '2026-03-05' } }],
    })
    await confirmReservationGroup(repo, { tenantId: tenantA, reservationGroupId: group.id })

    await cancelReservation(repo, { tenantId: tenantA, reservationId: reservations[0]!.id })

    expect(repo.getHeldCount(tenantA, HAMMER, '2026-03-05')).toBe(0)
  })

  it('rejects cancelling a Reservation that does not exist for the Tenant', async () => {
    await expect(cancelReservation(repo, { tenantId: tenantA, reservationId: 999 })).rejects.toThrow(
      ReservationNotFoundError,
    )
  })

  it('rejects cancelling an already-Cancelled Reservation (no double release, D-18)', async () => {
    const { reservations } = await checkoutReservationGroup(repo, {
      tenantId: tenantA,
      lines: [{ assetTypeId: HAMMER, period: { startDay: '2026-03-05', endDay: '2026-03-05' } }],
    })
    await cancelReservation(repo, { tenantId: tenantA, reservationId: reservations[0]!.id })

    await expect(
      cancelReservation(repo, { tenantId: tenantA, reservationId: reservations[0]!.id }),
    ).rejects.toThrow(ReservationNotActiveError)
  })
})

describe('getAvailableCount (FR-03, read-side — independent of the D-33 holds counter)', () => {
  let repo: FakeAvailabilityReservationRepository

  beforeEach(() => {
    repo = createFakeAvailabilityReservationRepository()
    repo.seedCapacity(HAMMER, 3)
  })

  it('computes Rentable minus active Reservations for the day', async () => {
    await checkoutReservationGroup(repo, {
      tenantId: tenantA,
      lines: [{ assetTypeId: HAMMER, period: { startDay: '2026-03-05', endDay: '2026-03-05' } }],
    })

    const available = await getAvailableCount(
      repo,
      async (_tenantId, assetTypeId) => (assetTypeId === HAMMER ? 3 : 0),
      { tenantId: tenantA, assetTypeId: HAMMER, day: '2026-03-05' },
    )

    expect(available).toBe(2)
  })

  it('excludes an unswept-but-expired Pending, matching D-25 lazy evaluation', async () => {
    // Comfortably past PENDING_EXPIRY_MINUTES (30) so pendingExpiresAt
    // (past + 30min) is itself already in the past, not just close to now.
    const past = new Date(Date.now() - 45 * 60_000)
    await checkoutReservationGroup(repo, {
      tenantId: tenantA,
      lines: [{ assetTypeId: HAMMER, period: { startDay: '2026-03-05', endDay: '2026-03-05' } }],
      now: past,
    })

    const available = await getAvailableCount(
      repo,
      async (_tenantId, assetTypeId) => (assetTypeId === HAMMER ? 3 : 0),
      { tenantId: tenantA, assetTypeId: HAMMER, day: '2026-03-05' },
    )

    // The stale Pending's state column hasn't been swept — still
    // 'pending' in the record — but lazy evaluation excludes it anyway.
    expect(available).toBe(3)
  })
})

describe('sweepExpiredReservations (D-25 §14.2, Finding 3, FR-08 — the proactive sweep)', () => {
  let repo: FakeAvailabilityReservationRepository

  beforeEach(() => {
    repo = createFakeAvailabilityReservationRepository()
    repo.seedCapacity(HAMMER, 1)
    repo.seedCapacity(SCAFFOLD, 1)
  })

  it('expires a lapsed Pending Reservation and releases every day it held', async () => {
    const past = new Date(Date.now() - 45 * 60_000)
    const { reservations } = await checkoutReservationGroup(repo, {
      tenantId: tenantA,
      lines: [{ assetTypeId: HAMMER, period: { startDay: '2026-03-05', endDay: '2026-03-07' } }],
      now: past,
    })

    const swept = await sweepExpiredReservations(repo, { tenantId: tenantA })

    expect(swept.map((r) => r.id)).toEqual([reservations[0]!.id])
    expect(swept[0]!.state).toBe('expired')
    expect(repo.getHeldCount(tenantA, HAMMER, '2026-03-05')).toBe(0)
    expect(repo.getHeldCount(tenantA, HAMMER, '2026-03-06')).toBe(0)
    expect(repo.getHeldCount(tenantA, HAMMER, '2026-03-07')).toBe(0)
  })

  it('leaves a Pending Reservation whose window has not lapsed untouched', async () => {
    const { reservations } = await checkoutReservationGroup(repo, {
      tenantId: tenantA,
      lines: [{ assetTypeId: HAMMER, period: { startDay: '2026-03-05', endDay: '2026-03-05' } }],
    })

    const swept = await sweepExpiredReservations(repo, { tenantId: tenantA })

    expect(swept).toHaveLength(0)
    const stillPending = await repo.getReservation(tenantA, reservations[0]!.id)
    expect(stillPending!.state).toBe('pending')
    expect(repo.getHeldCount(tenantA, HAMMER, '2026-03-05')).toBe(1)
  })

  it('leaves Confirmed Reservations untouched, even ones long past their RentalPeriod', async () => {
    const past = new Date(Date.now() - 45 * 60_000)
    const { group, reservations } = await checkoutReservationGroup(repo, {
      tenantId: tenantA,
      lines: [{ assetTypeId: HAMMER, period: { startDay: '2026-03-05', endDay: '2026-03-05' } }],
      now: past,
    })
    await confirmReservationGroup(repo, { tenantId: tenantA, reservationGroupId: group.id })

    const swept = await sweepExpiredReservations(repo, { tenantId: tenantA })

    expect(swept).toHaveLength(0)
    const stillConfirmed = await repo.getReservation(tenantA, reservations[0]!.id)
    expect(stillConfirmed!.state).toBe('confirmed')
  })

  it('sweeps every lapsed Pending Reservation across different AssetTypes in one call', async () => {
    const past = new Date(Date.now() - 45 * 60_000)
    const hammerCheckout = await checkoutReservationGroup(repo, {
      tenantId: tenantA,
      lines: [{ assetTypeId: HAMMER, period: { startDay: '2026-03-05', endDay: '2026-03-05' } }],
      now: past,
    })
    const scaffoldCheckout = await checkoutReservationGroup(repo, {
      tenantId: tenantA,
      lines: [{ assetTypeId: SCAFFOLD, period: { startDay: '2026-03-10', endDay: '2026-03-10' } }],
      now: past,
    })

    const swept = await sweepExpiredReservations(repo, { tenantId: tenantA })

    expect(swept.map((r) => r.id).sort()).toEqual(
      [hammerCheckout.reservations[0]!.id, scaffoldCheckout.reservations[0]!.id].sort(),
    )
  })

  it('never sweeps another Tenant\'s lapsed Pending Reservations (FR-33)', async () => {
    const past = new Date(Date.now() - 45 * 60_000)
    await checkoutReservationGroup(repo, {
      tenantId: tenantB,
      lines: [{ assetTypeId: HAMMER, period: { startDay: '2026-03-05', endDay: '2026-03-05' } }],
      now: past,
    })

    const swept = await sweepExpiredReservations(repo, { tenantId: tenantA })

    expect(swept).toHaveLength(0)
  })
})
