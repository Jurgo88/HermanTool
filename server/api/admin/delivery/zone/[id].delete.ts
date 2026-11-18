import { removeZoneMunicipality } from '../../../../contexts/logistics-delivery'
import { requireOperator } from '../../../../utils/operator-session'
import {
  createLogisticsDeliveryDeps,
  getPositiveIdParam,
  translateLogisticsDeliveryError,
} from '../../../../utils/logistics-delivery-deps'

// S-29 (D-66; #217): remove a municipality from the zone. A mark, not a
// delete: a Delivery that named it keeps its reference (FR-34 records who).
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const id = getPositiveIdParam(event, 'id')
  const { repo } = createLogisticsDeliveryDeps(event)
  try {
    await removeZoneMunicipality(repo, { tenantId: operator.tenantId, id, operatorId: operator.id })
    return { removed: true }
  } catch (err) {
    translateLogisticsDeliveryError(err)
  }
})
