import { z } from 'zod'
import { completeSettlement } from '../../../../contexts/handover-possession'
import { createCustomerIdentityComplianceDeps } from '../../../../utils/customer-identity-compliance-deps'
import {
  createHandoverPossessionDeps,
  getRentalAgreementIdParam,
  translateHandoverPossessionError,
} from '../../../../utils/handover-possession-deps'
import { InvalidPinError, verifyOperatorPin } from '../../../../utils/operator-pin'
import { createOperatorsDeps } from '../../../../utils/operators-deps'
import { requireOperator } from '../../../../utils/operator-session'

// D-21: EUR only in the pilot, matching every other MonetaryAmount
// request body in this codebase (see catalog-validation.ts).
const bodySchema = z.object({
  returnedAmount: z.object({ amount: z.number().int().nonnegative(), currency: z.literal('EUR') }),
  deductionReason: z.string().min(1).optional(),
  // F8/D-22/FR-36: resolves WHICH Operator is attesting DepositReturned —
  // see server/utils/operator-pin.ts.
  pin: z.string().min(1),
})

// D-07, FR-20, FR-21, W5, W8: resolves the deposit. A deduction (returned
// amount less than what DepositTaken recorded) is refused unless both
// the HandoverOut and HandoverIn ConditionReports exist (FR-20, no
// exceptions). No dispute workflow — this attestation plus attribution
// is the product's entire contribution (W8).
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const rentalAgreementId = getRentalAgreementIdParam(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const { repo, close } = createHandoverPossessionDeps(event)
  const operators = createOperatorsDeps(event)
  const customerIdentity = createCustomerIdentityComplianceDeps(event)

  try {
    const attestingOperator = await verifyOperatorPin(operators.repo, operator.tenantId, body.pin)

    return await completeSettlement(
      { repo, identityRepo: customerIdentity.repo },
      {
        tenantId: operator.tenantId,
        rentalAgreementId,
        operatorId: attestingOperator.id,
        returnedAmount: body.returnedAmount,
        deductionReason: body.deductionReason,
      },
    )
  } catch (err) {
    if (err instanceof InvalidPinError) {
      throw createError({ statusCode: 401, statusMessage: err.message, data: { code: err.constructor.name } })
    }
    translateHandoverPossessionError(err)
  } finally {
    await Promise.all([close(), operators.close(), customerIdentity.close()])
  }
})
