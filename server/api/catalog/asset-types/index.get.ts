import { listAssetTypes } from '../../../contexts/catalog'
import { createCatalogDeps } from '../../../utils/catalog-deps'
import { requireOperator } from '../../../utils/operator-session'

// FR-37 admin surface: an Operator sees every AssetType, published or
// not — unlike the public catalog browse (issue #11), which will only
// ever show published ones.
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const { repo, close } = createCatalogDeps(event)

  try {
    return await listAssetTypes(repo, { tenantId: operator.tenantId })
  } finally {
    await close()
  }
})
