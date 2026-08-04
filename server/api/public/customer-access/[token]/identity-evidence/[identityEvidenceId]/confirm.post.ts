import { confirmIdentityEvidenceUpload, resolveCustomerAccessLink } from '../../../../../../contexts/customer-identity-compliance'
import {
  createCustomerIdentityComplianceDeps,
  customerAccessLinkNotFoundError,
  getCustomerAccessTokenParam,
  getIdentityEvidenceIdParam,
  translateCustomerIdentityComplianceError,
} from '../../../../../../utils/customer-identity-compliance-deps'
import { getSeededTenantId } from '../../../../../../utils/tenant'

// D-23, D-40, issue #78/IR-10: the Customer self-service confirmation
// call, mirroring ../../identity-evidence.post.ts's own token-resolution
// pattern exactly. The token proves the caller may act on THIS
// Customer's evidence; it does not bypass D-40's own check — the row
// still only counts once the HEAD confirms it.
export default defineEventHandler(async (event) => {
  const token = getCustomerAccessTokenParam(event)
  const identityEvidenceId = getIdentityEvidenceIdParam(event)
  const { repo, gateway, sql, close } = createCustomerIdentityComplianceDeps(event)

  try {
    const tenantId = await getSeededTenantId(sql)

    const link = await resolveCustomerAccessLink(repo, { tenantId, token })
    if (!link) customerAccessLinkNotFoundError()

    // The token authenticates a Customer, not an arbitrary
    // IdentityEvidence id — refuse rather than let one Customer's link
    // confirm another's row.
    const evidence = await repo.getIdentityEvidence(tenantId, identityEvidenceId)
    if (!evidence || evidence.customerId !== link.customerId) customerAccessLinkNotFoundError()

    return await confirmIdentityEvidenceUpload(repo, gateway, { tenantId, identityEvidenceId })
  } catch (err) {
    translateCustomerIdentityComplianceError(err)
  } finally {
    await close()
  }
})
