// PWA surface descriptors (NFR-12; docs/design/interface-design-foundation.md §9).
//
// Why this file exists: a manifest and a <meta name="theme-color"> both need a
// literal colour, and neither can read a CSS custom property. Rather than
// spell the same hex in a manifest and again in a layout, both read it here.
// This is the one module permitted to carry raw colour values outside
// tokens.css — a component still may not (D-43, CLAUDE.md "Interface work").
// If a token moves in app/assets/css/tokens.css it moves here too, and
// scripts/generate-pwa-icons.mjs carries the same values for the icons.
//
// Two surfaces, not one, because NFR-12 says "PWA on both sides": the
// Visitor's catalogue and the Operator's counter are different applications
// to install, with different start URLs and opposite palettes.

/** Which installable application a layout belongs to. */
export type PwaSurface = 'public' | 'operator'

export interface PwaSurfaceDescriptor {
  /** Path the manifest is served from (server/routes/*.webmanifest.get.ts). */
  readonly manifestPath: string
  /** Where launching the installed application lands. */
  readonly startUrl: string
  /**
   * Browser UI colour. Mirrors --ht-paper for the surface in question:
   * light #f4f6f5 for public/admin, dark #0f1418 for the counter.
   */
  readonly themeColor: string
  /** Splash background. Mirrors --ht-paper for the same surface. */
  readonly backgroundColor: string
}

export const PWA_SURFACES: Record<PwaSurface, PwaSurfaceDescriptor> = {
  public: {
    manifestPath: '/manifest.webmanifest',
    startUrl: '/',
    themeColor: '#f4f6f5',
    backgroundColor: '#f4f6f5',
  },
  operator: {
    manifestPath: '/counter.webmanifest',
    startUrl: '/admin/counter',
    themeColor: '#0f1418',
    backgroundColor: '#0f1418',
  },
}

/**
 * Shared by both manifests — the mark does not change per surface, only the
 * palette around it does. Generated from scripts/generate-pwa-icons.mjs and
 * committed, so no build step has to produce them.
 */
export const PWA_ICONS = [
  { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
] as const
