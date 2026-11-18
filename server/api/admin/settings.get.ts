import { useRuntimeConfig } from '#imports'
import { getSharedDatabaseClient } from '../../utils/db'
import { requireOperator } from '../../utils/operator-session'
import { getTenantSettings } from '../../utils/tenant-settings'

// S-27 Nastavenia (D-65; issue #215): the Tenant's policy values. The
// online-payment discount is null until the Tenant sets it (OQ #31).
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const sql = getSharedDatabaseClient(useRuntimeConfig(event).databaseUrl)
  return getTenantSettings(sql, operator.tenantId)
})
