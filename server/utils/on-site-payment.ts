// On-site payment orchestration (D-65; issue #215), at the composition
// root because it spans Availability & Reservation (the group and its
// holds), Customer Identity & Compliance (the contact) and Handover &
// Possession (the attestation) — none of which may import the others for
// this (D-02).
//
// "Active" for D-65's one-per-contact limit: an on-site group that still
// holds capacity — a Reservation Pending inside its window, or Confirmed
// and not yet past its last day — and whose rental fee has not been
// attested yet. Once the Operator attests the payment, the contact may
// reserve on site again. Refusing after a NoShow is NOT built: it needs
// the contact kept after the rental ends (OQ #27, IR-07).
import { createHash, randomBytes } from 'node:crypto'
import type postgres from 'postgres'
import type { TenantId } from '../contexts/_shared'
import { TENANT_TIME_ZONE } from '../contexts/availability-reservation'
import type { ContactDetails } from '../contexts/customer-identity-compliance'

const TOKEN_BYTES = 32

// How long the e-mailed confirmation link works. The group's holds lapse
// after PENDING_EXPIRY_MINUTES like any unpaid checkout (D-08, D-33); a
// later click re-acquires the days if they are still free (the D-37 path
// confirmReservationGroup already takes). A pragmatic bound on a bearer
// link, not business policy — same footing as LINK_TTL_DAYS for D-23.
export const ON_SITE_CONFIRMATION_TTL_HOURS = 24

export function hashConfirmationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function listActiveOnSiteContacts(
  sql: postgres.Sql,
  tenantId: TenantId,
): Promise<ContactDetails[]> {
  const rows = await sql<{ email: string; phone: string }[]>`
    select c.email, c.phone from customers c
    join reservation_groups g on g.tenant_id = c.tenant_id and g.id = c.reservation_group_id
    where c.tenant_id = ${tenantId}
      and g.payment_method = 'on_site'
      and exists (
        select 1 from reservations r
        where r.tenant_id = g.tenant_id and r.reservation_group_id = g.id
          and (
            (r.state = 'pending' and r.pending_expires_at > now())
            or (r.state = 'confirmed' and r.end_day >= (now() at time zone ${TENANT_TIME_ZONE})::date)
          )
      )
      and not exists (
        select 1 from on_site_payments p
        where p.tenant_id = g.tenant_id and p.reservation_group_id = g.id
      )
  `
  return rows
}

// Issues the group's one confirmation token and returns it exactly once;
// only its hash is stored. A second request for the same group is refused
// by the table's unique index — the e-mail is not re-sent (FR-32's
// at-most-once dispatch says the same).
export async function issueOnSiteConfirmationToken(
  sql: postgres.Sql,
  params: { tenantId: TenantId; reservationGroupId: number; now?: Date },
): Promise<string | null> {
  const token = randomBytes(TOKEN_BYTES).toString('base64url')
  const expiresAt = new Date(
    (params.now ?? new Date()).getTime() + ON_SITE_CONFIRMATION_TTL_HOURS * 60 * 60 * 1000,
  )
  const rows = await sql<{ id: number }[]>`
    insert into on_site_confirmation_tokens (tenant_id, reservation_group_id, token_hash, expires_at)
    values (${params.tenantId}, ${params.reservationGroupId}, ${hashConfirmationToken(token)}, ${expiresAt})
    on conflict (reservation_group_id) do nothing
    returning id
  `
  return rows.length > 0 ? token : null
}

// Resolves a raw token to its group when it is unused and unexpired. Like
// D-23's link, a bad token says nothing about why it is bad.
export async function resolveOnSiteConfirmationToken(
  sql: postgres.Sql,
  params: { tenantId: TenantId; token: string },
): Promise<{ id: number; reservationGroupId: number } | null> {
  const rows = await sql<{ id: number; reservation_group_id: number }[]>`
    select id, reservation_group_id from on_site_confirmation_tokens
    where tenant_id = ${params.tenantId} and token_hash = ${hashConfirmationToken(params.token)}
      and used_at is null and expires_at > now()
  `
  const row = rows[0]
  return row ? { id: row.id, reservationGroupId: row.reservation_group_id } : null
}

export async function markOnSiteConfirmationTokenUsed(
  sql: postgres.Sql,
  params: { tenantId: TenantId; id: number },
): Promise<void> {
  await sql`
    update on_site_confirmation_tokens set used_at = now()
    where tenant_id = ${params.tenantId} and id = ${params.id} and used_at is null
  `
}
