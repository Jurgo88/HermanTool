import { beforeEach, describe, expect, it } from 'vitest'
import type { TenantId } from '../../../../server/contexts/_shared'
import {
  checkoutReservationGroup,
  sweepExpiredReservations,
} from '../../../../server/contexts/availability-reservation/reservation'
import { AssetTypeUnavailableError } from '../../../../server/contexts/availability-reservation/types'
import {
  createFakeAvailabilityReservationRepository,
  type FakeAvailabilityReservationRepository,
} from './fake-repository'

const tenantA = '11111111-1111-1111-1111-111111111111' as TenantId
const HAMMER = 1
const day = { startDay: '2026-03-05', endDay: '2026-03-06' }

// D-65: an on-site group holds capacity exactly like an unpaid online
// checkout — Pending with pending_expires_at — and an unconfirmed one
// releases it by the same expiry. D-08, D-33 and D-38 are unchanged.
describe('a ReservationGroup paid on site (D-65 with D-08, D-33)', () => {
  let repo: FakeAvailabilityReservationRepository

  beforeEach(() => {
    repo = createFakeAvailabilityReservationRepository()
    repo.seedCapacity(HAMMER, 1)
  })

  it('records the payment method on the group and holds capacity as Pending', async () => {
    const { group, reservations } = await checkoutReservationGroup(repo, {
      tenantId: tenantA,
      lines: [{ assetTypeId: HAMMER, period: day }],
      paymentMethod: 'on_site',
    })
    expect(group.paymentMethod).toBe('on_site')
    expect(reservations[0]!.state).toBe('pending')
    await expect(
      checkoutReservationGroup(repo, {
        tenantId: tenantA,
        lines: [{ assetTypeId: HAMMER, period: day }],
      }),
    ).rejects.toThrow(AssetTypeUnavailableError)
  })

  it('defaults to online, as every group before D-65 was', async () => {
    const { group } = await checkoutReservationGroup(repo, {
      tenantId: tenantA,
      lines: [{ assetTypeId: HAMMER, period: day }],
    })
    expect(group.paymentMethod).toBe('online')
  })

  it('releases capacity when left unconfirmed past its window', async () => {
    const past = new Date(Date.now() - 45 * 60_000)
    const { reservations } = await checkoutReservationGroup(repo, {
      tenantId: tenantA,
      lines: [{ assetTypeId: HAMMER, period: day }],
      paymentMethod: 'on_site',
      now: past,
    })

    const expired = await sweepExpiredReservations(repo, { tenantId: tenantA })
    expect(expired.map((r) => r.id)).toEqual([reservations[0]!.id])
    expect(repo.getHeldCount(tenantA, HAMMER, '2026-03-05')).toBe(0)

    const next = await checkoutReservationGroup(repo, {
      tenantId: tenantA,
      lines: [{ assetTypeId: HAMMER, period: day }],
    })
    expect(next.reservations[0]!.state).toBe('pending')
  })
})
