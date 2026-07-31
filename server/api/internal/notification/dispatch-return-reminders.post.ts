import { dispatchDueReturnReminders } from '../../../utils/return-reminder-dispatch'
import { createAvailabilityReservationDeps } from '../../../utils/availability-reservation-deps'
import { createCustomerIdentityComplianceDeps } from '../../../utils/customer-identity-compliance-deps'
import { createHandoverPossessionDeps } from '../../../utils/handover-possession-deps'
import { requireInternalJobSecret } from '../../../utils/internal-job-session'
import { createNotificationDeps } from '../../../utils/notification-deps'
import { getSeededTenantId } from '../../../utils/tenant'

function todayAsRentalDay(): string {
  return new Date().toISOString().slice(0, 10)
}

// A-08, D-28, FR-32: called on a schedule by GitHub Actions
// (.github/workflows/dispatch-return-reminders.yml), never by a human —
// requireInternalJobSecret gates this, not requireOperator, mirroring
// server/api/internal/reservations/sweep-expired.post.ts (FR-08) and
// server/api/internal/customer-identity-compliance/erase-expired-evidence.post.ts
// (FR-16) exactly.
export default defineEventHandler(async (event) => {
  requireInternalJobSecret(event)

  const availability = createAvailabilityReservationDeps(event)
  const handover = createHandoverPossessionDeps(event)
  const customerIdentity = createCustomerIdentityComplianceDeps(event)
  const notification = createNotificationDeps(event)

  try {
    const tenantId = await getSeededTenantId(availability.sql)
    const dispatched = await dispatchDueReturnReminders(
      {
        availabilityRepo: availability.repo,
        handoverRepo: handover.repo,
        identityRepo: customerIdentity.repo,
        notificationRepo: notification.repo,
        notificationGateway: notification.gateway,
      },
      { tenantId, today: todayAsRentalDay() },
    )
    return { dispatchedCount: dispatched.length, notificationIds: dispatched.map((d) => d.id) }
  } finally {
    await Promise.all([availability.close(), handover.close(), customerIdentity.close(), notification.close()])
  }
})
