// Constructs a real Postgres-backed PaymentsRepository and the real
// Stripe-backed PaymentGateway from runtime config, plus a `close()` to
// end the connection afterwards — same per-request create/end convention
// as ./catalog-deps.ts and ./availability-reservation-deps.ts (NFR-04: no
// pooling apparatus at pilot load).
import { createError, type H3Event } from 'h3'
import { useRuntimeConfig } from '#imports'
import type postgres from 'postgres'
import { createDatabaseClient } from './db'
import {
  createPostgresPaymentsRepository,
  createStripePaymentGateway,
  PaymentNotFoundError,
  PaymentNotRefundableError,
  ProviderWebhookSignatureInvalidError,
  ReservationGroupAlreadyPaidError,
  type PaymentGateway,
  type PaymentsRepository,
} from '../contexts/payments'

export function createPaymentsDeps(
  event: H3Event,
): { repo: PaymentsRepository; gateway: PaymentGateway; sql: postgres.Sql; close: () => Promise<void> } {
  const config = useRuntimeConfig(event)
  const sql = createDatabaseClient(config.databaseUrl)
  return {
    repo: createPostgresPaymentsRepository(sql),
    gateway: createStripePaymentGateway({
      secretKey: config.stripeSecretKey,
      webhookSecret: config.stripeWebhookSecret,
    }),
    sql,
    close: () => sql.end(),
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
    throw createError({ statusCode: 404, statusMessage: err.message })
  }
  if (err instanceof ReservationGroupAlreadyPaidError || err instanceof PaymentNotRefundableError) {
    throw createError({ statusCode: 409, statusMessage: err.message })
  }
  if (err instanceof ProviderWebhookSignatureInvalidError) {
    throw createError({ statusCode: 400, statusMessage: err.message })
  }
  throw err
}
