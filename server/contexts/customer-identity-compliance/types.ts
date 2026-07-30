// Domain types for Customer Identity & Compliance [MVP] — Customer
// creation, IdentityEvidence submission, IdentityVerification and the
// tokenised self-service link (D-06, D-14, D-23, D-27, NFR-06, FR-11,
// FR-39; issues #29, #30, #31). See ./index.ts for the context's
// boundary and citations.
import type { TenantId } from '../_shared'

// D-14: no account, no password. Created once per ReservationGroup at
// checkout commitment (W1) and never deduplicated across a repeat
// Customer — see the migration's unique index on reservation_group_id,
// which enforces "one per group", not "one per person".
export interface Customer {
  id: number
  tenantId: TenantId
  reservationGroupId: number
  name: string
  email: string
  phone: string
  createdAt: Date
}

// D-06: deliberately its own aggregate, separate from Customer — the
// photograph is erasable on a schedule (P7, D-11) while the Customer/
// rental/accounting record is not. `objectKey` is an opaque pointer into
// the R2 `evidence` bucket (D-27), never a public URL.
//
// `retentionDeadline` is NOT NULL at the type level, matching the
// migration: FR-12/P7 make an IdentityEvidence value without a deadline
// unrepresentable, not merely disallowed. See ./identity-evidence.ts for
// why creating one is currently guarded by RetentionWindowNotConfiguredError
// rather than a placeholder value (OQ #2, CLAUDE.md "do NOT invent
// defaults" for launch-blocking Open Questions).
export interface IdentityEvidence {
  id: number
  tenantId: TenantId
  customerId: number
  objectKey: string
  retentionDeadline: Date
  createdAt: Date
  // FR-16, W10, issue #32: set once, by eraseExpiredIdentityEvidence,
  // when retentionDeadline arrives — "the erasure is recorded." The row
  // itself is never deleted (P4, append-only) — `objectKey` stays as a
  // historical pointer to an object that no longer exists in R2; see
  // ./identity-evidence.ts's generateIdentityEvidenceReadUrl, which
  // refuses once this is set rather than minting a dead presigned URL.
  erasedAt: Date | null
}

// NFR-06: "every access to evidence is itself an attributed act."
// Append-only — nothing here is ever updated or deleted (P4).
export interface IdentityEvidenceAccessEvent {
  id: number
  tenantId: TenantId
  identityEvidenceId: number
  operatorId: string
  accessedAt: Date
}

// D-15: the counter-side act, separate from IdentityEvidence submission
// — an Operator compares the photograph to the human in front of them
// and records the outcome. Append-only (D-10): a rejected-then-later-
// verified Customer gets a second row, never an update to the first.
export type IdentityVerificationOutcome = 'verified' | 'rejected'

// FR-14/FR-15: HandoverOut's precondition. `reason` is non-null iff
// outcome is 'rejected' (FR-15) — enforced at the type level with a
// discriminated union so a caller can't construct the invalid
// combination, and backed by the migration's check constraint besides.
export type IdentityVerification = {
  id: number
  tenantId: TenantId
  customerId: number
  identityEvidenceId: number
  operatorId: string
  occurredAt: Date
} & ({ outcome: 'verified'; reason: null } | { outcome: 'rejected'; reason: string })

// D-23, FR-39, issue #31: "a tokenised, expiring, single-purpose link."
// `tokenHash` is a SHA-256 digest of the raw bearer token — the raw
// token itself is never persisted, only ever handed to the Customer once
// at issuance (mirrors NFR-06's severity discipline even though this
// token cannot read IdentityEvidence back, only submit it). Scope is
// exactly "view the ReservationGroup, submit IdentityEvidence" — nothing
// here models more than that; this is not an Account, not a Session
// (D-23's own banned-list).
export interface CustomerAccessLink {
  id: number
  tenantId: TenantId
  customerId: number
  tokenHash: string
  createdAt: Date
  expiresAt: Date
  // D-23: "its purpose ends at HandoverOut, and so does it." Set by
  // revokeCustomerAccessLinksForCustomer, called from
  // server/contexts/handover-possession/handover-out.ts once
  // performHandoverOut's transaction succeeds.
  revokedAt: Date | null
}

