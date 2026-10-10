import { describe, expect, it } from 'vitest'
import {
  InvalidLocalDateTimeError,
  parseTenantLocalDateTime,
} from '../../../../server/contexts/availability-reservation/rental-period'

// A-04, FR-24, D-51: a time typed at the counter is the Tenant's wall clock,
// resolved on the server. Wrong by an hour or two is silent, and it lands in
// an attestation that is read out in a dispute, so the zone edges are pinned.
const iso = (local: string) => parseTenantLocalDateTime(local).toISOString()

describe('parseTenantLocalDateTime (A-04)', () => {
  it('reads summer time as UTC+2', () => {
    expect(iso('2026-10-09T14:30')).toBe('2026-10-09T12:30:00.000Z')
  })

  it('reads winter time as UTC+1', () => {
    expect(iso('2026-01-15T14:30')).toBe('2026-01-15T13:30:00.000Z')
  })

  it('handles midnight on either side of the zone offset', () => {
    expect(iso('2026-07-01T00:15')).toBe('2026-06-30T22:15:00.000Z')
    expect(iso('2026-12-31T23:45')).toBe('2026-12-31T22:45:00.000Z')
  })

  it('refuses the hour that does not exist when clocks go forward (29 Mar 2026)', () => {
    expect(() => parseTenantLocalDateTime('2026-03-29T02:30')).toThrow(InvalidLocalDateTimeError)
    expect(iso('2026-03-29T01:59')).toBe('2026-03-29T00:59:00.000Z')
    expect(iso('2026-03-29T03:00')).toBe('2026-03-29T01:00:00.000Z')
  })

  it('takes the first occurrence of the hour that happens twice when clocks go back (25 Oct 2026)', () => {
    // 02:30 happens at 00:30Z (still summer time) and again at 01:30Z.
    expect(iso('2026-10-25T02:30')).toBe('2026-10-25T00:30:00.000Z')
    expect(iso('2026-10-25T03:30')).toBe('2026-10-25T02:30:00.000Z')
  })

  it('refuses text that is not a Tenant-local date and time', () => {
    for (const bad of [
      '',
      '2026-10-09',
      '2026-10-09 14:30',
      '2026-10-09T14:30:00Z',
      '2026-10-09T24:00',
      '2026-13-09T10:00',
      '2026-02-30T10:00',
    ]) {
      expect(() => parseTenantLocalDateTime(bad), bad).toThrow(InvalidLocalDateTimeError)
    }
  })
})
