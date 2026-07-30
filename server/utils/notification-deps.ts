// Constructs a real Postgres-backed NotificationRepository and the real
// Resend-backed NotificationGateway from runtime config, plus a
// `close()` to end the connection afterwards — same per-request
// create/end convention as ./catalog-deps.ts (NFR-04: no pooling
// apparatus at pilot load).
import { createError, type H3Event } from 'h3'
import { useRuntimeConfig } from '#imports'
import type postgres from 'postgres'
import { createDatabaseClient } from './db'
import {
  createPostgresNotificationRepository,
  createResendNotificationGateway,
  NotificationError,
  type NotificationGateway,
  type NotificationRepository,
} from '../contexts/notification'

export function createNotificationDeps(event: H3Event): {
  repo: NotificationRepository
  gateway: NotificationGateway
  sql: postgres.Sql
  close: () => Promise<void>
} {
  const config = useRuntimeConfig(event)
  const sql = createDatabaseClient(config.databaseUrl)
  return {
    repo: createPostgresNotificationRepository(sql),
    gateway: createResendNotificationGateway({
      apiKey: config.resendApiKey,
      fromAddress: config.notificationFromAddress,
    }),
    sql,
    close: () => sql.end(),
  }
}

// The HTTP layer translates typed domain errors into responses (CLAUDE.md).
export function translateNotificationError(err: unknown): never {
  if (err instanceof NotificationError) {
    throw createError({ statusCode: 502, statusMessage: err.message })
  }
  throw err
}
