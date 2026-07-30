// Domain types for Notification [MVP · generic] — deliberately dumb: no
// preference centre, no template engine, no campaign concept (P1 §4,
// D-28). See ./index.ts for the context's boundary and citations.
import type { TenantId } from '../_shared'

// P1 §4, Part 2's event catalogue: the complete, closed list — four
// named kinds, nothing else. #35 (this issue) implements 'confirmation'
// and 'return_reminder'; #36 implements 'pickup_reminder' and
// 'overdue_reminder'. 'return_reminder' is the PROACTIVE nudge sent
// around the RentalPeriod's own end day, before anything is late — the
// "highest-leverage operational lever" P1 names. 'overdue_reminder' is
// the REACTIVE one, tied to #16's already-derived Overdue state
// (D-17/W6) — a distinct kind, not a synonym.
export type NotificationKind = 'confirmation' | 'pickup_reminder' | 'return_reminder' | 'overdue_reminder'

// FR-32: "records every dispatch... the artefact you point at when a
// Customer says they were never told." `referenceId` is a generic
// correlating id whose MEANING depends on `kind` (confirmation:
// ReservationGroup id; return_reminder: Reservation id) — the unique
// index on (tenant_id, kind, reference_id) is this context's at-most-once
// guard against a retried webhook/cron run double-sending.
export interface NotificationDispatch {
  id: number
  tenantId: TenantId
  customerId: number
  kind: NotificationKind
  referenceId: number
  to: string
  subject: string
  providerMessageId: string
  sentAt: Date
}

export class NotificationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

// The provider (Resend) failed to accept the send — see
// ./resend-gateway.ts, the only file that ever constructs this.
export class NotificationSendFailedError extends NotificationError {
  constructor(reason: string) {
    super(`Notification send failed: ${reason}`)
  }
}
