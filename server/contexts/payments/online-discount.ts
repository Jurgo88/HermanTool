// The discount for paying the rental fee online (D-65; issue #215).
//
// One Tenant policy value, in basis points (1000 = 10 %), applied to the
// rental fee only — never to a deposit (D-07: the deposit is not Payments'
// money at all) and never to a Delivery fee (D-66). Not a pricing engine:
// Pricing & Promotions stays [Future]. The value itself is the Tenant's to
// set (OQ #31); null means "not set" and no discount applies.
import { createMonetaryAmount, type MonetaryAmount } from '../_shared'

export const MAX_ONLINE_DISCOUNT_BASIS_POINTS = 9999

export class InvalidOnlineDiscountError extends Error {
  constructor(basisPoints: number) {
    super(
      `An online-payment discount must be 1–${MAX_ONLINE_DISCOUNT_BASIS_POINTS} basis points; got ${basisPoints}.`,
    )
    this.name = new.target.name
  }
}

export function assertValidOnlineDiscount(basisPoints: number | null): void {
  if (basisPoints === null) return
  if (
    !Number.isInteger(basisPoints) ||
    basisPoints < 1 ||
    basisPoints > MAX_ONLINE_DISCOUNT_BASIS_POINTS
  ) {
    throw new InvalidOnlineDiscountError(basisPoints)
  }
}

// The fee a Customer pays online, and the discount taken off it. The
// discount is rounded half up to the cent, so 10 % of 25,00 € is 2,50 €
// and of 0,05 € is 0,01 €. Same currency in and out (D-21).
export function applyOnlinePaymentDiscount(
  rentalFee: MonetaryAmount,
  basisPoints: number | null,
): { rentalFee: MonetaryAmount; discount: MonetaryAmount } {
  assertValidOnlineDiscount(basisPoints)
  const discountCents =
    basisPoints === null ? 0 : Math.round((rentalFee.amount * basisPoints) / 10_000)
  return {
    rentalFee: createMonetaryAmount(rentalFee.amount - discountCents, rentalFee.currency),
    discount: createMonetaryAmount(discountCents, rentalFee.currency),
  }
}
