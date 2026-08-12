import { dispatchDueOverdueReminders } from '../../../utils/overdue-reminder-dispatch'
import { createAvailabilityReservationDeps } from '../../../utils/availability-reservation-deps'
import { createCatalogDeps } from '../../../utils/catalog-deps'
import { createCustomerIdentityComplianceDeps } from '../../../utils/customer-identity-compliance-deps'
import { createHandoverPossessionDeps } from '../../../utils/handover-possession-deps'
import { requireInternalJobSecret } from '../../../utils/internal-job-session'
import { runScheduledJob } from '../../../utils/job-run-ledger'
import { createNotificationDeps } from '../../../utils/notification-deps'
import { getSeededTenantId } from '../../../utils/tenant'

function todayAsRentalDay(): string {
  return new Date().toISOString().slice(0, 10)
}

// D-17, W6, FR-41: called on a schedule by GitHub Actions
// (.github/workflows/dispatch-overdue-reminders.yml), never by a human —
// requireInternalJobSecret gates this, not requireOperator, mirroring
// server/api/internal/notification/dispatch-return-reminders.post.ts
// exactly.
//
// createNotificationDeps is constructed INSIDE runScheduledJob's own
// callback, not alongside the other deps below — its gateway construction
// throws synchronously when NUXT_RESEND_API_KEY is unset (`new
// Resend('')`), and constructing it outside the wrapper meant that throw
// happened before runScheduledJob ever started, so it never wrote a
// job_runs row — exactly the silent failure D-41 exists to close, and
// exactly what has been happening on the deployed schedule.
export default defineEventHandler(async (event) => {
  requireInternalJobSecret(event)

  const availability = createAvailabilityReservationDeps(event)
  const handover = createHandoverPossessionDeps(event)
  const catalog = createCatalogDeps(event)
  const customerIdentity = createCustomerIdentityComplianceDeps(event)

  try {
    const tenantId = await getSeededTenantId(availability.sql)
    return await runScheduledJob(availability.sql, { tenantId, jobName: 'overdue_reminder_dispatch' }, async () => {
      const notification = createNotificationDeps(event)
      const dispatched = await dispatchDueOverdueReminders(
        {
          availabilityRepo: availability.repo,
          handoverRepo: handover.repo,
          assetRegistryRepo: handover.assetRegistryRepo,
          catalogRepo: catalog.repo,
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
    await Promise.all([availability.close(), handover.close(), catalog.close(), customerIdentity.close()])
  }
})
