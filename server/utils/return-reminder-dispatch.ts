// The composition root for A-08/FR-32's return reminder (issue #35) —
// the ONE place allowed to import Availability & Reservation's, Handover
// & Possession's, Customer Identity & Compliance's AND Notification's
// published interfaces together, since none of those four contexts may
// import each other for this purpose (D-02). Mirrors
// server/utils/overdue-noshow-views.ts's own composition pattern
// exactly, reusing its candidate query (listReservationsEndingOn,
// already built for FR-42's "today's returns" view).
//
// PROACTIVE, not reactive: this dispatches the courtesy nudge sent
// exactly on a Reservation's own RentalPeriod end day, before anything
// is late — the "highest-leverage operational lever" P1 §4 names.
// #36's separate 'overdue_reminder' kind is the reactive one, tied to
// #16's already-derived Overdue state once the period has already
// passed. A Reservation whose Possession has already closed (handed
// back early or on time) or was declared LostAsset needs no reminder —
// same exclusion logic overdue-noshow-views.ts already established.
import type { AvailabilityReservationRepository } from '../contexts/availability-reservation'
import type { CustomerIdentityComplianceRepository } from '../contexts/customer-identity-compliance'
import type { HandoverPossessionRepository } from '../contexts/handover-possession'
import { dispatchReturnReminder, type NotificationDispatch, type NotificationGateway, type NotificationRepository } from '../contexts/notification'
import type { TenantId } from '../contexts/_shared'

export interface DispatchDueReturnRemindersDeps {
  availabilityRepo: AvailabilityReservationRepository
  handoverRepo: HandoverPossessionRepository
  identityRepo: CustomerIdentityComplianceRepository
  notificationRepo: NotificationRepository
  notificationGateway: NotificationGateway
}

export async function dispatchDueReturnReminders(
  deps: DispatchDueReturnRemindersDeps,
  params: { tenantId: TenantId; today: string },
): Promise<NotificationDispatch[]> {
  const { availabilityRepo, handoverRepo, identityRepo, notificationRepo, notificationGateway } = deps
  const { tenantId, today } = params

  const candidates = await availabilityRepo.listReservationsEndingOn(tenantId, today)
  const dispatched: NotificationDispatch[] = []

  for (const reservation of candidates) {
    const agreement = await handoverRepo.getRentalAgreementByReservation(tenantId, reservation.id)
    // Never handed out (a NoShow, not a return-due Reservation), already
    // handed back, or declared LostAsset — nothing due back today for
    // any of these.
    if (!agreement || agreement.handoverInAt || agreement.declaredLostAt) continue

    const customer = await identityRepo.getCustomer(tenantId, agreement.customerId)
    // Unreachable via FK integrity — kept as a checked invariant.
    if (!customer) continue

    const result = await dispatchReturnReminder(
      { repo: notificationRepo, gateway: notificationGateway },
      {
        tenantId,
        customerId: customer.id,
        reservationId: reservation.id,
        to: customer.email,
        customerName: customer.name,
        assetTypeId: reservation.assetTypeId,
        endDay: reservation.period.endDay,
      },
    )
    if (result) dispatched.push(result)
  }

  return dispatched
}
