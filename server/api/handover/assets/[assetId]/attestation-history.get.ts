import { AssetNotFoundError } from '../../../../contexts/asset-registry'
import { getAssetAttestationHistory } from '../../../../contexts/handover-possession'
import { translateAssetRegistryError } from '../../../../utils/asset-registry-deps'
import { createHandoverPossessionDeps, getAssetIdParam } from '../../../../utils/handover-possession-deps'
import { createOperatorsDeps } from '../../../../utils/operators-deps'
import { requireOperator } from '../../../../utils/operator-session'

// FR-43, P4: "the artefact P4's append-only history exists to produce" —
// what an Operator pulls up when a Customer disputes a deduction.
// Operator-authenticated; read-only. Enriches getAssetAttestationHistory's
// own self-contained result with the Asset (S-13's heading), its active
// tag code (S-17 reuses it to start a backdated HandoverIn without a
// second lookup), and Operator display names (D-16/FR-34 attribution is
// only meaningful once it's a name, not a bare id) — all read-only
// composition at this route, same reasoning as
// server/utils/operator-counter-views.ts's describeReservation.
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const assetId = getAssetIdParam(event)
  const { repo, assetRegistryRepo, close } = createHandoverPossessionDeps(event)
  const operators = createOperatorsDeps(event)

  try {
    const [asset, tag, history, operatorList] = await Promise.all([
      assetRegistryRepo.getAsset(operator.tenantId, assetId),
      assetRegistryRepo.getActiveTagForAsset(operator.tenantId, assetId),
      getAssetAttestationHistory(repo, { tenantId: operator.tenantId, assetId }),
      operators.repo.listForTenant(operator.tenantId),
    ])
    if (!asset) throw new AssetNotFoundError(assetId)

    const operatorNames = Object.fromEntries(operatorList.map((o) => [o.id, o.displayName]))
    return { asset, tagCode: tag?.tagCode ?? null, history, operatorNames }
  } catch (err) {
    translateAssetRegistryError(err)
  } finally {
    await Promise.all([close(), operators.close()])
  }
})
