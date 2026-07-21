import postgres from 'postgres'

// Server-only, direct-to-Postgres (D-25, D-31, R-09). Never imported from
// app/ — the browser never holds a database connection, and this is the
// only permitted path to the database: no Supabase Data API/PostgREST,
// no client-side supabase-js.

export function hasDatabaseUrl(databaseUrl: string): boolean {
  return databaseUrl.length > 0
}

// Construction only — postgres() connects lazily on first query, so this
// is safe to call even when the connection string is missing or wrong.
// The caller decides what to do with the result (see db-health.ts for the
// connectivity attempt).
export function createDatabaseClient(databaseUrl: string): postgres.Sql {
  return postgres(databaseUrl)
}
