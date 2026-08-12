// WP-6.1 (NFR-12; docs/design/interface-design-foundation.md §9). Writes
// solid-colour PNG icons for the PWA manifest and apple-touch-icon —
// `--ht-signal` (#ffc400), the one token this product has actually
// committed to. Deliberately no monogram, wordmark or logo: which of
// those (if any) this product gets is UI-OQ-3, still open. A flat fill
// is honest about that and trivially safe for a maskable icon's safe
// zone (no content near the edges to clip). Re-run with `node
// scripts/generate-pwa-icons.mjs` if the signal token ever changes, or
// once UI-OQ-3 is answered and a real mark replaces this.
import { deflateSync, crc32 } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SIGNAL = [0xff, 0xc4, 0x00] // --ht-signal, tokens.css

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

function solidColorPng(size, [r, g, b]) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type: truecolor (RGB)
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace

  const rowBytes = size * 3
  const raw = Buffer.alloc((rowBytes + 1) * size)
  for (let y = 0; y < size; y++) {
    const rowStart = y * (rowBytes + 1)
    raw[rowStart] = 0 // filter type: None
    for (let x = 0; x < size; x++) {
      const px = rowStart + 1 + x * 3
      raw[px] = r
      raw[px + 1] = g
      raw[px + 2] = b
    }
  }

  const idat = deflateSync(raw)

  return Buffer.concat([PNG_SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

const outDir = join(import.meta.dirname, '..', 'public', 'icons')
mkdirSync(outDir, { recursive: true })

const targets = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'icon-512-maskable.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'favicon-32.png', size: 32 },
]

for (const { file, size } of targets) {
  writeFileSync(join(outDir, file), solidColorPng(size, SIGNAL))
  console.log(`wrote public/icons/${file} (${size}x${size})`)
}
