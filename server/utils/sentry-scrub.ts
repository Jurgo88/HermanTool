// D-29, NFR-08 (issue #73/IR-05): the scrubbing half of Sentry, kept as
// a plain, unit-testable function rather than an inline arrow in
// sentry.server.config.ts -- "SDK first, scrubbing follows" is exactly
// the window R-11 warns about, so this file and its test exist to make
// that window checkable, not just asserted in a commit message.
//
// sendDefaultPii: false (set in sentry.server.config.ts) already stops
// the Node SDK from attaching request bodies, cookies or IP addresses
// to any event -- this function is the SECOND, independent layer: even
// a metadata-only event (route, params, headers) from one of the three
// routes that handle IdentityEvidence is dropped before it leaves the
// process, because the route itself is the signal that something
// identity-related was in flight, not just its body.
import type { ErrorEvent, EventHint } from '@sentry/nuxt'

// Matches all three IdentityEvidence-related routes:
//   POST /api/handover/customers/:customerId/identity-evidence
//   POST /api/handover/customers/:customerId/identity-verification
//   POST /api/public/customer-access/:token/identity-evidence
// Deliberately NOT matching /api/internal/customer-identity-compliance/
// erase-expired-evidence -- that route receives no customer-submitted
// data (it's requireInternalJobSecret-gated, no request body), and its
// failures are exactly what D-29's Sentry Crons signal (see
// server/api/internal/customer-identity-compliance/erase-expired-evidence.post.ts)
// needs to observe.
const IDENTITY_EVIDENCE_ROUTE_PATTERN = /\/identity-(evidence|verification)(?:[/?]|$)/

export function scrubIdentityEvidenceEvents(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
  const url = event.request?.url
  if (url && IDENTITY_EVIDENCE_ROUTE_PATTERN.test(url)) {
    return null
  }
  return event
}
