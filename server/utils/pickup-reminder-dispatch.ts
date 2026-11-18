// The composition root for FR-41's pickup reminder (issue #36) — the
// ONE place allowed to import Availability & Reservation's, Handover &
// Possession's, Customer Identity & Compliance's AND Notification's
// published interfaces together, since none of those four contexts may
// import each other for this purpose (D-02). Mirrors
// server/utils/return-reminder-dispatch.ts exactly, reusing FR-42's
// existing listReservationsStartingOn query (already built for #27's
// "today's pickups" view) instead of listReservationsEndingOn.
//
// D-68 (answers OQ #7 for FR-41): sent on the day BEFORE the Reservation's
// RentalPeriod starts, so the Customer can still arrange to come — or say
// they will not. A Reservation confirmed after the run on that day, or
// one starting the day it was booked, gets only its confirmation; there
// is no catch-up send on the start day. A Reservation already handed out — even a day early, D-04 lets the
// Operator take any Rentable unit whenever the Customer shows up — needs
// no reminder; there is nothing left to remind them of.
import { addRentalDays, type AvailabilityReservationRepository } from '../contexts/availability-reservation'
import type { CatalogRepository } from '../contexts/catalog'
import type { CustomerIdentityComplianceRepository } from '../contexts/customer-identity-compliance'
import type { HandoverPossessionRepository } from '../contexts/handover-possession'
import { dispatchPickupReminder, type NotificationDispatch, type NotificationGateway, type NotificationRepository } from '../contexts/notification'
import type { TenantId } from '../contexts/_shared'
import { assetTypeNameForEmail } from './customer-email-data'

// D-68: one constant, not a Customer preference (FR-41, A-08) and not yet a
// Tenant setting (P3 §12(e)) — the day arithmetic stays in Availability &
// Reservation (D-12).
export const PICKUP_REMINDER_LEAD_DAYS = 1

export interface DispatchDuePickupRemindersDeps {
  availabilityRepo: AvailabilityReservationRepository
  handoverRepo: HandoverPossessionRepository
  catalogRepo: CatalogRepository
  identityRepo: CustomerIdentityComplianceRepository
  notificationRepo: NotificationRepository
  notificationGateway: NotificationGateway
}

export async function dispatchDuePickupReminders(
  deps: DispatchDuePickupRemindersDeps,
  params: { tenantId: TenantId; today: string },
): Promise<NotificationDispatch[]> {
  const { availabilityRepo, handoverRepo, catalogRepo, identityRepo, notificationRepo, notificationGateway } = deps
  const { tenantId, today } = params

  const candidates = await availabilityRepo.listReservationsStartingOn(tenantId, addRentalDays(today, PICKUP_REMINDER_LEAD_DAYS))
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
        assetTypeName: await assetTypeNameForEmail(catalogRepo, tenantId, reservation.assetTypeId),
        startDay: reservation.period.startDay,
        endDay: reservation.period.endDay,
      },
    )
    if (result) dispatched.push(result)
  }

  return dispatched
}
