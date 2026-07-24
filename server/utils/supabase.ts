import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Server-only, Auth-only (D-22, D-25, D-31). This client must never be
// used for `.from(...)` table access — that is the Data API/PostgREST,
// explicitly disabled (D-25, D-31, R-09). Direct-to-Postgres via
// ../utils/db.ts is the only permitted path to the database; this client
// exists solely to talk to the Auth service.
//
// autoRefreshToken/persistSession are disabled because this client is
// constructed fresh per request in a server process — there is no
// browser storage to persist into, and refresh is handled explicitly by
// ./auth.ts's resolveOperator, not by a background timer.
export function createSupabaseAuthClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
