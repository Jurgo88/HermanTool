import { z } from 'zod'
import { useRuntimeConfig } from '#imports'
import { getSharedDatabaseClient } from '../../../utils/db'
import { requireOperator } from '../../../utils/operator-session'
import { setRecommendationMonthlyCap } from '../../../utils/tenant-settings'
import { translateToolRecommendationError } from '../../../utils/tool-recommendation-deps'

// Euro cents; null returns to the owner's default (10 €), 0 switches off.
const bodySchema = z.object({
  cents: z.number().int().min(0).max(100_000).nullable(),
})

// S-27 (D-64; #214): sets the Tenant's monthly cap for AI recommendations.
// Attributed to the signed-in Operator (FR-34); Tenant from the session
// (FR-33). Not PIN-gated: an admin-surface edit, like the discount.
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const { cents } = await readValidatedBody(event, bodySchema.parse)
  const sql = getSharedDatabaseClient(useRuntimeConfig(event).databaseUrl)
  try {
    return await setRecommendationMonthlyCap(sql, { tenantId: operator.tenantId, cents, operatorId: operator.id })
  } catch (err) {
    translateToolRecommendationError(err)
  }
})
