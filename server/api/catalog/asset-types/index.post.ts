import { createAssetType } from '../../../contexts/catalog'
import { createCatalogDeps, translateCatalogError } from '../../../utils/catalog-deps'
import { requireOperator } from '../../../utils/operator-session'
import { createAssetTypeBodySchema } from '../../../utils/catalog-validation'

// FR-37: an Operator creates an AssetType — name, description, day rate,
// deposit amount. Starts unpublished (FR-01); publishing is its own
// explicit action (POST .../publish), not a flag on this request.
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const body = await readValidatedBody(event, createAssetTypeBodySchema.parse)
  const { repo, close } = createCatalogDeps(event)

  try {
    return await createAssetType(repo, {
      tenantId: operator.tenantId,
      operatorId: operator.id,
      ...body,
    })
  } catch (err) {
    translateCatalogError(err)
  } finally {
    await close()
  }
})
