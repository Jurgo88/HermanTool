// Availability & Reservation [MVP · CORE] — owns Reservation,
// ReservationGroup, and the day-granularity availability calendar. Holds
// the D-08 no-overbooking invariant under concurrency via D-33's
// materialised per-(AssetType, day) holds mechanism (Part 4 §16 D-33,
// Finding 4, R-08). Part 1 §4; D-04, D-08, D-09, D-13, D-18, D-33, D-37.
//
// Dependency direction (Part 1 §4 context map): downstream of Catalog,
// Asset Registry and Payments; upstream of Handover & Possession and
// Notification. Imports Asset Registry's published interface only (its
// `getRentableCount`, composed inside the same transaction as the D-33
// hold increment — see ./repository.ts) and must never reach into its
// internals. Must never import Handover & Possession, Notification or
// Payments at all — none of those contexts exist yet.
//
// Two distinct "availability" computations live here, and they are not
// the same mechanism:
//   - The READ side (FR-03, ./reservation.ts's getAvailableCount): a
//     live, non-transactional query for display — Rentable Assets minus
//     active Reservations, lazily excluding an unswept-but-expired
//     Pending (D-25).
//   - The WRITE side (D-33, ./repository.ts's tryIncrementHold): the
//     materialised holds counter that atomically gates NEW hold
//     attempts under concurrency. It exists because a plain COUNT(*) has
//     no row for Postgres to lock — see the module docs on
//     ./repository.ts and ./reservation.ts for the full reasoning.
//
// sweepExpiredReservations (D-25 §14.2, Finding 3, FR-08) is the
// proactive counterpart to reap-on-contention: it never affects D-08's
// correctness (that never depended on sweep timeliness), but without it
// an abandoned Pending on an AssetType nobody else contests would sit
// unswept indefinitely. Wired to server/api/internal/reservations/
// sweep-expired.post.ts, called on a schedule by GitHub Actions.
//
// Scope note: checkout/confirm/cancel have no server/api route yet —
// that is a separate, later piece of work. Cancellation is mechanics
// only (release-on-cancel); the cancellation WORKFLOW (W11) stays
// unbuilt pending OQ #1 (CLAUDE.md KNOWN GAPS).
export type { RentalPeriod } from './rental-period'
export { InvalidRentalPeriodError, eachDayOfPeriod, rentalPeriodLengthInDays } from './rental-period'

export type { Reservation, ReservationGroup, ReservationState } from './types'

// Error classes are exported as values (not `export type`) so callers
// can use `instanceof` — they are thrown, not just typed, by
// ./reservation.ts.
export {
  AvailabilityReservationError,
  AssetTypeUnavailableError,
  EmptyReservationGroupError,
  ReservationGroupNotFoundError,
  ReservationGroupReacquireFailedError,
  ReservationNotActiveError,
  ReservationNotFoundError,
} from './types'

export type { AvailabilityReservationRepository, CapacitySource, NewReservation } from './repository'
export { createPostgresAvailabilityReservationRepository } from './repository'

export type { AcquisitionHooks, ReservationLine } from './reservation'
export {
  PENDING_EXPIRY_MINUTES,
  cancelReservation,
  checkoutReservationGroup,
  confirmReservationGroup,
  getAvailableCount,
  sweepExpiredReservations,
} from './reservation'
