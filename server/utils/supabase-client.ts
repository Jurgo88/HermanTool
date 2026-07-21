import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Server-only (D-25, D-31). Never imported from app/ — the browser never
// holds a Supabase client, let alone the service-role key.

export interface SupabaseCredentials {
  url: string
  anonKey: string
}

export function hasSupabaseCredentials(credentials: SupabaseCredentials): boolean {
  return credentials.url.length > 0 && credentials.anonKey.length > 0
}

// Construction only — does not touch the network. Safe to call even when
// credentials are missing or wrong; the caller decides what to do with
// the client (see supabase-health.ts for the connectivity attempt).
export function createSupabaseClient(credentials: SupabaseCredentials): SupabaseClient {
  return createClient(credentials.url, credentials.anonKey)
}
