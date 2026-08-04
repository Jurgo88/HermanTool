// Constructs a real Postgres-backed CatalogRepository from runtime
// config. `close` is a no-op (D-39, IR-09): the connection is
// module-scope and reused across invocations (./db.ts), never ended per
// request — kept as a field so every call site's
// `finally { await close() }` keeps working unchanged.
import { createError, getRouterParam, type H3Event } from 'h3'
import { useRuntimeConfig } from '#imports'
import type postgres from 'postgres'
import { getSharedDatabaseClient } from './db'
import {
  AssetTypeNameRequiredError,
  AssetTypeNotFoundError,
  createPostgresCatalogRepository,
  type CatalogRepository,
} from '../contexts/catalog'

export function createCatalogDeps(
  event: H3Event,
): { repo: CatalogRepository; sql: postgres.Sql; close: () => Promise<void> } {
  const config = useRuntimeConfig(event)
  const sql = getSharedDatabaseClient(config.databaseUrl)
  return {
    repo: createPostgresCatalogRepository(sql),
    sql,
    close: () => Promise.resolve(), // D-39: shared client, never ended per request
  }
}

// AssetType ids are the `integer generated always as identity` primary
// key (see the Asset Registry migration's own rationale for `integer`
// over `bigint`) — a route param that isn't a positive integer is a
// malformed request, not a domain error.
export function getAssetTypeIdParam(event: H3Event): number {
  const raw = getRouterParam(event, 'id')
  const id = Number(raw)
  if (!raw || !Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid AssetType id.' })
  }
  return id
}

// The HTTP layer translates typed domain errors into responses (CLAUDE.md
// "Domain rule violations throw typed domain errors... The HTTP layer
// translates them"); every asset-types route re-throws through this
// rather than letting a CatalogError surface as an unhandled 500.
export function translateCatalogError(err: unknown): never {
  if (err instanceof AssetTypeNotFoundError) {
    throw createError({ statusCode: 404, statusMessage: err.message })
  }
  if (err instanceof AssetTypeNameRequiredError) {
    throw createError({ statusCode: 400, statusMessage: err.message })
  }
  throw err
}
