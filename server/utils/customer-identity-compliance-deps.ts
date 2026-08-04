// Constructs a real Postgres-backed CustomerIdentityComplianceRepository
// and the real R2-backed IdentityEvidenceStorageGateway from runtime
// config. `close` is a no-op (D-39, IR-09): the connection is
// module-scope and reused across invocations (./db.ts), never ended per
// request — kept as a field so every call site's
// `finally { await close() }` keeps working unchanged.
import { createError, getRouterParam, type H3Event } from 'h3'
import { useRuntimeConfig } from '#imports'
import type postgres from 'postgres'
import { getSharedDatabaseClient } from './db'
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
  const sql = getSharedDatabaseClient(config.databaseUrl)
  return {
    repo: createPostgresCustomerIdentityComplianceRepository(sql),
    gateway: createR2IdentityEvidenceGateway({
      accessKeyId: config.r2AccessKeyId,
      secretAccessKey: config.r2SecretAccessKey,
      endpoint: config.r2Endpoint,
      bucket: config.r2BucketEvidence,
    }),
    sql,
    close: () => Promise.resolve(), // D-39: shared client, never ended per request
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

// D-40, issue #78/IR-10: same reasoning as getCustomerIdParam above.
export function getIdentityEvidenceIdParam(event: H3Event): number {
  const raw = getRouterParam(event, 'identityEvidenceId')
  const id = Number(raw)
  if (!raw || !Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid IdentityEvidence id.' })
  }
  return id
}

// D-23: the raw bearer token from a public customer-access route's own
// path — never a database identifier, so no numeric parsing.
export function getCustomerAccessTokenParam(event: H3Event): string {
  const raw = getRouterParam(event, 'token')
  if (!raw) throw createError({ statusCode: 400, statusMessage: 'Missing access token.' })
  return raw
}

// D-23: "unguessable, short-lived, revocable" — the response is
// deliberately generic and identical whether the token never existed,
// expired, or was already revoked at HandoverOut. Distinguishing those
// cases in the response is exactly the oracle an unguessable-token
// design must not hand back.
export function customerAccessLinkNotFoundError(): never {
  throw createError({ statusCode: 404, statusMessage: 'Link not found, expired, or no longer active.' })
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
