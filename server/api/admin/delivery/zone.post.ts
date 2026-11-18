import { z } from 'zod'
import { addZoneMunicipality } from '../../../contexts/logistics-delivery'
import { requireOperator } from '../../../utils/operator-session'
import {
  createLogisticsDeliveryDeps,
  translateLogisticsDeliveryError,
} from '../../../utils/logistics-delivery-deps'

const bodySchema = z.object({ name: z.string().max(120) })

// S-29 (D-66; #217): add a municipality to the DeliveryZone (FR-34).
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const { name } = await readValidatedBody(event, bodySchema.parse)
  const { repo } = createLogisticsDeliveryDeps(event)
  try {
    return await addZoneMunicipality(repo, {
      tenantId: operator.tenantId,
      name,
      operatorId: operator.id,
    })
  } catch (err) {
    translateLogisticsDeliveryError(err)
  }
})
