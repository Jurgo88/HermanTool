import { checkSupabaseHealth } from '../utils/supabase-health'

// Attempts the Supabase connection and reports status instead of
// crashing when credentials are absent — Supabase credentials are not
// available yet (scaffold issue).
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)

  const supabase = await checkSupabaseHealth({
    url: config.supabaseUrl,
    anonKey: config.supabaseAnonKey,
  })

  return {
    status: 'ok',
    supabase,
  }
})
