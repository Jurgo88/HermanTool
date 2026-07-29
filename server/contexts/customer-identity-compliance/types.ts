// Domain types for Customer Identity & Compliance [MVP] — Customer
// creation and IdentityEvidence submission only (D-06, D-14, D-27,
// NFR-06, FR-11; issue #29). See ./index.ts for the context's boundary
// and citations.
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
