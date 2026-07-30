import { z } from 'zod'
import { declareAssetLost } from '../../../../contexts/handover-possession'
import {
  createHandoverPossessionDeps,
  getRentalAgreementIdParam,
  translateHandoverPossessionError,
} from '../../../../utils/handover-possession-deps'
import { InvalidPinError, verifyOperatorPin } from '../../../../utils/operator-pin'
import { createOperatorsDeps } from '../../../../utils/operators-deps'
import { requireOperator } from '../../../../utils/operator-session'

const bodySchema = z.object({
  reason: z.string().min(1),
  // F8/D-22/FR-36: resolves WHICH Operator is attesting the LostAsset
  // declaration — see server/utils/operator-pin.ts.
  pin: z.string().min(1),
})

// D-17, FR-31, FR-36, W6: the transition from Overdue to LostAsset is
// always this explicit Operator declaration with a reason — never
// automatic, never a timer, and never gated by the (unset, OQ #5)
// LostAsset threshold value, which only ever gates a prompt shown to
// the Operator in the Overdue view, not this action. Moves the Asset
// to Retired in Asset Registry (AssetDeclaredLost).
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const rentalAgreementId = getRentalAgreementIdParam(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const { repo, close } = createHandoverPossessionDeps(event)
  const operators = createOperatorsDeps(event)

  try {
    const attestingOperator = await verifyOperatorPin(operators.repo, operator.tenantId, body.pin)

    return await declareAssetLost(
      { repo },
      {
        tenantId: operator.tenantId,
        rentalAgreementId,
        operatorId: attestingOperator.id,
        reason: body.reason,
      },
    )
  } catch (err) {
    if (err instanceof InvalidPinError) {
      throw createError({ statusCode: 401, statusMessage: err.message })
    }
    translateHandoverPossessionError(err)
  } finally {
    await Promise.all([close(), operators.close()])
  }
})
