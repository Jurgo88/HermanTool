// In-memory stand-in for NotificationRepository, used by
// notification.test.ts (and composition-root tests that need Notification)
// so the domain logic in server/contexts/notification/notification.ts is
// exercised without a database (Part 4 §14.2), mirroring every other
// context's fake-repository.ts.
import type { TenantId } from '../../../../server/contexts/_shared'
import type { NewNotificationDispatch, NotificationRepository } from '../../../../server/contexts/notification/repository'
import type { NotificationDispatch } from '../../../../server/contexts/notification/types'

interface State {
  dispatches: NotificationDispatch[]
  nextId: number
}

export interface FakeNotificationRepository extends NotificationRepository {
  allDispatches(): NotificationDispatch[]
}

export function createFakeNotificationRepository(): FakeNotificationRepository {
  const state: State = { dispatches: [], nextId: 1 }

  return {
    allDispatches() {
      return state.dispatches.map((d) => ({ ...d }))
    },

    async insertNotificationDispatch(
      tenantId: TenantId,
      { customerId, kind, referenceId, to, subject, providerMessageId }: NewNotificationDispatch,
    ) {
      const dispatch: NotificationDispatch = {
        id: state.nextId++,
        tenantId,
        customerId,
        kind,
        referenceId,
        to,
        subject,
        providerMessageId,
        sentAt: new Date(),
      }
      state.dispatches.push(dispatch)
      return { ...dispatch }
    },

    async hasBeenDispatched(tenantId, kind, referenceId) {
      return state.dispatches.some((d) => d.tenantId === tenantId && d.kind === kind && d.referenceId === referenceId)
    },
  }
}
