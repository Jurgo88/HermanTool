// Marketing consent (issue #216; D-35 pattern, D-14, P7). An explicit,
// optional opt-in at checkout, recorded with the version of the text shown,
// and withdrawable through a tokenised link with no login. No marketing
// e-mail is sent anywhere yet; this only makes the consent real and
// withdrawable. Transactional e-mails are unaffected.
//
// The contact is the normalised e-mail the offers would go to. Records are
// append-only events and the status is derived: a withdrawal wins over
// every earlier consent; a later consent at a new checkout grants again.
// An unticked box at checkout records nothing — it is not a withdrawal and
// never consent (a missing field never records consent).
//
// Retention of the records is with the lawyer (OQ #27, IR-07): no
// RetentionDeadline is invented here.
import { createHash, randomBytes } from 'node:crypto'
import type postgres from 'postgres'
import type { TenantId } from '../_shared'
import { normaliseEmail } from './contact'
import { CustomerIdentityComplianceError } from './types'

export interface MarketingConsentEvent {
  id: number
  tenantId: TenantId
  emailNormalised: string
  customerId: number | null
  granted: boolean
  consentTextVersion: string | null
  source: 'checkout' | 'unsubscribe'
  recordedAt: Date
}

export interface MarketingConsentRepository {
  insertEvent(
    tenantId: TenantId,
    params: Omit<MarketingConsentEvent, 'id' | 'tenantId' | 'recordedAt'>,
  ): Promise<MarketingConsentEvent>
  listEventsForContact(
    tenantId: TenantId,
    emailNormalised: string,
  ): Promise<MarketingConsentEvent[]>
  listAllEvents(tenantId: TenantId): Promise<MarketingConsentEvent[]>
  insertUnsubscribeToken(
    tenantId: TenantId,
    params: { emailNormalised: string; tokenHash: string },
  ): Promise<void>
  findUnsubscribeToken(
    tenantId: TenantId,
    tokenHash: string,
  ): Promise<{ emailNormalised: string } | null>
}

export class MarketingConsentVersionMismatchError extends CustomerIdentityComplianceError {
  constructor() {
    super('The marketing-consent text version does not match the text currently shown.')
  }
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

// The latest event decides: a withdrawal after a consent revokes it, a
// consent after a withdrawal grants again.
export function isConsentActive(events: Pick<MarketingConsentEvent, 'id' | 'granted'>[]): boolean {
  const latest = [...events].sort((a, b) => b.id - a.id)[0]
  return latest?.granted === true
}

// S-03: only an explicit `true` records anything. `currentVersion` is the
// server's own version of the text; the browser's must match it.
export async function recordCheckoutMarketingConsent(
  repo: MarketingConsentRepository,
  params: {
    tenantId: TenantId
    customerId: number
    email: string
    consent: boolean | undefined
    shownVersion: string | undefined
    currentVersion: string
  },
): Promise<MarketingConsentEvent | null> {
  if (params.consent !== true) return null
  if (params.shownVersion !== params.currentVersion)
    throw new MarketingConsentVersionMismatchError()
  return repo.insertEvent(params.tenantId, {
    emailNormalised: normaliseEmail(params.email),
    customerId: params.customerId,
    granted: true,
    consentTextVersion: params.currentVersion,
    source: 'checkout',
  })
}

// For the future sender of a marketing e-mail: the link it must carry.
// Returned exactly once; only the hash is stored.
export async function issueMarketingUnsubscribeToken(
  repo: MarketingConsentRepository,
  params: { tenantId: TenantId; email: string },
): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  await repo.insertUnsubscribeToken(params.tenantId, {
    emailNormalised: normaliseEmail(params.email),
    tokenHash: hashToken(token),
  })
  return token
}

// Idempotent: unsubscribing an already-withdrawn contact records nothing
// new. An unknown token says nothing about why (D-23's posture).
export async function withdrawMarketingConsent(
  repo: MarketingConsentRepository,
  params: { tenantId: TenantId; token: string },
): Promise<'withdrawn' | 'already_withdrawn' | 'unknown_token'> {
  const found = await repo.findUnsubscribeToken(params.tenantId, hashToken(params.token))
  if (!found) return 'unknown_token'
  const events = await repo.listEventsForContact(params.tenantId, found.emailNormalised)
  if (events.length > 0 && !isConsentActive(events)) return 'already_withdrawn'
  await repo.insertEvent(params.tenantId, {
    emailNormalised: found.emailNormalised,
    customerId: null,
    granted: false,
    consentTextVersion: null,
    source: 'unsubscribe',
  })
  return 'withdrawn'
}

// Admin (#216): how many contacts may receive offers. A count only — no
// list until OQ #27 says how long the contacts may be kept.
export async function countActiveMarketingConsents(
  repo: MarketingConsentRepository,
  params: { tenantId: TenantId },
): Promise<number> {
  const byContact = new Map<string, MarketingConsentEvent[]>()
  for (const event of await repo.listAllEvents(params.tenantId)) {
    const list = byContact.get(event.emailNormalised) ?? []
    list.push(event)
    byContact.set(event.emailNormalised, list)
  }
  return [...byContact.values()].filter(isConsentActive).length
}

interface EventRow {
  id: number
  tenant_id: string
  email_normalised: string
  customer_id: number | null
  granted: boolean
  consent_text_version: string | null
  source: 'checkout' | 'unsubscribe'
  recorded_at: Date
}

const mapEvent = (row: EventRow): MarketingConsentEvent => ({
  id: row.id,
  tenantId: row.tenant_id as TenantId,
  emailNormalised: row.email_normalised,
  customerId: row.customer_id,
  granted: row.granted,
  consentTextVersion: row.consent_text_version,
  source: row.source,
  recordedAt: row.recorded_at,
})

export function createPostgresMarketingConsentRepository(
  sql: postgres.Sql,
): MarketingConsentRepository {
  return {
    async insertEvent(tenantId, params) {
      const rows = await sql<EventRow[]>`
        insert into marketing_consent_events
          (tenant_id, email_normalised, customer_id, granted, consent_text_version, source)
        values (${tenantId}, ${params.emailNormalised}, ${params.customerId}, ${params.granted},
          ${params.consentTextVersion}, ${params.source})
        returning *
      `
      return mapEvent(rows[0]!)
    },
    async listEventsForContact(tenantId, emailNormalised) {
      const rows = await sql<EventRow[]>`
        select * from marketing_consent_events
        where tenant_id = ${tenantId} and email_normalised = ${emailNormalised}
        order by id
      `
      return rows.map(mapEvent)
    },
    async listAllEvents(tenantId) {
      const rows = await sql<EventRow[]>`
        select * from marketing_consent_events where tenant_id = ${tenantId} order by id
      `
      return rows.map(mapEvent)
    },
    async insertUnsubscribeToken(tenantId, { emailNormalised, tokenHash }) {
      await sql`
        insert into marketing_unsubscribe_tokens (tenant_id, email_normalised, token_hash)
        values (${tenantId}, ${emailNormalised}, ${tokenHash})
      `
    },
    async findUnsubscribeToken(tenantId, tokenHash) {
      const rows = await sql<{ email_normalised: string }[]>`
        select email_normalised from marketing_unsubscribe_tokens
        where tenant_id = ${tenantId} and token_hash = ${tokenHash}
      `
      return rows[0] ? { emailNormalised: rows[0].email_normalised } : null
    },
  }
}
