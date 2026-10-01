import { createClassificationEntry } from '../../../../contexts/catalog'
import { classificationLabelBodySchema } from '../../../../utils/catalog-validation'
import {
  createCatalogDeps,
  getClassificationKindParam,
  translateCatalogError,
} from '../../../../utils/catalog-deps'
import { requireOperator } from '../../../../utils/operator-session'

// D-54, FR-37, FR-34: add a PowerSource or UseArea at the end of the list.
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const kind = getClassificationKindParam(event)
  const { label } = await readValidatedBody(event, classificationLabelBodySchema.parse)
  const { repo, close } = createCatalogDeps(event)

  try {
    return await createClassificationEntry(repo, {
      tenantId: operator.tenantId,
      kind,
      label,
      operatorId: operator.id,
    })
  } catch (err) {
    translateCatalogError(err)
  } finally {
    await close()
  }
})
