// IdentityVerification at the counter [MVP] (D-15, FR-14, FR-15, W3;
// issue #30). The second of D-15's two separate acts — evidence is
// submitted online after payment (./identity-evidence.ts); this is an
// Operator, at the counter, comparing that photograph to the human in
// front of them and recording the outcome. Do not conflate the two.
import type { TenantId } from '../_shared'
import type { CustomerIdentityComplianceRepository } from './repository'
import {
  IdentityEvidenceCustomerMismatchError,
  IdentityEvidenceNotFoundError,
  IdentityVerificationReasonRequiredError,
  type IdentityVerification,
} from './types'

// FR-14/FR-15/D-15: records the outcome of an Operator comparing
// IdentityEvidence to the Customer standing in front of them.
// Append-only (D-10) — a Customer rejected once and verified later on a
// different document produces a second row, never an update to the
// first; ./repository.ts's hasSuccessfulIdentityVerification reads
// across every row rather than assuming the latest one wins.
export async function recordIdentityVerification(
  repo: CustomerIdentityComplianceRepository,
  params: {
    tenantId: TenantId
    customerId: number
    identityEvidenceId: number
    operatorId: string
    outcome: 'verified' | 'rejected'
    reason?: string
  },
): Promise<IdentityVerification> {
  const { tenantId, customerId, identityEvidenceId, operatorId, outcome, reason } = params

  const evidence = await repo.getIdentityEvidence(tenantId, identityEvidenceId)
  if (!evidence) throw new IdentityEvidenceNotFoundError(identityEvidenceId)
  if (evidence.customerId !== customerId) {
    throw new IdentityEvidenceCustomerMismatchError(identityEvidenceId, customerId)
  }

  if (outcome === 'rejected') {
    if (!reason?.trim()) throw new IdentityVerificationReasonRequiredError()
    return repo.insertIdentityVerification(tenantId, {
      customerId,
      identityEvidenceId,
      operatorId,
      outcome: 'rejected',
      reason,
    })
  }

  return repo.insertIdentityVerification(tenantId, {
    customerId,
    identityEvidenceId,
    operatorId,
    outcome: 'verified',
    reason: null,
  })
}

// FR-14: "HandoverOut is refused without a successful IdentityVerification."
// Re-exported thinly so a future #23 caller has one obvious published
// function to call rather than reaching for the repository directly.
export async function hasSuccessfulIdentityVerification(
  repo: CustomerIdentityComplianceRepository,
  params: { tenantId: TenantId; customerId: number },
): Promise<boolean> {
  return repo.hasSuccessfulIdentityVerification(params.tenantId, params.customerId)
}
