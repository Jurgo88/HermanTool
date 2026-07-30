// The Customer's self-service surface (D-23, FR-39; issue #31). A
// tokenised, expiring, single-purpose link, emailed at confirmation
// (actual dispatch is #35/Notification's job — this module only issues
// the token; server/api/webhooks/stripe.post.ts calls issueCustomerAccessLink
// once a ReservationGroup confirms, ready for #35 to send). Scope is
// exactly "view the ReservationGroup, submit IdentityEvidence" — see
// server/api/customer-access/[token].get.ts and
// server/api/customer-access/[token]/identity-evidence.post.ts, the only
// two capabilities this token grants. Never grants read access to
// IdentityEvidence (NFR-06).
import { createHash, randomBytes } from 'node:crypto'
import type { TenantId } from '../_shared'
import type { CustomerIdentityComplianceRepository } from './repository'
import { CustomerNotFoundError, type CustomerAccessLink } from './types'

const TOKEN_BYTES = 32

// D-23 says "short-lived" but names no value, and this is not a listed
// Open Question (checked Part 4's appendix — no OQ covers a self-service
// link TTL). Same discipline as reservation.ts's PENDING_EXPIRY_MINUTES
// and overdue-noshow-views.ts's SHORTFALL_SCAN_HORIZON_DAYS: a pragmatic
// pilot-scale constant, not a value requiring a lawyer/OQ resolution.
// This is defence-in-depth only — the definitive expiry is
// revokeCustomerAccessLinksForCustomer at HandoverOut; this ceiling
// exists for the rentals that never reach it (an abandoned pickup, W3's
// own named failure mode).
const LINK_TTL_DAYS = 30

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

// Issues a new bearer token and returns it exactly once — only its hash
// is ever persisted (mirrors NFR-06's severity discipline even though
// this token cannot read IdentityEvidence back). The caller (the Stripe
// webhook route, at ReservationConfirmed) is responsible for getting the
// raw token to the Customer.
export async function issueCustomerAccessLink(
  repo: CustomerIdentityComplianceRepository,
  params: { tenantId: TenantId; customerId: number; now?: Date },
): Promise<{ link: CustomerAccessLink; token: string }> {
  const { tenantId, customerId, now = new Date() } = params

  const customer = await repo.getCustomer(tenantId, customerId)
  if (!customer) throw new CustomerNotFoundError(customerId)

  const token = randomBytes(TOKEN_BYTES).toString('base64url')
  const tokenHash = hashToken(token)
  const expiresAt = new Date(now.getTime() + LINK_TTL_DAYS * 24 * 60 * 60 * 1000)

  const link = await repo.insertCustomerAccessLink(tenantId, { customerId, tokenHash, expiresAt })
  return { link, token }
}

// D-23: "unguessable, short-lived, revocable, single-purpose." Resolves
// a raw bearer token to its CustomerAccessLink — deliberately returns
// null rather than a typed error distinguishing "no such token" from
// "expired" from "revoked". That distinction is exactly the oracle an
// unguessable-token design must not hand back to whoever is holding the
// link (mirrors operator-pin.ts's InvalidPinError being deliberately
// generic for the same reason).
export async function resolveCustomerAccessLink(
  repo: CustomerIdentityComplianceRepository,
  params: { tenantId: TenantId; token: string; now?: Date },
): Promise<CustomerAccessLink | null> {
  const { tenantId, token, now = new Date() } = params

  const link = await repo.getCustomerAccessLinkByTokenHash(tenantId, hashToken(token))
  if (!link) return null
  if (link.revokedAt) return null
  if (link.expiresAt.getTime() <= now.getTime()) return null
  return link
}

// D-23: "its purpose ends at HandoverOut, and so does it." Called from
// server/contexts/handover-possession/handover-out.ts once
// performHandoverOut's transaction succeeds — that module already
// composes this repository for FR-14 (Customer Identity & Compliance is
// upstream of Handover & Possession, see ./index.ts).
export async function revokeCustomerAccessLinksForCustomer(
  repo: CustomerIdentityComplianceRepository,
  params: { tenantId: TenantId; customerId: number; now?: Date },
): Promise<void> {
  const { tenantId, customerId, now = new Date() } = params
  await repo.revokeCustomerAccessLinksForCustomer(tenantId, customerId, now)
}
