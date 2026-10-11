import { z } from 'zod'
import { InvalidRentalPeriodError, todayRentalDay } from '../../contexts/availability-reservation'
import { AssetTypeNotFoundError } from '../../contexts/catalog'
import { createCatalogDeps } from '../../utils/catalog-deps'
import { quoteReservationLines } from '../../utils/reservation-quote'
import { getSeededTenantId } from '../../utils/tenant'

const dayPattern = /^\d{4}-\d{2}-\d{2}$/

const bodySchema = z.object({
  lines: z
    .array(
      z.object({
        assetTypeId: z.number().int().positive(),
        period: z.object({
          startDay: z.string().regex(dayPattern),
          endDay: z.string().regex(dayPattern),
        }),
        quantity: z.number().int().min(1).max(50),
      }),
    )
    .min(1)
    .max(50),
})

// S-03 (FR-02, FR-09, D-07; issue #164): the rental fee and the deposit
// for a draft, computed server-side so the browser does no date
// arithmetic (D-51) and shows exactly what Stripe will charge. A Visitor
// is not identified and nothing is written — a quote is not a hold.
export default defineEventHandler(async (event) => {
  const { lines } = await readValidatedBody(event, bodySchema.parse)
  const { repo, sql, close } = createCatalogDeps(event)

  try {
    const tenantId = await getSeededTenantId(sql)
    return await quoteReservationLines(
      lines,
      async (assetTypeId) => {
        const assetType = await repo.getAssetType(tenantId, assetTypeId)
        return assetType?.published ? assetType : null
      },
      { today: todayRentalDay() },
    )
  } catch (err) {
    if (err instanceof AssetTypeNotFoundError) {
      throw createError({
        statusCode: 404,
        statusMessage: err.message,
        data: { code: err.constructor.name },
      })
    }
    if (err instanceof InvalidRentalPeriodError) {
      throw createError({
        statusCode: 400,
        statusMessage: err.message,
        data: { code: err.constructor.name },
      })
    }
    throw err
  } finally {
    await close()
  }
})
