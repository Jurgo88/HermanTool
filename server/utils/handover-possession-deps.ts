// Constructs a real Postgres-backed HandoverPossessionRepository plus the
// AssetRegistryRepository it composes with (D-02: ScanEvent resolution
// reads Asset state through Asset Registry's published interface, never
// by querying `assets`/`asset_tags` directly), plus the real R2-backed
// ConditionReportStorageGateway, from runtime config, plus a `close()` to
// end the connection afterwards — same per-request create/end convention
// as ./catalog-deps.ts (NFR-04: no pooling apparatus at pilot load).
import { createError, type H3Event } from 'h3'
import { useRuntimeConfig } from '#imports'
import type postgres from 'postgres'
import { createDatabaseClient } from './db'
import { AssetNotFoundError, createPostgresAssetRegistryRepository, type AssetRegistryRepository } from '../contexts/asset-registry'
import {
  AssetTypeMismatchError,
  createPostgresHandoverPossessionRepository,
  createR2ConditionReportGateway,
  CustomerReservationMismatchError,
  EmptyConditionReportError,
  HandoverPossessionError,
  IdentityVerificationRequiredError,
  ReservationNotConfirmedError,
  ScanEventTagNotBoundError,
  UnexpectedScanResolutionError,
  type ConditionReportStorageGateway,
  type HandoverPossessionRepository,
} from '../contexts/handover-possession'

export function createHandoverPossessionDeps(event: H3Event): {
  repo: HandoverPossessionRepository
  assetRegistryRepo: AssetRegistryRepository
  conditionsGateway: ConditionReportStorageGateway
  sql: postgres.Sql
  close: () => Promise<void>
} {
  const config = useRuntimeConfig(event)
  const sql = createDatabaseClient(config.databaseUrl)
  return {
    repo: createPostgresHandoverPossessionRepository(sql),
    assetRegistryRepo: createPostgresAssetRegistryRepository(sql),
    conditionsGateway: createR2ConditionReportGateway({
      accessKeyId: config.r2AccessKeyId,
      secretAccessKey: config.r2SecretAccessKey,
      endpoint: config.r2Endpoint,
      bucket: config.r2BucketConditions,
    }),
    sql,
    close: () => sql.end(),
  }
}

// The HTTP layer translates typed domain errors into responses (CLAUDE.md).
export function translateHandoverPossessionError(err: unknown): never {
  if (err instanceof ScanEventTagNotBoundError || err instanceof AssetNotFoundError) {
    throw createError({ statusCode: 404, statusMessage: err.message })
  }
  if (err instanceof EmptyConditionReportError) {
    throw createError({ statusCode: 400, statusMessage: err.message })
  }
  if (
    err instanceof ReservationNotConfirmedError ||
    err instanceof CustomerReservationMismatchError ||
    err instanceof IdentityVerificationRequiredError ||
    err instanceof UnexpectedScanResolutionError ||
    err instanceof AssetTypeMismatchError
  ) {
    throw createError({ statusCode: 409, statusMessage: err.message })
  }
  if (err instanceof HandoverPossessionError) {
    throw createError({ statusCode: 400, statusMessage: err.message })
  }
  throw err
}
