// Availability & Reservation's data access, kept behind a narrow
// interface so the domain logic in ./reservation.ts is testable without a
// database (Part 4 §14.2), mirroring Asset Registry's repository shape.
// Every method takes `tenantId` as its first parameter (FR-33).
import type postgres from 'postgres'
import type { TenantId } from '../_shared'
import { createPostgresAssetRegistryRepository } from '../asset-registry'
import { formatRentalDay, type RentalPeriod } from './rental-period'
import type { Reservation, ReservationGroup, ReservationState } from './types'

// Bound to the SAME transaction as every other call made through the
// `repo` handed to the same `transaction()` callback — never a second
// connection. This is the published-interface seam D-02 requires:
// Availability & Reservation never selects from `assets` directly, and
// domain logic (./reservation.ts) never imports Asset Registry's
// Postgres factory itself, so it stays testable with a fake capacity
// source instead of a database (Part 4 §16 D-33).
export type CapacitySource = (tenantId: TenantId, assetTypeId: number) => Promise<number>

export interface NewReservation {
  reservationGroupId: number
  assetTypeId: number
  period: RentalPeriod
  pendingExpiresAt: Date
}

export interface AvailabilityReservationRepository {
  insertReservationGroup(tenantId: TenantId): Promise<ReservationGroup>
  getReservationGroup(tenantId: TenantId, id: number): Promise<ReservationGroup | null>
  listReservationsForGroup(tenantId: TenantId, reservationGroupId: number): Promise<Reservation[]>

  // D-35, F1 KNOWN GAP: records that `termsVersion` was accepted now.
  // Overwrites any prior acceptance on the same group (re-accepting a
  // changed version) rather than keeping a history — ReservationGroup
  // has "no status of its own" (D-13) and this is a current-state fact,
  // not an append-only evidentiary record like Handover & Possession's
  // attestations (D-10 scopes append-only history to Possession/
  // condition/attestation facts specifically). Returns null if no
  // ReservationGroup exists for this Tenant with this id.
  recordTermsAcceptance(
    tenantId: TenantId,
    reservationGroupId: number,
    termsVersion: string,
  ): Promise<ReservationGroup | null>

  getReservation(tenantId: TenantId, id: number): Promise<Reservation | null>
  insertReservation(tenantId: TenantId, params: NewReservation): Promise<Reservation>

  // Transitions a Reservation's state, guarded by the state it must
  // currently be in (an optimistic-lock-style guard, so a caller can
  // never silently clobber a state it didn't observe). Returns null if
  // the guard didn't match — already transitioned by someone else — the
  // caller decides what that means; this method never throws for it.
  transitionReservationState(
    tenantId: TenantId,
    id: number,
    params: { from: ReservationState; to: ReservationState },
  ): Promise<Reservation | null>

  // D-33 holds mechanism. Private to this context — not exported from
  // ./index.ts. Atomic conditional increment: succeeds only if
  // held_count was strictly below `capacity` at the moment of the
  // upsert, whether or not a row already existed for (tenantId,
  // assetTypeId, day). `capacity` must be read from Asset Registry's
  // published interface bound to the SAME transaction as this call (see
  // `transaction` below and ./reservation.ts).
  tryIncrementHold(tenantId: TenantId, assetTypeId: number, day: string, capacity: number): Promise<boolean>

  // Releases one day's hold (Cancelled/Expired release, D-33). Never
  // takes held_count below zero — the migration's check constraint is
  // the backstop, but callers should never call this more than once per
  // day per Reservation.
  decrementHold(tenantId: TenantId, assetTypeId: number, day: string): Promise<void>

  // D-33 reap-on-contention: finds a Pending Reservation covering `day`
  // whose pending_expires_at has already passed — a candidate to reap
  // before refusing a new hold attempt. Uses Postgres's own `now()`
  // (transaction-consistent), not an injected clock — see
  // ./reservation.ts's module doc for why that's the correct seam.
  findStalePendingReservationForDay(
    tenantId: TenantId,
    assetTypeId: number,
    day: string,
  ): Promise<Reservation | null>

  // D-25 §14.2 / Finding 3: the proactive sweep's read side. Every
  // Pending Reservation for the Tenant whose window has already lapsed —
  // across all AssetTypes and days, not just one contended day. Real
  // Postgres `now()`, same reasoning as findStalePendingReservationForDay.
  findStalePendingReservations(tenantId: TenantId): Promise<Reservation[]>

