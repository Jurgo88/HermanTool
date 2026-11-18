import { requireOperator } from '../../../utils/operator-session'
import { createLogisticsDeliveryDeps } from '../../../utils/logistics-delivery-deps'
import { getTenantSettings } from '../../../utils/tenant-settings'

// S-29 (D-66; #217): the DeliveryZone and the fee settings for the admin.
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const { repo, sql } = createLogisticsDeliveryDeps(event)
  const [zone, settings] = await Promise.all([
    repo.listZone(operator.tenantId),
    getTenantSettings(sql, operator.tenantId),
  ])
  return {
    municipalities: zone.map(({ id, name }) => ({ id, name })),
    flatFee: settings.deliveryFlatFee,
    perKmRate: settings.deliveryPerKmRate,
  }
})
