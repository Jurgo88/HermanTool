import { z } from 'zod'
import {
  assertTermsAccepted,
  ReservationGroupNotFoundError,
  TermsNotAcceptedError,
} from '../../contexts/availability-reservation'
import { AssetTypeNotFoundError } from '../../contexts/catalog'
import {
  PaymentProviderUnavailableError,
  ReservationGroupAlreadyPaidError,
  startPayment,
} from '../../contexts/payments'
import { createAvailabilityReservationDeps } from '../../utils/availability-reservation-deps'
import { createCatalogDeps } from '../../utils/catalog-deps'
import { requireCheckoutGroupCookie } from '../../utils/checkout-session'
import { createPaymentsDeps, getAppBaseUrl } from '../../utils/payments-deps'
import { createPostgresLogisticsDeliveryRepository } from '../../contexts/logistics-delivery'
import { computeGroupCharges } from '../../utils/group-charges'
import { getSeededTenantId } from '../../utils/tenant'
import { getTenantSettings } from '../../utils/tenant-settings'

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
    // D-65: an on-site group never goes to Stripe.
    if (group.paymentMethod !== 'online') {
      throw createError({
        statusCode: 409,
        statusMessage: 'This ReservationGroup is paid on site.',
        data: { code: 'OnSitePaymentGroupError' },
      })
    }
    const { onlinePaymentDiscountBasisPoints } = await getTenantSettings(availability.sql, tenantId)

    const reservations = await availability.repo.listReservationsForGroup(tenantId, body.reservationGroupId)
    // One Reservation is one unit (FR-06). Same computation as the S-03
    // quote (#164), so the page and the charge cannot disagree. D-65: the
    // rental fee less the online discount; D-66: plus in-zone Delivery /
    // Collection fees, never discounted.
    const deliveries = await createPostgresLogisticsDeliveryRepository(
      availability.sql,
    ).listDeliveriesForGroup(tenantId, body.reservationGroupId)
    const charges = await computeGroupCharges({
      tenantId,
      reservations,
      catalogRepo: catalog.repo,
      deliveries,
      onlineDiscountBasisPoints: onlinePaymentDiscountBasisPoints,
    })
    const amount = charges.onlineTotal

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
      throw createError({ statusCode: 404, statusMessage: err.message, data: { code: err.constructor.name } })
    }
    if (err instanceof TermsNotAcceptedError || err instanceof ReservationGroupAlreadyPaidError) {
      throw createError({ statusCode: 409, statusMessage: err.message, data: { code: err.constructor.name } })
    }
    if (err instanceof PaymentProviderUnavailableError) {
      console.error('Stripe checkout session creation failed:', err.cause)
      throw createError({ statusCode: 502, statusMessage: err.message, data: { code: err.constructor.name } })
    }
    throw err
  } finally {
    await Promise.all([availability.close(), catalog.close(), payments.close()])
  }
})
