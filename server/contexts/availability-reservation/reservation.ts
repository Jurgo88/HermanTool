// Availability & Reservation domain logic [MVP · CORE] (W1, W2; D-04,
// D-08, D-09, D-13, D-18, D-33, D-37; FR-03..FR-10).
//
// The D-33 concurrency mechanism lives here, not in the repository: the
// repository's tryIncrementHold is the atomic primitive (a single
// conditional UPSERT); this module composes it with the capacity read
// (Asset Registry, via the CapacitySource handed back by
// repo.transaction — never imported directly, see ./repository.ts) and
// with reap-on-contention.
//
// Reap-on-contention resolves the lazy-expiry seam (D-25, Finding 3): a
// Pending Reservation's window can lapse before the background sweep
// (not built in this phase — see D-25 §14.2) has flipped its state
// column. Rather than depending on the sweep's timeliness, the
// acquisition path itself performs the lazy check exactly when it
// matters — when a NEW attempt is contended by a stale hold — and
// releases it before retrying once. D-37's payment-after-expiry
// re-acquire (confirmReservationGroup, below) reuses the identical path.
import type { TenantId } from '../_shared'
import type { AvailabilityReservationRepository, CapacitySource } from './repository'
import { eachDayOfPeriod, validateRentalPeriod, type RentalPeriod } from './rental-period'
import {
  AssetTypeUnavailableError,
  EmptyReservationGroupError,
  InvalidTermsVersionError,
  ReservationGroupNotFoundError,
  ReservationGroupReacquireFailedError,
  ReservationNotActiveError,
  ReservationNotFoundError,
  TermsNotAcceptedError,
  type Reservation,
  type ReservationGroup,
} from './types'

// D-18 / OQ #6 — Pending expiry window. Platform-scoped (Part 3 §12(e)):
// checkout mechanics, not business policy, and coupled to the payment
// provider's own timeout rather than anything the owner decides. OQ #6
// lists this value as still unset. 30 minutes is a placeholder — long
// enough to complete a Stripe Checkout session without holding a
// contested day needlessly — and MUST be reconciled with Stripe's actual
// session timeout before launch. This is its one named home; nothing
// else in the codebase should hardcode a expiry duration.
export const PENDING_EXPIRY_MINUTES = 30

export interface ReservationLine {
  assetTypeId: number
  period: RentalPeriod
}

// Test-only instrumentation seam (OQ #23). No-op in production. Exists
// so the concurrency test can force genuine interleaving between two
// acquisition attempts — pausing one after it has read capacity but
// before it executes the atomic increment — rather than relying on
// network-timing luck to exercise that interleaving.
export interface AcquisitionHooks {
  afterCapacityRead?: (params: { assetTypeId: number; day: string; capacity: number }) => Promise<void> | void
}

async function acquireDayHold(
  repo: AvailabilityReservationRepository,
  getRentablePoolCount: CapacitySource,
  params: { tenantId: TenantId; assetTypeId: number; day: string; hooks?: AcquisitionHooks },
): Promise<void> {
  const { tenantId, assetTypeId, day, hooks } = params
  const capacity = await getRentablePoolCount(tenantId, assetTypeId)
  await hooks?.afterCapacityRead?.({ assetTypeId, day, capacity })

  if (await repo.tryIncrementHold(tenantId, assetTypeId, day, capacity)) return

  const stale = await repo.findStalePendingReservationForDay(tenantId, assetTypeId, day)
  if (stale) {
    await reapReservation(repo, { tenantId, reservation: stale })
    if (await repo.tryIncrementHold(tenantId, assetTypeId, day, capacity)) return
  }

  throw new AssetTypeUnavailableError(assetTypeId, day)
}

// Transitions a Pending Reservation to Expired and releases every day it
// was holding — the full RentalPeriod, not just a contended day, since an
// abandoned multi-day Pending must not keep the other days either.
// Idempotent by construction: transitionReservationState's guard means
// only the first caller to reach this for a given Reservation actually
// releases anything; if it's already Expired or Cancelled (e.g. reaped by
// a concurrent contender, or already handled), this is a no-op and
// returns null — the caller decides whether that matters.
async function reapReservation(
  repo: AvailabilityReservationRepository,
  params: { tenantId: TenantId; reservation: Reservation },
): Promise<Reservation | null> {
  const { tenantId, reservation } = params
  const transitioned = await repo.transitionReservationState(tenantId, reservation.id, {
    from: 'pending',
    to: 'expired',
  })
  if (!transitioned) return null

  for (const day of eachDayOfPeriod(reservation.period)) {
    await repo.decrementHold(tenantId, reservation.assetTypeId, day)
  }

  return transitioned
}

