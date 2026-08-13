// Web app manifest for the public surface (NFR-12;
// docs/design/interface-design-foundation.md §9).
//
// Served from a route rather than sitting in public/ as static JSON so its
// user-facing labels come from app/i18n/sk.ts like every other string (D-20)
// and its colours from shared/pwa-surface.ts like every other surface colour,
// instead of being a third place the same values are spelled out.
//
// No service worker is registered anywhere in this application, deliberately:
// UI-OQ-6's stated default is no, and NFR-01/NFR-12 forbid offline mode and
// the caching of API responses outright — a stale worklist at the counter is
// worse than an error. A manifest alone makes a site installable; only
// offline capability needs a worker.

import { sk } from '~/i18n/sk'
import { PWA_ICONS, PWA_SURFACES } from '#shared/pwa-surface'

export default defineEventHandler((event) => {
  const surface = PWA_SURFACES.public

  setResponseHeader(event, 'content-type', 'application/manifest+json; charset=utf-8')

  return {
    // `id` is what keeps this and the counter manifest installable as two
    // separate applications despite sharing a scope.
    id: '/',
    name: sk.pwa.publicName,
    short_name: sk.pwa.publicShortName,
    description: sk.pwa.publicDescription,
    lang: 'sk',
    dir: 'ltr',
    start_url: surface.startUrl,
    // Scope stays '/' rather than narrowing to the public pages: a narrower
    // scope ejects any out-of-scope navigation back into a browser tab
    // mid-task, and S-07's legal pages are reachable from checkout.
    scope: '/',
    display: 'standalone',
    theme_color: surface.themeColor,
    background_color: surface.backgroundColor,
    icons: PWA_ICONS,
  }
})
