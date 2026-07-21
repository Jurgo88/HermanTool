// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-07-21',
  modules: ['@nuxt/eslint'],

  typescript: {
    strict: true,
    typeCheck: false, // run via `pnpm typecheck` (nuxi typecheck) instead of per-build
  },

  eslint: {
    config: {
      stylistic: false, // Prettier owns formatting; ESLint owns correctness only
    },
  },

  runtimeConfig: {
    // Server-only (D-31): declared at the top level, not under `public`,
    // so none of these ever reach the client bundle. This includes the
    // anon key — the client never talks to Supabase directly (D-25), so
    // it has no need for any Supabase credential, public or otherwise.
    // The service-role key in particular bypasses RLS entirely and must
    // never be exposed.
    //
    // Values come from Nuxt's runtimeConfig env mapping — NUXT_SUPABASE_URL,
    // NUXT_SUPABASE_ANON_KEY, NUXT_SUPABASE_SERVICE_ROLE_KEY (see
    // .env.example) — with no manual process.env wiring here (D-31). No
    // live Supabase connection is required for the dev server to boot —
    // see server/utils/supabase-client.ts.
    supabaseUrl: '',
    supabaseAnonKey: '',
    supabaseServiceRoleKey: '',
  },
})
