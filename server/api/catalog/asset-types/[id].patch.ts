import { updateAssetType } from '../../../contexts/catalog'
import { createCatalogDeps, getAssetTypeIdParam, translateCatalogError } from '../../../utils/catalog-deps'
import { requireOperator } from '../../../utils/operator-session'
import { updateAssetTypeBodySchema } from '../../../utils/catalog-validation'

// FR-37: partial update of an AssetType's name, description, day rate
// and/or deposit amount. Publication state is not accepted here — it
// has its own explicit endpoints (POST .../publish, .../unpublish),
// matching the Asset Registry convention of named transitions over a
// generic flag flip.
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const assetTypeId = getAssetTypeIdParam(event)
  const body = await readValidatedBody(event, updateAssetTypeBodySchema.parse)
  const { repo, close } = createCatalogDeps(event)

  try {
    return await updateAssetType(repo, {
      tenantId: operator.tenantId,
      assetTypeId,
      operatorId: operator.id,
      ...body,
    })
  } catch (err) {
    translateCatalogError(err)
  } finally {
    await close()
  }
})
