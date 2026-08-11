// D-29, NFR-08, NFR-14 (issue #73/IR-05). Client-side counterpart to
// ./sentry.server.config.ts. The frontend is minimal today (IR-12) and
// carries no IdentityEvidence handling of its own -- the browser never
// touches the photograph, only a presigned upload URL (D-23, D-40) --
// so there is no client-side equivalent of ./server/utils/sentry-scrub.ts
// to write yet. sendDefaultPii stays false regardless, on the same
// NFR-08 principle: no IP address, no cookies, attached by default.
//
// FR-38/issue #81 (IR-13): @sentry/nuxt's default integrations include
// BrowserSession (release-health/session tracking), which is NOT what
// NFR-04's "error tracking only" asked for -- it beacons a session ping
// to Sentry on every page load/route change, for every Visitor, not just
// ones who error. It sets no cookie and touches no local/session storage
// (confirmed by reading the installed SDK: startSession/captureSession
// are pure in-memory + network), so it does not trigger FR-38's cookie
// consent on its own -- but sending Sentry a request per Visitor is a
// controller-processor question (OQ #4), not something to leave enabled
// by an unexamined default. Filtered out rather than left in place.
import * as Sentry from '@sentry/nuxt'

Sentry.init({
  dsn: process.env.NUXT_SENTRY_DSN,
  sendDefaultPii: false,
  integrations: (defaults) => defaults.filter((integration) => integration.name !== 'BrowserSession'),
  tracesSampleRate: 0, // NFR-04: no performance-monitoring apparatus at pilot load; error tracking only
})
