import { reorderClassification } from '../../../../contexts/catalog'
import { classificationReorderBodySchema } from '../../../../utils/catalog-validation'
import {
  createCatalogDeps,
  getClassificationKindParam,
  translateCatalogError,
} from '../../../../utils/catalog-deps'
import { requireOperator } from '../../../../utils/operator-session'

// D-54, FR-37, FR-34: the full list in its new order.
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const kind = getClassificationKindParam(event)
  const { sequence } = await readValidatedBody(event, classificationReorderBodySchema.parse)
  const { repo, close } = createCatalogDeps(event)

  try {
    return await reorderClassification(repo, {
      tenantId: operator.tenantId,
      kind,
      sequence,
      operatorId: operator.id,
    })
  } catch (err) {
    translateCatalogError(err)
  } finally {
    await close()
  }
})
