// Constructs a real Postgres-backed HandoverPossessionRepository plus the
// AssetRegistryRepository it composes with (D-02: ScanEvent resolution
// reads Asset state through Asset Registry's published interface, never
// by querying `assets`/`asset_tags` directly), plus the real R2-backed
// ConditionReportStorageGateway, from runtime config. `close` is a no-op
// (D-39, IR-09): the connection is module-scope and reused across
// invocations (./db.ts), never ended per request — kept as a field so
// every call site's `finally { await close() }` keeps working unchanged.
// This is the request NFR-02 names a latency budget for (the scan
// route) — D-39 exists specifically because this file's old per-request
// create/end cost a TLS handshake before any domain work began.
import { createError, getRouterParam, type H3Event } from 'h3'
import { useRuntimeConfig } from '#imports'
import type postgres from 'postgres'
import { getSharedDatabaseClient } from './db'
import {
  AssetNotFoundError,
  AssetRetiredError,
  createPostgresAssetRegistryRepository,
  type AssetRegistryRepository,
} from '../contexts/asset-registry'
import {
  AssetNotYetReturnableError,
  AssetTypeMismatchError,
  BackdateReasonRequiredError,
  ConditionReportNotFoundError,
  createPostgresHandoverPossessionRepository,
  createR2ConditionReportGateway,
  CustomerReservationMismatchError,
  DeductionReasonRequiredError,
  DeductionRequiresPairedConditionReportsError,
  DepositReturnExceedsTakenError,
  EmptyConditionReportError,
  HandoverPossessionError,
  IdentityVerificationRequiredError,
  LostAssetReasonRequiredError,
  NoOpenRentalAgreementError,
  RentalAgreementAlreadyDeclaredLostError,
  RentalAgreementAlreadyHandedInError,
  RentalAgreementAlreadySettledError,
  RentalAgreementNotFoundError,
  RentalAgreementNotHandedInError,
  ReservationNotConfirmedError,
  ScanEventTagNotBoundError,
  SettlementNotCompleteError,
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
  const sql = getSharedDatabaseClient(config.databaseUrl)
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
    close: () => Promise.resolve(), // D-39: shared client, never ended per request
  }
}

// RentalAgreement ids are the `integer generated always as identity`
// primary key, same reasoning as ./catalog-deps.ts's getAssetTypeIdParam.
export function getRentalAgreementIdParam(event: H3Event): number {
  const raw = getRouterParam(event, 'rentalAgreementId')
  const id = Number(raw)
  if (!raw || !Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid RentalAgreement id.' })
  }
  return id
}

// D-40, issue #78/IR-10: same reasoning as getRentalAgreementIdParam above.
export function getConditionReportIdParam(event: H3Event): number {
  const raw = getRouterParam(event, 'conditionReportId')
  const id = Number(raw)
  if (!raw || !Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid ConditionReport id.' })
  }
  return id
}

// FR-43: Asset ids are Asset Registry's own `integer generated always as
// identity` primary key.
export function getAssetIdParam(event: H3Event): number {
  const raw = getRouterParam(event, 'assetId')
  const id = Number(raw)
  if (!raw || !Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid Asset id.' })
  }
  return id
}

// The HTTP layer translates typed domain errors into responses (CLAUDE.md).
export function translateHandoverPossessionError(err: unknown): never {
  if (
    err instanceof ScanEventTagNotBoundError ||
    err instanceof AssetNotFoundError ||
    err instanceof RentalAgreementNotFoundError ||
    err instanceof ConditionReportNotFoundError
  ) {
    throw createError({ statusCode: 404, statusMessage: err.message, data: { code: err.constructor.name } })
  }
  if (
    err instanceof EmptyConditionReportError ||
    err instanceof DeductionReasonRequiredError ||
    err instanceof DepositReturnExceedsTakenError ||
    err instanceof BackdateReasonRequiredError ||
    err instanceof LostAssetReasonRequiredError
  ) {
    throw createError({ statusCode: 400, statusMessage: err.message, data: { code: err.constructor.name } })
  }
  if (
    err instanceof ReservationNotConfirmedError ||
    err instanceof CustomerReservationMismatchError ||
    err instanceof IdentityVerificationRequiredError ||
    err instanceof UnexpectedScanResolutionError ||
    err instanceof AssetTypeMismatchError ||
    err instanceof NoOpenRentalAgreementError ||
    err instanceof RentalAgreementNotHandedInError ||
    err instanceof RentalAgreementAlreadySettledError ||
    err instanceof DeductionRequiresPairedConditionReportsError ||
    err instanceof SettlementNotCompleteError ||
    err instanceof AssetNotYetReturnableError ||
    err instanceof RentalAgreementAlreadyHandedInError ||
    err instanceof RentalAgreementAlreadyDeclaredLostError ||
    err instanceof AssetRetiredError
  ) {
    throw createError({ statusCode: 409, statusMessage: err.message, data: { code: err.constructor.name } })
  }
  if (err instanceof HandoverPossessionError) {
    throw createError({ statusCode: 400, statusMessage: err.message, data: { code: err.constructor.name } })
  }
  throw err
}
