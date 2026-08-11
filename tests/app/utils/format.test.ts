import { describe, expect, it } from 'vitest'
import { formatDay, formatDateTime, formatDayRange, formatMoney } from '../../../app/utils/format'

// sk-SK's Intl currency format separates the amount and the symbol with
// U+00A0 (no-break space), not a plain space — matters for exact
// equality, invisible in a terminal.
const NBSP = ' '

describe('formatMoney (D-51, D-21)', () => {
  it('formats minor units as Slovak-locale currency', () => {
    expect(formatMoney({ amount: 1250, currency: 'EUR' })).toBe(`12,50${NBSP}€`)
  })

  it('formats a zero amount', () => {
    expect(formatMoney({ amount: 0, currency: 'EUR' })).toBe(`0,00${NBSP}€`)
  })

  it('always carries the currency, never a bare number', () => {
    const result = formatMoney({ amount: 2000, currency: 'EUR' })
    expect(result).toContain('€')
  })
})

describe('formatDay (D-51)', () => {
  it('formats a RentalDay string as a Slovak calendar date', () => {
    expect(formatDay('2026-08-12')).toBe('12. 8. 2026')
  })

  it('renders the same digits regardless of a leading/trailing UTC offset ambiguity', () => {
    // The whole point of parsing as UTC midnight: this must never render
    // as the 11th or the 13th depending on the reader's own clock.
    expect(formatDay('2026-01-01')).toBe('1. 1. 2026')
    expect(formatDay('2026-12-31')).toBe('31. 12. 2026')
  })
})

describe('formatDayRange (D-51)', () => {
  it('collapses to "start. – end. month. year." within the same month', () => {
    expect(formatDayRange('2026-08-12', '2026-08-14')).toBe('12. – 14. 8. 2026')
  })

  it('shows two full dates when the range crosses a month', () => {
    expect(formatDayRange('2026-08-30', '2026-09-02')).toBe('30. 8. 2026 – 2. 9. 2026')
  })

  it('shows two full dates when the range crosses a year', () => {
    expect(formatDayRange('2026-12-30', '2027-01-02')).toBe('30. 12. 2026 – 2. 1. 2027')
  })

  it('handles a single-day range', () => {
    expect(formatDayRange('2026-08-12', '2026-08-12')).toBe('12. – 12. 8. 2026')
  })
})

describe('formatDateTime (D-51)', () => {
  it('formats an instant in Europe/Bratislava, never raw ISO', () => {
    const result = formatDateTime('2026-08-12T10:30:00.000Z')
    expect(result).not.toContain('T')
    expect(result).not.toContain('Z')
    expect(result).toBe('12. 8. 2026 12:30') // UTC+2 in August (CEST)
  })

  it('accepts a Date instance directly', () => {
    expect(formatDateTime(new Date('2026-08-12T10:30:00.000Z'))).toBe('12. 8. 2026 12:30')
  })
})
