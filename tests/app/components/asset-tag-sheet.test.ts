import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import AssetTagSheet, { type AssetTagSheetEntry } from '~/components/AssetTagSheet.vue'

// C-24 (FR-26, S-20). A sheet that holds more than 21 labels would print a
// partial second page with the grid shifted, so the page split and what each
// label shows are worth pinning.
const entries = (count: number): AssetTagSheetEntry[] =>
  Array.from({ length: count }, (_, i) => ({
    assetId: i + 1,
    tagCode: `HT-${String(i + 1).padStart(6, '0')}`,
    qrDataUrl: 'data:image/png;base64,AAAA',
    assetTypeName: 'Generátor ozónu',
  }))

describe('AssetTagSheet (C-24, FR-26)', () => {
  it('puts 21 labels on a sheet and the rest on the next', async () => {
    const sheet = await mountSuspended(AssetTagSheet, { props: { entries: entries(52) } })
    const pages = sheet.findAll('section.asset-tag-sheet')

    expect(pages.map((page) => page.findAll('figure').length)).toEqual([21, 21, 10])
  })

  it('numbers the sheets for a screen reader', async () => {
    const sheet = await mountSuspended(AssetTagSheet, { props: { entries: entries(22) } })
    const labels = sheet
      .findAll('section.asset-tag-sheet')
      .map((page) => page.attributes('aria-label'))

    expect(labels).toEqual(['Hárok štítkov 1 z 2', 'Hárok štítkov 2 z 2'])
  })

  it('shows the QR, the tag code and the AssetType name on each label', async () => {
    const sheet = await mountSuspended(AssetTagSheet, { props: { entries: entries(1) } })
    const label = sheet.find('figure')

    expect(label.find('img').attributes('src')).toBe('data:image/png;base64,AAAA')
    expect(label.find('img').attributes('alt')).toBe('HT-000001')
    expect(label.text()).toContain('HT-000001')
    expect(label.text()).toContain('Generátor ozónu')
  })

  it('renders no sheet at all for no labels', async () => {
    const sheet = await mountSuspended(AssetTagSheet, { props: { entries: [] } })

    expect(sheet.findAll('section.asset-tag-sheet')).toHaveLength(0)
  })
})
