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
//
// prepare: false is required, not optional, because we connect through
// Supabase's transaction-mode pooler (Supavisor, port 6543 — D-24, D-25
// §14.2, Finding 4, R-08). postgres.js prepares parameterized statements
// against a specific backend connection by default; pgbouncer/Supavisor
// transaction pooling can hand a client a different backend connection
// on the next transaction, so a prepared statement from one lease is not
// guaranteed valid on the next. Every write in D-33's holds mechanism —
// the atomic conditional UPSERT gating the D-08 invariant — depends on
// this being disabled.
export function createDatabaseClient(databaseUrl: string): postgres.Sql {
  return postgres(databaseUrl, { prepare: false })
}
