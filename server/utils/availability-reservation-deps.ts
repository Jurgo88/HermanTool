// Constructs a real Postgres-backed AvailabilityReservationRepository
// from runtime config, plus a `close()` to end the connection afterwards
// — same per-request create/end convention as ./catalog-deps.ts and
// ./db-health.ts (NFR-04: no pooling apparatus at pilot load).
import type { H3Event } from 'h3'
import { useRuntimeConfig } from '#imports'
import type postgres from 'postgres'
import { createDatabaseClient } from './db'
import {
  createPostgresAvailabilityReservationRepository,
  type AvailabilityReservationRepository,
} from '../contexts/availability-reservation'

export function createAvailabilityReservationDeps(
  event: H3Event,
): { repo: AvailabilityReservationRepository; sql: postgres.Sql; close: () => Promise<void> } {
  const config = useRuntimeConfig(event)
  const sql = createDatabaseClient(config.databaseUrl)
  return {
    repo: createPostgresAvailabilityReservationRepository(sql),
    sql,
    close: () => sql.end(),
  }
}
