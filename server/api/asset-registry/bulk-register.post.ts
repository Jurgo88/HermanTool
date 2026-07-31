import { z } from 'zod'
import { bulkRegisterAssets, parseBulkRegistrationCsv } from '../../contexts/asset-registry'
import { createAssetRegistryDeps, translateAssetRegistryError } from '../../utils/asset-registry-deps'
import { requireOperator } from '../../utils/operator-session'

const bodySchema = z.object({ csv: z.string().min(1) })

// F10, FR-25, FR-26, W9; issue #9: the 200-asset pilot bootstrap. A
// low-frequency admin surface (A-09), not a counter interaction — no PIN
// reconfirmation (F8/FR-36 gates money/evidence-bearing attestations
// only, and registering fleet inventory is neither).
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const { repo, close } = createAssetRegistryDeps(event)

  try {
    const lines = parseBulkRegistrationCsv(body.csv)
    const units = await bulkRegisterAssets(repo, { tenantId: operator.tenantId, operatorId: operator.id, lines })

    return {
      units: units.map((u) => ({ assetId: u.asset.id, assetTypeId: u.asset.assetTypeId, tagCode: u.tag.tagCode })),
    }
  } catch (err) {
    translateAssetRegistryError(err)
  } finally {
    await close()
  }
})