  // FR-03's read-side availability — independent of the D-33 holds
  // counter (see ./index.ts's module doc for why these are two distinct
  // computations). Lazy expiry (D-25): a Pending row whose
  // pending_expires_at has passed is excluded here even if no sweep has
  // flipped its state column yet.
  countActiveReservations(tenantId: TenantId, assetTypeId: number, day: string): Promise<number>

  // Runs `fn` against a repository bound to a single transaction, and
  // also hands back a `getRentableCount` bound to that SAME transaction
  // (Part 4 §16 D-33) — Availability & Reservation's capacity read and
  // its hold increment must never straddle two connections. Unlike
  // Asset Registry's `transaction`, this context composes a second
  // context's published repository here, at the infrastructure layer;
  // domain logic (./reservation.ts) only ever sees the narrow
  // CapacitySource function, never a raw connection handle, so it stays
  // fakeable in unit tests without a database.
  transaction<T>(fn: (repo: AvailabilityReservationRepository, getRentableCount: CapacitySource) => Promise<T>): Promise<T>
}

interface ReservationGroupRow {
  id: number
  tenant_id: string
  created_at: Date
  terms_version: string | null
  terms_accepted_at: Date | null
}

function mapReservationGroup(row: ReservationGroupRow): ReservationGroup {
  return {
    id: row.id,
    tenantId: row.tenant_id as TenantId,
    createdAt: row.created_at,
    termsVersion: row.terms_version,
    termsAcceptedAt: row.terms_accepted_at,
  }
}

interface ReservationRow {
  id: number
  tenant_id: string
  reservation_group_id: number
  asset_type_id: number
  start_day: Date
  end_day: Date
  state: ReservationState
  pending_expires_at: Date
  created_at: Date
  state_changed_at: Date
}

function mapReservation(row: ReservationRow): Reservation {
  return {
    id: row.id,
    tenantId: row.tenant_id as TenantId,
    reservationGroupId: row.reservation_group_id,
    assetTypeId: row.asset_type_id,
    period: { startDay: formatRentalDay(row.start_day), endDay: formatRentalDay(row.end_day) },
    state: row.state,
    pendingExpiresAt: row.pending_expires_at,
    createdAt: row.created_at,
    stateChangedAt: row.state_changed_at,
  }
}

