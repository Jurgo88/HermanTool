import { describe, expect, it } from 'vitest'
import { PWA_ICONS, PWA_SURFACES } from '../../shared/pwa-surface'
import { sk } from '../../app/i18n/sk'

// NFR-12 (docs/design/interface-design-foundation.md §9). These are not domain
// invariants — they are the two properties that were actually wrong before
// this module existed, and both are silent failures: a manifest is read by the
// operating system at install time, never on a screen anyone is looking at.

describe('PWA surfaces (NFR-12)', () => {
  it('installs as two applications, not one', () => {
    // The regression this guards: a single manifest whose start_url was
    // /admin/counter meant a Visitor installing the catalogue launched into
    // the counter. "PWA on both sides" requires the two to be separable.
    expect(PWA_SURFACES.public.startUrl).not.toBe(PWA_SURFACES.operator.startUrl)
    expect(PWA_SURFACES.public.manifestPath).not.toBe(PWA_SURFACES.operator.manifestPath)
  })

  it('lands the Visitor on the catalogue and the Operator on the counter', () => {
    expect(PWA_SURFACES.public.startUrl).toBe('/')
    expect(PWA_SURFACES.operator.startUrl).toBe('/admin/counter')
  })

  it('gives each surface the palette its layout actually renders', () => {
    // Mirrors --ht-paper in tokens.css: light for public/admin, dark for the
    // counter's [data-surface='counter'] override. A mismatch shows up as a
    // flash of the wrong colour in the phone's own chrome.
    expect(PWA_SURFACES.public.themeColor).toBe('#f4f6f5')
    expect(PWA_SURFACES.operator.themeColor).toBe('#0f1418')
  })

  it('ships a maskable icon so Android cannot clip the mark', () => {
    expect(PWA_ICONS.some((icon) => icon.purpose === 'maskable')).toBe(true)
    expect(PWA_ICONS.some((icon) => icon.purpose === 'any')).toBe(true)
  })
})

describe('PWA labels (D-20)', () => {
  it('names both applications from the string catalogue', () => {
    // The manifest `name` is what a phone prints under the home-screen icon,
    // so it is user-facing copy and belongs in sk.ts like everything else —
    // it was previously a Slovak literal inside a static JSON file.
    expect(sk.pwa.publicName).toBeTruthy()
    expect(sk.pwa.operatorName).toBeTruthy()
    expect(sk.pwa.publicName).not.toBe(sk.pwa.operatorName)
  })

  it('keeps short names short enough for a home screen', () => {
    expect(sk.pwa.publicShortName.length).toBeLessThanOrEqual(12)
    expect(sk.pwa.operatorShortName.length).toBeLessThanOrEqual(12)
  })
})
