// D-39 (Part 4 §16.2, issue #77/IR-09): local verification of the
// Operator access token's signature and expiry, replacing a remote
// Supabase Auth `getUser` call on the normal (non-expired) path. This
// project's Supabase Auth signs with ES256 against a rotating key set
// published at /auth/v1/.well-known/jwks.json (verified directly against
// this project — confirmed a real JWKS response, not the legacy shared
// HS256 secret some older Supabase projects still use), so verification
// needs no secret this codebase must hold: the public keys are, by
// design, public.
//
// jose's createRemoteJWKSet caches the JWKS response in-process and only
// re-fetches on a genuine key-rotation (an unrecognised `kid`), so this
// is a per-process cache, not a per-request fetch -- the "local"
// verification D-39 asks for.
//
// The refresh path (an access token that fails local verification, in
// ./auth.ts's resolveOperator) still calls Supabase's real
// `refreshSession` -- a refresh token is opaque and rotating; it cannot
// be verified locally, only by the server that issued it.
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'

export function createSupabaseJwksKeySet(supabaseUrl: string): JWTVerifyGetKey {
  return createRemoteJWKSet(new URL('/auth/v1/.well-known/jwks.json', supabaseUrl))
}

export interface VerifiedAccessToken {
  userId: string
}

// Returns null rather than throwing for every failure mode (expired,
// malformed, wrong signature, unrecognised key) -- ./auth.ts's
// resolveOperator treats "local verification did not succeed" as one
// outcome with one response: fall back to the refresh path. Which
// specific reason it failed is not a distinction any caller acts on.
export async function verifyAccessTokenLocally(
  accessToken: string,
  getKey: JWTVerifyGetKey,
): Promise<VerifiedAccessToken | null> {
  try {
    const { payload } = await jwtVerify(accessToken, getKey)
    if (typeof payload.sub !== 'string' || !payload.sub) return null
    return { userId: payload.sub }
  } catch {
    return null
  }
}
