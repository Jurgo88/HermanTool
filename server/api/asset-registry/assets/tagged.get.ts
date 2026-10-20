import { createAssetRegistryDeps } from '../../../utils/asset-registry-deps'
import { requireOperator } from '../../../utils/operator-session'

// FR-26: every unit that is not Retired with its active AssetTag, so the
// admin can print a damaged or lost sticker again with the same code.
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const { repo, close } = createAssetRegistryDeps(event)

  try {
    const tagged = await repo.listTaggedAssets(operator.tenantId)
    return tagged.map(({ asset, tag }) => ({
      assetId: asset.id,
      assetTypeId: asset.assetTypeId,
      status: asset.status,
      tagCode: tag.tagCode,
    }))
  } finally {
    await close()
  }
})
