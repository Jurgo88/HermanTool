// Notification's data access, kept behind a narrow interface so
// ./notification.ts is testable without a database (Part 4 §14.2),
// mirroring every other context's repository shape. Every method takes
// `tenantId` as its first parameter (FR-33).
import type postgres from 'postgres'
import type { TenantId } from '../_shared'
import type { NotificationDispatch, NotificationKind } from './types'

export interface NewNotificationDispatch {
  customerId: number
  kind: NotificationKind
  referenceId: number
  to: string
  subject: string
  providerMessageId: string
}

export interface NotificationRepository {
  insertNotificationDispatch(tenantId: TenantId, params: NewNotificationDispatch): Promise<NotificationDispatch>

  // FR-32's at-most-once guard: has a dispatch of this kind already been
  // recorded for this referenceId? Checked before sending, backed by the
  // migration's own unique index besides (belt and braces against a
  // race between two concurrent callers).
  hasBeenDispatched(tenantId: TenantId, kind: NotificationKind, referenceId: number): Promise<boolean>
}

interface NotificationDispatchRow {
  id: number
  tenant_id: string
  customer_id: number
  kind: NotificationKind
  reference_id: number
  to_address: string
  subject: string
  provider_message_id: string
  sent_at: Date
}

function mapNotificationDispatch(row: NotificationDispatchRow): NotificationDispatch {
  return {
    id: row.id,
    tenantId: row.tenant_id as TenantId,
    customerId: row.customer_id,
    kind: row.kind,
    referenceId: row.reference_id,
    to: row.to_address,
    subject: row.subject,
    providerMessageId: row.provider_message_id,
    sentAt: row.sent_at,
  }
}

export function createPostgresNotificationRepository(sql: postgres.Sql): NotificationRepository {
  return {
    async insertNotificationDispatch(tenantId, { customerId, kind, referenceId, to, subject, providerMessageId }) {
      const rows = await sql<NotificationDispatchRow[]>`
        insert into notification_dispatches (
          tenant_id, customer_id, kind, reference_id, to_address, subject, provider_message_id
        ) values (
          ${tenantId}, ${customerId}, ${kind}, ${referenceId}, ${to}, ${subject}, ${providerMessageId}
        )
        returning *
      `
      return mapNotificationDispatch(rows[0]!)
    },

    async hasBeenDispatched(tenantId, kind, referenceId) {
      const rows = await sql<{ id: number }[]>`
        select id from notification_dispatches
        where tenant_id = ${tenantId} and kind = ${kind} and reference_id = ${referenceId}
        limit 1
      `
      return rows.length > 0
    },
  }
}
