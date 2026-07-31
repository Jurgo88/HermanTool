// Constructs a real Postgres-backed AssetRegistryRepository from runtime
// config, plus a `close()` to end the connection afterwards — same
// per-request create/end convention as ./catalog-deps.ts (NFR-04: no
// pooling apparatus at pilot load).
import { createError, type H3Event } from 'h3'
import { useRuntimeConfig } from '#imports'
import type postgres from 'postgres'
import { createDatabaseClient } from './db'
import {
  AssetNotFoundError,
  AssetRegistryError,
  AssetRetiredError,
  AssetTypeNotFoundError,
  createPostgresAssetRegistryRepository,
  EmptyBulkRegistrationError,
  InvalidBulkRegistrationLineError,
  MalformedCsvRowError,
  TagAlreadyBoundError,
  type AssetRegistryRepository,
} from '../contexts/asset-registry'

export function createAssetRegistryDeps(
  event: H3Event,
): { repo: AssetRegistryRepository; sql: postgres.Sql; close: () => Promise<void> } {
  const config = useRuntimeConfig(event)
  const sql = createDatabaseClient(config.databaseUrl)
  return {
    repo: createPostgresAssetRegistryRepository(sql),
    sql,
    close: () => sql.end(),
  }
}

// The HTTP layer translates typed domain errors into responses (CLAUDE.md).
export function translateAssetRegistryError(err: unknown): never {
  if (err instanceof AssetTypeNotFoundError || err instanceof AssetNotFoundError) {
    throw createError({ statusCode: 404, statusMessage: err.message })
  }
  if (
    err instanceof InvalidBulkRegistrationLineError ||
    err instanceof EmptyBulkRegistrationError ||
    err instanceof MalformedCsvRowError
  ) {
    throw createError({ statusCode: 400, statusMessage: err.message })
  }
  if (err instanceof TagAlreadyBoundError || err instanceof AssetRetiredError) {
    throw createError({ statusCode: 409, statusMessage: err.message })
  }
  if (err instanceof AssetRegistryError) {
    throw createError({ statusCode: 400, statusMessage: err.message })
  }
  throw err
}
