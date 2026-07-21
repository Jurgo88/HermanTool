import {
  hasSupabaseCredentials,
  createSupabaseClient,
  type SupabaseCredentials,
} from './supabase-client'

export type SupabaseHealthStatus = 'connected' | 'not_connected' | 'credentials_missing'

export interface SupabaseHealthResult {
  status: SupabaseHealthStatus
  message: string
}

// Injectable so the connectivity attempt can be replaced with a stub in
// tests — no live Supabase project exists yet (credentials arrive with
// the Tenant separately). Kept separate from createSupabaseClient so
// construction and the network attempt fail independently and neither
// can crash the dev server at startup.
export type SupabasePing = (credentials: SupabaseCredentials) => Promise<void>

const defaultPing: SupabasePing = async (credentials) => {
  const client = createSupabaseClient(credentials)

  // No migrations exist yet (D-30), so this table is never expected to
  // exist. A "relation does not exist" response still proves the
  // request reached PostgREST and the API key was accepted — that is
  // "connected" for this health check. Any other error (invalid key,
  // DNS failure, timeout) is a genuine connectivity problem.
  const { error } = await client.from('__hermantool_healthcheck__').select('*').limit(1)

  if (error && error.code !== 'PGRST205' && error.code !== '42P01') {
    throw new Error(error.message)
  }
}

export async function checkSupabaseHealth(
  credentials: SupabaseCredentials,
  ping: SupabasePing = defaultPing,
): Promise<SupabaseHealthResult> {
  if (!hasSupabaseCredentials(credentials)) {
    return {
      status: 'credentials_missing',
      message: 'SUPABASE_URL / SUPABASE_ANON_KEY not set — see .env.example.',
    }
  }

  try {
    await ping(credentials)
    return { status: 'connected', message: 'Supabase reachable and credentials accepted.' }
  } catch (err) {
    return {
      status: 'not_connected',
      message: err instanceof Error ? err.message : 'Unknown error contacting Supabase.',
    }
  }
}
