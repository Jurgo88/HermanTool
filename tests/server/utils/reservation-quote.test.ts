import { describe, expect, it } from 'vitest'
import { createMonetaryAmount, type TenantId } from '../../../server/contexts/_shared'
import { InvalidRentalPeriodError } from '../../../server/contexts/availability-reservation'
import { AssetTypeNotFoundError, type AssetType } from '../../../server/contexts/catalog'
import { quoteReservationLines } from '../../../server/utils/reservation-quote'

const tenantId = '11111111-1111-1111-1111-111111111111' as TenantId

function assetType(id: number, dayRate: number, deposit: number): AssetType {
  return {
    id,
    tenantId,
    name: `AssetType ${id}`,
    description: '',
    dayRate: createMonetaryAmount(dayRate),
    depositAmount: createMonetaryAmount(deposit),
    published: true,
    createdByOperatorId: null,
    updatedByOperatorId: null,
    updatedAt: new Date(),
  }
}

const catalog = new Map([
  [1, assetType(1, 1500, 7500)],
  [2, assetType(2, 500, 2500)],
])
const lookup = async (id: number) => catalog.get(id) ?? null

describe('quoteReservationLines (FR-09, D-07, #164)', () => {
  it('charges rate × days × units and holds the deposit per unit, not per day', async () => {
    const quote = await quoteReservationLines(
      [
        { assetTypeId: 1, period: { startDay: '2026-10-05', endDay: '2026-10-07' }, quantity: 2 },
        { assetTypeId: 2, period: { startDay: '2026-10-05', endDay: '2026-10-05' }, quantity: 1 },
      ],
      lookup,
    )

    expect(quote.lines.map((line) => line.days)).toEqual([3, 1])
    expect(quote.lines[0]?.rentalFee).toEqual(createMonetaryAmount(1500 * 3 * 2))
    expect(quote.lines[0]?.deposit).toEqual(createMonetaryAmount(7500 * 2))
    expect(quote.rentalFeeTotal).toEqual(createMonetaryAmount(9000 + 500))
    expect(quote.depositTotal).toEqual(createMonetaryAmount(15000 + 2500))
  })

  it('matches the per-Reservation sum the payment path charges', async () => {
    const period = { startDay: '2026-10-05', endDay: '2026-10-08' }
    const asOneLine = await quoteReservationLines([{ assetTypeId: 1, period, quantity: 3 }], lookup)
    const perUnit = await quoteReservationLines(
      [1, 2, 3].map(() => ({ assetTypeId: 1, period, quantity: 1 })),
      lookup,
    )

    expect(asOneLine.rentalFeeTotal).toEqual(perUnit.rentalFeeTotal)
    expect(asOneLine.depositTotal).toEqual(perUnit.depositTotal)
  })

  it('refuses an unknown AssetType and an inverted RentalPeriod', async () => {
    await expect(
      quoteReservationLines(
        [
          {
            assetTypeId: 99,
            period: { startDay: '2026-10-05', endDay: '2026-10-05' },
            quantity: 1,
          },
        ],
        lookup,
      ),
    ).rejects.toThrow(AssetTypeNotFoundError)
    await expect(
      quoteReservationLines(
        [{ assetTypeId: 1, period: { startDay: '2026-10-07', endDay: '2026-10-05' }, quantity: 1 }],
        lookup,
      ),
    ).rejects.toThrow(InvalidRentalPeriodError)
  })
})
