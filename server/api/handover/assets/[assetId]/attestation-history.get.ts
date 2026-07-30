import { getAssetAttestationHistory } from '../../../../contexts/handover-possession'
import { createHandoverPossessionDeps, getAssetIdParam } from '../../../../utils/handover-possession-deps'
import { requireOperator } from '../../../../utils/operator-session'

// FR-43, P4: "the artefact P4's append-only history exists to produce" —
// what an Operator pulls up when a Customer disputes a deduction.
// Operator-authenticated; read-only.
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const assetId = getAssetIdParam(event)
  const { repo, close } = createHandoverPossessionDeps(event)

  try {
    const history = await getAssetAttestationHistory(repo, { tenantId: operator.tenantId, assetId })
    return { history }
  } finally {
    await close()
  }
})
