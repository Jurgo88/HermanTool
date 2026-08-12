// The composition root for D-17/W6/FR-41's Overdue reminder (issue
// #36) — the Customer-facing half of #16's Overdue derivation
// (server/utils/overdue-noshow-views.ts), which stays exactly what it
// was: a query, sending nothing itself. This file adds the "notify the
// Customer" half FR-29 also asks for, reusing listOverdue's own
// candidate set rather than re-deriving Overdue independently.
//
// Sent AT MOST ONCE per Reservation — see
// server/contexts/notification/notification.ts's header comment for why
// this must not become a repeating nag (D-17 explicitly rejects staged
// escalation). dispatchOverdueReminder's own hasBeenDispatched check is
// what makes running this on every scheduled scan safe: a Reservation
// still Overdue on day five of five scans gets exactly one email, from
// whichever scan first found it.
import type { AssetRegistryRepository } from '../contexts/asset-registry'
import type { AvailabilityReservationRepository } from '../contexts/availability-reservation'
import type { CatalogRepository } from '../contexts/catalog'
import type { CustomerIdentityComplianceRepository } from '../contexts/customer-identity-compliance'
import type { HandoverPossessionRepository } from '../contexts/handover-possession'
import { dispatchOverdueReminder, type NotificationDispatch, type NotificationGateway, type NotificationRepository } from '../contexts/notification'
import type { TenantId } from '../contexts/_shared'
import { listOverdue } from './overdue-noshow-views'

export interface DispatchDueOverdueRemindersDeps {
  availabilityRepo: AvailabilityReservationRepository
  handoverRepo: HandoverPossessionRepository
  assetRegistryRepo: AssetRegistryRepository
  catalogRepo: CatalogRepository
  identityRepo: CustomerIdentityComplianceRepository
  notificationRepo: NotificationRepository
  notificationGateway: NotificationGateway
}

export async function dispatchDueOverdueReminders(
  deps: DispatchDueOverdueRemindersDeps,
  params: { tenantId: TenantId; today: string },
): Promise<NotificationDispatch[]> {
  const { availabilityRepo, handoverRepo, assetRegistryRepo, catalogRepo, identityRepo, notificationRepo, notificationGateway } = deps
  const { tenantId, today } = params

  const overdue = await listOverdue({ availabilityRepo, handoverRepo, assetRegistryRepo, catalogRepo, identityRepo }, { tenantId, today })
  const dispatched: NotificationDispatch[] = []

  for (const entry of overdue) {
    const customer = await identityRepo.getCustomer(tenantId, entry.rentalAgreement.customerId)
    // Unreachable via FK integrity — kept as a checked invariant.
    if (!customer) continue

    const result = await dispatchOverdueReminder(
      { repo: notificationRepo, gateway: notificationGateway },
      {
        tenantId,
        customerId: customer.id,
        reservationId: entry.reservation.id,
        to: customer.email,
        customerName: customer.name,
        assetTypeId: entry.reservation.assetTypeId,
        endDay: entry.reservation.period.endDay,
      },
    )
    if (result) dispatched.push(result)
  }

  return dispatched
}
