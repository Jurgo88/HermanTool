import { z } from 'zod'
import { MAX_QUESTION_LENGTH, RecommendationUnavailableError, recommendTools } from '../../contexts/tool-recommendation'
import { createCatalogDeps } from '../../utils/catalog-deps'
import { getTenantSettings } from '../../utils/tenant-settings'
import { getSeededTenantId } from '../../utils/tenant'
import {
  TENANT_TIME_ZONE,
  buildRecommendationCatalog,
  createToolRecommendationDeps,
  translateToolRecommendationError,
  utcDayOf,
  visitorIpOf,
} from '../../utils/tool-recommendation-deps'

const bodySchema = z.object({
  question: z.string().trim().min(1).max(MAX_QUESTION_LENGTH),
})

// S-01 (D-64; #214): a Visitor describes a job and gets at most three of the
// Tenant's published AssetTypes, each with a one-sentence reason. The
// server-side call is the only place the provider key is used (D-25); the
// answer is validated against the published catalog before anything
// reaches the browser. No availability in the result (D-58): the cards link
// to S-02, which owns it. No match is a normal result (`matched: false`),
// for which S-01 offers personal advice.
export default defineEventHandler(async (event) => {
  const { question } = await readValidatedBody(event, bodySchema.parse)
  const { sql, repo, gateway, model, configured } = createToolRecommendationDeps(event)
  const catalogDeps = createCatalogDeps(event)

  try {
    if (!configured) throw new RecommendationUnavailableError('no API key configured')
    const tenantId = await getSeededTenantId(sql)
    const [settings, catalog] = await Promise.all([
      getTenantSettings(sql, tenantId),
      buildRecommendationCatalog(catalogDeps.repo, tenantId),
    ])
    const now = new Date()
    const result = await recommendTools(
      { repo, gateway },
      {
        tenantId,
        question,
        visitorIp: visitorIpOf(event),
        utcDay: utcDayOf(now),
        now,
        timeZone: TENANT_TIME_ZONE,
        model,
        monthlyCap: settings.recommendationMonthlyCap,
        catalog: catalog.entries,
      },
    )
    return {
      matched: result.recommendations.length > 0,
      safetyNote: result.safetyNote,
      recommendations: result.recommendations.map(({ assetTypeId, reason }) => {
        // validateRecommendations kept only ids present in this catalog.
        const assetType = catalog.byId.get(assetTypeId)!
        return {
          assetTypeId,
          reason,
          name: assetType.name,
          dayRate: assetType.dayRate,
          imageFile: assetType.imageFile,
        }
      }),
    }
  } catch (err) {
    translateToolRecommendationError(err)
  } finally {
    await catalogDeps.close()
  }
})
