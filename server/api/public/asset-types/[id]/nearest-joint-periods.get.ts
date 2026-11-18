import { z } from 'zod'
import {
  findNearestJointPeriods,
  rentalPeriodLengthInDays,
  todayRentalDay,
  validateRentalPeriod,
} from '../../../../contexts/availability-reservation'
import {
  createAvailabilityReservationDeps,
  translateAvailabilityReservationError,
} from '../../../../utils/availability-reservation-deps'
import { createCatalogDeps, getAssetTypeIdParam } from '../../../../utils/catalog-deps'
import { getSeededTenantId } from '../../../../utils/tenant'

const positiveInt = z.coerce.number().int().positive()
const querySchema = z.object({
  compatibleId: positiveInt,
  startDay: z.string(),
  endDay: z.string(),
  // Units of the AssetType whose page this is; the compatible one is
  // always a single unit ("Pridať na rovnaký termín" adds one).
  quantity: positiveInt.max(20).default(1),
})

const MAX_PERIOD_DAYS = 92 // same bound as ./availability.get.ts

// S-02 (D-62; issue #210): when a CompatibleAssetType is not free for the
// picked period, the nearest same-length periods in which both are. A
// Visitor read — no session, nothing written. Both AssetTypes must be
// published and actually linked; anything else reads as not found, so
// the route cannot be used to probe unrelated AssetTypes (FR-33 is kept
// by resolving the Tenant on the server, never from the request).
export default defineEventHandler(async (event) => {
  const assetTypeId = getAssetTypeIdParam(event)
  const { compatibleId, startDay, endDay, quantity } = await getValidatedQuery(
    event,
    querySchema.parse,
  )

  const catalog = createCatalogDeps(event)
  const availability = createAvailabilityReservationDeps(event)

  try {
    const tenantId = await getSeededTenantId(catalog.sql)
    const self = await catalog.repo.getAssetType(tenantId, assetTypeId)
    const other = await catalog.repo.getAssetType(tenantId, compatibleId)
    if (
      !self ||
      !self.published ||
      !other ||
      !other.published ||
      other.principalIds.length > 0 ||
      !self.compatibleIds.includes(compatibleId)
    ) {
      throw createError({ statusCode: 404, statusMessage: 'AssetType not found.' })
    }

    const period = { startDay, endDay }
    validateRentalPeriod(period)
    if (rentalPeriodLengthInDays(period) > MAX_PERIOD_DAYS) {
      throw createError({
        statusCode: 400,
        statusMessage: `Range exceeds ${MAX_PERIOD_DAYS} days.`,
      })
    }

    const periods = await findNearestJointPeriods(
      availability.repo,
      availability.repo.readRentablePoolCount,
      {
        tenantId,
        demands: [
          { assetTypeId, units: quantity },
          { assetTypeId: compatibleId, units: 1 },
        ],
        period,
        today: todayRentalDay(),
      },
    )
    return { periods }
  } catch (err) {
    translateAvailabilityReservationError(err)
  } finally {
    await Promise.all([catalog.close(), availability.close()])
  }
})
