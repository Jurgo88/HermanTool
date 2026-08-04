import { markAssetRentable } from '../../../../contexts/asset-registry'
import {
  createAssetRegistryDeps,
  getAssetRegistryAssetIdParam,
  translateAssetRegistryError,
} from '../../../../utils/asset-registry-deps'
import { requireOperator } from '../../../../utils/operator-session'

// W9/F10, issue #9 follow-up: the explicit third step of
// AssetRegistered -> AssetTagBound -> AssetMadeRentable — see
// server/contexts/asset-registry/asset-lifecycle.ts's own comment on why
// this is never implicit in registration. A low-frequency admin surface
// (A-09), no PIN reconfirmation (F8/FR-36 gates money/evidence-bearing
// attestations only, and this is neither).
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const assetId = getAssetRegistryAssetIdParam(event)
  const { repo, close } = createAssetRegistryDeps(event)

  try {
    const asset = await markAssetRentable(repo, { tenantId: operator.tenantId, assetId, operatorId: operator.id })
    return { assetId: asset.id, status: asset.status }
  } catch (err) {
    translateAssetRegistryError(err)
  } finally {
    await close()
  }
})
