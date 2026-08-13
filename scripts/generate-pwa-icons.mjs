// WP-6.1 (NFR-12; docs/design/interface-design-foundation.md §9). Writes the
// PWA manifest and apple-touch icons.
//
// UI-OQ-3 is now answered: no wordmark, the mark is derived from §4 instead.
// It quotes C-10's scan target, because §4.1 spends boldness in exactly two
// places and the scan plate is the first of them — which makes it the honest
// visual answer to "what is this thing for" on a phone home screen. This
// replaces the flat --ht-signal fill that stood in while the question was
// open. A real logo, if one ever arrives, replaces MARK below and nothing else.
//
// Everything is drawn as axis-aligned rectangles, which is why this needs no
// browser, no SVG rasteriser and no image dependency — the same reason the
// original flat-fill version didn't. Rectangles are rendered at 4x and box-
// downsampled, so the edges are antialiased rather than stair-stepped at 180
// and 192. Re-run with `node scripts/generate-pwa-icons.mjs` if a token below
// changes.

import { deflateSync, crc32 } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// tokens.css: --ht-ink, --ht-signal, counter --ht-ink
const INK = [0x14, 0x18, 0x1b]
const SIGNAL = [0xff, 0xc4, 0x00]
const COUNTER_INK = [0xec, 0xf1, 0xf3]

// The mark, in a 512x512 design space. Bracket geometry: a 360-wide frame
// inset 76, arms 104 long and 26 thick. Monogram: 96 tall, 20-thick strokes,
// spanning x 166..346 so it is centred on 256.
const MARK = [
  // Scan-target corner brackets (C-10) — the one accent
  { x: 76, y: 76, w: 104, h: 26, fill: SIGNAL },
  { x: 76, y: 76, w: 26, h: 104, fill: SIGNAL },
  { x: 332, y: 76, w: 104, h: 26, fill: SIGNAL },
  { x: 410, y: 76, w: 26, h: 104, fill: SIGNAL },
  { x: 76, y: 410, w: 104, h: 26, fill: SIGNAL },
  { x: 76, y: 332, w: 26, h: 104, fill: SIGNAL },
  { x: 332, y: 410, w: 104, h: 26, fill: SIGNAL },
  { x: 410, y: 332, w: 26, h: 104, fill: SIGNAL },

  // HT monogram — counter ink, deliberately not a second signal colour
  // (§4.1: one signal colour, used sparingly)
  { x: 166, y: 208, w: 20, h: 96, fill: COUNTER_INK },
  { x: 222, y: 208, w: 20, h: 96, fill: COUNTER_INK },
  { x: 166, y: 246, w: 76, h: 20, fill: COUNTER_INK },
  { x: 270, y: 208, w: 76, h: 20, fill: COUNTER_INK },
  { x: 298, y: 208, w: 20, h: 96, fill: COUNTER_INK },
]

const DESIGN = 512
const SUPERSAMPLE = 4

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const lengthBuf = Buffer.alloc(4)
  lengthBuf.writeUInt32BE(data.length)
  const crcInput = Buffer.concat([typeBuf, data])
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(crcInput) >>> 0)
  return Buffer.concat([lengthBuf, typeBuf, data, crcBuf])
}

function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type: truecolour (RGB)
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace

  const rowBytes = size * 3
  const raw = Buffer.alloc((rowBytes + 1) * size)
  for (let y = 0; y < size; y++) {
    const rowStart = y * (rowBytes + 1)
    raw[rowStart] = 0 // filter type: None
    pixels.copy(raw, rowStart + 1, y * rowBytes, (y + 1) * rowBytes)
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/**
 * @param size    output edge length in pixels
 * @param inset   fraction of the design space the mark is scaled to. 1 fills
 *                the canvas; the maskable variant shrinks the mark so the
 *                adaptive-icon mask cannot clip it (see below).
 */
function renderIcon(size, inset = 1) {
  const hi = size * SUPERSAMPLE
  const big = Buffer.alloc(hi * hi * 3)

  // Background first — full bleed at every inset, so a maskable icon has no
  // transparent corners for the launcher to fill with something else.
  for (let i = 0; i < hi * hi; i++) {
    big[i * 3] = INK[0]
    big[i * 3 + 1] = INK[1]
    big[i * 3 + 2] = INK[2]
  }

  const scale = (hi / DESIGN) * inset
  const offset = (hi - DESIGN * scale) / 2

  for (const rect of MARK) {
    const x0 = Math.round(rect.x * scale + offset)
    const y0 = Math.round(rect.y * scale + offset)
    const x1 = Math.round((rect.x + rect.w) * scale + offset)
    const y1 = Math.round((rect.y + rect.h) * scale + offset)

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const px = (y * hi + x) * 3
        big[px] = rect.fill[0]
        big[px + 1] = rect.fill[1]
        big[px + 2] = rect.fill[2]
      }
    }
  }

  // Box-downsample the supersampled buffer.
  const out = Buffer.alloc(size * size * 3)
  const samples = SUPERSAMPLE * SUPERSAMPLE
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const px = ((y * SUPERSAMPLE + sy) * hi + (x * SUPERSAMPLE + sx)) * 3
          r += big[px]
          g += big[px + 1]
          b += big[px + 2]
        }
      }
      const px = (y * size + x) * 3
      out[px] = Math.round(r / samples)
      out[px + 1] = Math.round(g / samples)
      out[px + 2] = Math.round(b / samples)
    }
  }

  return out
}

const outDir = join(import.meta.dirname, '..', 'public', 'icons')
mkdirSync(outDir, { recursive: true })

const targets = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  // Maskable safe zone is a circle of 80% diameter (409.6 of 512). The frame
  // is 360 wide, so its diagonal is ~509 and does not fit; at 0.72 the
  // diagonal is ~366 and clears the circle with margin.
  { file: 'icon-512-maskable.png', size: 512, inset: 0.72 },
  { file: 'apple-touch-icon.png', size: 180 },
  // At 32px the monogram would collapse into a smudge, so the favicon gets
  // the brackets alone — still recognisably the same mark in a tab strip.
  { file: 'favicon-32.png', size: 32, bracketsOnly: true },
]

const fullMark = MARK.slice()

for (const { file, size, inset = 1, bracketsOnly = false } of targets) {
  if (bracketsOnly) MARK.length = 8
  writeFileSync(join(outDir, file), encodePng(size, renderIcon(size, inset)))
  if (bracketsOnly) MARK.push(...fullMark.slice(8))
  console.log(`wrote public/icons/${file} (${size}x${size})`)
}
