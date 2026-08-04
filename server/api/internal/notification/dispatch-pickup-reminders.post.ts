import { dispatchDuePickupReminders } from '../../../utils/pickup-reminder-dispatch'
import { createAvailabilityReservationDeps } from '../../../utils/availability-reservation-deps'
import { createCustomerIdentityComplianceDeps } from '../../../utils/customer-identity-compliance-deps'
import { createHandoverPossessionDeps } from '../../../utils/handover-possession-deps'
import { requireInternalJobSecret } from '../../../utils/internal-job-session'
import { runScheduledJob } from '../../../utils/job-run-ledger'
import { createNotificationDeps } from '../../../utils/notification-deps'
import { getSeededTenantId } from '../../../utils/tenant'

function todayAsRentalDay(): string {
  return new Date().toISOString().slice(0, 10)
}

// FR-41: called on a schedule by GitHub Actions
// (.github/workflows/dispatch-pickup-reminders.yml), never by a human —
// requireInternalJobSecret gates this, not requireOperator, mirroring
// server/api/internal/notification/dispatch-return-reminders.post.ts
// exactly.
export default defineEventHandler(async (event) => {
  requireInternalJobSecret(event)

  const availability = createAvailabilityReservationDeps(event)
  const handover = createHandoverPossessionDeps(event)
  const customerIdentity = createCustomerIdentityComplianceDeps(event)
  const notification = createNotificationDeps(event)

  try {
    const tenantId = await getSeededTenantId(availability.sql)
    return await runScheduledJob(availability.sql, { tenantId, jobName: 'pickup_reminder_dispatch' }, async () => {
      const dispatched = await dispatchDuePickupReminders(
        {
          availabilityRepo: availability.repo,
          handoverRepo: handover.repo,
          identityRepo: customerIdentity.repo,
          notificationRepo: notification.repo,
          notificationGateway: notification.gateway,
        },
        { tenantId, today: todayAsRentalDay() },
      )
      return {
        processedCount: dispatched.length,
        result: { dispatchedCount: dispatched.length, notificationIds: dispatched.map((d) => d.id) },
      }
    })
  } finally {
    await Promise.all([availability.close(), handover.close(), customerIdentity.close(), notification.close()])
  }
})
