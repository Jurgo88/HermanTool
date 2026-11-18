import { useRuntimeConfig } from '#imports'
import {
  countActiveMarketingConsents,
  createPostgresMarketingConsentRepository,
} from '../../../contexts/customer-identity-compliance'
import { getSharedDatabaseClient } from '../../../utils/db'
import { requireOperator } from '../../../utils/operator-session'

// S-27 (#216): how many contacts currently consent to offers. A number
// only — no list of people until OQ #27 says how long contacts may be kept.
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const sql = getSharedDatabaseClient(useRuntimeConfig(event).databaseUrl)
  const count = await countActiveMarketingConsents(createPostgresMarketingConsentRepository(sql), {
    tenantId: operator.tenantId,
  })
  return { count }
})
