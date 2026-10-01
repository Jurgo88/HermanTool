import { z } from 'zod'
import {
  getAvailabilityMonth,
  InvalidMonthError,
  todayRentalDay,
} from '../../../../../contexts/availability-reservation'
import {
  createAvailabilityReservationDeps,
  translateAvailabilityReservationError,
} from '../../../../../utils/availability-reservation-deps'
import { createCatalogDeps, getAssetTypeIdParam } from '../../../../../utils/catalog-deps'
import { getSeededTenantId } from '../../../../../utils/tenant'

const querySchema = z.object({ month: z.string() })

// S-02 calendar (D-58; FR-02, FR-03, D-38; issue #152): one month of
// derived levels — free / last / none — for a Visitor. No session, no
// cookie, nothing written. Published AssetTypes only; an Accessory is
// published too, which its principal's checkbox needs (D-57).
export default defineEventHandler(async (event) => {
  const assetTypeId = getAssetTypeIdParam(event)
  const { month } = await getValidatedQuery(event, querySchema.parse)

  const catalog = createCatalogDeps(event)
  const availability = createAvailabilityReservationDeps(event)

  try {
    const tenantId = await getSeededTenantId(catalog.sql)
    const assetType = await catalog.repo.getAssetType(tenantId, assetTypeId)
    if (!assetType || !assetType.published) {
      throw createError({ statusCode: 404, statusMessage: 'AssetType not found.' })
    }

    return await availability.repo.transaction((trx, getRentablePoolCount) =>
      getAvailabilityMonth(trx, getRentablePoolCount, {
        tenantId,
        assetTypeId,
        month,
        today: todayRentalDay(),
      }),
    )
  } catch (err) {
    if (err instanceof InvalidMonthError) {
      throw createError({
        statusCode: 400,
        statusMessage: err.message,
        data: { code: err.constructor.name },
      })
    }
    translateAvailabilityReservationError(err)
  } finally {
    await Promise.all([catalog.close(), availability.close()])
  }
})
