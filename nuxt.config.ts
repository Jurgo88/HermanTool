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
    // so none of these ever reach the client bundle.
    //
    // databaseUrl is the direct-to-Postgres connection string (D-25,
    // D-31, R-09) — the only path domain code uses to reach the
    // database. No Data API/PostgREST, no client-side supabase-js.
    //
    // The supabase* keys are kept for Supabase Auth only (D-22), which
    // arrives later; they must never be used to reach the database. The
    // service-role key in particular bypasses RLS entirely and must
    // never be exposed to the client.
    //
    // Values come from Nuxt's runtimeConfig env mapping — NUXT_DATABASE_URL,
    // NUXT_SUPABASE_URL, NUXT_SUPABASE_ANON_KEY, NUXT_SUPABASE_SERVICE_ROLE_KEY
    // (see .env.example) — with no manual process.env wiring here (D-31).
    // No live database connection is required for the dev server to boot —
    // see server/utils/db.ts.
    databaseUrl: '',
    supabaseUrl: '',
    supabaseAnonKey: '',
    supabaseServiceRoleKey: '',

    // Shared secret for machine-to-machine internal endpoints scheduled
    // by GitHub Actions (D-25 §14.2), e.g. the expiry sweep. Not an
    // Operator credential (D-22) — see server/utils/internal-job-auth.ts.
    internalJobSecret: '',

    // Stripe (D-26, D-31): the Tenant's OWN account, never the
    // developer's — see server/contexts/payments/gateway.ts, the one
    // file permitted to use these. stripeWebhookSecret verifies that an
    // inbound webhook actually came from Stripe (NFR-05/P6's boundary
    // depends on this, not just on the outbound secret key).
    stripeSecretKey: '',
    stripeWebhookSecret: '',

    public: {
      // Used only to build Stripe Checkout's success_url/cancel_url
      // server-side (server/api/payments/checkout-session.post.ts) —
      // never a client-supplied redirect target, which would be an
      // open-redirect risk. Public because it is the site's own origin,
      // not a secret.
      appBaseUrl: '',
    },
  },
})
