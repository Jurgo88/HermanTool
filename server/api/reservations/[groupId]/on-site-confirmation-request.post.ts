import {
  assertTermsAccepted,
  ReservationGroupNotFoundError,
  TermsNotAcceptedError,
} from '../../../contexts/availability-reservation'
import { dispatchOnSiteConfirmationRequest } from '../../../contexts/notification'
import {
  createAvailabilityReservationDeps,
  getReservationGroupIdParam,
} from '../../../utils/availability-reservation-deps'
import { createCatalogDeps } from '../../../utils/catalog-deps'
import { requireCheckoutGroupCookie } from '../../../utils/checkout-session'
import { createCustomerIdentityComplianceDeps } from '../../../utils/customer-identity-compliance-deps'
import { buildConfirmationSummary } from '../../../utils/customer-email-data'
import { createNotificationDeps } from '../../../utils/notification-deps'
import { issueOnSiteConfirmationToken } from '../../../utils/on-site-payment'
import { getAppBaseUrl } from '../../../utils/payments-deps'
import { createPostgresLogisticsDeliveryRepository } from '../../../contexts/logistics-delivery'
import { computeGroupCharges } from '../../../utils/group-charges'
import { getSeededTenantId } from '../../../utils/tenant'

// D-65 (#215): the last checkout step for a group paid on site, in place
// of the Stripe redirect. Terms must already be accepted (D-35, same order
// as online). Sends the one confirmation e-mail (D-28) carrying a
// single-use, expiring link; the group stays Pending — holding capacity
// only until pending_expires_at, like an unpaid online checkout (D-08,
// D-33) — until the Customer follows it. Scoped to this browser's checkout
// cookie, like the Stripe step.
export default defineEventHandler(async (event) => {
  const reservationGroupId = getReservationGroupIdParam(event)
  requireCheckoutGroupCookie(event, reservationGroupId)

  const availability = createAvailabilityReservationDeps(event)
  const catalog = createCatalogDeps(event)
  const customerIdentity = createCustomerIdentityComplianceDeps(event)
  const notification = createNotificationDeps(event)

  try {
    const tenantId = await getSeededTenantId(availability.sql)
    const group = await availability.repo.getReservationGroup(tenantId, reservationGroupId)
    if (!group) throw new ReservationGroupNotFoundError(reservationGroupId)
    assertTermsAccepted(group)
    if (group.paymentMethod !== 'on_site') {
      throw createError({
        statusCode: 409,
        statusMessage: 'This ReservationGroup is paid online.',
        data: { code: 'OnlinePaymentGroupError' },
      })
    }

    const customer = await customerIdentity.repo.getCustomerByReservationGroup(
      tenantId,
      reservationGroupId,
    )
    if (!customer) throw new ReservationGroupNotFoundError(reservationGroupId)

    const token = await issueOnSiteConfirmationToken(availability.sql, {
      tenantId,
      reservationGroupId,
    })
    // Already requested for this group: the e-mail went out once (FR-32).
    if (!token) return { sent: false, alreadyRequested: true }

    const reservations = await availability.repo.listReservationsForGroup(
      tenantId,
      reservationGroupId,
    )
    const charges = await computeGroupCharges({
      tenantId,
      reservations,
      catalogRepo: catalog.repo,
      deliveries: await createPostgresLogisticsDeliveryRepository(
        availability.sql,
      ).listDeliveriesForGroup(tenantId, reservationGroupId),
      onlineDiscountBasisPoints: null,
    })
    const { lines } = await buildConfirmationSummary(catalog.repo, tenantId, reservations)
    await dispatchOnSiteConfirmationRequest(
      { repo: notification.repo, gateway: notification.gateway },
      {
        tenantId,
        customerId: customer.id,
        reservationGroupId,
        to: customer.email,
        customerName: customer.name,
        lines,
        rentalFee: charges.onSiteTotal,
        confirmUrl: `${getAppBaseUrl(event)}/reservations/confirm/${token}`,
      },
    )
    return { sent: true, alreadyRequested: false }
  } catch (err) {
    if (err instanceof ReservationGroupNotFoundError) {
      throw createError({
        statusCode: 404,
        statusMessage: err.message,
        data: { code: err.constructor.name },
      })
    }
    if (err instanceof TermsNotAcceptedError) {
      throw createError({
        statusCode: 409,
        statusMessage: err.message,
        data: { code: err.constructor.name },
      })
    }
    throw err
  } finally {
    await Promise.all([
      availability.close(),
      catalog.close(),
      customerIdentity.close(),
      notification.close(),
    ])
  }
})
