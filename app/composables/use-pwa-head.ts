// NFR-12; docs/design/interface-design-foundation.md §9.
//
// Points a layout at its installable application and paints the browser
// chrome to match the surface being rendered. Called by layouts rather than
// pages, because "which application is this" is a property of the surface
// (public / admin / counter), which is what a layout decides.
//
// §9 asks for "theme-color per surface", which a manifest cannot express — it
// carries one value for the whole application. The <meta> is what varies per
// screen, and it is why the admin surface can offer the Operator manifest
// while still painting its own light chrome.

import { PWA_SURFACES, type PwaSurface } from '#shared/pwa-surface'

export function usePwaHead(surface: PwaSurface, themeColorSurface: PwaSurface = surface) {
  const application = PWA_SURFACES[surface]
  const chrome = PWA_SURFACES[themeColorSurface]

  useHead({
    link: [{ rel: 'manifest', href: application.manifestPath }],
    meta: [{ name: 'theme-color', content: chrome.themeColor }],
  })
}
