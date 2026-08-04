import { createAssetRegistryDeps } from '../../../utils/asset-registry-deps'
import { requireOperator } from '../../../utils/operator-session'

// W9/F10, issue #9 follow-up: registration (single or bulk) leaves an
// Asset `unavailable` until the explicit markAssetRentable step (see
// ../[assetId]/mark-rentable.post.ts) — this route is where an Operator
// finds the Assets waiting for that step, since nothing prompts it
// automatically. A low-frequency admin surface (A-09), no PIN
// reconfirmation (F8/FR-36 gates money/evidence-bearing attestations only).
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const { repo, close } = createAssetRegistryDeps(event)

  try {
    const pending = await repo.listPendingActivation(operator.tenantId)
    return pending.map(({ asset, tag }) => ({
      assetId: asset.id,
      assetTypeId: asset.assetTypeId,
      tagCode: tag.tagCode,
      registeredAt: asset.registeredAt,
    }))
  } finally {
    await close()
  }
})
