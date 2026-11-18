import { useRuntimeConfig } from '#imports'
import {
  createPostgresMarketingConsentRepository,
  withdrawMarketingConsent,
} from '../../../contexts/customer-identity-compliance'
import { getSharedDatabaseClient } from '../../../utils/db'
import { getSeededTenantId } from '../../../utils/tenant'

// S-28 (#216; D-14, P7): the login-free unsubscribe link every marketing
// e-mail carries. A POST from the page's button, so a mail scanner opening
// the link withdraws nothing on the Customer's behalf. Idempotent.
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token') ?? ''
  const sql = getSharedDatabaseClient(useRuntimeConfig(event).databaseUrl)
  const tenantId = await getSeededTenantId(sql)
  const outcome = token
    ? await withdrawMarketingConsent(createPostgresMarketingConsentRepository(sql), {
        tenantId,
        token,
      })
    : 'unknown_token'
  if (outcome === 'unknown_token') {
    throw createError({
      statusCode: 404,
      statusMessage: 'Unknown unsubscribe link.',
      data: { code: 'MarketingUnsubscribeLinkInvalidError' },
    })
  }
  return { withdrawn: true }
})
