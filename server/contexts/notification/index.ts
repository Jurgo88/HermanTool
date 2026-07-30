// Notification [MVP · generic] — outbound messages only: reservation
// confirmation, pickup reminder, return reminder, Overdue reminder.
// Deliberately stupid — no preference centre, no template engine, no
// campaign concept. Part 1 §4; D-28.
//
// Dependency direction (Part 1 §4 context map): downstream of Handover &
// Possession and Availability & Reservation — those arrows would permit
// this context's own modules to import their published interfaces
// directly, but ./notification.ts deliberately doesn't: every caller
// assembles display data from wherever it needs to and passes plain
// values in, keeping this context a true leaf with zero cross-context
// imports of its own. No other MVP context may depend on Notification.
//
// Every NotificationDispatch is an aggregate root and carries
// `tenantId: TenantId` (D-01, P2).
//
// Implements 'confirmation' and 'return_reminder' (D-28, FR-32, A-08;
// issue #35). 'pickup_reminder' and 'overdue_reminder' are issue #36's
// separate, later scope — see ./types.ts's NotificationKind for the
// full, closed four-kind list.
export type { NotificationDispatch, NotificationKind } from './types'
export { NotificationError, NotificationSendFailedError } from './types'

export type { NewNotificationDispatch, NotificationRepository } from './repository'
export { createPostgresNotificationRepository } from './repository'

export type { NotificationGateway, SendEmailRequest } from './resend-gateway'
export { createResendNotificationGateway } from './resend-gateway'

export type { NotificationDeps } from './notification'
export { dispatchReservationConfirmation, dispatchReturnReminder } from './notification'
