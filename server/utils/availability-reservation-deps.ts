// Constructs a real Postgres-backed AvailabilityReservationRepository
// from runtime config. `close` is a no-op (D-39, IR-09): the connection
// is module-scope and reused across invocations (./db.ts), never ended
// per request — kept as a field so every call site's
// `finally { await close() }` keeps working unchanged.
import { createError, getRouterParam, type H3Event } from 'h3'
import { useRuntimeConfig } from '#imports'
import type postgres from 'postgres'
import { getSharedDatabaseClient } from './db'
import {
  AssetTypeUnavailableError,
  EmptyReservationGroupError,
  InvalidRentalPeriodError,
  InvalidTermsVersionError,
  ReservationGroupNotFoundError,
  ReservationNotActiveError,
  ReservationNotFoundError,
  TermsNotAcceptedError,
  createPostgresAvailabilityReservationRepository,
  type AvailabilityReservationRepository,
} from '../contexts/availability-reservation'

export function createAvailabilityReservationDeps(
  event: H3Event,
): { repo: AvailabilityReservationRepository; sql: postgres.Sql; close: () => Promise<void> } {
  const config = useRuntimeConfig(event)
  const sql = getSharedDatabaseClient(config.databaseUrl)
  return {
    repo: createPostgresAvailabilityReservationRepository(sql),
    sql,
    close: () => Promise.resolve(), // D-39: shared client, never ended per request
  }
}

// ReservationGroup ids are the `integer generated always as identity`
// primary key, same reasoning as ./catalog-deps.ts's getAssetTypeIdParam.
export function getReservationGroupIdParam(event: H3Event): number {
  const raw = getRouterParam(event, 'groupId')
  const id = Number(raw)
  if (!raw || !Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid ReservationGroup id.' })
  }
  return id
}

// The HTTP layer translates typed domain errors into responses (CLAUDE.md).
export function translateAvailabilityReservationError(err: unknown): never {
  if (err instanceof ReservationGroupNotFoundError || err instanceof ReservationNotFoundError) {
    throw createError({ statusCode: 404, statusMessage: err.message })
  }
  if (
    err instanceof EmptyReservationGroupError ||
    err instanceof InvalidRentalPeriodError ||
    err instanceof InvalidTermsVersionError
  ) {
    throw createError({ statusCode: 400, statusMessage: err.message })
  }
  if (
    err instanceof AssetTypeUnavailableError ||
    err instanceof TermsNotAcceptedError ||
    err instanceof ReservationNotActiveError
  ) {
    throw createError({ statusCode: 409, statusMessage: err.message })
  }
  throw err
}
