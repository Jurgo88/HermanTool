import { ReservationGroupNotFoundError } from '../../../../contexts/availability-reservation'
import { currentOnSitePayment } from '../../../../contexts/handover-possession'
import {
  createAvailabilityReservationDeps,
  getReservationGroupIdParam,
} from '../../../../utils/availability-reservation-deps'
import { createCatalogDeps } from '../../../../utils/catalog-deps'
import { createHandoverPossessionDeps } from '../../../../utils/handover-possession-deps'
import { requireOperator } from '../../../../utils/operator-session'
import { createPostgresLogisticsDeliveryRepository } from '../../../../contexts/logistics-delivery'
import { computeGroupCharges } from '../../../../utils/group-charges'

// S-10 (D-65; issue #215): what the counter needs before HandoverOut of a
// group paid on site — how it is paid, the rental fee due (computed here,
// undiscounted: the online discount never applies at the counter), and
// the attestation in force, if any. Operator-only, Tenant from the session
// (FR-33). Evidence-free, so no PIN to read.
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const reservationGroupId = getReservationGroupIdParam(event)
  const availability = createAvailabilityReservationDeps(event)
  const catalog = createCatalogDeps(event)
  const handover = createHandoverPossessionDeps(event)

  try {
    const { tenantId } = operator
    const group = await availability.repo.getReservationGroup(tenantId, reservationGroupId)
    if (!group) throw new ReservationGroupNotFoundError(reservationGroupId)

    const reservations = await availability.repo.listReservationsForGroup(
      tenantId,
      reservationGroupId,
    )
    const active = reservations.filter((r) => r.state === 'confirmed' || r.state === 'pending')
    // D-66: in-zone Delivery/Collection fees are paid with the rental fee.
    const deliveries = await createPostgresLogisticsDeliveryRepository(
      availability.sql,
    ).listDeliveriesForGroup(tenantId, reservationGroupId)
    const charges =
      active.length > 0
        ? await computeGroupCharges({
            tenantId,
            reservations: active,
            catalogRepo: catalog.repo,
            deliveries,
            onlineDiscountBasisPoints: null,
          })
        : null
    const current =
      group.paymentMethod === 'on_site'
        ? currentOnSitePayment(
            await handover.onSitePaymentRepo.listOnSitePaymentsForGroup(
              tenantId,
              reservationGroupId,
            ),
          )
        : null

    return {
      reservationGroupId,
      paymentMethod: group.paymentMethod,
      rentalFeeDue: charges?.onSiteTotal ?? null,
      current: current
        ? {
            id: current.id,
            amount: current.amount,
            method: current.method,
            attestedAt: current.attestedAt,
          }
        : null,
    }
  } catch (err) {
    if (err instanceof ReservationGroupNotFoundError) {
      throw createError({
        statusCode: 404,
        statusMessage: err.message,
        data: { code: err.constructor.name },
      })
    }
    throw err
  } finally {
    await Promise.all([availability.close(), catalog.close(), handover.close()])
  }
})
