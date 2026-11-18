import { listRecentVisitorQuestions } from '../../../contexts/tool-recommendation'
import { createCatalogDeps } from '../../../utils/catalog-deps'
import { requireOperator } from '../../../utils/operator-session'
import { buildRecommendationCatalog, createToolRecommendationDeps } from '../../../utils/tool-recommendation-deps'

const LIMIT = 100

// S-25 „Čo ľudia hľadali“ (D-64; #214): the latest stored questions (kept
// 90 days, contact details already stripped) with the AssetTypes they were
// shown. A question with none is a gap in the offer; S-25 highlights it.
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const { repo } = createToolRecommendationDeps(event)
  const catalogDeps = createCatalogDeps(event)
  try {
    const [questions, catalog] = await Promise.all([
      listRecentVisitorQuestions(repo, { tenantId: operator.tenantId, limit: LIMIT }),
      buildRecommendationCatalog(catalogDeps.repo, operator.tenantId),
    ])
    return questions.map((question) => ({
      id: question.id,
      questionText: question.questionText,
      recordedAt: question.recordedAt,
      matched: question.recommendedAssetTypeIds.length > 0,
      // An AssetType unpublished since shows without a name.
      recommended: question.recommendedAssetTypeIds.map((id) => ({
        assetTypeId: id,
        name: catalog.byId.get(id)?.name ?? null,
      })),
    }))
  } finally {
    await catalogDeps.close()
  }
})
