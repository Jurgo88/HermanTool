import type { IdentityEvidence } from '../../../../../contexts/customer-identity-compliance'
import { getCustomerIdParam, createCustomerIdentityComplianceDeps } from '../../../../../utils/customer-identity-compliance-deps'
import { requireOperator } from '../../../../../utils/operator-session'

// W3, FR-14, issue #80/IR-12: the Counter's identity-verification step
// needs to know what IdentityEvidence already exists for this Customer
// (submitted online via D-23's link) before deciding whether the
// Operator must capture a fallback (../identity-evidence.post.ts).
// Returns metadata only — object keys and read URLs are never handed
// out from here; see ./[identityEvidenceId]/read-url.get.ts for that,
// gated separately (NFR-06).
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const customerId = getCustomerIdParam(event)
  const { repo, close } = createCustomerIdentityComplianceDeps(event)

  try {
    const evidence = await repo.listIdentityEvidenceForCustomer(operator.tenantId, customerId)
    return evidence.map((e: IdentityEvidence) => ({
      id: e.id,
      createdAt: e.createdAt,
      confirmedAt: e.confirmedAt,
    }))
  } finally {
    await close()
  }
})
