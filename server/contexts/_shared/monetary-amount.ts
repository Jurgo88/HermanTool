// MonetaryAmount (D-21, Part 3 §12, glossary): a quantity of money
// together with the currency it is denominated in. Neither half exists
// without the other — there is no bare amount anywhere in this model.
//
// `amount` is stored in minor units (cents), always an integer. This
// matches the precision-avoidance pattern the Asset Registry migration
// already established for ids (`integer` rather than `bigint`, so
// postgres.js returns a plain JS number instead of a string): a Postgres
// `numeric` column would have the same string-return problem, and float
// arithmetic on major units risks rounding errors on records that must
// be defensible in a dispute (P4).
export type CurrencyCode = 'EUR'

export interface MonetaryAmount {
  amount: number
  currency: CurrencyCode
}

export class InvalidMonetaryAmountError extends Error {
  constructor(amount: number) {
    super(`MonetaryAmount amount must be a non-negative integer (minor units); got ${amount}.`)
    this.name = new.target.name
  }
}

export function createMonetaryAmount(amount: number, currency: CurrencyCode = 'EUR'): MonetaryAmount {
  if (!Number.isInteger(amount) || amount < 0) throw new InvalidMonetaryAmountError(amount)
  return { amount, currency }
}
