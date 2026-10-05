import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// D-53, #183: a face that points at a missing file, or a Slovak glyph with
// no face to cover it, falls back to the system font without any error.
const css = readFileSync('app/assets/css/fonts.css', 'utf8')
const faces = [...css.matchAll(/@font-face \{([\s\S]*?)\n\}/g)].map((match) => match[1]!)

function field(face: string, name: string): string {
  const match = face.match(new RegExp(`${name}:\\s*([^;]+);`))
  if (!match) throw new Error(`no ${name} in face`)
  return match[1]!.trim()
}

function covers(range: string, codePoint: number): boolean {
  return range.split(',').some((part) => {
    const [from, to = from] = part.trim().replace(/^U\+/, '').split('-')
    return codePoint >= parseInt(from!, 16) && codePoint <= parseInt(to!, 16)
  })
}

describe('self-hosted fonts (D-53, #183)', () => {
  it('points every face at a file that exists, same-origin', () => {
    expect(faces.length).toBeGreaterThan(0)
    for (const face of faces) {
      const url = field(face, 'src').match(/url\('(\/fonts\/[^']+\.woff2)'\)/)?.[1]
      expect(url, face).toBeDefined()
      expect(existsSync(`public${url}`)).toBe(true)
    }
  })

  it.each([
    ['IBM Plex Sans', '400'],
    ['IBM Plex Sans', '500'],
    ['IBM Plex Sans', '600'],
    ['IBM Plex Sans Condensed', '600'],
    ['IBM Plex Mono', '400'],
    ['IBM Plex Mono', '600'],
  ])('covers basic Latin and every Slovak letter for %s %s', (family, weight) => {
    const ranges = faces
      .filter(
        (face) =>
          field(face, 'font-family') === `'${family}'` && field(face, 'font-weight') === weight,
      )
      .map((face) => field(face, 'unicode-range'))

    const slovak = 'abcxyz0159ÁáÄäÉéÍíÓóÔôÚúÝý' + 'ČčĎďĹĺĽľŇňŔŕŠšŤťŽž'
    for (const char of slovak) {
      expect(
        ranges.some((range) => covers(range, char.codePointAt(0)!)),
        `${family} ${weight} has no face for ${char}`,
      ).toBe(true)
    }
  })

  it('makes no third-party request', () => {
    expect(css).not.toMatch(/https?:\/\//)
  })
})
