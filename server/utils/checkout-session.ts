// HTTP-layer plumbing scoping the checkout → accept-terms → pay sequence
// to the browser that actually created the ReservationGroup. Not a
// domain concept — D-14 gives a Customer no account and no password, and
// D-23's tokenised link is a different, later thing (emailed at
// confirmation, for viewing the booking and submitting IdentityEvidence
// post-payment). This is scoped narrowly to the pre-payment flow this
// browser is mid-way through, same httpOnly-cookie pattern as
// ./operator-session.ts, and grants nothing beyond "this browser may act
// on this specific ReservationGroup" — no read access, no history, no
// login.
import { createError, deleteCookie, getCookie, setCookie, type H3Event } from 'h3'

const CHECKOUT_GROUP_COOKIE = 'ht_checkout_group'

// Generous past PENDING_EXPIRY_MINUTES (30) so a D-37 late-arriving
// payment can still complete in the same browser session even after the
// Pending hold has lapsed and the re-acquire path is in play.
const COOKIE_MAX_AGE_SECONDS = 60 * 60

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
  }
}

export function issueCheckoutGroupCookie(event: H3Event, reservationGroupId: number): void {
  setCookie(event, CHECKOUT_GROUP_COOKIE, String(reservationGroupId), cookieOptions())
}

// The gate every route past checkout.post.ts calls. Throws a 403 H3Error
// when the cookie is missing or names a different ReservationGroup —
// never falls back to trusting the route param alone.
export function requireCheckoutGroupCookie(event: H3Event, reservationGroupId: number): void {
  const raw = getCookie(event, CHECKOUT_GROUP_COOKIE)
  if (raw !== String(reservationGroupId)) {
    throw createError({ statusCode: 403, statusMessage: 'No checkout session for this ReservationGroup.' })
  }
}

export function clearCheckoutGroupCookie(event: H3Event): void {
  deleteCookie(event, CHECKOUT_GROUP_COOKIE, { path: '/' })
}
