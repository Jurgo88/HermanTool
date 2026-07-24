import { createAuthDeps, clearSessionCookie, readSessionCookie } from '../../utils/operator-session'

// Revokes the session at Supabase Auth (NFR-09: sessions must be
// revocable, since the counter device is a phone left on a counter) and
// clears the cookie regardless of whether revocation succeeded — a
// browser that has forgotten its cookie is logged out from its own
// point of view even if the server call fails.
export default defineEventHandler(async (event) => {
  const session = readSessionCookie(event)

  if (session) {
    const { deps, close } = createAuthDeps(event)
    try {
      await deps.supabase.auth.setSession({
        access_token: session.accessToken,
        refresh_token: session.refreshToken,
      })
      await deps.supabase.auth.signOut()
    } finally {
      await close()
    }
  }

  clearSessionCookie(event)
  return { loggedOut: true }
})
