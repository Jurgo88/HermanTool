import { z } from 'zod'
import { requireOperator } from '../../../utils/operator-session'
import { createLogisticsDeliveryDeps } from '../../../utils/logistics-delivery-deps'
import { setDeliveryFees } from '../../../utils/tenant-settings'

// Minor units of EUR (D-21). null clears a value: no Delivery is offered
// without the flat fee, no outside-zone price without the rate (OQ #32).
const amount = z.number().int().nonnegative().max(100_000_00).nullable()
const bodySchema = z.object({ flatFeeCents: amount, perKmCents: amount })

// S-29 (D-66; #217): the Tenant's Delivery fees. Attributed (FR-34).
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const { sql } = createLogisticsDeliveryDeps(event)
  const settings = await setDeliveryFees(sql, {
    tenantId: operator.tenantId,
    flatFeeCents: body.flatFeeCents,
    perKmCents: body.perKmCents,
    operatorId: operator.id,
  })
  return { flatFee: settings.deliveryFlatFee, perKmRate: settings.deliveryPerKmRate }
})
