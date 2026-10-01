import { describe, expect, it } from 'vitest'
import {
  parsePilotCatalog,
  parseSemicolonCsv,
  parseSpecifications,
  readPilotCatalog,
} from '../../scripts/lib/pilot-catalog-csv'

const HEADER =
  'kľúč;názov;pôvodný názov (pozicovna_List1.csv);pohon;oblasti použitia;doplnok k (kľúč);cena za deň (€);záloha (€);počet ks;fotka (súbor v docs/catalog-source);popis;obsah balenia;upozornenie;parametre (názov: hodnota | …);poznámka na kontrolu'

describe('parseSemicolonCsv', () => {
  it('handles a BOM, quoted separators, doubled quotes and CRLF', () => {
    const rows = parseSemicolonCsv('\uFEFFa;b\r\n"x;y";"say ""hi"""\r\n')
    expect(rows).toEqual([
      ['a', 'b'],
      ['x;y', 'say "hi"'],
    ])
  })
})

describe('parseSpecifications', () => {
  it('splits on " | " and the first ": " only', () => {
    expect(parseSpecifications('Príkon: 1 800 W | Režim: A: B')).toEqual([
      { label: 'Príkon', value: '1 800 W' },
      { label: 'Režim', value: 'A: B' },
    ])
    expect(parseSpecifications('')).toEqual([])
  })
})

describe('parsePilotCatalog', () => {
  const row = (cells: string) => `${HEADER}\n${cells}\n`

  it('reads a row by header name', () => {
    const [parsed] = parsePilotCatalog(
      row('mikrofon-jbl;Mikrofón;x;;Zábava;;5;25;1;;;;;Typ: na spev;'),
    )
    expect(parsed).toMatchObject({
      key: 'mikrofon-jbl',
      powerSource: null,
      useAreas: ['Zábava'],
      dayRateEuros: 5,
      depositEuros: 25,
      quantity: 1,
      sourceImage: null,
      specifications: [{ label: 'Typ', value: 'na spev' }],
    })
  })

  it('refuses a principal key that is not in the file', () => {
    expect(() => parsePilotCatalog(row('a;A;;;;missing;5;25;1;;;;;;'))).toThrow(/principal/)
  })

  it('refuses a zero quantity', () => {
    expect(() => parsePilotCatalog(row('a;A;;;;;5;25;0;;;;;;'))).toThrow(/quantity/)
  })

  it('reads the reviewed pilot catalog', () => {
    const rows = readPilotCatalog('docs/catalog-source/pilot-catalog.csv')
    expect(rows).toHaveLength(48)
    expect(rows.filter((r) => r.principalKey)).toHaveLength(4)
    expect(rows.reduce((sum, r) => sum + r.quantity, 0)).toBe(52)
  })
})
