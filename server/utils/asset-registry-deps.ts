// Constructs a real Postgres-backed AssetRegistryRepository from runtime
// config. `close` is a no-op (D-39, IR-09): the connection is
// module-scope and reused across invocations (./db.ts), never ended per
// request — kept as a field so every call site's
// `finally { await close() }` keeps working unchanged.
import { createError, getRouterParam, type H3Event } from 'h3'
import { useRuntimeConfig } from '#imports'
import type postgres from 'postgres'
import { getSharedDatabaseClient } from './db'
import {
  AssetNotFoundError,
  AssetNotTaggedError,
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
  const sql = getSharedDatabaseClient(config.databaseUrl)
  return {
    repo: createPostgresAssetRegistryRepository(sql),
    sql,
    close: () => Promise.resolve(), // D-39: shared client, never ended per request
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
  if (err instanceof TagAlreadyBoundError || err instanceof AssetRetiredError || err instanceof AssetNotTaggedError) {
    throw createError({ statusCode: 409, statusMessage: err.message })
  }
  if (err instanceof AssetRegistryError) {
    throw createError({ statusCode: 400, statusMessage: err.message })
  }
  throw err
}

// Same reasoning as getCustomerIdParam in customer-identity-compliance-deps.ts.
// Named getAssetRegistryAssetIdParam, not getAssetIdParam, because
// handover-possession-deps.ts already exports a getAssetIdParam of its
// own (server/utils/* is one flat Nitro auto-import namespace — two
// same-named exports there silently shadow each other).
export function getAssetRegistryAssetIdParam(event: H3Event): number {
  const raw = getRouterParam(event, 'assetId')
  const id = Number(raw)
  if (!raw || !Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid Asset id.' })
  }
  return id
}
