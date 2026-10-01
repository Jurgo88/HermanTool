import { renameClassificationEntry } from '../../../../contexts/catalog'
import { classificationLabelBodySchema } from '../../../../utils/catalog-validation'
import {
  createCatalogDeps,
  getClassificationIdParam,
  getClassificationKindParam,
  translateCatalogError,
} from '../../../../utils/catalog-deps'
import { requireOperator } from '../../../../utils/operator-session'

// D-54, FR-37, FR-34: rename. Order has its own endpoint (reorder.post).
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const kind = getClassificationKindParam(event)
  const id = getClassificationIdParam(event)
  const { label } = await readValidatedBody(event, classificationLabelBodySchema.parse)
  const { repo, close } = createCatalogDeps(event)

  try {
    return await renameClassificationEntry(repo, {
      tenantId: operator.tenantId,
      kind,
      id,
      label,
      operatorId: operator.id,
    })
  } catch (err) {
    translateCatalogError(err)
  } finally {
    await close()
  }
})
