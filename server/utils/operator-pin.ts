// Per-Operator PIN reconfirmation (D-22, FR-36, F8, Part 5 Finding 8;
// issue #28). D-22 chose individual Operator authentication specifically
// to protect the identity-evidence bucket from a phone left on the
// counter (NFR-06), on the unstated assumption of one device per
// Operator. The pilot's actual reality is one shared counter phone: the
// owner logs in Monday morning, the employee uses the same session all
// week, and every attestation FR-34 records ends up attributed to
// "whoever is holding the phone" — Finding 8.
//
// The fix is NOT a second login. It is a reconfirmation: the Operator
// session (requireOperator) still gates whether this device may reach
// the counter tools at all; a PIN, checked separately at the moment of a
// CRITICAL attesting action (DepositTaken, DepositReturned,
// ConditionReport capture, LostAsset declaration — FR-36), resolves
// WHICH of the Tenant's Operators is physically attesting THIS action,
// independent of whichever Operator's session cookie happens to be
// live. Callers pass the PIN-resolved Operator's id as the attestation's
// operatorId — not necessarily the session's — see
// server/api/handover/handover-out.post.ts for the pattern.
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import type { TenantId } from '../contexts/_shared'
import type { Operator, OperatorRepository } from './operators'

const scrypt = promisify(scryptCallback)
const KEY_LENGTH = 32
const MIN_PIN_LENGTH = 4

export class PinTooShortError extends Error {
  constructor() {
    super(`PIN must be at least ${MIN_PIN_LENGTH} characters.`)
    this.name = new.target.name
  }
}

// Deliberately generic — never reveals whether a PIN was "close" to any
// Operator's, or how many Operators exist.
export class InvalidPinError extends Error {
  constructor() {
    super('PIN does not match any Operator for this Tenant.')
    this.name = new.target.name
  }
}

async function derivePinHash(pin: string, salt: Buffer): Promise<Buffer> {
  return (await scrypt(pin, salt, KEY_LENGTH)) as Buffer
}

// Self-service only: an Operator sets their OWN PIN, once authenticated
// (requireOperator gates the caller). There is no admin surface for this
// (D-22: "no Operator management surface") and no route lets one
// Operator set another's.
export async function setOperatorPin(repo: OperatorRepository, operatorId: string, pin: string): Promise<void> {
  if (pin.trim().length < MIN_PIN_LENGTH) throw new PinTooShortError()

  const salt = randomBytes(16)
  const hash = await derivePinHash(pin, salt)
  await repo.setPin(operatorId, { pinSalt: salt.toString('hex'), pinHash: hash.toString('hex') })
}

// F8/Finding 8: the actual reconfirmation. Checks the PIN against every
// Operator for the Tenant (D-22: two seats in the pilot) and returns
// whichever one matches.
//
// Deliberately not rate-limited: this sits BEHIND requireOperator's own
// session check. Reaching this code path at all already requires a
// valid, authenticated Operator session on the device — an attacker in
// a position to guess PINs here already has full counter-tool access;
// the PIN's job is correcting ATTRIBUTION on that access, not gating it,
// so it is not the layer a brute-force defence belongs on.
export async function verifyOperatorPin(repo: OperatorRepository, tenantId: TenantId, pin: string): Promise<Operator> {
  const candidates = await repo.listForTenant(tenantId)

  for (const candidate of candidates) {
    if (!candidate.pinSalt || !candidate.pinHash) continue

    const stored = Buffer.from(candidate.pinHash, 'hex')
    const computed = await derivePinHash(pin, Buffer.from(candidate.pinSalt, 'hex'))
    if (computed.length === stored.length && timingSafeEqual(computed, stored)) {
      return { id: candidate.id, tenantId: candidate.tenantId, displayName: candidate.displayName }
    }
  }

  throw new InvalidPinError()
}
