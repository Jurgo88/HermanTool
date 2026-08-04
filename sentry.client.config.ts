// D-29, NFR-08, NFR-14 (issue #73/IR-05). Client-side counterpart to
// ./sentry.server.config.ts. The frontend is minimal today (IR-12) and
// carries no IdentityEvidence handling of its own -- the browser never
// touches the photograph, only a presigned upload URL (D-23, D-40) --
// so there is no client-side equivalent of ./server/utils/sentry-scrub.ts
// to write yet. sendDefaultPii stays false regardless, on the same
// NFR-08 principle: no IP address, no cookies, attached by default.
import * as Sentry from '@sentry/nuxt'

Sentry.init({
  dsn: process.env.NUXT_SENTRY_DSN,
  sendDefaultPii: false,
  tracesSampleRate: 0, // NFR-04: no performance-monitoring apparatus at pilot load; error tracking only
})
