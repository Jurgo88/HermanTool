import { z } from 'zod'
import {
  eachDayOfPeriod,
  getAvailableCount,
  rentalPeriodLengthInDays,
} from '../../../../contexts/availability-reservation'
import { createAvailabilityReservationDeps, translateAvailabilityReservationError } from '../../../../utils/availability-reservation-deps'
import { createCatalogDeps, getAssetTypeIdParam } from '../../../../utils/catalog-deps'
import { getSeededTenantId } from '../../../../utils/tenant'

const querySchema = z.object({ startDay: z.string(), endDay: z.string() })

// FR-02, FR-03, D-08, W1, R-08 (issue #76/IR-08): a Visitor sees
// availability before committing — the public browse page's other
// missing half. No session, no cookie, no record written, same as
// ../asset-types.get.ts. Depends on D-38 (IR-01): this reads the
// rentable POOL via getAvailableCount, never the literal Rentable
// status count, so a HandoverOut elsewhere does not publish a wrong
// number here.
//
// Import-light deliberately (R-08): this is on the pre-commitment path,
// same discipline as the scan route.
const MAX_WINDOW_DAYS = 92 // ~3 months — a browse-page query, not a report

export default defineEventHandler(async (event) => {
  const assetTypeId = getAssetTypeIdParam(event)
  const { startDay, endDay } = await getValidatedQuery(event, querySchema.parse)

  const catalog = createCatalogDeps(event)
  const availability = createAvailabilityReservationDeps(event)

  try {
    const tenantId = await getSeededTenantId(catalog.sql)

    const assetType = await catalog.repo.getAssetType(tenantId, assetTypeId)
    // Same posture as a Reservation for an unpublished AssetType: a
    // Visitor has no business reason to see availability for something
    // not offered, published or not yet created reads identically.
    if (!assetType || !assetType.published) {
      throw createError({ statusCode: 404, statusMessage: 'AssetType not found.' })
    }

    const period = { startDay, endDay }
    const days = eachDayOfPeriod(period) // throws InvalidRentalPeriodError for a malformed/inverted range
    if (rentalPeriodLengthInDays(period) > MAX_WINDOW_DAYS) {
      throw createError({ statusCode: 400, statusMessage: `Range exceeds ${MAX_WINDOW_DAYS} days.` })
    }

    const perDay = await availability.repo.transaction(async (trx, getRentablePoolCount) =>
      Promise.all(
        days.map(async (day) => ({
          day,
          available: await getAvailableCount(trx, getRentablePoolCount, { tenantId, assetTypeId, day }),
        })),
      ),
    )

    return { assetTypeId, days: perDay }
  } catch (err) {
    translateAvailabilityReservationError(err)
  } finally {
    await Promise.all([catalog.close(), availability.close()])
  }
})