export class CustomerIdentityComplianceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

// D-14: a checkout produces at most one Customer per ReservationGroup.
// Guards a retried/duplicated checkout-composition call from producing a
// second contact record for the same group.
export class CustomerAlreadyExistsForGroupError extends CustomerIdentityComplianceError {
  constructor(reservationGroupId: number) {
    super(`ReservationGroup ${reservationGroupId} already has a Customer record (D-14).`)
  }
}

export class CustomerNotFoundError extends CustomerIdentityComplianceError {
  constructor(identifier: number) {
    super(`Customer ${identifier} does not exist for this Tenant.`)
  }
}

export class IdentityEvidenceNotFoundError extends CustomerIdentityComplianceError {
  constructor(identifier: number) {
    super(`IdentityEvidence ${identifier} does not exist for this Tenant.`)
  }
}

// FR-16: the photograph is gone from R2 — refuses to mint a presigned
// read URL to an object that no longer exists, rather than handing back
// a dead link. Distinct from IdentityEvidenceNotFoundError: the row
// itself still exists (append-only, P4), only the object doesn't.
export class IdentityEvidenceErasedError extends CustomerIdentityComplianceError {
  constructor(identifier: number) {
    super(`IdentityEvidence ${identifier} was erased on its RetentionDeadline (FR-16) — no read access remains.`)
  }
}

// FR-15: "a rejected IdentityVerification records a reason." Thrown when
// a caller tries to record a rejection with an empty reason — the
// migration's check constraint is the backstop, this is the domain-level
// guard that produces a typed error instead of a raw constraint
// violation.
export class IdentityVerificationReasonRequiredError extends CustomerIdentityComplianceError {
  constructor() {
    super('A rejected IdentityVerification must record a reason (FR-15).')
  }
}

// The IdentityEvidence being verified must belong to the Customer being
// verified — a mismatch here means the caller mixed up two counter
// interactions, not a fact about either Customer.
export class IdentityEvidenceCustomerMismatchError extends CustomerIdentityComplianceError {
  constructor(identityEvidenceId: number, customerId: number) {
    super(`IdentityEvidence ${identityEvidenceId} does not belong to Customer ${customerId}.`)
  }
}

// FR-09-style validation guard: name/email/phone are the whole of a
// Customer record (D-14) — none may be empty, since an empty field is
// not "contact information", it is no contact information.
export class InvalidCustomerDetailsError extends CustomerIdentityComplianceError {
  constructor(reason: string) {
    super(`Invalid Customer details: ${reason}.`)
  }
}

// FR-11: "IdentityEvidence cannot be created before its ReservationGroup
// is Confirmed." The confirmation check itself is Availability &
// Reservation's (this context never imports it, see ./index.ts) — the
// caller (a future #30/#31 route) supplies the fact, this error is what
// requestIdentityEvidenceUpload throws when that fact is false.
export class ReservationGroupNotConfirmedError extends CustomerIdentityComplianceError {
  constructor(reservationGroupId: number) {
    super(`ReservationGroup ${reservationGroupId} is not Confirmed — IdentityEvidence cannot be created yet (FR-11).`)
  }
}

// OQ #2 (CLAUDE.md launch-blocking, "do NOT invent defaults"): the
// IdentityEvidence retention window value and its legal basis are
// unset. Thrown by identity-evidence.ts's computeRetentionDeadline
// rather than falling back to a guessed number of days — the same
// "leave the path unimplemented" treatment CLAUDE.md already prescribes
// for OQ #1's cancellation path.
export class RetentionWindowNotConfiguredError extends CustomerIdentityComplianceError {
  constructor() {
    super(
      'IdentityEvidence retention window is not configured (OQ #2 — value and legal basis unresolved). ' +
        'Refusing to create IdentityEvidence with a guessed retention window.',
    )
  }
}
