// Customer Identity & Compliance [MVP] — owns Customer, IdentityVerification,
// IdentityEvidence, and RetentionDeadline. Deliberately isolated because
// this data has a different legal lifecycle from everything around it.
// Part 1 §4; D-06, D-11.
//
// Dependency direction (Part 1 §4 context map): upstream of Handover &
// Possession. Must never import it. Also never imports Availability &
// Reservation, even though Customer creation and IdentityEvidence
// submission are both triggered by facts that context owns
// (ReservationGroup existing, ReservationGroup Confirmed) — those facts
// are supplied by the caller (a route composing both published
// interfaces), never read directly (D-02).
//
// Every Customer and IdentityEvidence is an aggregate root and carries
// `tenantId: TenantId` (D-01, P2). IdentityEvidence always carries a
// RetentionDeadline, set at creation, never absent (P7, D-11) — see
// ./identity-evidence.ts for why creating one is currently guarded by
// RetentionWindowNotConfiguredError rather than a placeholder value
// (OQ #2, still unresolved and launch-blocking per CLAUDE.md).
//
// Currently implements Customer creation (D-14), IdentityEvidence
// submission mechanics (D-06, D-27, NFR-06, FR-11; issue #29), and
// IdentityVerification at the counter (D-15, FR-14, FR-15, W3; issue
// #30). The tokenised self-service link (#31) and the scheduled
// retention/erasure job (#32) are separate, later issues — re-read
// CLAUDE.md KNOWN GAPS F6 (Customer-record retention has no
// RetentionDeadline of its own — issue #34, not resolved here either)
// before extending this context further.
export type {
  Customer,
  IdentityEvidence,
  IdentityEvidenceAccessEvent,
  IdentityVerification,
  IdentityVerificationOutcome,
} from './types'

export {
  CustomerAlreadyExistsForGroupError,
  CustomerIdentityComplianceError,
  CustomerNotFoundError,
  IdentityEvidenceCustomerMismatchError,
  IdentityEvidenceNotFoundError,
  IdentityVerificationReasonRequiredError,
  InvalidCustomerDetailsError,
  ReservationGroupNotConfirmedError,
  RetentionWindowNotConfiguredError,
} from './types'

export type {
  CustomerIdentityComplianceRepository,
  NewCustomer,
  NewIdentityEvidence,
  NewIdentityVerification,
} from './repository'
export { createPostgresCustomerIdentityComplianceRepository } from './repository'

export type { IdentityEvidenceStorageGateway } from './r2-gateway'
export { createR2IdentityEvidenceGateway } from './r2-gateway'

export { createCustomer } from './customer'
export {
  computeRetentionDeadline,
  generateIdentityEvidenceReadUrl,
  requestIdentityEvidenceUpload,
  RETENTION_WINDOW_DAYS,
} from './identity-evidence'
export { hasSuccessfulIdentityVerification, recordIdentityVerification } from './identity-verification'
