import { hasDatabaseUrl, createDatabaseClient } from './db'

export type DatabaseHealthStatus = 'connected' | 'not_connected' | 'credentials_missing'

export interface DatabaseHealthResult {
  status: DatabaseHealthStatus
  message: string
}

// Injectable so the connectivity attempt can be replaced with a stub in
// tests — no live database is reachable in CI. Kept separate from
// createDatabaseClient so construction and the network attempt fail
// independently and neither can crash the dev server at startup.
export type DatabasePing = (databaseUrl: string) => Promise<void>

const defaultPing: DatabasePing = async (databaseUrl) => {
  const sql = createDatabaseClient(databaseUrl)

  try {
    // Trivial connectivity probe (D-25) — no schema or table query, since
    // no migrations exist yet (D-30).
    await sql`SELECT 1`
  } finally {
    await sql.end()
  }
}

export async function checkDatabaseHealth(
  databaseUrl: string,
  ping: DatabasePing = defaultPing,
): Promise<DatabaseHealthResult> {
  if (!hasDatabaseUrl(databaseUrl)) {
    return {
      status: 'credentials_missing',
      message: 'NUXT_DATABASE_URL not set — see .env.example.',
    }
  }

  try {
    await ping(databaseUrl)
    return { status: 'connected', message: 'Database reachable and connection accepted.' }
  } catch (err) {
    return {
      status: 'not_connected',
      message: err instanceof Error ? err.message : 'Unknown error contacting database.',
    }
  }
}
