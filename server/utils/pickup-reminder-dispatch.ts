// The composition root for FR-41's pickup reminder (issue #36) — the
// ONE place allowed to import Availability & Reservation's, Handover &
// Possession's, Customer Identity & Compliance's AND Notification's
// published interfaces together, since none of those four contexts may
// import each other for this purpose (D-02). Mirrors
// server/utils/return-reminder-dispatch.ts exactly, reusing FR-42's
// existing listReservationsStartingOn query (already built for #27's
// "today's pickups" view) instead of listReservationsEndingOn.
//
// Sent exactly on the Reservation's own RentalPeriod start day (OQ #7's
// timing value, pilot-scale pragmatic default — see
// server/contexts/notification/notification.ts's own comment). A
// Reservation already handed out — even a day early, D-04 lets the
// Operator take any Rentable unit whenever the Customer shows up — needs
// no reminder; there is nothing left to remind them of.
import type { AvailabilityReservationRepository } from '../contexts/availability-reservation'
import type { CustomerIdentityComplianceRepository } from '../contexts/customer-identity-compliance'
import type { HandoverPossessionRepository } from '../contexts/handover-possession'
import { dispatchPickupReminder, type NotificationDispatch, type NotificationGateway, type NotificationRepository } from '../contexts/notification'
import type { TenantId } from '../contexts/_shared'

export interface DispatchDuePickupRemindersDeps {
  availabilityRepo: AvailabilityReservationRepository
  handoverRepo: HandoverPossessionRepository
  identityRepo: CustomerIdentityComplianceRepository
  notificationRepo: NotificationRepository
  notificationGateway: NotificationGateway
}

export async function dispatchDuePickupReminders(
  deps: DispatchDuePickupRemindersDeps,
  params: { tenantId: TenantId; today: string },
): Promise<NotificationDispatch[]> {
  const { availabilityRepo, handoverRepo, identityRepo, notificationRepo, notificationGateway } = deps
  const { tenantId, today } = params

  const candidates = await availabilityRepo.listReservationsStartingOn(tenantId, today)
  const dispatched: NotificationDispatch[] = []

  for (const reservation of candidates) {
    const agreement = await handoverRepo.getRentalAgreementByReservation(tenantId, reservation.id)
    if (agreement) continue // already handed out — nothing left to remind them of

    const customer = await identityRepo.getCustomerByReservationGroup(tenantId, reservation.reservationGroupId)
    // Unreachable via FK integrity — kept as a checked invariant.
    if (!customer) continue

    const result = await dispatchPickupReminder(
      { repo: notificationRepo, gateway: notificationGateway },
      {
        tenantId,
        customerId: customer.id,
        reservationId: reservation.id,
        to: customer.email,
        customerName: customer.name,
        assetTypeId: reservation.assetTypeId,
        startDay: reservation.period.startDay,
      },
    )
    if (result) dispatched.push(result)
  }

  return dispatched
}
