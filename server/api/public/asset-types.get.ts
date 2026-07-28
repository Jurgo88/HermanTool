import { listPublishedAssetTypes } from '../../contexts/catalog'
import { createCatalogDeps } from '../../utils/catalog-deps'
import { getSeededTenantId } from '../../utils/tenant'

// FR-02, W1, P2 §7: a Visitor browses published AssetTypes without
// identifying themselves and without leaving a record — no
// requireOperator() gate, no cookie, no session concept, nothing
// written. D-01: there is no Tenant header or session to resolve from
// on a public route, so this uses the single seeded Tenant.
export default defineEventHandler(async (event) => {
  const { repo, sql, close } = createCatalogDeps(event)

  try {
    const tenantId = await getSeededTenantId(sql)
    const assetTypes = await listPublishedAssetTypes(repo, { tenantId })

    // Only the fields a Visitor needs to decide whether to book —
    // never internal attribution (createdByOperatorId etc.), which has
    // no meaning outside the admin surface.
    return assetTypes.map((assetType) => ({
      id: assetType.id,
      name: assetType.name,
      description: assetType.description,
      dayRate: assetType.dayRate,
      depositAmount: assetType.depositAmount,
    }))
  } finally {
    await close()
  }
})
