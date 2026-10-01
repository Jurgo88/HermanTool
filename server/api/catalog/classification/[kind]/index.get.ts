import { listClassification } from '../../../../contexts/catalog'
import { createCatalogDeps, getClassificationKindParam } from '../../../../utils/catalog-deps'
import { requireOperator } from '../../../../utils/operator-session'

// D-54, FR-37: the PowerSource or UseArea list, in display order.
// `kind` is `power-sources` or `use-areas`.
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const kind = getClassificationKindParam(event)
  const { repo, close } = createCatalogDeps(event)

  try {
    return await listClassification(repo, { tenantId: operator.tenantId, kind })
  } finally {
    await close()
  }
})
