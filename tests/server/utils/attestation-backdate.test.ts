import { describe, expect, it } from 'vitest'
import { backdateBodySchema, parseOccurredAt } from '../../../server/utils/attestation-backdate'

// FR-24, D-51, A-04: what a counter form sends is the Tenant's wall clock;
// anything that would be read in the server's own zone is refused.
describe('parseOccurredAt', () => {
  it('reads a counter form time in the Tenant timezone', () => {
    expect(parseOccurredAt('2026-10-09T14:30')?.toISOString()).toBe('2026-10-09T12:30:00.000Z')
  })

  it('accepts an ISO instant that names its offset', () => {
    expect(parseOccurredAt('2026-10-09T12:30:00Z')?.toISOString()).toBe('2026-10-09T12:30:00.000Z')
    expect(parseOccurredAt('2026-10-09T14:30:00+02:00')?.toISOString()).toBe(
      '2026-10-09T12:30:00.000Z',
    )
  })

  it('refuses an ISO time with no offset, which would depend on the server zone', () => {
    expect(parseOccurredAt('2026-10-09T14:30:00')).toBeNull()
  })

  it('refuses nonsense and times that do not exist', () => {
    expect(parseOccurredAt('yesterday')).toBeNull()
    expect(parseOccurredAt('2026-03-29T02:30')).toBeNull()
    expect(parseOccurredAt('2026-02-30T10:00')).toBeNull()
  })
})

describe('backdateBodySchema', () => {
  it('turns occurredAt into a Date and keeps the reason', () => {
    const parsed = backdateBodySchema.parse({ occurredAt: '2026-10-09T14:30', reason: 'Výpadok' })

    expect(parsed.occurredAt).toBeInstanceOf(Date)
    expect(parsed.occurredAt.toISOString()).toBe('2026-10-09T12:30:00.000Z')
    expect(parsed.reason).toBe('Výpadok')
  })

  it('rejects an unreadable time and an empty reason', () => {
    expect(backdateBodySchema.safeParse({ occurredAt: 'x', reason: 'r' }).success).toBe(false)
    expect(
      backdateBodySchema.safeParse({ occurredAt: '2026-10-09T14:30', reason: '' }).success,
    ).toBe(false)
  })
})
