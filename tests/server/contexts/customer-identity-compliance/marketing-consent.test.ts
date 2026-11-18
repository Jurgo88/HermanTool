import { beforeEach, describe, expect, it } from 'vitest'
import type { TenantId } from '../../../../server/contexts/_shared'
import {
  MarketingConsentVersionMismatchError,
  countActiveMarketingConsents,
  isConsentActive,
  issueMarketingUnsubscribeToken,
  recordCheckoutMarketingConsent,
  withdrawMarketingConsent,
  type MarketingConsentEvent,
  type MarketingConsentRepository,
} from '../../../../server/contexts/customer-identity-compliance/marketing-consent'

const tenantA = '11111111-1111-1111-1111-111111111111' as TenantId
const tenantB = '22222222-2222-2222-2222-222222222222' as TenantId
const VERSION = 'marketing-test-1'

function fakeRepo(): MarketingConsentRepository & { events: MarketingConsentEvent[] } {
  const events: MarketingConsentEvent[] = []
  const tokens: { tenantId: TenantId; emailNormalised: string; tokenHash: string }[] = []
  return {
    events,
    async insertEvent(tenantId, params) {
      const event = { id: events.length + 1, tenantId, recordedAt: new Date(), ...params }
      events.push(event)
      return event
    },
    async listEventsForContact(tenantId, email) {
      return events.filter((e) => e.tenantId === tenantId && e.emailNormalised === email)
    },
    async listAllEvents(tenantId) {
      return events.filter((e) => e.tenantId === tenantId)
    },
    async insertUnsubscribeToken(tenantId, params) {
      tokens.push({ tenantId, ...params })
    },
    async findUnsubscribeToken(tenantId, tokenHash) {
      const t = tokens.find((x) => x.tenantId === tenantId && x.tokenHash === tokenHash)
      return t ? { emailNormalised: t.emailNormalised } : null
    },
  }
}

let repo: ReturnType<typeof fakeRepo>

const consent = (
  consentGiven: boolean | undefined,
  email = 'Jana@Example.sk',
  tenantId = tenantA,
) =>
  recordCheckoutMarketingConsent(repo, {
    tenantId,
    customerId: 1,
    email,
    consent: consentGiven,
    shownVersion: VERSION,
    currentVersion: VERSION,
  })

beforeEach(() => {
  repo = fakeRepo()
})

describe('marketing consent at checkout (#216, D-35 pattern)', () => {
  it('records nothing by default — a missing or false field is never consent', async () => {
    expect(await consent(undefined)).toBeNull()
    expect(await consent(false)).toBeNull()
    expect(repo.events).toHaveLength(0)
  })

  it('records an explicit yes with the version of the text shown and the normalised e-mail', async () => {
    const event = await consent(true)
    expect(event).toMatchObject({
      granted: true,
      consentTextVersion: VERSION,
      emailNormalised: 'jana@example.sk',
      source: 'checkout',
    })
  })

  it('refuses a consent given to a different text version', async () => {
    await expect(
      recordCheckoutMarketingConsent(repo, {
        tenantId: tenantA,
        customerId: 1,
        email: 'jana@example.sk',
        consent: true,
        shownVersion: 'older',
        currentVersion: VERSION,
      }),
    ).rejects.toThrow(MarketingConsentVersionMismatchError)
  })
})

describe('withdrawal (#216)', () => {
  it('wins over earlier consent for the same contact, and is idempotent', async () => {
    await consent(true)
    const token = await issueMarketingUnsubscribeToken(repo, {
      tenantId: tenantA,
      email: 'JANA@example.sk',
    })

    expect(await withdrawMarketingConsent(repo, { tenantId: tenantA, token })).toBe('withdrawn')
    expect(isConsentActive(await repo.listEventsForContact(tenantA, 'jana@example.sk'))).toBe(false)
    expect(await withdrawMarketingConsent(repo, { tenantId: tenantA, token })).toBe(
      'already_withdrawn',
    )
    expect(repo.events.filter((e) => !e.granted)).toHaveLength(1)
  })

  it('a later consent at a new checkout grants again', async () => {
    await consent(true)
    const token = await issueMarketingUnsubscribeToken(repo, {
      tenantId: tenantA,
      email: 'jana@example.sk',
    })
    await withdrawMarketingConsent(repo, { tenantId: tenantA, token })
    await consent(true)
    expect(isConsentActive(await repo.listEventsForContact(tenantA, 'jana@example.sk'))).toBe(true)
  })

  it('an unknown token withdraws nothing', async () => {
    expect(await withdrawMarketingConsent(repo, { tenantId: tenantA, token: 'nope' })).toBe(
      'unknown_token',
    )
  })
})

describe('Tenant scoping and the admin count (FR-33)', () => {
  it('never counts or withdraws across Tenants', async () => {
    await consent(true, 'jana@example.sk', tenantA)
    await consent(true, 'peter@example.sk', tenantA)
    await consent(true, 'jana@example.sk', tenantB)
    const tokenB = await issueMarketingUnsubscribeToken(repo, {
      tenantId: tenantB,
      email: 'jana@example.sk',
    })

    expect(await withdrawMarketingConsent(repo, { tenantId: tenantA, token: tokenB })).toBe(
      'unknown_token',
    )
    expect(await countActiveMarketingConsents(repo, { tenantId: tenantA })).toBe(2)
    await withdrawMarketingConsent(repo, { tenantId: tenantB, token: tokenB })
    expect(await countActiveMarketingConsents(repo, { tenantId: tenantB })).toBe(0)
    expect(await countActiveMarketingConsents(repo, { tenantId: tenantA })).toBe(2)
  })
})
