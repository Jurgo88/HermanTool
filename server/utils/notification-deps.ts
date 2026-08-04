// Constructs a real Postgres-backed NotificationRepository and the real
// Resend-backed NotificationGateway from runtime config. `close` is a
// no-op (D-39, IR-09): the connection is module-scope and reused across
// invocations (./db.ts), never ended per request — kept as a field so
// every call site's `finally { await close() }` keeps working unchanged.
import { createError, type H3Event } from 'h3'
import { useRuntimeConfig } from '#imports'
import type postgres from 'postgres'
import { getSharedDatabaseClient } from './db'
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
  const sql = getSharedDatabaseClient(config.databaseUrl)
  return {
    repo: createPostgresNotificationRepository(sql),
    gateway: createResendNotificationGateway({
      apiKey: config.resendApiKey,
      fromAddress: config.notificationFromAddress,
    }),
    sql,
    close: () => Promise.resolve(), // D-39: shared client, never ended per request
  }
}

// The HTTP layer translates typed domain errors into responses (CLAUDE.md).
export function translateNotificationError(err: unknown): never {
  if (err instanceof NotificationError) {
    throw createError({ statusCode: 502, statusMessage: err.message })
  }
  throw err
}
