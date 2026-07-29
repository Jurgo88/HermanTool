import { z } from 'zod'
import { performHandoverIn } from '../../contexts/handover-possession'
import { createHandoverPossessionDeps, translateHandoverPossessionError } from '../../utils/handover-possession-deps'
import { InvalidPinError, verifyOperatorPin } from '../../utils/operator-pin'
import { createOperatorsDeps } from '../../utils/operators-deps'
import { requireOperator } from '../../utils/operator-session'

// D-10, FR-24, Finding 9: omit for an ordinary live scan (occurredAt
// defaults to now() in the domain layer). Supply to record the "return
// went unscanned" repair — occurredAt is backdated, reason is mandatory.
const backdateSchema = z.object({ occurredAt: z.coerce.date(), reason: z.string().min(1) })

const bodySchema = z.object({
  tagCode: z.string().min(1),
  conditionPhotoContentTypes: z.array(z.string().min(1)).min(1),
  // F8/D-22/FR-36: see handover-out.post.ts's identical field — resolves
  // WHICH Operator is attesting the bundled ConditionReport, independent
  // of the session's own Operator.
  pin: z.string().min(1),
  backdate: backdateSchema.optional(),
})

// D-09, FR-19, W5: the Asset comes back. The scan resolves to HandoverIn
// (#22), Possession closes, condition is captured again. Operator-
// authenticated — a counter action. Unlike HandoverOut, no reservationId/
// customerId is needed: the open RentalAgreement for the scanned Asset
// is unambiguous (D-04/D-13).
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const { repo, conditionsGateway, close } = createHandoverPossessionDeps(event)
  const operators = createOperatorsDeps(event)

  try {
    const attestingOperator = await verifyOperatorPin(operators.repo, operator.tenantId, body.pin)

    return await performHandoverIn(
      { repo, conditionsGateway },
      {
        tenantId: operator.tenantId,
        tagCode: body.tagCode,
        operatorId: attestingOperator.id,
        conditionPhotoContentTypes: body.conditionPhotoContentTypes,
        backdate: body.backdate,
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
