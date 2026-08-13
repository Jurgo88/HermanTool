// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-07-21',
  modules: ['@nuxt/eslint', '@sentry/nuxt/module'],

  // WP-6.1 (NFR-12; docs/design/interface-design-foundation.md §9):
  // manifest + icons, installable. No service worker registered
  // anywhere in this app (UI-OQ-6's honest default) — NFR-01/NFR-12
  // both forbid caching that could serve a stale worklist at the
  // counter. `theme-color` itself is per-surface, not set here — see
  // each of app/layouts/{public,admin,counter}.vue's own useHead call.
  app: {
    head: {
      htmlAttrs: { lang: 'sk' },
      link: [
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/icons/favicon-32.png' },
      ],
    },
  },

  // D-53: self-hosted fonts, Latin Extended-A subset only (Slovak
  // diacritics — ď ĺ ľ ň ŕ š ť ž ô — need latin-ext, not the plain latin
  // subset). Via @fontsource, not a Google Fonts <link>/@import, so the
  // browser makes zero third-party requests for typography — the fact
  // D-42 leans on to conclude FR-38's cookie banner isn't owed here.
  // Weights match docs/design/interface-design-foundation.md §4.2's
  // three roles: Sans 400/500/600 (body), Condensed 600 (display/label),
  // Mono 400/600 (data — tag codes, Asset IDs, amounts).
  css: [
    '@fontsource/ibm-plex-sans/latin-ext-400.css',
    '@fontsource/ibm-plex-sans/latin-ext-500.css',
    '@fontsource/ibm-plex-sans/latin-ext-600.css',
    '@fontsource/ibm-plex-sans-condensed/latin-ext-600.css',
    '@fontsource/ibm-plex-mono/latin-ext-400.css',
    '@fontsource/ibm-plex-mono/latin-ext-600.css',
    '~/assets/css/tokens.css',
    '~/assets/css/base.css',
  ],

  typescript: {
    strict: true,
    typeCheck: false, // run via `pnpm typecheck` (nuxi typecheck) instead of per-build
  },

  eslint: {
    config: {
      stylistic: false, // Prettier owns formatting; ESLint owns correctness only
    },
  },

  // D-29 (issue #73/IR-05). Actual init options (dsn, sendDefaultPii,
  // beforeSend) live in sentry.server.config.ts / sentry.client.config.ts
  // — this block is build-time only. sourceMapsUploadOptions.authToken
  // is intentionally left unset: without SENTRY_AUTH_TOKEN in the build
  // environment, the module skips the upload step with a warning rather
  // than failing the build, which is correct until a Sentry project
  // exists to upload to.
  sentry: {
    sourceMapsUploadOptions: {
      authToken: process.env.SENTRY_AUTH_TOKEN,
      telemetry: false, // build-tool usage stats to Sentry's own telemetry endpoint; not requested, not needed
    },
  },
  sourcemap: {
    client: 'hidden',
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

    // Resend (D-28) — see server/contexts/notification/resend-gateway.ts,
    // the one file permitted to use the `resend` package.
    // notificationFromAddress must be a Resend-verified sender for the
    // Tenant's own domain.
    resendApiKey: '',
    notificationFromAddress: '',

    // Cloudflare R2 (D-27, S3-compatible). r2AccessKeyId/r2SecretAccessKey/
    // r2Endpoint are shared across buckets; each context reads its OWN
    // bucket only, through its OWN gateway file (the one file per
    // context permitted to use the AWS S3 SDK):
    // server/contexts/customer-identity-compliance/r2-gateway.ts
    // (r2BucketEvidence, unbacked, D-27) and
    // server/contexts/handover-possession/r2-gateway.ts
    // (r2BucketConditions, backed up, D-27).
    r2AccessKeyId: '',
    r2SecretAccessKey: '',
    r2Endpoint: '',
    r2BucketEvidence: '',
    r2BucketConditions: '',

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
