// In-memory stand-in for AvailabilityReservationRepository, used by
// reservation.test.ts so the domain logic in
// server/contexts/availability-reservation/reservation.ts is exercised
// without a database (Part 4 §14.2). Mirrors the real Postgres
// repository's tenant-scoping and D-33 atomic-hold semantics closely
// enough to prove checkout atomicity and reap-on-contention at the unit
// level; the OQ #23 genuine-concurrency proof still requires real
// Postgres (see the integration test).
import type { TenantId } from '../../../../server/contexts/_shared'
import type {
  AvailabilityReservationRepository,
  CapacitySource,
  NewReservation,
} from '../../../../server/contexts/availability-reservation/repository'
import type {
  Reservation,
  ReservationGroup,
  ReservationState,
} from '../../../../server/contexts/availability-reservation/types'

interface State {
  reservationGroups: ReservationGroup[]
  reservations: Reservation[]
  holds: Map<string, number>
  capacities: Map<number, number>
  nextGroupId: number
  nextReservationId: number
}

function holdKey(tenantId: TenantId, assetTypeId: number, day: string): string {
  return `${tenantId}:${assetTypeId}:${day}`
}

function cloneState(state: State): State {
  return {
    reservationGroups: state.reservationGroups.map((g) => ({ ...g })),
    reservations: state.reservations.map((r) => ({ ...r, period: { ...r.period } })),
    holds: new Map(state.holds),
    capacities: new Map(state.capacities),
    nextGroupId: state.nextGroupId,
    nextReservationId: state.nextReservationId,
  }
}

export interface FakeAvailabilityReservationRepository extends AvailabilityReservationRepository {
  // Stands in for Asset Registry's Rentable count (D-02: the real
  // repository reads this through Asset Registry's published interface;
  // this fake short-circuits straight to a seeded value).
  seedCapacity(assetTypeId: number, capacity: number): void
  getHeldCount(tenantId: TenantId, assetTypeId: number, day: string): number
  allReservations(): Reservation[]
}

export function createFakeAvailabilityReservationRepository(): FakeAvailabilityReservationRepository {
  const state: State = {
    reservationGroups: [],
    reservations: [],
    holds: new Map(),
    capacities: new Map(),
    nextGroupId: 1,
    nextReservationId: 1,
  }

  function build(target: State): FakeAvailabilityReservationRepository {
    return {
      seedCapacity(assetTypeId, capacity) {
        target.capacities.set(assetTypeId, capacity)
      },

      getHeldCount(tenantId, assetTypeId, day) {
        return target.holds.get(holdKey(tenantId, assetTypeId, day)) ?? 0
      },

      allReservations() {
        return target.reservations.map((r) => ({ ...r }))
      },

      async insertReservationGroup(tenantId) {
        const group: ReservationGroup = { id: target.nextGroupId++, tenantId, createdAt: new Date() }
        target.reservationGroups.push(group)
        return { ...group }
      },

      async getReservationGroup(tenantId, id) {
        const group = target.reservationGroups.find((g) => g.tenantId === tenantId && g.id === id)
        return group ? { ...group } : null
      },

      async listReservationsForGroup(tenantId, reservationGroupId) {
        return target.reservations
          .filter((r) => r.tenantId === tenantId && r.reservationGroupId === reservationGroupId)
          .map((r) => ({ ...r }))
      },

      async getReservation(tenantId, id) {
        const reservation = target.reservations.find((r) => r.tenantId === tenantId && r.id === id)
        return reservation ? { ...reservation } : null
      },

      async insertReservation(tenantId, params: NewReservation) {
        const now = new Date()
        const reservation: Reservation = {
          id: target.nextReservationId++,
          tenantId,
          reservationGroupId: params.reservationGroupId,
          assetTypeId: params.assetTypeId,
          period: { ...params.period },
          state: 'pending',
          pendingExpiresAt: params.pendingExpiresAt,
          createdAt: now,
          stateChangedAt: now,
        }
        target.reservations.push(reservation)
        return { ...reservation }
      },

      async transitionReservationState(tenantId, id, { from, to }) {
        const reservation = target.reservations.find(
          (r) => r.tenantId === tenantId && r.id === id && r.state === from,
        )
        if (!reservation) return null
        reservation.state = to as ReservationState
        reservation.stateChangedAt = new Date()
        return { ...reservation }
      },

      async tryIncrementHold(tenantId, assetTypeId, day, capacity) {
        const key = holdKey(tenantId, assetTypeId, day)
        const current = target.holds.get(key) ?? 0
        if (current >= capacity) return false
        target.holds.set(key, current + 1)
        return true
      },

      async decrementHold(tenantId, assetTypeId, day) {
        const key = holdKey(tenantId, assetTypeId, day)
        const current = target.holds.get(key) ?? 0
        if (current > 0) target.holds.set(key, current - 1)
      },

      async findStalePendingReservationForDay(tenantId, assetTypeId, day) {
        const now = Date.now()
        const reservation = target.reservations.find(
          (r) =>
            r.tenantId === tenantId &&
            r.assetTypeId === assetTypeId &&
            r.state === 'pending' &&
            r.pendingExpiresAt.getTime() < now &&
            r.period.startDay <= day &&
            r.period.endDay >= day,
        )
        return reservation ? { ...reservation } : null
      },

      async countActiveReservations(tenantId, assetTypeId, day) {
        const now = Date.now()
        return target.reservations.filter(
          (r) =>
            r.tenantId === tenantId &&
            r.assetTypeId === assetTypeId &&
            r.period.startDay <= day &&
            r.period.endDay >= day &&
            (r.state === 'confirmed' || (r.state === 'pending' && r.pendingExpiresAt.getTime() > now)),
        ).length
      },

      async transaction(fn) {
        const snapshot = cloneState(target)
        const getRentableCount: CapacitySource = async (_tenantId, assetTypeId) =>
          target.capacities.get(assetTypeId) ?? 0
        try {
          return await fn(build(target), getRentableCount)
        } catch (err) {
          Object.assign(target, cloneState(snapshot))
          throw err
        }
      },
    }
  }

  return build(state)
}
