import { z } from 'zod'
import {
  getAvailabilityMonth,
  InvalidMonthError,
  monthOfDay,
  todayRentalDay,
} from '../../../../../contexts/availability-reservation'
import {
  createAvailabilityReservationDeps,
  translateAvailabilityReservationError,
} from '../../../../../utils/availability-reservation-deps'
import { createCatalogDeps, getAssetTypeIdParam } from '../../../../../utils/catalog-deps'
import { getSeededTenantId } from '../../../../../utils/tenant'

// No month means the current one in the Tenant's timezone, so the
// browser never derives "this month" from a date (D-51).
const querySchema = z.object({ month: z.string().optional() })

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
    // A display read: no transaction (D-33 decides at checkout), and the
    // publish check runs alongside the month instead of before it.
    const [assetType, calendar] = await Promise.all([
      catalog.repo.getAssetType(tenantId, assetTypeId),
      getAvailabilityMonth(availability.repo, availability.repo.readRentablePoolCount, {
        tenantId,
        assetTypeId,
        month: month ?? monthOfDay(todayRentalDay()),
        today: todayRentalDay(),
      }),
    ])
    if (!assetType || !assetType.published) {
      throw createError({ statusCode: 404, statusMessage: 'AssetType not found.' })
    }
    return calendar
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
