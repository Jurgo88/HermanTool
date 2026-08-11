import { dispatchDueReturnReminders } from '../../../utils/return-reminder-dispatch'
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

// A-08, D-28, FR-32: called on a schedule by GitHub Actions
// (.github/workflows/dispatch-return-reminders.yml), never by a human —
// requireInternalJobSecret gates this, not requireOperator, mirroring
// server/api/internal/reservations/sweep-expired.post.ts (FR-08) and
// server/api/internal/customer-identity-compliance/erase-expired-evidence.post.ts
// (FR-16) exactly.
//
// createNotificationDeps is constructed INSIDE runScheduledJob's own
// callback, not alongside the other deps below — see
// dispatch-overdue-reminders.post.ts's own comment for why (its
// Resend-client construction throws synchronously when
// NUXT_RESEND_API_KEY is unset, and outside the wrapper that throw never
// wrote a job_runs row).
export default defineEventHandler(async (event) => {
  requireInternalJobSecret(event)

  const availability = createAvailabilityReservationDeps(event)
  const handover = createHandoverPossessionDeps(event)
  const customerIdentity = createCustomerIdentityComplianceDeps(event)

  try {
    const tenantId = await getSeededTenantId(availability.sql)
    return await runScheduledJob(availability.sql, { tenantId, jobName: 'return_reminder_dispatch' }, async () => {
      const notification = createNotificationDeps(event)
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
      return {
        processedCount: dispatched.length,
        result: { dispatchedCount: dispatched.length, notificationIds: dispatched.map((d) => d.id) },
      }
    })
  } finally {
    await Promise.all([availability.close(), handover.close(), customerIdentity.close()])
  }
})
