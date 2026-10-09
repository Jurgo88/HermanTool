import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ASSET_TAG_COLUMNS,
  ASSET_TAG_ROWS,
  ASSET_TAGS_PER_SHEET,
  chunkIntoSheets,
} from '../../app/utils/asset-tag-sheet'

// FR-26, #130: a label grid that does not fit the page prints a second,
// mostly empty sheet and shifts every label after it, with no error.
const tokens = readFileSync('app/assets/css/tokens.css', 'utf8')
const printCss = readFileSync('app/assets/css/print.css', 'utf8')

const A4_WIDTH_MM = 210
const A4_HEIGHT_MM = 297

function millimetres(name: string): number {
  const match = tokens.match(new RegExp(`--${name}: *([0-9.]+)mm`))
  if (!match) throw new Error(`--${name} not found in tokens.css`)
  return Number(match[1])
}

function pageMargins(): { y: number; x: number } {
  const match = printCss.match(/@page labels \{[^}]*margin:\s*([0-9.]+)mm\s+([0-9.]+)mm/)
  if (!match) throw new Error('@page labels margin not found in print.css')
  return { y: Number(match[1]), x: Number(match[2]) }
}

describe('AssetTag sheet geometry (FR-26)', () => {
  it('uses the column count the tokens declare', () => {
    const columns = tokens.match(/--ht-label-columns:\s*(\d+)/)
    expect(Number(columns?.[1])).toBe(ASSET_TAG_COLUMNS)
  })

  it('fits the columns across an A4 page with its side margins', () => {
    const { x } = pageMargins()
    const used =
      ASSET_TAG_COLUMNS * millimetres('ht-label-width') +
      (ASSET_TAG_COLUMNS - 1) * millimetres('ht-label-gap-x') +
      2 * x
    expect(used).toBeLessThanOrEqual(A4_WIDTH_MM)
  })

  it('fits the rows down an A4 page with its top and bottom margins', () => {
    const { y } = pageMargins()
    const used = ASSET_TAG_ROWS * millimetres('ht-label-height') + 2 * y
    expect(used).toBeLessThanOrEqual(A4_HEIGHT_MM)
  })

  it('does not leave room for another row, so the count is the real capacity', () => {
    const { y } = pageMargins()
    const used = (ASSET_TAG_ROWS + 1) * millimetres('ht-label-height') + 2 * y
    expect(used).toBeGreaterThan(A4_HEIGHT_MM)
  })

  it('keeps the QR square inside its label', () => {
    expect(millimetres('ht-label-qr')).toBeLessThan(millimetres('ht-label-height'))
  })
})

describe('chunkIntoSheets', () => {
  it('prints 21 labels per sheet', () => {
    expect(ASSET_TAGS_PER_SHEET).toBe(21)
  })

  it('splits 52 labels into three sheets, the last one partial', () => {
    const sheets = chunkIntoSheets(Array.from({ length: 52 }, (_, i) => i))
    expect(sheets.map((sheet) => sheet.length)).toEqual([21, 21, 10])
    expect(sheets.flat()).toHaveLength(52)
  })

  it('gives no sheets for no labels', () => {
    expect(chunkIntoSheets([])).toEqual([])
  })
})
