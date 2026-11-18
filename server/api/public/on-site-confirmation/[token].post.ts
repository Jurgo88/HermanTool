import {
  confirmReservationGroup,
  ReservationGroupReacquireFailedError,
} from '../../../contexts/availability-reservation'
import { issueCustomerAccessLink } from '../../../contexts/customer-identity-compliance'
import { dispatchReservationConfirmation } from '../../../contexts/notification'
import { createAvailabilityReservationDeps } from '../../../utils/availability-reservation-deps'
import { createCatalogDeps } from '../../../utils/catalog-deps'
import { createCustomerIdentityComplianceDeps } from '../../../utils/customer-identity-compliance-deps'
import { buildConfirmationSummary, deliveryLinesForEmail } from '../../../utils/customer-email-data'
import { createNotificationDeps } from '../../../utils/notification-deps'
import {
  markOnSiteConfirmationTokenUsed,
  resolveOnSiteConfirmationToken,
} from '../../../utils/on-site-payment'
import { getAppBaseUrl } from '../../../utils/payments-deps'
import { createPostgresLogisticsDeliveryRepository } from '../../../contexts/logistics-delivery'
import { computeGroupCharges } from '../../../utils/group-charges'
import { getSeededTenantId } from '../../../utils/tenant'

// D-65 (#215), S-26: the Customer follows the e-mailed link and presses
// "Potvrdiť" (a POST, so a mail scanner prefetching the link confirms
// nothing). The group's Reservations become Confirmed through the same
// confirmReservationGroup a successful Payment uses — including D-37's
// re-acquire when the brief hold has already lapsed. Nothing is paid: the
// rental fee is attested at the counter later.
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token') ?? ''
  const availability = createAvailabilityReservationDeps(event)
  const catalog = createCatalogDeps(event)
  const customerIdentity = createCustomerIdentityComplianceDeps(event)
  const notification = createNotificationDeps(event)

  try {
    const tenantId = await getSeededTenantId(availability.sql)
    const resolved = token
      ? await resolveOnSiteConfirmationToken(availability.sql, { tenantId, token })
      : null
    if (!resolved) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Unknown or expired confirmation link.',
        data: { code: 'OnSiteConfirmationLinkInvalidError' },
      })
    }

    const { reservationGroupId } = resolved
    const reservations = await confirmReservationGroup(availability.repo, {
      tenantId,
      reservationGroupId,
    })
    await markOnSiteConfirmationTokenUsed(availability.sql, { tenantId, id: resolved.id })

    // Side effects after the commit, swallowed on failure, exactly as the
    // Stripe webhook does: the confirmation itself already stands.
    try {
      const customer = await customerIdentity.repo.getCustomerByReservationGroup(
        tenantId,
        reservationGroupId,
      )
      if (customer) {
        const { token: accessToken } = await issueCustomerAccessLink(customerIdentity.repo, {
          tenantId,
          customerId: customer.id,
        })
        const group = await availability.repo.getReservationGroup(tenantId, reservationGroupId)
        const { lines, depositTotal } = await buildConfirmationSummary(
          catalog.repo,
          tenantId,
          reservations,
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
        await dispatchReservationConfirmation(
          { repo: notification.repo, gateway: notification.gateway },
          {
            tenantId,
            customerId: customer.id,
            reservationGroupId,
            to: customer.email,
            customerName: customer.name,
            lines,
            depositTotal,
            termsVersion: group?.termsVersion ?? null,
            accessLinkUrl: `${getAppBaseUrl(event)}/reservations/access/${accessToken}`,
            onSiteRentalFee: charges.onSiteTotal,
            deliveries: await deliveryLinesForEmail(
              createPostgresLogisticsDeliveryRepository(availability.sql),
              tenantId,
              reservationGroupId,
            ),
          },
        )
      }
    } catch (sideEffectErr) {
      console.error(
        'On-site confirmation side effects (access link / e-mail) failed:',
        sideEffectErr,
      )
    }

    return { reservationGroupId, confirmed: true }
  } catch (err) {
    if (err instanceof ReservationGroupReacquireFailedError) {
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