// W1, D-13, FR-06: a checkout covering n AssetTypes produces one
// ReservationGroup and n Reservations, each holding its own RentalPeriod.
// Built atomic at the whole-checkout level: one DB transaction covers
// every line, so a failure acquiring line 2's days rolls back line 1's
// too, rather than leaving a partial ReservationGroup. D-13's "each
// Reservation is checked independently against the calendar" is about
// the availability check having no cross-AssetType invariant — it does
// not forbid checkout-level transaction atomicity.
export async function checkoutReservationGroup(
  repo: AvailabilityReservationRepository,
  params: { tenantId: TenantId; lines: ReservationLine[]; now?: Date; hooks?: AcquisitionHooks },
): Promise<{ group: ReservationGroup; reservations: Reservation[] }> {
  const { tenantId, lines, now = new Date(), hooks } = params
  if (lines.length === 0) throw new EmptyReservationGroupError()
  for (const line of lines) validateRentalPeriod(line.period)

  const pendingExpiresAt = new Date(now.getTime() + PENDING_EXPIRY_MINUTES * 60_000)

  return repo.transaction(async (trx, getRentablePoolCount) => {
    const group = await trx.insertReservationGroup(tenantId)
    const reservations: Reservation[] = []

    for (const line of lines) {
      for (const day of eachDayOfPeriod(line.period)) {
        await acquireDayHold(trx, getRentablePoolCount, { tenantId, assetTypeId: line.assetTypeId, day, hooks })
      }
      reservations.push(
        await trx.insertReservation(tenantId, {
          reservationGroupId: group.id,
          assetTypeId: line.assetTypeId,
          period: line.period,
          pendingExpiresAt,
        }),
      )
    }

    return { group, reservations }
  })
}

// D-35, F1 KNOWN GAP (Part 5 Finding 1): records that `termsVersion` was
// accepted, now. Mechanics only — no legal counsel has reviewed the
// actual terms content or the pre-contractual information catalogue yet
// (trader identity, total price, duration, withdrawal information), and
// the withdrawal-right section specifically cannot be written until
// OQ #1 (cancellation policy) is resolved. This function does not know
// or care what `termsVersion` refers to — that is a future content/
// frontend concern — it only records that a specific, versioned
// reference was accepted at a specific time, which is what FR-09/FR-10
// and D-35 actually require of the domain layer.
export async function recordTermsAcceptance(
  repo: AvailabilityReservationRepository,
  params: { tenantId: TenantId; reservationGroupId: number; termsVersion: string },
): Promise<ReservationGroup> {
  const { tenantId, reservationGroupId, termsVersion } = params
  if (!termsVersion.trim()) throw new InvalidTermsVersionError()

  const group = await repo.recordTermsAcceptance(tenantId, reservationGroupId, termsVersion)
  if (!group) throw new ReservationGroupNotFoundError(reservationGroupId)
  return group
}

// FR-09: "Payment may start only after terms acceptance is recorded on
// the ReservationGroup." A guard for a future Payments-side caller
// (Milestone 5, not built here) to call before starting a charge —
// there is no checkout/payment HTTP flow yet for this to gate.
export function assertTermsAccepted(group: ReservationGroup): void {
  if (!group.termsAcceptedAt) throw new TermsNotAcceptedError(group.id)
}

// W2, FR-10, D-37: PaymentReceived confirms every Reservation in the
// group. A Reservation still within its Pending window simply flips
// state — its hold is already ours. One that has lapsed (swept to
// Expired already, or Pending-but-unswept) goes through the identical
// release-then-reacquire path a contended checkout uses (Finding 3):
// release whatever it still holds (a no-op if already released),
// re-acquire every day fresh. Whole-group atomic — if any Reservation
// can't be re-acquired, none are confirmed (FR-09: partial payment is
// not representable, extended to confirmation) — the caller (a future
// Payments integration, not built here) is expected to trigger an
// automatic refund on ReservationGroupReacquireFailedError; this context
// never processes refunds itself (D-07).
export async function confirmReservationGroup(
  repo: AvailabilityReservationRepository,
  params: { tenantId: TenantId; reservationGroupId: number },
): Promise<Reservation[]> {
  const { tenantId, reservationGroupId } = params

  return repo.transaction(async (trx, getRentablePoolCount) => {
    const group = await trx.getReservationGroup(tenantId, reservationGroupId)
    if (!group) throw new ReservationGroupNotFoundError(reservationGroupId)

    const reservations = await trx.listReservationsForGroup(tenantId, reservationGroupId)
    const confirmed: Reservation[] = []
    const failed: number[] = []

    for (const reservation of reservations) {
      if (reservation.state === 'confirmed') {
        confirmed.push(reservation)
        continue
      }

      if (reservation.state === 'cancelled') {
        // A Cancelled Reservation awaiting payment is a caller error,
        // not a re-acquire case — surfaced as a failure rather than
        // silently resurrected.
        failed.push(reservation.id)
        continue
      }

      const stillWithinWindow =
        reservation.state === 'pending' && reservation.pendingExpiresAt.getTime() > Date.now()

      if (stillWithinWindow) {
        const transitioned = await trx.transitionReservationState(tenantId, reservation.id, {
          from: 'pending',
          to: 'confirmed',
        })
        if (transitioned) {
          confirmed.push(transitioned)
          continue
        }
        // Guard miss: state changed between our read and this update
        // (e.g. reaped concurrently by a contended acquisition
        // elsewhere). Fall through to the re-acquire path with a fresh
        // read below.
      }

      try {
        const current = (await trx.getReservation(tenantId, reservation.id))!
        if (current.state === 'pending') {
          await reapReservation(trx, { tenantId, reservation: current })
        }

        for (const day of eachDayOfPeriod(current.period)) {
          await acquireDayHold(trx, getRentablePoolCount, {
            tenantId,
            assetTypeId: current.assetTypeId,
            day,
          })
        }

        const transitioned = await trx.transitionReservationState(tenantId, reservation.id, {
          from: 'expired',
          to: 'confirmed',
        })
        if (transitioned) confirmed.push(transitioned)
        else failed.push(reservation.id)
      } catch (err) {
        if (err instanceof AssetTypeUnavailableError) failed.push(reservation.id)
        else throw err
      }
    }

    if (failed.length > 0) {
      throw new ReservationGroupReacquireFailedError(reservationGroupId, failed)
    }

    return confirmed
  })
}

