import { describe, expect, it } from 'vitest'
import { createMonetaryAmount } from '../../../../server/contexts/_shared'
import {
  InvalidOnlineDiscountError,
  applyOnlinePaymentDiscount,
} from '../../../../server/contexts/payments/online-discount'

describe('applyOnlinePaymentDiscount (D-65, OQ #31)', () => {
  it('applies no discount while the Tenant has set none', () => {
    expect(applyOnlinePaymentDiscount(createMonetaryAmount(2500), null)).toEqual({
      rentalFee: createMonetaryAmount(2500),
      discount: createMonetaryAmount(0),
    })
  })

  it('takes the percentage off the rental fee, rounded half up to the cent (D-21)', () => {
    // 25,00 € at 10 % → 22,50 € online.
    expect(applyOnlinePaymentDiscount(createMonetaryAmount(2500), 1000).rentalFee).toEqual(
      createMonetaryAmount(2250),
    )
    // 0,05 € at 10 % = 0,005 € → 0,01 € off.
    expect(applyOnlinePaymentDiscount(createMonetaryAmount(5), 1000).discount).toEqual(
      createMonetaryAmount(1),
    )
  })

  it('refuses an out-of-range or fractional value', () => {
    for (const bad of [0, 10_000, -5, 12.5]) {
      expect(() => applyOnlinePaymentDiscount(createMonetaryAmount(100), bad)).toThrow(
        InvalidOnlineDiscountError,
      )
    }
  })
})
