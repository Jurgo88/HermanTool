// Notification core (D-28, FR-32, A-08, FR-41, W6, D-17; issues #35,
// #36, #189). All four named message kinds: 'confirmation' (dispatched at
// ReservationConfirmed — see server/api/webhooks/stripe.post.ts),
// 'return_reminder' (server/utils/return-reminder-dispatch.ts),
// 'pickup_reminder' (server/utils/pickup-reminder-dispatch.ts) and
// 'overdue_reminder' (server/utils/overdue-reminder-dispatch.ts).
//
// 'overdue_reminder' is sent AT MOST ONCE per Reservation — the first
// time it is found Overdue, not repeatedly on every scheduled run while
// it stays Overdue. D-17 explicitly rejects "staged automatic
// escalation... no escalation state machine, no automatic penalty" — a
// daily nagging email would be exactly that in disguise, and nothing in
// FR-41/W6/D-17 asks for repetition. This also keeps the same
// at-most-once-per-(kind, referenceId) model every other kind already
// uses, rather than inventing a second dispatch-tracking shape just for
// this one.
//
// Deliberately a leaf with ZERO cross-context imports of its own, even
// though the context map (Part 1 §4) would structurally permit this
// module to import Availability & Reservation's and Handover &
// Possession's published interfaces directly (arrows point into
// Notification from both). Every caller assembles whatever display data
// it needs from wherever it needs it and passes plain values in — this
// keeps Notification "deliberately stupid" (D-28, P1 §4) in the strongest
// sense: it has no opinion about what a Reservation or a RentalAgreement
// is, only about how to format and send a message once it already has
// the words.
//
// #189: the caller now resolves the AssetType's NAME (Catalog) and passes it
// in, so a Customer reads "Generátor ozónu" and not "AssetType 13". Days and
// money are formatted here through the one formatting module (D-51,
// shared/format.ts); the words themselves are in ./copy.ts.
import type { MonetaryAmount, TenantId } from '../_shared'
import { formatDay, formatDayRange, formatMoney } from '../../../shared/format'
import type { NotificationGateway } from './resend-gateway'
import type { NotificationRepository } from './repository'
import type { NotificationDispatch } from './types'
import {
  overdueReminderText,
  pickupReminderText,
  reservationConfirmationText,
  returnReminderText,
} from './copy'

export interface NotificationDeps {
  repo: NotificationRepository
  gateway: NotificationGateway
}

// One line of a confirmation: a tool, how many units, for which days. FR-06
// makes a unit its own Reservation, so the caller groups equal ones.
export interface ConfirmationLine {
  assetTypeName: string
  quantity: number
  startDay: string
  endDay: string
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
    lines: ConfirmationLine[]
    // The cash deposit across the group (D-07), or null when it cannot be
    // named; the email then says only that it is paid in cash at pickup.
    depositTotal: MonetaryAmount | null
    // The terms version the Customer accepted before paying (D-35).
    termsVersion: string | null
    accessLinkUrl: string
  },
): Promise<NotificationDispatch | null> {
  const { tenantId, customerId, reservationGroupId, to, customerName, accessLinkUrl } = params
  const { subject, body } = reservationConfirmationText({
    customerName,
    lines: params.lines.map((line) => ({
      name: line.assetTypeName,
      quantity: line.quantity,
      period: formatDayRange(line.startDay, line.endDay),
    })),
    depositTotal: params.depositTotal ? formatMoney(params.depositTotal) : null,
    termsVersion: params.termsVersion,
    accessLinkUrl,
  })
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
    assetTypeName: string
    endDay: string
  },
): Promise<NotificationDispatch | null> {
  const { tenantId, customerId, reservationId, to, customerName, assetTypeName, endDay } = params
  const { subject, body } = returnReminderText({ customerName, assetTypeName, dueDay: formatDay(endDay) })
  return sendAndRecord(deps, { tenantId, customerId, kind: 'return_reminder', referenceId: reservationId, to, subject, body })
}

// FR-41: "Pickup reminder by email." Sent exactly on the Reservation's
// own RentalPeriod start day (OQ #7's timing value — not launch-blocking,
// same pragmatic pilot-scale constant discipline as return_reminder's
// own "exactly on end day" choice) for symmetry and simplicity, not a
// preference/configuration surface (issue #36's own scope note).
export async function dispatchPickupReminder(
  deps: NotificationDeps,
  params: {
    tenantId: TenantId
    customerId: number
    reservationId: number
    to: string
    customerName: string
    assetTypeName: string
    startDay: string
    endDay: string
  },
): Promise<NotificationDispatch | null> {
  const { tenantId, customerId, reservationId, to, customerName, assetTypeName, startDay, endDay } = params
  const { subject, body } = pickupReminderText({
    customerName,
    assetTypeName,
    period: formatDayRange(startDay, endDay),
  })
  return sendAndRecord(deps, { tenantId, customerId, kind: 'pickup_reminder', referenceId: reservationId, to, subject, body })
}

// D-17, W6, FR-41: the Customer-facing half of Overdue handling — the
// derivation and Operator view live in Availability & Reservation
// (server/utils/overdue-noshow-views.ts, issue #16). Sent AT MOST ONCE
// per Reservation (see this file's header comment for why) —
// server/utils/overdue-reminder-dispatch.ts's own hasBeenDispatched
// check (via sendAndRecord) is what makes a daily scheduled scan safe to
// run indefinitely without renagging the same Customer.
export async function dispatchOverdueReminder(
  deps: NotificationDeps,
  params: {
    tenantId: TenantId
    customerId: number
    reservationId: number
    to: string
    customerName: string
    assetTypeName: string
    endDay: string
  },
): Promise<NotificationDispatch | null> {
  const { tenantId, customerId, reservationId, to, customerName, assetTypeName, endDay } = params
  const { subject, body } = overdueReminderText({ customerName, assetTypeName, dueDay: formatDay(endDay) })
  return sendAndRecord(deps, { tenantId, customerId, kind: 'overdue_reminder', referenceId: reservationId, to, subject, body })
}
