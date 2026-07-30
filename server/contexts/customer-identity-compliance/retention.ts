// Retention & scheduled erasure (D-11, D-36, FR-12, FR-16, W10; issue
// #32). Makes P7 real: personal data with a clock on it, and deletion a
// routine, scheduled operation rather than an incident response.
//
// Two halves:
//   - reanchorRetentionDeadlineForCustomer: D-36's fix for the FR-12/D-11
//     tension Part 5 Finding 2 identified. IdentityEvidence gets a
//     provisional RetentionDeadline at creation
//     (./identity-evidence.ts's computeRetentionDeadline); a rental that
//     never settles (a paid NoShow, a rejected IdentityVerification, an
//     abandoned pickup) keeps that provisional deadline, so it is never
//     held indefinitely (D-36). A rental that DOES settle gets its
//     deadline re-anchored here, from server/contexts/handover-possession/handover-in.ts's
//     completeSettlement, once the deposit is resolved.
//   - eraseExpiredIdentityEvidence: FR-16/W10's "no human triggering it."
//     Called on a schedule by server/api/internal/customer-identity-compliance/erase-expired-evidence.post.ts,
//     the same GitHub-Actions-calls-an-internal-Nitro-route pattern as
//     server/api/internal/reservations/sweep-expired.post.ts (FR-08).
//     Never attributed to an Operator — there is no human decision here
//     at all, unlike D-17/D-09's deliberate refusal to automate (this is
//     the automated case those two explicitly carved out as different).
//
// Both halves are, like every OQ #2-gated path in this context, blocked
// end-to-end until the retention window value and legal basis are set
// (RetentionWindowNotConfiguredError) — that is correct, not a bug: an
// unconfigured window must refuse rather than guess (CLAUDE.md).
import type { TenantId } from '../_shared'
import { computeRetentionDeadline } from './identity-evidence'
import type { IdentityEvidenceStorageGateway } from './r2-gateway'
import type { CustomerIdentityComplianceRepository } from './repository'
import type { IdentityEvidence } from './types'

export async function reanchorRetentionDeadlineForCustomer(
  repo: CustomerIdentityComplianceRepository,
  params: { tenantId: TenantId; customerId: number; settledAt: Date },
): Promise<IdentityEvidence[]> {
  const { tenantId, customerId, settledAt } = params

  // Computed before touching the repository, same ordering as
  // requestIdentityEvidenceUpload's own guard: an unconfigured window
  // refuses the whole operation rather than re-anchoring some rows and
  // not others.
  const newDeadline = computeRetentionDeadline(settledAt)

  const evidenceRows = await repo.listIdentityEvidenceForCustomer(tenantId, customerId)
  const reanchored: IdentityEvidence[] = []
  for (const evidence of evidenceRows) {
    const updated = await repo.setIdentityEvidenceRetentionDeadline(tenantId, evidence.id, newDeadline)
    if (updated) reanchored.push(updated)
  }
  return reanchored
}

export async function eraseExpiredIdentityEvidence(
  deps: { repo: CustomerIdentityComplianceRepository; gateway: IdentityEvidenceStorageGateway },
  params: { tenantId: TenantId; now?: Date },
): Promise<IdentityEvidence[]> {
  const { repo, gateway } = deps
  const { tenantId, now = new Date() } = params

  const expired = await repo.listIdentityEvidenceWithExpiredRetention(tenantId, now)
  const erased: IdentityEvidence[] = []
  for (const evidence of expired) {
    // The R2 object is deleted first: if markIdentityEvidenceErased then
    // fails or this candidate is picked up again by a retried run,
    // deleteObject against an already-missing key is a safe no-op
    // (R2/S3 semantics) — the reverse order would risk a row marked
    // erased while the photograph still exists.
    await gateway.deleteObject(evidence.objectKey)
    const updated = await repo.markIdentityEvidenceErased(tenantId, evidence.id, now)
    if (updated) erased.push(updated)
  }
  return erased
}
