import { confirmIdentityEvidenceUpload } from '../../../../../../contexts/customer-identity-compliance'
import {
  createCustomerIdentityComplianceDeps,
  getCustomerIdParam,
  getIdentityEvidenceIdParam,
  translateCustomerIdentityComplianceError,
} from '../../../../../../utils/customer-identity-compliance-deps'
import { requireOperator } from '../../../../../../utils/operator-session'

// D-40, issue #78/IR-10: the Operator-at-the-counter confirmation call —
// the client hits this once its own upload PUT to the presigned URL
// (../identity-evidence.post.ts's response) succeeds, but the server
// verifies independently via a HEAD (D-40's whole point: the client's
// word is not the check). `customerId` is only used to route-scope the
// URL consistently with the sibling upload route; the domain function
// itself is keyed by identityEvidenceId alone.
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  getCustomerIdParam(event) // route-scoping only, see module doc
  const identityEvidenceId = getIdentityEvidenceIdParam(event)

  const { repo, gateway, close } = createCustomerIdentityComplianceDeps(event)
  try {
    return await confirmIdentityEvidenceUpload(repo, gateway, { tenantId: operator.tenantId, identityEvidenceId })
  } catch (err) {
    translateCustomerIdentityComplianceError(err)
  } finally {
    await close()
  }
})
