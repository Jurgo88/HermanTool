import { getPublishedAssetType } from '../../../contexts/catalog'
import {
  createCatalogDeps,
  getAssetTypeIdParam,
  translateCatalogError,
} from '../../../utils/catalog-deps'
import { getSeededTenantId } from '../../../utils/tenant'

// S-02 (D-58), FR-02: one published AssetType with its D-55 content, for
// a Visitor — no session, nothing written, same as ../asset-types.get.ts.
// Unpublished answers 404, exactly like a missing id.
export default defineEventHandler(async (event) => {
  const assetTypeId = getAssetTypeIdParam(event)
  const { repo, sql, close } = createCatalogDeps(event)

  try {
    const tenantId = await getSeededTenantId(sql)
    const assetType = await getPublishedAssetType(repo, { tenantId, assetTypeId })

    return {
      id: assetType.id,
      name: assetType.name,
      description: assetType.description,
      dayRate: assetType.dayRate,
      depositAmount: assetType.depositAmount,
      powerSourceId: assetType.powerSourceId,
      useAreaIds: assetType.useAreaIds,
      specifications: assetType.specifications,
      includedContents: assetType.includedContents,
      handlingNotice: assetType.handlingNotice,
      imageFile: assetType.imageFile,
    }
  } catch (err) {
    translateCatalogError(err)
  } finally {
    await close()
  }
})
