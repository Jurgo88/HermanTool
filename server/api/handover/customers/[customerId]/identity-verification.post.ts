import { z } from 'zod'
import { recordIdentityVerification } from '../../../../contexts/customer-identity-compliance'
import {
  getCustomerIdParam,
  createCustomerIdentityComplianceDeps,
  translateCustomerIdentityComplianceError,
} from '../../../../utils/customer-identity-compliance-deps'
import { requireOperator } from '../../../../utils/operator-session'

const bodySchema = z.object({
  identityEvidenceId: z.number().int().positive(),
  outcome: z.enum(['verified', 'rejected']),
  reason: z.string().min(1).optional(),
})

// D-15, FR-14, FR-15, W3: an Operator compares IdentityEvidence to the
// Customer standing in front of them and records the outcome — the
// precondition Handover & Possession's future HandoverOut workflow (#23)
// checks via hasSuccessfulIdentityVerification before letting a scan
// resolve to HandoverOut. A rejected outcome requires a reason (FR-15)
// and does not stop the Asset leaving by itself — this route only
// records the fact; refusing HandoverOut is #23's job.
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const customerId = getCustomerIdParam(event)
  const body = await readValidatedBody(event, bodySchema.parse)

  const { repo, close } = createCustomerIdentityComplianceDeps(event)

  try {
    return await recordIdentityVerification(repo, {
      tenantId: operator.tenantId,
      customerId,
      identityEvidenceId: body.identityEvidenceId,
      operatorId: operator.id,
      outcome: body.outcome,
      reason: body.reason,
    })
  } catch (err) {
    translateCustomerIdentityComplianceError(err)
  } finally {
    await close()
  }
})
