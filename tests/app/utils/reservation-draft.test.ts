import { describe, expect, it } from 'vitest'
import {
  orderForDisplay,
  parseStoredDraft,
  toCheckoutLines,
  toQuoteLines,
  withoutLine,
} from '../../../app/utils/reservation-draft'
import type { DraftReservationLine } from '../../../app/composables/useReservationDraft'

const money = (amount: number) => ({ amount, currency: 'EUR' })

const hammer: DraftReservationLine = {
  assetTypeId: 7,
  assetTypeName: 'Bosch GBH 2-26 DFR',
  dayRate: money(1500),
  depositAmount: money(7500),
  period: { startDay: '2026-10-05', endDay: '2026-10-07' },
  quantity: 3,
}

const bits: DraftReservationLine = {
  ...hammer,
  assetTypeId: 9,
  assetTypeName: 'Sada vrtákov',
  quantity: 1,
}

describe('toCheckoutLines (FR-06, #164)', () => {
  it('sends one line per unit', () => {
    const lines = toCheckoutLines([hammer, bits])

    expect(lines).toHaveLength(4)
    expect(lines.filter((line) => line.assetTypeId === 7)).toHaveLength(3)
    expect(
      lines.every(
        (line) => line.period.startDay === '2026-10-05' && line.period.endDay === '2026-10-07',
      ),
    ).toBe(true)
  })

  it('sends nothing for an empty draft', () => {
    expect(toCheckoutLines([])).toEqual([])
  })
})

describe('toQuoteLines', () => {
  it('keeps the quantity for the server-side quote', () => {
    expect(toQuoteLines([hammer])).toEqual([{ assetTypeId: 7, period: hammer.period, quantity: 3 }])
  })
})

describe('withoutLine (D-57)', () => {
  const bitsWithHammer = { ...bits, principalAssetTypeId: 7 }

  it('removes the Accessory lines added with a removed principal', () => {
    expect(withoutLine([hammer, bitsWithHammer], 0)).toEqual([])
  })

  it('keeps the principal when only the Accessory is removed', () => {
    expect(withoutLine([hammer, bitsWithHammer], 1)).toEqual([hammer])
  })

  it('keeps an Accessory added for a different RentalPeriod', () => {
    const otherWeek = { ...bitsWithHammer, period: { startDay: '2026-10-12', endDay: '2026-10-13' } }
    expect(withoutLine([hammer, otherWeek], 0)).toEqual([otherWeek])
  })
})

describe('parseStoredDraft (S-03, draft kept in the browser)', () => {
  it('reads back what was stored', () => {
    const stored = JSON.stringify([hammer, { ...bits, principalAssetTypeId: 7 }])
    expect(parseStoredDraft(stored)).toEqual([hammer, { ...bits, principalAssetTypeId: 7 }])
  })

  it('yields an empty draft for anything malformed, never an error', () => {
    for (const raw of [
      null,
      '',
      'not json',
      '{}',
      JSON.stringify([{ ...hammer, quantity: 0 }]),
      JSON.stringify([{ ...hammer, period: { startDay: '5.10.2026', endDay: '2026-10-07' } }]),
      JSON.stringify([{ ...hammer, dayRate: 15 }]),
    ]) {
      expect(parseStoredDraft(raw)).toEqual([])
    }
  })
})

describe('orderForDisplay (D-57: an Accessory sits under its principal)', () => {
  it('places each Accessory right after the principal it was added with, keeping draft indexes', () => {
    const accessory: DraftReservationLine = { ...bits, principalAssetTypeId: 7 }
    const other: DraftReservationLine = { ...bits, assetTypeId: 11, assetTypeName: 'Píla' }
    const ordered = orderForDisplay([accessory, other, hammer])

    expect(ordered.map((entry) => [entry.line.assetTypeId, entry.index, entry.isAccessory])).toEqual([
      [11, 1, false],
      [7, 2, false],
      [9, 0, true],
    ])
  })

  it('still shows an Accessory whose principal is missing', () => {
    const accessory: DraftReservationLine = { ...bits, principalAssetTypeId: 99 }
    expect(orderForDisplay([accessory])).toEqual([{ line: accessory, index: 0, isAccessory: true }])
  })
})
