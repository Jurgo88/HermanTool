import { describe, expect, it } from 'vitest'
import { matchesSelection, toggleId } from '../../../app/utils/catalog-filter'

const AKU = 1
const BENZIN = 3
const ZAHRADA = 10
const STAVBA = 11

const chainSaw = { powerSourceId: AKU, useAreaIds: [ZAHRADA, 12] }
const mower = { powerSourceId: BENZIN, useAreaIds: [ZAHRADA] }
const rake = { powerSourceId: null, useAreaIds: [ZAHRADA] }
const combiHammer = { powerSourceId: AKU, useAreaIds: [STAVBA] }

const none = { powerSourceIds: [], useAreaIds: [] }

describe('matchesSelection (D-54)', () => {
  it('lets everything through with nothing selected', () => {
    expect([chainSaw, mower, rake, combiHammer].every((a) => matchesSelection(a, none))).toBe(true)
  })

  it('ANDs across dimensions: Aku + Záhrada excludes the petrol mower', () => {
    const selection = { powerSourceIds: [AKU], useAreaIds: [ZAHRADA] }
    expect(matchesSelection(chainSaw, selection)).toBe(true)
    expect(matchesSelection(mower, selection)).toBe(false)
    expect(matchesSelection(combiHammer, selection)).toBe(false)
  })

  it('ORs within a dimension: Záhrada or Stavba', () => {
    const selection = { powerSourceIds: [], useAreaIds: [ZAHRADA, STAVBA] }
    expect([chainSaw, mower, rake, combiHammer].every((a) => matchesSelection(a, selection))).toBe(
      true,
    )
  })

  it('hides tools without a power source once a power source is selected', () => {
    expect(matchesSelection(rake, { powerSourceIds: [AKU], useAreaIds: [] })).toBe(false)
  })
})

describe('toggleId', () => {
  it('adds and removes', () => {
    expect(toggleId([1], 2)).toEqual([1, 2])
    expect(toggleId([1, 2], 1)).toEqual([2])
  })
})
