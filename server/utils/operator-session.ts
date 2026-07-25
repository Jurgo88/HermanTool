// H3/Nuxt-specific glue around ./auth.ts's pure sign-in/resolve logic:
// cookie storage and runtime config resolution. Not unit tested for the
// same reason server/api/health.get.ts isn't — it is Nuxt-runtime glue,
// not domain logic (Part 4 §14.2); ./auth.ts carries the tested logic.
import { createError, deleteCookie, getCookie, setCookie, type H3Event } from 'h3'
import { useRuntimeConfig } from '#imports'
import { createDatabaseClient } from './db'
import { createPostgresOperatorRepository, type Operator } from './operators'
import { createSupabaseAuthClient } from './supabase'
import {
  OperatorNotProvisionedError,
  resolveOperator,
  UnauthenticatedError,
  type AuthDeps,
  type OperatorSession,
} from './auth'

const ACCESS_TOKEN_COOKIE = 'ht_operator_at'
const REFRESH_TOKEN_COOKIE = 'ht_operator_rt'

// D-22: long-lived enough that a morning login carries an Operator
// through a shift. Actual session validity is enforced by Supabase Auth
// (refresh token expiry/revocation, NFR-09) — this is only how long the
// browser holds onto the cookie.
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
  }
}

export function readSessionCookie(event: H3Event): OperatorSession | null {
  const accessToken = getCookie(event, ACCESS_TOKEN_COOKIE)
  const refreshToken = getCookie(event, REFRESH_TOKEN_COOKIE)
  if (!accessToken || !refreshToken) return null
  return { accessToken, refreshToken }
}

export function writeSessionCookie(event: H3Event, session: OperatorSession): void {
  setCookie(event, ACCESS_TOKEN_COOKIE, session.accessToken, cookieOptions())
  setCookie(event, REFRESH_TOKEN_COOKIE, session.refreshToken, cookieOptions())
}

export function clearSessionCookie(event: H3Event): void {
  deleteCookie(event, ACCESS_TOKEN_COOKIE, { path: '/' })
  deleteCookie(event, REFRESH_TOKEN_COOKIE, { path: '/' })
}

// Constructs the real Supabase/Postgres-backed AuthDeps from runtime
// config, plus a `close()` to end the Postgres connection afterwards.
// The connection is created and ended per call, matching the existing
// convention in ./db-health.ts rather than introducing a new pooling
// pattern (NFR-04: no scaling apparatus at pilot load).
export function createAuthDeps(event: H3Event): { deps: AuthDeps; close: () => Promise<void> } {
  const config = useRuntimeConfig(event)
  const sql = createDatabaseClient(config.databaseUrl)
  return {
    deps: {
      supabase: createSupabaseAuthClient(config.supabaseUrl, config.supabaseAnonKey),
      operators: createPostgresOperatorRepository(sql),
    },
    close: () => sql.end(),
  }
}

// The gate every FR-37 admin route calls. Throws a 401 H3Error when
// there is no valid session or the authenticated user has no Operator
// seat provisioned — never falls back to "an Operator" (FR-34, D-16).
export async function requireOperator(event: H3Event): Promise<Operator> {
  const session = readSessionCookie(event)
  const { deps, close } = createAuthDeps(event)

  try {
    const result = await resolveOperator(deps, session)
    if (
      !session ||
      result.session.accessToken !== session.accessToken ||
      result.session.refreshToken !== session.refreshToken
    ) {
      writeSessionCookie(event, result.session)
    }
    return result.operator
  } catch (err) {
    if (err instanceof UnauthenticatedError || err instanceof OperatorNotProvisionedError) {
      throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
    }
    throw err
  } finally {
    await close()
  }
}
