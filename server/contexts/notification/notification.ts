// Notification core (D-28, FR-32, A-08; issue #35). Two named message
// kinds: 'confirmation' (dispatched at ReservationConfirmed — see
// server/api/webhooks/stripe.post.ts) and 'return_reminder' (dispatched
// by a scheduled scan of Reservations due back today — see
// server/utils/return-reminder-dispatch.ts). 'pickup_reminder' and
// 'overdue_reminder' are #36's separate, later scope.
//
// Deliberately a leaf with ZERO cross-context imports of its own, even
// though the context map (Part 1 §4) would structurally permit this
// module to import Availability & Reservation's and Handover &
// Possession's published interfaces directly (arrows point into
// Notification from both). Every caller assembles whatever display data
// it needs from wherever it needs it and passes plain values in — this
// keeps Notification "deliberately dumb" (D-28, P1 §4) in the strongest
// sense: it has no opinion about what a Reservation or a RentalAgreement
// is, only about how to format and send a message once it already has
// the words. No AssetType name is resolved anywhere here — same minimal
// scope already established for the Customer's own view
// (server/api/public/customer-access/[token].get.ts): an id and dates,
// not a display name.
import type { TenantId } from '../_shared'
import type { NotificationGateway } from './resend-gateway'
import type { NotificationRepository } from './repository'
import type { NotificationDispatch } from './types'

export interface NotificationDeps {
  repo: NotificationRepository
  gateway: NotificationGateway
}

interface ReservationLine {
  assetTypeId: number
  startDay: string
  endDay: string
}

function formatReservationConfirmationEmail(params: { customerName: string; lines: ReservationLine[] }): {
  subject: string
  body: string
} {
  const lineText = params.lines
    .map((l) => `- AssetType ${l.assetTypeId}: ${l.startDay} to ${l.endDay}`)
    .join('\n')
  return {
    subject: 'Your reservation is confirmed',
    body: `Hi ${params.customerName},\n\nYour reservation is confirmed:\n${lineText}\n\nSee you soon.`,
  }
}

function formatReturnReminderEmail(params: { customerName: string; assetTypeId: number; endDay: string }): {
  subject: string
  body: string
} {
  return {
    subject: 'Your rental is due back soon',
    body: `Hi ${params.customerName},\n\nA reminder that your rental (AssetType ${params.assetTypeId}) is due back on ${params.endDay}.\n\nThanks for returning it on time.`,
  }
}

// FR-32's at-most-once guard: checked before sending, so a retried
// webhook/cron run never double-sends. Not wrapped in a database
// transaction with the check (NFR-04: no saga machinery at pilot
// scale) — the migration's own unique index on (tenant_id, kind,
// reference_id) is the backstop against the rare race, same "check then
// act, index catches the race" discipline already accepted elsewhere in
// this codebase (e.g. D-14's Customer-per-ReservationGroup uniqueness).
async function sendAndRecord(
  deps: NotificationDeps,
  params: {
    tenantId: TenantId
    customerId: number
    kind: NotificationDispatch['kind']
    referenceId: number
    to: string
    subject: string
    body: string
  },
): Promise<NotificationDispatch | null> {
  const { repo, gateway } = deps
  const { tenantId, customerId, kind, referenceId, to, subject, body } = params

  const already = await repo.hasBeenDispatched(tenantId, kind, referenceId)
  if (already) return null

  const { providerMessageId } = await gateway.sendEmail({ to, subject, text: body })
  return repo.insertNotificationDispatch(tenantId, { customerId, kind, referenceId, to, subject, providerMessageId })
}

export async function dispatchReservationConfirmation(
  deps: NotificationDeps,
  params: {
    tenantId: TenantId
    customerId: number
    reservationGroupId: number
    to: string
    customerName: string
    lines: ReservationLine[]
  },
): Promise<NotificationDispatch | null> {
  const { tenantId, customerId, reservationGroupId, to, customerName, lines } = params
  const { subject, body } = formatReservationConfirmationEmail({ customerName, lines })
  return sendAndRecord(deps, { tenantId, customerId, kind: 'confirmation', referenceId: reservationGroupId, to, subject, body })
}

export async function dispatchReturnReminder(
  deps: NotificationDeps,
  params: {
    tenantId: TenantId
    customerId: number
    reservationId: number
    to: string
    customerName: string
    assetTypeId: number
    endDay: string
  },
): Promise<NotificationDispatch | null> {
  const { tenantId, customerId, reservationId, to, customerName, assetTypeId, endDay } = params
  const { subject, body } = formatReturnReminderEmail({ customerName, assetTypeId, endDay })
  return sendAndRecord(deps, { tenantId, customerId, kind: 'return_reminder', referenceId: reservationId, to, subject, body })
}
