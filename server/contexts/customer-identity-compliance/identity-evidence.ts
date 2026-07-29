// IdentityEvidence submission [MVP] (D-06, D-27, NFR-06, FR-11; issue
// #29). The upload/access mechanism only — IdentityVerification (#30),
// the tokenised self-service link (#31), and the scheduled retention/
// erasure job (#32) are separate issues that call into this module,
// this module does not build them.
import { randomUUID } from 'node:crypto'
import type { TenantId } from '../_shared'
import type { IdentityEvidenceStorageGateway } from './r2-gateway'
import type { CustomerIdentityComplianceRepository } from './repository'
import {
  CustomerNotFoundError,
  IdentityEvidenceNotFoundError,
  ReservationGroupNotConfirmedError,
  RetentionWindowNotConfiguredError,
  type IdentityEvidence,
  type IdentityEvidenceAccessEvent,
} from './types'

// OQ #2 (CLAUDE.md launch-blocking, "do NOT invent defaults" for
// unresolved Open Questions): the retention window value and its legal
// basis are unset. A named constant exactly as #32/#33 require —
// deliberately `null` rather than a guessed number of days, so
// computeRetentionDeadline fails loudly instead of quietly promising an
// erasure date nobody has signed off on (P7/FR-12 already forbid a
// deadline-less IdentityEvidence row; guessing a number would just trade
// one violation for another). Set this the day a lawyer names the
// number — with the card-scheme chargeback horizon in view, not in
// isolation (Part 5 Finding 5).
export const RETENTION_WINDOW_DAYS: number | null = null

export function computeRetentionDeadline(from: Date): Date {
  if (RETENTION_WINDOW_DAYS === null) throw new RetentionWindowNotConfiguredError()
  return new Date(from.getTime() + RETENTION_WINDOW_DAYS * 24 * 60 * 60 * 1000)
}

// FR-11: "IdentityEvidence cannot be created before its ReservationGroup
// is Confirmed." `isReservationGroupConfirmed` is supplied by the caller
// — a future route composing Availability & Reservation's published
// interface — since this context never imports it (D-02, see
// ./index.ts). Currently unusable end-to-end regardless of that flag:
// computeRetentionDeadline throws before any row or presigned URL is
// created, until OQ #2 is resolved.
export async function requestIdentityEvidenceUpload(
  repo: CustomerIdentityComplianceRepository,
  gateway: IdentityEvidenceStorageGateway,
  params: {
    tenantId: TenantId
    customerId: number
    reservationGroupId: number
    isReservationGroupConfirmed: boolean
    contentType: string
    now?: Date
  },
): Promise<{ identityEvidence: IdentityEvidence; uploadUrl: string }> {
  const {
    tenantId,
    customerId,
    reservationGroupId,
    isReservationGroupConfirmed,
    contentType,
    now = new Date(),
  } = params

  if (!isReservationGroupConfirmed) throw new ReservationGroupNotConfirmedError(reservationGroupId)

  const customer = await repo.getCustomer(tenantId, customerId)
  if (!customer) throw new CustomerNotFoundError(customerId)

  // Computed before touching the repository or the gateway: an
  // unconfigured retention window must refuse the whole operation, not
  // leave a half-created row or a live presigned URL behind.
  const retentionDeadline = computeRetentionDeadline(now)
  const objectKey = `${tenantId}/${customerId}/${randomUUID()}`

  const identityEvidence = await repo.insertIdentityEvidence(tenantId, { customerId, objectKey, retentionDeadline })
  const { uploadUrl } = await gateway.generateUploadUrl(objectKey, contentType)

  return { identityEvidence, uploadUrl }
}

// NFR-06: "every access to evidence is itself an attributed act." The
// operatorId parameter is not optional — generating a read URL without
// recording who asked is exactly the gap NFR-06 exists to close. The
// access event is recorded even if the URL is never actually fetched:
// the act being attributed is "an Operator was granted access", which
// happens the moment the URL is minted.
export async function generateIdentityEvidenceReadUrl(
  repo: CustomerIdentityComplianceRepository,
  gateway: IdentityEvidenceStorageGateway,
  params: { tenantId: TenantId; identityEvidenceId: number; operatorId: string },
): Promise<{ readUrl: string; accessEvent: IdentityEvidenceAccessEvent }> {
  const { tenantId, identityEvidenceId, operatorId } = params

  const evidence = await repo.getIdentityEvidence(tenantId, identityEvidenceId)
  if (!evidence) throw new IdentityEvidenceNotFoundError(identityEvidenceId)

  const accessEvent = await repo.insertIdentityEvidenceAccessEvent(tenantId, { identityEvidenceId, operatorId })
  const { readUrl } = await gateway.generateReadUrl(evidence.objectKey)

  return { readUrl, accessEvent }
}