export function createPostgresAvailabilityReservationRepository(
  sql: postgres.Sql | postgres.TransactionSql,
): AvailabilityReservationRepository {
  return {
    async insertReservationGroup(tenantId) {
      const rows = await sql<ReservationGroupRow[]>`
        insert into reservation_groups (tenant_id) values (${tenantId}) returning *
      `
      return mapReservationGroup(rows[0]!)
    },

    async getReservationGroup(tenantId, id) {
      const rows = await sql<ReservationGroupRow[]>`
        select * from reservation_groups where tenant_id = ${tenantId} and id = ${id}
      `
      return rows[0] ? mapReservationGroup(rows[0]) : null
    },

    async recordTermsAcceptance(tenantId, reservationGroupId, termsVersion) {
      const rows = await sql<ReservationGroupRow[]>`
        update reservation_groups
        set terms_version = ${termsVersion}, terms_accepted_at = now()
        where tenant_id = ${tenantId} and id = ${reservationGroupId}
        returning *
      `
      return rows[0] ? mapReservationGroup(rows[0]) : null
    },

    async listReservationsForGroup(tenantId, reservationGroupId) {
      const rows = await sql<ReservationRow[]>`
        select * from reservations
        where tenant_id = ${tenantId} and reservation_group_id = ${reservationGroupId}
        order by id
      `
      return rows.map(mapReservation)
    },

    async getReservation(tenantId, id) {
      const rows = await sql<ReservationRow[]>`
        select * from reservations where tenant_id = ${tenantId} and id = ${id}
      `
      return rows[0] ? mapReservation(rows[0]) : null
    },

    async insertReservation(tenantId, { reservationGroupId, assetTypeId, period, pendingExpiresAt }) {
      const rows = await sql<ReservationRow[]>`
        insert into reservations (
          tenant_id, reservation_group_id, asset_type_id, start_day, end_day, pending_expires_at
        ) values (
          ${tenantId}, ${reservationGroupId}, ${assetTypeId},
          ${period.startDay}, ${period.endDay}, ${pendingExpiresAt}
        )
        returning *
      `
      return mapReservation(rows[0]!)
    },

    async transitionReservationState(tenantId, id, { from, to }) {
      const rows = await sql<ReservationRow[]>`
        update reservations
        set state = ${to}, state_changed_at = now()
        where tenant_id = ${tenantId} and id = ${id} and state = ${from}
        returning *
      `
      return rows[0] ? mapReservation(rows[0]) : null
    },

    async tryIncrementHold(tenantId, assetTypeId, day, capacity) {
      // The `select ... where 0 < capacity` guards the no-existing-row
      // path (a plain `values (...)` insert would ignore capacity
      // entirely on first touch); the `on conflict ... where` guards the
      // existing-row path. Together they make this correct whether or
      // not a holds row already exists for (tenantId, assetTypeId, day) —
      // verified against real Postgres for both paths before writing
      // this (Part 4 §16 D-33, Finding 4).
      const rows = await sql<{ held_count: number }[]>`
        insert into asset_type_day_holds (tenant_id, asset_type_id, rental_day, held_count)
        select ${tenantId}, ${assetTypeId}, ${day}, 1
        where 0 < ${capacity}
        on conflict (tenant_id, asset_type_id, rental_day)
        do update set held_count = asset_type_day_holds.held_count + 1
        where asset_type_day_holds.held_count < ${capacity}
        returning held_count
      `
      return rows.length > 0
    },

    async decrementHold(tenantId, assetTypeId, day) {
      await sql`
        update asset_type_day_holds
        set held_count = held_count - 1
        where tenant_id = ${tenantId} and asset_type_id = ${assetTypeId} and rental_day = ${day}
          and held_count > 0
      `
    },

    async findStalePendingReservationForDay(tenantId, assetTypeId, day) {
      const rows = await sql<ReservationRow[]>`
        select * from reservations
        where tenant_id = ${tenantId} and asset_type_id = ${assetTypeId}
          and state = 'pending' and pending_expires_at < now()
          and start_day <= ${day} and end_day >= ${day}
        limit 1
      `
      return rows[0] ? mapReservation(rows[0]) : null
    },

    async findStalePendingReservations(tenantId) {
      const rows = await sql<ReservationRow[]>`
        select * from reservations
        where tenant_id = ${tenantId} and state = 'pending' and pending_expires_at < now()
        order by id
      `
      return rows.map(mapReservation)
    },

    async countActiveReservations(tenantId, assetTypeId, day) {
      const rows = await sql<{ count: string }[]>`
        select count(*)::text as count from reservations
        where tenant_id = ${tenantId} and asset_type_id = ${assetTypeId}
          and start_day <= ${day} and end_day >= ${day}
          and (state = 'confirmed' or (state = 'pending' and pending_expires_at > now()))
      `
      return Number(rows[0]!.count)
    },

    async transaction<T>(
      fn: (repo: AvailabilityReservationRepository, getRentableCount: CapacitySource) => Promise<T>,
    ) {
      // See Asset Registry's repository for why this guard exists:
      // `TransactionSql` has no `.begin()` (nested transactions use
      // `savepoint()`), and nothing here ever calls `.transaction()` on
      // an already-transaction-bound repo — this makes that a checked
      // invariant instead of a silent runtime failure.
      if (!('begin' in sql)) {
        throw new Error('Nested transactions are not supported — this repository is already bound to one.')
      }
      // See Asset Registry's repository for why the cast is needed:
      // postgres.js's begin<T> returns Promise<UnwrapPromiseArray<T>>,
      // which is the same type as Promise<T> for every actual callback
      // here (none return arrays) but not provably so for an arbitrary
      // generic T.
      return sql.begin((trx) => {
        const getRentableCount: CapacitySource = (tenantId, assetTypeId) =>
          createPostgresAssetRegistryRepository(trx).getRentableCount(tenantId, assetTypeId)
        return fn(createPostgresAvailabilityReservationRepository(trx), getRentableCount)
      }) as Promise<T>
    },
  }
}
