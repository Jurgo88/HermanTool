// D-29, NFR-08, NFR-14 (issue #73/IR-05). SDK and scrubbing land in the
// SAME change, deliberately -- R-11's failure mode is the window
// between "SDK installed" and "scrubbing configured," where an upload
// route throwing turns Sentry into a second, unmanaged copy of an
// identity document, outside every retention clock, in a third party.
//
// What this file enforces, and what it does NOT:
//   - sendDefaultPii: false -- the Node SDK's own switch for whether
//     request bodies, cookies and IP addresses are attached to an
//     event. False is the default; set explicitly so it is never a
//     silent inherited value.
//   - beforeSend: scrubIdentityEvidenceEvents (./server/utils/sentry-scrub.ts)
//     -- a second, independent layer: drops any event from the three
//     IdentityEvidence routes entirely, metadata included, not just
//     their (already-excluded) bodies.
//   - What this file CANNOT enforce, because it is Sentry-project
//     configuration rather than SDK configuration: per-key rate
//     limiting (Sentry project settings -> Client Keys) and EU data
//     residency (chosen when the Sentry project/org is created -- the
//     DSN's ingest host reflects it). Both must be set in the Sentry
//     dashboard by whoever owns the account; NUXT_SENTRY_DSN being
//     unset (.env.example) means neither has been done yet.
import * as Sentry from '@sentry/nuxt'
import { scrubIdentityEvidenceEvents } from './server/utils/sentry-scrub'

Sentry.init({
  dsn: process.env.NUXT_SENTRY_DSN,
  sendDefaultPii: false,
  beforeSend: scrubIdentityEvidenceEvents,
  tracesSampleRate: 0, // NFR-04: no performance-monitoring apparatus at pilot load; error tracking only
})
