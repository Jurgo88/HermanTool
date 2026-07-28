// Domain types for Availability & Reservation [MVP · CORE] (Part 1 §4,
// §5, §6; D-04, D-08, D-13, D-18). See ./index.ts for the context's
// boundary and citations.
import type { TenantId } from '../_shared'
import type { RentalPeriod } from './rental-period'

export type { RentalPeriod } from './rental-period'

// D-18: the complete list. No Fulfilled, and there must never be one — a
// Reservation is never closed, completed or fulfilled by anything
// physical (Part 1: Possession and Reservation are separate clocks that
// never own each other).
export type ReservationState = 'pending' | 'confirmed' | 'cancelled' | 'expired'

// D-13: the set of Reservations created in one checkout and the single
// Payment covering them, and nothing else. No status, no RentalPeriod,
// no availability invariant of its own — each Reservation carries those.
export interface ReservationGroup {
  id: number
  tenantId: TenantId
  createdAt: Date
}

// D-04: binds to an AssetType, never to an Asset — instance choice is
// deferred to HandoverOut (Handover & Possession, not this context).
export interface Reservation {
  id: number
  tenantId: TenantId
  reservationGroupId: number
  assetTypeId: number
  period: RentalPeriod
  state: ReservationState
  pendingExpiresAt: Date
  createdAt: Date
  stateChangedAt: Date
}

export class AvailabilityReservationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

export class ReservationGroupNotFoundError extends AvailabilityReservationError {
  constructor(reservationGroupId: number) {
    super(`ReservationGroup ${reservationGroupId} does not exist for this Tenant.`)
  }
}

export class ReservationNotFoundError extends AvailabilityReservationError {
  constructor(reservationId: number) {
    super(`Reservation ${reservationId} does not exist for this Tenant.`)
  }
}

export class EmptyReservationGroupError extends AvailabilityReservationError {
  constructor() {
    super('A ReservationGroup must contain at least one Reservation line (D-13).')
  }
}

// D-08: strict no-overbooking, no buffer. Thrown when an AssetType has no
// Rentable capacity left for a given RentalDay, after the D-33
// reap-on-contention step has already tried to free a stale Pending hold.
export class AssetTypeUnavailableError extends AvailabilityReservationError {
  constructor(
    public readonly assetTypeId: number,
    public readonly day: string,
  ) {
    super(`AssetType ${assetTypeId} has no Rentable capacity left on ${day}.`)
  }
}

// A Reservation was not in the state a transition requires — e.g.
// confirming or cancelling one that is already Cancelled or Expired.
export class ReservationNotActiveError extends AvailabilityReservationError {
  constructor(reservationId: number, state: ReservationState) {
    super(`Reservation ${reservationId} is ${state} and cannot be confirmed or cancelled.`)
  }
}

// D-37 / Finding 3: PaymentReceived arrived for a ReservationGroup where
// at least one Reservation's RentalDays could not be re-acquired after
// expiry. Availability & Reservation never processes refunds (D-07) — it
// reports failure so a Payments-side caller can trigger one automatically.
export class ReservationGroupReacquireFailedError extends AvailabilityReservationError {
  constructor(
    public readonly reservationGroupId: number,
    public readonly failedReservationIds: number[],
  ) {
    super(
      `ReservationGroup ${reservationGroupId} could not be confirmed: RentalDays for Reservation(s) ` +
        `${failedReservationIds.join(', ')} could not be re-acquired after expiry (D-37).`,
    )
  }
}
