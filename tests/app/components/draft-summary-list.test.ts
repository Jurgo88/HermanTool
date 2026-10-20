import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import DraftSummaryList from '~/components/DraftSummaryList.vue'
import type { DraftReservationLine } from '~/composables/useReservationDraft'

// C-28 (S-04, S-05). What the draft holds: photo when there is one, name,
// days and units, and an Accessory placed under its principal (D-57).
const money = (amount: number) => ({ amount, currency: 'EUR' })
const drill: DraftReservationLine = {
  assetTypeId: 7,
  assetTypeName: 'Vŕtacie kladivo',
  dayRate: money(1500),
  depositAmount: money(7500),
  period: { startDay: '2026-10-22', endDay: '2026-10-25' },
  quantity: 2,
  imageFile: 'kladivo.webp',
}
const bits: DraftReservationLine = {
  ...drill,
  assetTypeId: 9,
  assetTypeName: 'Sada vrtákov',
  quantity: 2,
  imageFile: null,
  principalAssetTypeId: 7,
}

describe('DraftSummaryList (C-28)', () => {
  it('lists each line with its units, an Accessory after its principal', async () => {
    const list = await mountSuspended(DraftSummaryList, { props: { lines: [bits, drill] } })
    const rows = list.findAll('li')

    expect(rows.map((row) => row.find('.draft-summary__name').text())).toEqual(['Vŕtacie kladivo', 'Sada vrtákov'])
    expect(rows[1]!.classes()).toContain('draft-summary__line--accessory')
    expect(rows[0]!.text()).toContain('2 ks')
  })

  it('shows the photo only for a line that has one', async () => {
    const list = await mountSuspended(DraftSummaryList, { props: { lines: [drill, bits] } })
    const images = list.findAll('img')

    expect(images).toHaveLength(1)
    expect(images[0]!.attributes('src')).toBe('/catalog/kladivo.webp')
  })
})
