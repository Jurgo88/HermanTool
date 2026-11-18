import { z } from 'zod'
import { MAX_DISTANCE_KM, priceOutsideZoneDelivery } from '../../../../contexts/logistics-delivery'
import { InvalidPinError, verifyOperatorPin } from '../../../../utils/operator-pin'
import { createOperatorsDeps } from '../../../../utils/operators-deps'
import { requireOperator } from '../../../../utils/operator-session'
import {
  createLogisticsDeliveryDeps,
  getPositiveIdParam,
  translateLogisticsDeliveryError,
} from '../../../../utils/logistics-delivery-deps'
import { deliverySettingsOf, getTenantSettings } from '../../../../utils/tenant-settings'

// The km only — the fee is computed on the server (D-25).
const bodySchema = z.object({
  distanceKm: z.number().int().min(0).max(MAX_DISTANCE_KM),
  pin: z.string().min(1),
})

// S-29 (D-66; #217): after the phone call the Operator records the
// outside-zone distance; fee = flat fee + km × rate. PIN-gated so the
// price is attributed to who agreed it (D-48, FR-34).
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const deliveryId = getPositiveIdParam(event, 'id')
  const body = await readValidatedBody(event, bodySchema.parse)
  const { repo, sql } = createLogisticsDeliveryDeps(event)
  const operators = createOperatorsDeps(event)
  try {
    const attesting = await verifyOperatorPin(operators.repo, operator.tenantId, body.pin)
    return await priceOutsideZoneDelivery(repo, {
      tenantId: operator.tenantId,
      deliveryId,
      distanceKm: body.distanceKm,
      settings: deliverySettingsOf(await getTenantSettings(sql, operator.tenantId)),
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
