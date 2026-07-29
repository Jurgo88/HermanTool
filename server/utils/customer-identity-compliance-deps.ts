// Constructs a real Postgres-backed CustomerIdentityComplianceRepository
// and the real R2-backed IdentityEvidenceStorageGateway from runtime
// config, plus a `close()` to end the connection afterwards — same
// per-request create/end convention as ./catalog-deps.ts (NFR-04: no
// pooling apparatus at pilot load).
import { createError, getRouterParam, type H3Event } from 'h3'
import { useRuntimeConfig } from '#imports'
import type postgres from 'postgres'
import { createDatabaseClient } from './db'
import {
  createPostgresCustomerIdentityComplianceRepository,
  createR2IdentityEvidenceGateway,
  CustomerAlreadyExistsForGroupError,
  CustomerIdentityComplianceError,
  CustomerNotFoundError,
  IdentityEvidenceCustomerMismatchError,
  IdentityEvidenceNotFoundError,
  IdentityVerificationReasonRequiredError,
  InvalidCustomerDetailsError,
  ReservationGroupNotConfirmedError,
  RetentionWindowNotConfiguredError,
  type CustomerIdentityComplianceRepository,
  type IdentityEvidenceStorageGateway,
} from '../contexts/customer-identity-compliance'

export function createCustomerIdentityComplianceDeps(event: H3Event): {
  repo: CustomerIdentityComplianceRepository
  gateway: IdentityEvidenceStorageGateway
  sql: postgres.Sql
  close: () => Promise<void>
} {
  const config = useRuntimeConfig(event)
  const sql = createDatabaseClient(config.databaseUrl)
  return {
    repo: createPostgresCustomerIdentityComplianceRepository(sql),
    gateway: createR2IdentityEvidenceGateway({
      accessKeyId: config.r2AccessKeyId,
      secretAccessKey: config.r2SecretAccessKey,
      endpoint: config.r2Endpoint,
      bucket: config.r2BucketEvidence,
    }),
    sql,
    close: () => sql.end(),
  }
}

// Customer ids are the `integer generated always as identity` primary
// key, same reasoning as ./catalog-deps.ts's getAssetTypeIdParam.
export function getCustomerIdParam(event: H3Event): number {
  const raw = getRouterParam(event, 'customerId')
  const id = Number(raw)
  if (!raw || !Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid Customer id.' })
  }
  return id
}

// The HTTP layer translates typed domain errors into responses (CLAUDE.md).
export function translateCustomerIdentityComplianceError(err: unknown): never {
  if (err instanceof CustomerNotFoundError || err instanceof IdentityEvidenceNotFoundError) {
    throw createError({ statusCode: 404, statusMessage: err.message })
  }
  if (err instanceof InvalidCustomerDetailsError || err instanceof IdentityVerificationReasonRequiredError) {
    throw createError({ statusCode: 400, statusMessage: err.message })
  }
  if (
    err instanceof CustomerAlreadyExistsForGroupError ||
    err instanceof ReservationGroupNotConfirmedError ||
    err instanceof RetentionWindowNotConfiguredError ||
    err instanceof IdentityEvidenceCustomerMismatchError
  ) {
    throw createError({ statusCode: 409, statusMessage: err.message })
  }
  if (err instanceof CustomerIdentityComplianceError) {
    throw createError({ statusCode: 400, statusMessage: err.message })
  }
  throw err
}
