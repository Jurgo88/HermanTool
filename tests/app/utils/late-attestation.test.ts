import { describe, expect, it } from 'vitest'
import {
  emptyLateAttestation,
  isLateAttestationComplete,
  toBackdate,
} from '../../../app/utils/late-attestation'

// FR-24, S-17, D-51: a live scan sends no `backdate` at all; a late record
// sends the time exactly as typed, for the server to resolve, and cannot be
// submitted without both a time and a reason.
describe('late attestation form state', () => {
  it('is off, complete and sends nothing by default', () => {
    const late = emptyLateAttestation()

    expect(late.enabled).toBe(false)
    expect(isLateAttestationComplete(late)).toBe(true)
    expect(toBackdate(late)).toBeUndefined()
  })

  it('sends the typed time untouched, with a trimmed reason', () => {
    const late = { enabled: true, occurredAt: '2026-10-09T14:30', reason: '  Výpadok internetu  ' }

    expect(toBackdate(late)).toEqual({
      occurredAt: '2026-10-09T14:30',
      reason: 'Výpadok internetu',
    })
  })

  it('is incomplete without a time or without a reason once switched on', () => {
    expect(isLateAttestationComplete({ enabled: true, occurredAt: '', reason: 'x' })).toBe(false)
    expect(
      isLateAttestationComplete({ enabled: true, occurredAt: '2026-10-09T14:30', reason: '  ' }),
    ).toBe(false)
    expect(
      isLateAttestationComplete({ enabled: true, occurredAt: '2026-10-09T14:30', reason: 'x' }),
    ).toBe(true)
  })

  it('ignores whatever is typed while switched off', () => {
    const late = { enabled: false, occurredAt: '2026-10-09T14:30', reason: 'zabudnuté' }

    expect(isLateAttestationComplete(late)).toBe(true)
    expect(toBackdate(late)).toBeUndefined()
  })
})
