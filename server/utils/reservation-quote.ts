// The one place a rental fee and a deposit total are computed (FR-09,
// D-07, D-21; issue #164). The S-03 quote and the Stripe amount both go
// through quoteReservationLines, so the page can never show a different
// fee from the one charged. Composes Availability & Reservation's day
// arithmetic, Catalog's rates and Payments' fee sum at the utility layer
// (D-02: none of those contexts imports another for this).
import {
  rentalPeriodLengthInDays,
  validateRentalPeriod,
  type RentalPeriod,
} from '../contexts/availability-reservation'
import { createMonetaryAmount, type MonetaryAmount } from '../contexts/_shared'
import { AssetTypeNotFoundError, type AssetType } from '../contexts/catalog'
import { computeRentalFeeAmount } from '../contexts/payments'

export interface QuoteLine {
  assetTypeId: number
  period: RentalPeriod
  quantity: number
}

export interface QuotedLine extends QuoteLine {
  days: number
  // Set only when the caller passes `today`: a draft kept in the browser
  // can outlive its first day, and the page may not compare dates (D-51).
  startsInPast?: boolean
  rentalFee: MonetaryAmount
  deposit: MonetaryAmount
}

export interface ReservationQuote {
  lines: QuotedLine[]
  rentalFeeTotal: MonetaryAmount
  depositTotal: MonetaryAmount
}

// `lookupAssetType` decides visibility: the public quote only sees
// published AssetTypes, the payment path sees whatever was reserved.
export async function quoteReservationLines(
  lines: QuoteLine[],
  lookupAssetType: (assetTypeId: number) => Promise<AssetType | null>,
  options: { today?: string } = {},
): Promise<ReservationQuote> {
  const quoted: QuotedLine[] = []
  const feeInputs: { dayRate: MonetaryAmount; days: number }[] = []
  for (const line of lines) {
    validateRentalPeriod(line.period)
    const assetType = await lookupAssetType(line.assetTypeId)
    if (!assetType) throw new AssetTypeNotFoundError(line.assetTypeId)
    const days = rentalPeriodLengthInDays(line.period)
    // A unit-day is the unit of charge (RentalDay); quantity units of the
    // same AssetType and period are quantity × days of it.
    const feeInput = { dayRate: assetType.dayRate, days: days * line.quantity }
    feeInputs.push(feeInput)
    quoted.push({
      ...line,
      days,
      ...(options.today ? { startsInPast: line.period.startDay < options.today } : {}),
      rentalFee: computeRentalFeeAmount([feeInput]),
      deposit: createMonetaryAmount(
        assetType.depositAmount.amount * line.quantity,
        assetType.depositAmount.currency,
      ),
    })
  }

  return {
    lines: quoted,
    rentalFeeTotal: computeRentalFeeAmount(feeInputs),
    depositTotal: sumAmounts(quoted.map((line) => line.deposit)),
  }
}

// D-21: amounts are summed only within one currency.
function sumAmounts(amounts: MonetaryAmount[]): MonetaryAmount {
  const currency = amounts[0]?.currency ?? 'EUR'
  if (amounts.some((amount) => amount.currency !== currency)) {
    throw new Error('Mixed currencies in one ReservationGroup deposit total.')
  }
  return createMonetaryAmount(
    amounts.reduce((sum, amount) => sum + amount.amount, 0),
    currency,
  )
}
