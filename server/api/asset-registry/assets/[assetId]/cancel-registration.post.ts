import { cancelAssetRegistration } from '../../../../contexts/asset-registry'
import {
  createAssetRegistryDeps,
  getAssetRegistryAssetIdParam,
  translateAssetRegistryError,
} from '../../../../utils/asset-registry-deps'
import { requireOperator } from '../../../../utils/operator-session'

// FR-25/FR-26: withdraws a unit registered by mistake, before it was ever
// in service. The unit is Retired with the reason recorded and the acting
// Operator attributed (FR-34); nothing is deleted.
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const assetId = getAssetRegistryAssetIdParam(event)
  const { repo, close } = createAssetRegistryDeps(event)

  try {
    const asset = await cancelAssetRegistration(repo, {
      tenantId: operator.tenantId,
      assetId,
      operatorId: operator.id,
    })
    return { assetId: asset.id, status: asset.status }
  } catch (err) {
    translateAssetRegistryError(err)
  } finally {
    await close()
  }
})
