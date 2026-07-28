// Machine-to-machine authentication for internal endpoints invoked on a
// schedule by GitHub Actions (D-25 §14.2 — "Scheduling by GitHub Actions
// calling authenticated Nitro endpoints"). This is NOT an Operator
// session (D-22): there is no human and no Supabase Auth identity here,
// just a shared secret held by the scheduler and by this server. Kept as
// ordinary TypeScript against plain strings, not H3Event or
// runtimeConfig, so the comparison is testable without Nuxt runtime —
// same split as ./auth.ts versus ./operator-session.ts.
import { timingSafeEqual } from 'node:crypto'

const BEARER_PREFIX = 'Bearer '

export class MissingInternalJobSecretError extends Error {
  constructor() {
    super('NUXT_INTERNAL_JOB_SECRET is not configured.')
    this.name = new.target.name
  }
}

export class InvalidInternalJobSecretError extends Error {
  constructor() {
    super('Authorization header does not match the configured internal job secret.')
    this.name = new.target.name
  }
}

// Constant-time comparison: the header carries a bearer credential, and
// an early-exit length check on the SECRET's own length would be fine,
// but comparing unequal-length buffers is what timingSafeEqual refuses
// to do (it throws), so length is checked plainly first and the
// content comparison stays constant-time.
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export function verifyInternalJobSecret(params: {
  authorizationHeader: string | undefined
  expectedSecret: string
}): void {
  const { authorizationHeader, expectedSecret } = params
  if (!expectedSecret) throw new MissingInternalJobSecretError()

  const provided = authorizationHeader?.startsWith(BEARER_PREFIX)
    ? authorizationHeader.slice(BEARER_PREFIX.length)
    : ''

  if (!provided || !safeEqual(provided, expectedSecret)) {
    throw new InvalidInternalJobSecretError()
  }
}