// Mechanical release only (D-13, W11): a cancelled Reservation must
// release its RentalDays or the D-08 invariant silently rots. This is NOT
// the cancellation WORKFLOW — no route calls this, there is no refund,
// no notification, no policy on who may cancel or when. W11 is
// launch-blocking and undecided (OQ #1, CLAUDE.md KNOWN GAPS); building
// the workflow means inventing that policy, which this function
// deliberately does not do. It exists so the mechanics are ready the day
// the policy is decided (Finding 3's reasoning, extended to cancellation).
export async function cancelReservation(
  repo: AvailabilityReservationRepository,
  params: { tenantId: TenantId; reservationId: number },
): Promise<Reservation> {
  const { tenantId, reservationId } = params

  return repo.transaction(async (trx) => {
    const reservation = await trx.getReservation(tenantId, reservationId)
    if (!reservation) throw new ReservationNotFoundError(reservationId)
    if (reservation.state !== 'pending' && reservation.state !== 'confirmed') {
      throw new ReservationNotActiveError(reservationId, reservation.state)
    }

    const transitioned = await trx.transitionReservationState(tenantId, reservationId, {
      from: reservation.state,
      to: 'cancelled',
    })
    if (!transitioned) throw new ReservationNotActiveError(reservationId, reservation.state)

    for (const day of eachDayOfPeriod(reservation.period)) {
      await trx.decrementHold(tenantId, reservation.assetTypeId, day)
    }

    return transitioned
  })
}

// D-25 §14.2, Finding 3, FR-08: the proactive expiry sweep. Reap-on-
// contention (above) already guarantees D-08's invariant never depends
// on this running promptly — this exists for the general case: an
// abandoned Pending on an AssetType nobody else wants right now would
// otherwise sit unswept indefinitely (no reap-on-contention call would
// ever trigger for it), and Part 2's event catalogue is explicit that
// `ReservationExpired` is recorded by "the Platform sweep process," not
// left as an implicit read-time condition. Called on a schedule via an
// authenticated Nitro endpoint (D-25 §14.2 — GitHub Actions, not a
// long-lived process); each stale Reservation is reaped in its OWN
// transaction, not one transaction for the whole sweep, since — unlike a
// single checkout — different Reservations expiring have no atomicity
// relationship with each other, and a failure reaping one must not
// block the rest (R-08).
export async function sweepExpiredReservations(
  repo: AvailabilityReservationRepository,
  params: { tenantId: TenantId },
): Promise<Reservation[]> {
  const { tenantId } = params
  const stale = await repo.findStalePendingReservations(tenantId)
  const expired: Reservation[] = []

  for (const reservation of stale) {
    const result = await repo.transaction((trx) => reapReservation(trx, { tenantId, reservation }))
    if (result) expired.push(result)
  }

  return expired
}

// FR-03: Availability is computed per AssetType per RentalDay from
// Rentable Assets minus active Reservations, on demand — never written
// onto an Asset. Independent of the D-33 holds counter (see ./index.ts's
// module doc for why): this is a read, not an enforcement, so it needs no
// transaction. Lazy expiry (D-25): countActiveReservations excludes a
// Pending row past its window regardless of whether the sweep has
// processed it yet.
export async function getAvailableCount(
  repo: AvailabilityReservationRepository,
  getRentablePoolCount: CapacitySource,
  params: { tenantId: TenantId; assetTypeId: number; day: string },
): Promise<number> {
  const { tenantId, assetTypeId, day } = params
  const [rentable, active] = await Promise.all([
    getRentablePoolCount(tenantId, assetTypeId),
    repo.countActiveReservations(tenantId, assetTypeId, day),
  ])
  return Math.max(0, rentable - active)
}
