import { z } from 'zod'
import {
  assertTermsAccepted,
  rentalPeriodLengthInDays,
  ReservationGroupNotFoundError,
  TermsNotAcceptedError,
} from '../../contexts/availability-reservation'
import { AssetTypeNotFoundError } from '../../contexts/catalog'
import { computeRentalFeeAmount, ReservationGroupAlreadyPaidError, startPayment } from '../../contexts/payments'
import { createAvailabilityReservationDeps } from '../../utils/availability-reservation-deps'
import { createCatalogDeps } from '../../utils/catalog-deps'
import { requireCheckoutGroupCookie } from '../../utils/checkout-session'
import { createPaymentsDeps, getAppBaseUrl } from '../../utils/payments-deps'
import { getSeededTenantId } from '../../utils/tenant'

const bodySchema = z.object({ reservationGroupId: z.number().int().positive() })

// W2, FR-09, D-26: starts the ReservationGroup's one card payment.
// Reads the accepted rate from Catalog and the reserved days from
// Availability & Reservation (composition at the route layer, D-02 —
// neither context imports the other), sums them into the single amount
// FR-09 requires, then hands off to Stripe's hosted checkout page
// (NFR-05: this process never sees card data, only a redirect URL back).
export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, bodySchema.parse)
  requireCheckoutGroupCookie(event, body.reservationGroupId)

  const availability = createAvailabilityReservationDeps(event)
  const catalog = createCatalogDeps(event)
  const payments = createPaymentsDeps(event)

  try {
    const tenantId = await getSeededTenantId(availability.sql)

    const group = await availability.repo.getReservationGroup(tenantId, body.reservationGroupId)
    if (!group) throw new ReservationGroupNotFoundError(body.reservationGroupId)
    assertTermsAccepted(group)

    const reservations = await availability.repo.listReservationsForGroup(tenantId, body.reservationGroupId)
    const lines = await Promise.all(
      reservations.map(async (reservation) => {
        const assetType = await catalog.repo.getAssetType(tenantId, reservation.assetTypeId)
        if (!assetType) throw new AssetTypeNotFoundError(reservation.assetTypeId)
        return { dayRate: assetType.dayRate, days: rentalPeriodLengthInDays(reservation.period) }
      }),
    )
    const amount = computeRentalFeeAmount(lines)

    const appBaseUrl = getAppBaseUrl(event)
    const { redirectUrl } = await startPayment(payments.repo, payments.gateway, {
      tenantId,
      reservationGroupId: body.reservationGroupId,
      amount,
      successUrl: `${appBaseUrl}/reservations/${body.reservationGroupId}/success`,
      cancelUrl: `${appBaseUrl}/reservations/${body.reservationGroupId}/cancel`,
    })

    return { redirectUrl }
  } catch (err) {
    if (err instanceof AssetTypeNotFoundError || err instanceof ReservationGroupNotFoundError) {
      throw createError({ statusCode: 404, statusMessage: err.message })
    }
    if (err instanceof TermsNotAcceptedError || err instanceof ReservationGroupAlreadyPaidError) {
      throw createError({ statusCode: 409, statusMessage: err.message })
    }
    throw err
  } finally {
    await Promise.all([availability.close(), catalog.close(), payments.close()])
  }
})
