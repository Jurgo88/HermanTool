import { describe, expect, it } from 'vitest'
import {
  createMonetaryAmount,
  InvalidMonetaryAmountError,
} from '../../../../server/contexts/_shared/monetary-amount'

describe('createMonetaryAmount', () => {
  it('creates a MonetaryAmount in minor units with EUR by default (D-21)', () => {
    expect(createMonetaryAmount(1500)).toEqual({ amount: 1500, currency: 'EUR' })
  })

  it('accepts zero as a valid amount', () => {
    expect(createMonetaryAmount(0)).toEqual({ amount: 0, currency: 'EUR' })
  })

  it('rejects a negative amount', () => {
    expect(() => createMonetaryAmount(-100)).toThrow(InvalidMonetaryAmountError)
  })

  it('rejects a non-integer amount, since minor units are always whole (no bare floats)', () => {
    expect(() => createMonetaryAmount(15.5)).toThrow(InvalidMonetaryAmountError)
  })
})
