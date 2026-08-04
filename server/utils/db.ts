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

// D-39 (IR-09): module-scope, reused across invocations, never
// `.end()`-ed. Before this, every *-deps.ts factory called
// createDatabaseClient() fresh and the owning route `.end()`-ed it in a
// `finally` -- on a warm Netlify Function instance that discarded a
// perfectly good connection every single request, and a single request
// touching several contexts (e.g. dispatch-overdue-reminders.post.ts's
// four *Deps calls) opened that many separate connections for one HTTP
// request. postgres.js already owns a pool internally (NFR-04: this is
// not "scaling apparatus", it's apparatus already paid for and
// previously discarded) -- one client, created once, is enough for
// every request this process ever handles.
//
// Deliberately NOT used by tests or by scripts/backup-and-record.mjs:
// integration tests need their own per-test-file connection for
// truncate isolation (createDatabaseClient, called directly, is
// correct there), and the backup script is a one-shot process with
// nothing to reuse a connection across.
let sharedClient: postgres.Sql | null = null

export function getSharedDatabaseClient(databaseUrl: string): postgres.Sql {
  sharedClient ??= createDatabaseClient(databaseUrl)
  return sharedClient
}
