import { z } from 'zod'
import { InvalidRentalPeriodError, todayRentalDay } from '../../contexts/availability-reservation'
import { AssetTypeNotFoundError } from '../../contexts/catalog'
import { createCatalogDeps } from '../../utils/catalog-deps'
import { quoteReservationLines } from '../../utils/reservation-quote'
import { deliverySettingsOf, getTenantSettings } from '../../utils/tenant-settings'
import {
  LogisticsDeliveryError,
  createPostgresLogisticsDeliveryRepository,
  quoteDeliveryRequests,
} from '../../contexts/logistics-delivery'
import { createMonetaryAmount } from '../../contexts/_shared'
import { deliveryRequestSchema } from '../../utils/availability-reservation-validation'
import { addAmounts } from '../../utils/group-charges'
import { translateLogisticsDeliveryError } from '../../utils/logistics-delivery-deps'
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
  // D-66: priced on the server; outside-zone legs carry no fee yet.
  deliveries: z.array(deliveryRequestSchema).max(2).default([]),
})

// S-03 (FR-02, FR-09, D-07; issue #164): the rental fee and the deposit
// for a draft, computed server-side so the browser does no date
// arithmetic (D-51) and shows exactly what Stripe will charge. A Visitor
// is not identified and nothing is written — a quote is not a hold.
export default defineEventHandler(async (event) => {
  const { lines, deliveries } = await readValidatedBody(event, bodySchema.parse)
  const { repo, sql, close } = createCatalogDeps(event)

  try {
    const tenantId = await getSeededTenantId(sql)
    // D-65: both prices — on site and online with the Tenant's discount.
    const settings = await getTenantSettings(sql, tenantId)
    const { onlinePaymentDiscountBasisPoints } = settings
    const quotedDeliveries = await quoteDeliveryRequests(
      createPostgresLogisticsDeliveryRepository(sql),
      {
        tenantId,
        settings: deliverySettingsOf(settings),
        requests: deliveries,
      },
    )
    const quote = await quoteReservationLines(
      lines,
      async (assetTypeId) => {
        const assetType = await repo.getAssetType(tenantId, assetTypeId)
        return assetType?.published ? assetType : null
      },
      { today: todayRentalDay(), onlineDiscountBasisPoints: onlinePaymentDiscountBasisPoints },
    )
    // D-66: in-zone fees join both totals, never discounted (D-65).
    const deliveryFeeTotal = createMonetaryAmount(
      quotedDeliveries.reduce((sum, d) => sum + (d.fee?.amount ?? 0), 0),
      quote.rentalFeeTotal.currency,
    )
    return {
      ...quote,
      deliveries: quotedDeliveries.map((d) => ({
        leg: d.request.leg,
        outsideZone: d.request.outsideZone,
        fee: d.fee,
      })),
      deliveryFeeTotal,
      onlineTotal: addAmounts(quote.onlineRentalFeeTotal, deliveryFeeTotal),
      onSiteTotal: addAmounts(quote.rentalFeeTotal, deliveryFeeTotal),
    }
  } catch (err) {
    if (err instanceof LogisticsDeliveryError) translateLogisticsDeliveryError(err)
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
