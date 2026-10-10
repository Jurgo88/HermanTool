import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// D-59 obliges the Rent Star palette to clear NFR-11's floor, measured,
// not assumed (design foundation §4.3). Reads the values from tokens.css
// so a change there that breaks contrast fails here.
const css = readFileSync('app/assets/css/tokens.css', 'utf8')
const publicBlock = css.slice(css.indexOf("[data-surface='public']"))

function token(name: string, block = publicBlock): string {
  const match = block.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!match) throw new Error(`token --${name} not found`)
  return match[1]!
}

function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

describe('Rent Star public palette (D-59, NFR-11)', () => {
  const white = token('ht-on-brand')

  it('carries header text and the primary action at ≥4.5:1', () => {
    expect(contrast(white, token('ht-brand-deep'))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(white, token('ht-brand'))).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps the pale gradient end decorative: it would fail under white text', () => {
    expect(contrast(white, token('ht-brand-light'))).toBeLessThan(4.5)
  })

  it('draws the focus ring at ≥3:1 against the page', () => {
    const paper = token('ht-paper', css)
    expect(contrast(token('ht-brand-deep'), paper)).toBeGreaterThanOrEqual(3)
  })
})

// base.css draws every native control's edge in --ht-ink-muted. NFR-11 asks 3:1
// for a control's edge, against the field's own fill and against the page it
// sits on, on every surface. (The dark counter used to have unreadable bare
// buttons; this keeps the floor from sliding back.)
function block(start: string): string {
  const from = css.indexOf(start)
  if (from < 0) throw new Error(`${start} not found in tokens.css`)
  return css.slice(from, css.indexOf('\n}', from))
}

describe('control edges (NFR-11)', () => {
  for (const [surface, tokens] of [
    ['light (public, admin)', block(':root {')],
    ['counter', block("[data-surface='counter']")],
  ] as const) {
    it(`reach 3:1 on the ${surface} surface`, () => {
      // The counter block overrides only some tokens; the rest come from :root.
      const root = block(':root {')
      const pick = (name: string) => {
        try {
          return token(name, tokens)
        } catch {
          return token(name, root)
        }
      }
      const edge = pick('ht-ink-muted')
      for (const ground of ['ht-surface', 'ht-surface-sunk', 'ht-paper']) {
        expect(
          contrast(edge, pick(ground)),
          `${surface}: edge on ${ground}`,
        ).toBeGreaterThanOrEqual(3)
      }
    })
  }
})
