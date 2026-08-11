// Constructs a real Postgres-backed PaymentsRepository and the real
// Stripe-backed PaymentGateway from runtime config. `close` is a no-op
// (D-39, IR-09): the connection is module-scope and reused across
// invocations (./db.ts), never ended per request — kept as a field so
// every call site's `finally { await close() }` keeps working unchanged.
import { createError, type H3Event } from 'h3'
import { useRuntimeConfig } from '#imports'
import type postgres from 'postgres'
import { getSharedDatabaseClient } from './db'
import {
  createPostgresPaymentsRepository,
  createStripePaymentGateway,
  PaymentNotFoundError,
  PaymentNotRefundableError,
  PaymentProviderUnavailableError,
  ProviderWebhookSignatureInvalidError,
  ReservationGroupAlreadyPaidError,
  type PaymentGateway,
  type PaymentsRepository,
} from '../contexts/payments'

export function createPaymentsDeps(
  event: H3Event,
): { repo: PaymentsRepository; gateway: PaymentGateway; sql: postgres.Sql; close: () => Promise<void> } {
  const config = useRuntimeConfig(event)
  const sql = getSharedDatabaseClient(config.databaseUrl)
  return {
    repo: createPostgresPaymentsRepository(sql),
    gateway: createStripePaymentGateway({
      secretKey: config.stripeSecretKey,
      webhookSecret: config.stripeWebhookSecret,
    }),
    sql,
    close: () => Promise.resolve(), // D-39: shared client, never ended per request
  }
}

// Server-side only (D-31, NFR-09): used to build Stripe's success_url/
// cancel_url rather than trusting a client-supplied redirect target.
export function getAppBaseUrl(event: H3Event): string {
  return useRuntimeConfig(event).public.appBaseUrl
}

// The HTTP layer translates typed domain errors into responses (CLAUDE.md).
export function translatePaymentsError(err: unknown): never {
  if (err instanceof PaymentNotFoundError) {
    throw createError({ statusCode: 404, statusMessage: err.message, data: { code: err.constructor.name } })
  }
  if (err instanceof ReservationGroupAlreadyPaidError || err instanceof PaymentNotRefundableError) {
    throw createError({ statusCode: 409, statusMessage: err.message, data: { code: err.constructor.name } })
  }
  if (err instanceof ProviderWebhookSignatureInvalidError) {
    throw createError({ statusCode: 400, statusMessage: err.message, data: { code: err.constructor.name } })
  }
  if (err instanceof PaymentProviderUnavailableError) {
    console.error('Stripe checkout session creation failed:', err.cause)
    throw createError({ statusCode: 502, statusMessage: err.message, data: { code: err.constructor.name } })
  }
  throw err
}
