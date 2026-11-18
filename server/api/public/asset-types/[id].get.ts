import {
  getPublishedAssetType,
  listPublishedAccessoriesOf,
  listPublishedCompatibleOf,
} from '../../../contexts/catalog'
import {
  createCatalogDeps,
  getAssetTypeIdParam,
  translateCatalogError,
} from '../../../utils/catalog-deps'
import { applyOnlinePaymentDiscount } from '../../../contexts/payments'
import { getSeededTenantId } from '../../../utils/tenant'
import { getTenantSettings } from '../../../utils/tenant-settings'

// S-02 (D-58), FR-02: one published AssetType with its D-55 content and
// its D-57 Accessories and D-62 CompatibleAssetTypes, for a Visitor — no session, nothing written, same
// as ../asset-types.get.ts. Unpublished or an Accessory answers 404,
// exactly like a missing id.
export default defineEventHandler(async (event) => {
  const assetTypeId = getAssetTypeIdParam(event)
  const { repo, sql, close } = createCatalogDeps(event)

  try {
    const tenantId = await getSeededTenantId(sql)
    const assetType = await getPublishedAssetType(repo, { tenantId, assetTypeId })
    const [accessories, compatible, settings] = await Promise.all([
      listPublishedAccessoriesOf(repo, { tenantId, principalId: assetTypeId }),
      listPublishedCompatibleOf(repo, { tenantId, assetTypeId }),
      getTenantSettings(sql, tenantId),
    ])
    // D-65: "25 €/deň · pri platbe online 22,50 €" — computed here, never
    // in the browser. Null when the Tenant has set no discount (OQ #31).
    const discount = settings.onlinePaymentDiscountBasisPoints
    const onlineDayRate =
      discount === null ? null : applyOnlinePaymentDiscount(assetType.dayRate, discount).rentalFee

    return {
      id: assetType.id,
      name: assetType.name,
      description: assetType.description,
      dayRate: assetType.dayRate,
      onlineDayRate,
      depositAmount: assetType.depositAmount,
      powerSourceId: assetType.powerSourceId,
      useAreaIds: assetType.useAreaIds,
      specifications: assetType.specifications,
      includedContents: assetType.includedContents,
      handlingNotice: assetType.handlingNotice,
      imageFile: assetType.imageFile,
      accessories: accessories.map((accessory) => ({
        id: accessory.id,
        name: accessory.name,
        dayRate: accessory.dayRate,
        depositAmount: accessory.depositAmount,
        imageFile: accessory.imageFile,
      })),
      compatible: compatible.map((other) => ({
        id: other.id,
        name: other.name,
        dayRate: other.dayRate,
        depositAmount: other.depositAmount,
        imageFile: other.imageFile,
      })),
    }
  } catch (err) {
    translateCatalogError(err)
  } finally {
    await close()
  }
})
