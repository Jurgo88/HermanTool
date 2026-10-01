import { removeClassificationEntry } from '../../../../contexts/catalog'
import {
  createCatalogDeps,
  getClassificationIdParam,
  getClassificationKindParam,
  translateCatalogError,
} from '../../../../utils/catalog-deps'
import { requireOperator } from '../../../../utils/operator-session'

// D-54, FR-34: attributed soft removal, refused while any AssetType uses
// the entry (409 with the AssetType names).
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const kind = getClassificationKindParam(event)
  const id = getClassificationIdParam(event)
  const { repo, close } = createCatalogDeps(event)

  try {
    await removeClassificationEntry(repo, {
      tenantId: operator.tenantId,
      kind,
      id,
      operatorId: operator.id,
    })
    setResponseStatus(event, 204)
    return null
  } catch (err) {
    translateCatalogError(err)
  } finally {
    await close()
  }
})
