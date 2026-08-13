// Web app manifest for the Operator surface (NFR-12;
// docs/design/interface-design-foundation.md §9).
//
// A second manifest, not a variant of the public one: NFR-12 says "PWA on
// both sides", and the two sides are different applications to install. The
// Operator installs this on the counter phone and expects it to open on the
// scan screen (S-08); before this existed, the single manifest pointed the
// whole site at /admin/counter, so a Visitor installing the catalogue landed
// at the counter.
//
// See manifest.webmanifest.get.ts for why this is a route and not a static
// file, and for why no service worker is registered.

import { sk } from '~/i18n/sk'
import { PWA_ICONS, PWA_SURFACES } from '#shared/pwa-surface'

export default defineEventHandler((event) => {
  const surface = PWA_SURFACES.operator

  setResponseHeader(event, 'content-type', 'application/manifest+json; charset=utf-8')

  return {
    id: surface.startUrl,
    name: sk.pwa.operatorName,
    short_name: sk.pwa.operatorShortName,
    description: sk.pwa.operatorDescription,
    lang: 'sk',
    dir: 'ltr',
    start_url: surface.startUrl,
    // Scope is '/' rather than '/admin', even though every Operator screen
    // lives under it: an expired session redirects to /login (S-18), which a
    // narrower scope would eject into a browser tab at exactly the moment the
    // Operator is mid-handover.
    scope: '/',
    display: 'standalone',
    // Portrait only — the counter surface is designed one-handed on a phone
    // (§4.1's scan plate is the full width of it) and has no landscape layout
    // to rotate into.
    orientation: 'portrait',
    theme_color: surface.themeColor,
    background_color: surface.backgroundColor,
    icons: PWA_ICONS,
  }
})
