// D-29, NFR-08 (issue #73/IR-05). Proves the scrubbing half of Sentry
// actually drops what it claims to, independent of a live Sentry
// backend — see server/utils/sentry-scrub.ts's module doc for why this
// exists as a plain, testable function rather than an inline
// beforeSend arrow.
import { describe, expect, it } from 'vitest'
import type { ErrorEvent } from '@sentry/nuxt'
import { scrubIdentityEvidenceEvents } from '../../../server/utils/sentry-scrub'

function eventWithUrl(url: string | undefined): ErrorEvent {
  return url === undefined ? {} : { request: { url } }
}

describe('scrubIdentityEvidenceEvents (D-29)', () => {
  it('drops an event from the Operator-at-the-counter IdentityEvidence route', () => {
    const event = eventWithUrl('https://hermantool.example/api/handover/customers/42/identity-evidence')
    expect(scrubIdentityEvidenceEvents(event, {})).toBeNull()
  })

  it('drops an event from the IdentityVerification route', () => {
    const event = eventWithUrl('https://hermantool.example/api/handover/customers/42/identity-verification')
    expect(scrubIdentityEvidenceEvents(event, {})).toBeNull()
  })

  it('drops an event from the D-23 Customer self-service upload route', () => {
    const event = eventWithUrl('https://hermantool.example/api/public/customer-access/tok_abc123/identity-evidence')
    expect(scrubIdentityEvidenceEvents(event, {})).toBeNull()
  })

  it('drops regardless of a query string on the route', () => {
    const event = eventWithUrl('https://hermantool.example/api/handover/customers/42/identity-evidence?debug=1')
    expect(scrubIdentityEvidenceEvents(event, {})).toBeNull()
  })

  it('does NOT drop the internal erasure job route -- its failures are exactly what Sentry Crons watches', () => {
    const event = eventWithUrl(
      'https://hermantool.example/api/internal/customer-identity-compliance/erase-expired-evidence',
    )
    expect(scrubIdentityEvidenceEvents(event, {})).toBe(event)
  })

  it('does not drop an unrelated route', () => {
    const event = eventWithUrl('https://hermantool.example/api/catalog/asset-types')
    expect(scrubIdentityEvidenceEvents(event, {})).toBe(event)
  })

  it('passes through an event with no request url at all', () => {
    const event = eventWithUrl(undefined)
    expect(scrubIdentityEvidenceEvents(event, {})).toBe(event)
  })
})
