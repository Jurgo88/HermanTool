import { z } from 'zod'
import { useRuntimeConfig } from '#imports'
import {
  InvalidOnlineDiscountError,
  MAX_ONLINE_DISCOUNT_BASIS_POINTS,
} from '../../../contexts/payments'
import { getSharedDatabaseClient } from '../../../utils/db'
import { requireOperator } from '../../../utils/operator-session'
import { setOnlinePaymentDiscount } from '../../../utils/tenant-settings'

// null switches the discount off. Basis points: 1000 = 10 %.
const bodySchema = z.object({
  basisPoints: z.number().int().min(1).max(MAX_ONLINE_DISCOUNT_BASIS_POINTS).nullable(),
})

// S-27 (D-65; issue #215): sets or clears the Tenant's discount for paying
// online. Attributed to the signed-in Operator (FR-34); Tenant from the
// session (FR-33). Not PIN-gated: it attests nothing that happened at the
// counter, and it is an admin-surface edit like a day rate (FR-37).
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const { basisPoints } = await readValidatedBody(event, bodySchema.parse)
  const sql = getSharedDatabaseClient(useRuntimeConfig(event).databaseUrl)
  try {
    return await setOnlinePaymentDiscount(sql, {
      tenantId: operator.tenantId,
      basisPoints,
      operatorId: operator.id,
    })
  } catch (err) {
    if (err instanceof InvalidOnlineDiscountError) {
      throw createError({
        statusCode: 400,
        statusMessage: err.message,
        data: { code: err.constructor.name },
      })
    }
    throw err
  }
})
