// S-17 (FR-24, D-10): the optional "recorded late" part of a HandoverOut or
// HandoverIn form. Pure, so what is sent and when the form may be submitted
// is testable. The time stays the string the counter typed: the server
// resolves it in the Tenant's timezone, and the browser does no date
// arithmetic (D-51).
export interface LateAttestation {
  enabled: boolean
  occurredAt: string
  reason: string
}

export function emptyLateAttestation(): LateAttestation {
  return { enabled: false, occurredAt: '', reason: '' }
}

export function isLateAttestationComplete(late: LateAttestation): boolean {
  return !late.enabled || (late.occurredAt.trim() !== '' && late.reason.trim() !== '')
}

// The `backdate` request field: absent for an ordinary live scan.
export function toBackdate(
  late: LateAttestation,
): { occurredAt: string; reason: string } | undefined {
  if (!late.enabled) return undefined
  return { occurredAt: late.occurredAt.trim(), reason: late.reason.trim() }
}
