import { describe, expect, it } from 'vitest'
import { checkoutPaymentStatus } from '../../../server/utils/checkout-payment-status'

const now = new Date('2026-10-12T12:00:00Z')
const pendingUntil = (iso: string) => ({ state: 'pending' as const, pendingExpiresAt: new Date(iso) })

describe('checkoutPaymentStatus (#190, S-05)', () => {
  it('is payable while every Reservation is Pending inside its window, held until the earliest expiry', () => {
    const status = checkoutPaymentStatus(
      [pendingUntil('2026-10-12T12:25:00Z'), pendingUntil('2026-10-12T12:20:00Z')],
      [{ status: 'failed' }, { status: 'pending' }],
      now,
    )
    expect(status).toEqual({ state: 'payable', holdUntil: '2026-10-12T12:20:00.000Z' })
  })

  it('is paid once a Payment succeeded, or every Reservation is confirmed', () => {
    expect(checkoutPaymentStatus([pendingUntil('2026-10-12T12:20:00Z')], [{ status: 'succeeded' }], now).state).toBe('paid')
    expect(
      checkoutPaymentStatus([{ state: 'confirmed', pendingExpiresAt: new Date('2026-10-12T11:00:00Z') }], [], now).state,
    ).toBe('paid')
  })

  it('is expired when any hold has lapsed or been released', () => {
    expect(checkoutPaymentStatus([pendingUntil('2026-10-12T11:59:00Z')], [], now)).toEqual({
      state: 'expired',
      holdUntil: null,
    })
    expect(
      checkoutPaymentStatus(
        [pendingUntil('2026-10-12T12:20:00Z'), { state: 'expired', pendingExpiresAt: new Date('2026-10-12T11:00:00Z') }],
        [],
        now,
      ).state,
    ).toBe('expired')
    expect(checkoutPaymentStatus([], [], now).state).toBe('expired')
  })
})
