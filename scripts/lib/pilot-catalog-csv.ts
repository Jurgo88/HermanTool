// Reads docs/catalog-source/pilot-catalog.csv, the reviewed pilot
// catalog (D-60): UTF-8 with BOM, `;`-separated, quoted fields may hold
// `;`, `"` and newlines — what Excel writes for a Slovak locale. Columns
// are found by header, so a reordered sheet still reads correctly.
import { readFileSync } from 'node:fs'

export interface PilotCatalogRow {
  key: string
  name: string
  powerSource: string | null
  useAreas: string[]
  principalKey: string | null
  dayRateEuros: number
  depositEuros: number
  quantity: number
  sourceImage: string | null
  description: string
  includedContents: string
  handlingNotice: string
  specifications: { label: string; value: string }[]
}

const COLUMNS = {
  key: 'kľúč',
  name: 'názov',
  powerSource: 'pohon',
  useAreas: 'oblasti použitia',
  principalKey: 'doplnok k (kľúč)',
  dayRate: 'cena za deň (€)',
  deposit: 'záloha (€)',
  quantity: 'počet ks',
  sourceImage: 'fotka (súbor v docs/catalog-source)',
  description: 'popis',
  includedContents: 'obsah balenia',
  handlingNotice: 'upozornenie',
  specifications: 'parametre (názov: hodnota | …)',
} as const

export function parseSemicolonCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const input = text.replace(/^\uFEFF/, '')

  for (let i = 0; i < input.length; i++) {
    const char = input[i]!
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"'
        i++
      } else if (char === '"') {
        quoted = false
      } else {
        field += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === ';') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((cell) => cell.trim().length > 0))
}

function euros(raw: string, column: string, key: string): number {
  const value = Number(raw.trim().replace(',', '.'))
  if (!Number.isFinite(value) || value < 0)
    throw new Error(`${key}: "${column}" is not an amount: "${raw}"`)
  return value
}

export function parseSpecifications(raw: string): { label: string; value: string }[] {
  return raw
    .split(' | ')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      const separator = part.indexOf(': ')
      if (separator <= 0)
        throw new Error(`Specification "${part}" has no "label: value" separator.`)
      return { label: part.slice(0, separator).trim(), value: part.slice(separator + 2).trim() }
    })
}

export function parsePilotCatalog(text: string): PilotCatalogRow[] {
  const [header, ...body] = parseSemicolonCsv(text)
  if (!header) throw new Error('pilot-catalog.csv is empty.')
  const index = Object.fromEntries(
    Object.entries(COLUMNS).map(([field, label]) => {
      const position = header.findIndex((cell) => cell.trim() === label)
      if (position < 0) throw new Error(`pilot-catalog.csv has no "${label}" column.`)
      return [field, position]
    }),
  ) as Record<keyof typeof COLUMNS, number>

  const rows = body.map((cells) => {
    const cell = (field: keyof typeof COLUMNS) => (cells[index[field]] ?? '').trim()
    const key = cell('key')
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key)) throw new Error(`Invalid key "${key}".`)
    const quantity = Number(cell('quantity'))
    if (!Number.isInteger(quantity) || quantity < 1)
      throw new Error(`${key}: invalid quantity "${cell('quantity')}".`)

    return {
      key,
      name: cell('name'),
      powerSource: cell('powerSource') || null,
      useAreas: cell('useAreas')
        .split(',')
        .map((area) => area.trim())
        .filter((area) => area.length > 0),
      principalKey: cell('principalKey') || null,
      dayRateEuros: euros(cell('dayRate'), COLUMNS.dayRate, key),
      depositEuros: euros(cell('deposit'), COLUMNS.deposit, key),
      quantity,
      sourceImage: cell('sourceImage') || null,
      description: cell('description'),
      includedContents: cell('includedContents'),
      handlingNotice: cell('handlingNotice'),
      specifications: parseSpecifications(cell('specifications')),
    }
  })

  const keys = new Set<string>()
  for (const row of rows) {
    if (!row.name) throw new Error(`${row.key}: empty name.`)
    if (keys.has(row.key)) throw new Error(`Duplicate key "${row.key}".`)
    keys.add(row.key)
  }
  for (const row of rows) {
    if (row.principalKey && !keys.has(row.principalKey)) {
      throw new Error(`${row.key}: principal "${row.principalKey}" is not a key in the file.`)
    }
  }
  return rows
}

export function readPilotCatalog(path: string): PilotCatalogRow[] {
  return parsePilotCatalog(readFileSync(path, 'utf8'))
}
