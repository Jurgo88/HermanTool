import { generateIdentityEvidenceReadUrl } from '../../../../../../contexts/customer-identity-compliance'
import {
  createCustomerIdentityComplianceDeps,
  getCustomerIdParam,
  getIdentityEvidenceIdParam,
  translateCustomerIdentityComplianceError,
} from '../../../../../../utils/customer-identity-compliance-deps'
import { requireOperator } from '../../../../../../utils/operator-session'

// W3, FR-14, NFR-06, issue #80/IR-12: the Operator's "let me see the ID
// photo" step of identity verification. `forceRemoteCheck: true` is
// D-39's own carve-out (see server/utils/auth.ts's resolveOperator) —
// this is the one route in the codebase that hands out a presigned read
// URL for IdentityEvidence, and NFR-06 is what bought individual,
// real-time authentication for evidence access in the first place.
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event, { forceRemoteCheck: true })
  getCustomerIdParam(event) // route-scoping only, matching the confirm route's own pattern
  const identityEvidenceId = getIdentityEvidenceIdParam(event)

  const { repo, gateway, close } = createCustomerIdentityComplianceDeps(event)
  try {
    return await generateIdentityEvidenceReadUrl(repo, gateway, {
      tenantId: operator.tenantId,
      identityEvidenceId,
      operatorId: operator.id,
    })
  } catch (err) {
    translateCustomerIdentityComplianceError(err)
  } finally {
    await close()
  }
})
