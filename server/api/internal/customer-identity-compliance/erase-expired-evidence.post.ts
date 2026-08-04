import { eraseExpiredIdentityEvidence } from '../../../contexts/customer-identity-compliance'
import { createCustomerIdentityComplianceDeps } from '../../../utils/customer-identity-compliance-deps'
import { requireInternalJobSecret } from '../../../utils/internal-job-session'
import { runScheduledJob } from '../../../utils/job-run-ledger'
import { getSeededTenantId } from '../../../utils/tenant'

// D-11, D-36, FR-16, W10: called on a schedule by GitHub Actions
// (.github/workflows/erase-expired-identity-evidence.yml), never by a
// human — requireInternalJobSecret gates this, not requireOperator,
// mirroring server/api/internal/reservations/sweep-expired.post.ts (FR-08)
// exactly. There is no Operator attribution on what this route does
// (FR-34 doesn't apply — the actor is the platform itself, Part 2 §7),
// unlike D-17/D-09's deliberate refusal to automate: this IS the
// automated case those two explicitly carved out as different, because
// erasing an expired photograph has no judgement call in it at all.
export default defineEventHandler(async (event) => {
  requireInternalJobSecret(event)

  const { repo, gateway, sql, close } = createCustomerIdentityComplianceDeps(event)
  try {
    const tenantId = await getSeededTenantId(sql)
    return await runScheduledJob(sql, { tenantId, jobName: 'evidence_erasure' }, async () => {
      const erased = await eraseExpiredIdentityEvidence({ repo, gateway }, { tenantId })
      return {
        processedCount: erased.length,
        result: { erasedCount: erased.length, identityEvidenceIds: erased.map((e) => e.id) },
      }
    })
  } finally {
    await close()
  }
})
