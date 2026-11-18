import { z } from 'zod'
import { attestDeliveryFeePayment } from '../../../../contexts/logistics-delivery'
import { InvalidPinError, verifyOperatorPin } from '../../../../utils/operator-pin'
import { createOperatorsDeps } from '../../../../utils/operators-deps'
import { requireOperator } from '../../../../utils/operator-session'
import {
  createLogisticsDeliveryDeps,
  getPositiveIdParam,
  translateLogisticsDeliveryError,
} from '../../../../utils/logistics-delivery-deps'

const bodySchema = z.object({
  method: z.enum(['cash', 'card_terminal', 'qr']),
  pin: z.string().min(1),
})

// S-29 (D-66, D-65 pattern, P6; #217): the driver attests the outside-zone
// fee received on site. Amount = the server's price; PIN-resolved Operator
// (D-48, FR-34). The eKasa receipt is the Tenant's; the platform issues none.
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const deliveryId = getPositiveIdParam(event, 'id')
  const body = await readValidatedBody(event, bodySchema.parse)
  const { repo } = createLogisticsDeliveryDeps(event)
  const operators = createOperatorsDeps(event)
  try {
    const attesting = await verifyOperatorPin(operators.repo, operator.tenantId, body.pin)
    return await attestDeliveryFeePayment(repo, {
      tenantId: operator.tenantId,
      deliveryId,
      method: body.method,
      operatorId: attesting.id,
    })
  } catch (err) {
    if (err instanceof InvalidPinError) {
      throw createError({
        statusCode: 401,
        statusMessage: err.message,
        data: { code: err.constructor.name },
      })
    }
    translateLogisticsDeliveryError(err)
  } finally {
    await operators.close()
  }
})
