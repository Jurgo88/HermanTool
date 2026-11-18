import { isDeliveryOffered } from '../../contexts/logistics-delivery'
import { createLogisticsDeliveryDeps } from '../../utils/logistics-delivery-deps'
import { getSeededTenantId } from '../../utils/tenant'
import { deliverySettingsOf, getTenantSettings } from '../../utils/tenant-settings'

// S-03 (D-66; #217): whether Delivery/Collection is offered, the zone's
// municipalities and the flat fee. A Visitor read; nothing written. Not
// offered until the Tenant sets the flat fee and names a municipality
// (OQ #32). The per-km rate is not shown: outside the zone the price is
// agreed by phone.
export default defineEventHandler(async (event) => {
  const { repo, sql } = createLogisticsDeliveryDeps(event)
  const tenantId = await getSeededTenantId(sql)
  const [zone, settings] = await Promise.all([
    repo.listZone(tenantId),
    getTenantSettings(sql, tenantId),
  ])
  const delivery = deliverySettingsOf(settings)
  const offered = isDeliveryOffered(delivery, zone)
  return {
    offered,
    flatFee: offered ? delivery.flatFee : null,
    municipalities: offered ? zone.map(({ id, name }) => ({ id, name })) : [],
  }
})
