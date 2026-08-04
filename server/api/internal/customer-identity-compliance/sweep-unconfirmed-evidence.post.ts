import { sweepUnconfirmedIdentityEvidence } from '../../../contexts/customer-identity-compliance'
import { createCustomerIdentityComplianceDeps } from '../../../utils/customer-identity-compliance-deps'
import { requireInternalJobSecret } from '../../../utils/internal-job-session'
import { runScheduledJob } from '../../../utils/job-run-ledger'
import { getSeededTenantId } from '../../../utils/tenant'

// D-40, issue #78/IR-10: called on a schedule by GitHub Actions
// (.github/workflows/sweep-unconfirmed-evidence.yml), never by a human —
// requireInternalJobSecret gates this, not requireOperator, mirroring
// ../reservations/sweep-expired.post.ts (FR-08) exactly. A row this
// sweep confirms is one whose client never called the confirm route
// itself (closed tab, dropped connection) but whose upload actually
// succeeded — see ../../../contexts/customer-identity-compliance/identity-evidence.ts's
// sweepUnconfirmedIdentityEvidence for why an unconfirmed row is never
// deleted, only ever confirmed or left alone.
export default defineEventHandler(async (event) => {
  requireInternalJobSecret(event)

  const { repo, gateway, sql, close } = createCustomerIdentityComplianceDeps(event)
  try {
    const tenantId = await getSeededTenantId(sql)
    return await runScheduledJob(sql, { tenantId, jobName: 'unconfirmed_identity_evidence_sweep' }, async () => {
      const confirmed = await sweepUnconfirmedIdentityEvidence(repo, gateway, { tenantId })
      return { processedCount: confirmed.length, result: { confirmedCount: confirmed.length } }
    })
  } finally {
    await close()
  }
})
