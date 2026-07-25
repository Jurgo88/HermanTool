import { unpublishAssetType } from '../../../../contexts/catalog'
import { createCatalogDeps, getAssetTypeIdParam, translateCatalogError } from '../../../../utils/catalog-deps'
import { requireOperator } from '../../../../utils/operator-session'

// FR-01/FR-37: hides an AssetType from a Visitor without deleting it.
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const assetTypeId = getAssetTypeIdParam(event)
  const { repo, close } = createCatalogDeps(event)

  try {
    return await unpublishAssetType(repo, { tenantId: operator.tenantId, assetTypeId, operatorId: operator.id })
  } catch (err) {
    translateCatalogError(err)
  } finally {
    await close()
  }
})
