import { z } from 'zod'
import { performHandoverIn } from '../../contexts/handover-possession'
import { createHandoverPossessionDeps, translateHandoverPossessionError } from '../../utils/handover-possession-deps'
import { requireOperator } from '../../utils/operator-session'

const bodySchema = z.object({
  tagCode: z.string().min(1),
  conditionPhotoContentTypes: z.array(z.string().min(1)).min(1),
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

  try {
    return await performHandoverIn(
      { repo, conditionsGateway },
      {
        tenantId: operator.tenantId,
        tagCode: body.tagCode,
        operatorId: operator.id,
        conditionPhotoContentTypes: body.conditionPhotoContentTypes,
      },
    )
  } catch (err) {
    translateHandoverPossessionError(err)
  } finally {
    await close()
  }
})
