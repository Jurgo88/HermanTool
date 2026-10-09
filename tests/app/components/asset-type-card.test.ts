import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import AssetTypeCard from '~/components/AssetTypeCard.vue'
import { sk } from '~/i18n/sk'

// C-23 (D-56, D-58, S-01). Two things a card must not get wrong: a missing
// photograph is a placeholder, never a broken image, and the price carries
// its currency (D-21) through the formatting module (D-51).
const base = {
  assetTypeId: 42,
  name: 'Bosch GBH 2-26 DFR, vŕtacie kladivo 220V',
  dayRate: { amount: 1500, currency: 'EUR' },
}

describe('AssetTypeCard (C-23)', () => {
  it('links the whole card to the S-02 detail', async () => {
    const card = await mountSuspended(AssetTypeCard, { props: { ...base, imageFile: null } })

    expect(card.element.tagName).toBe('A')
    expect(card.attributes('href')).toBe('/naradie/42')
  })

  it('shows the shipped photograph from /catalog, with an empty alt', async () => {
    const card = await mountSuspended(AssetTypeCard, {
      props: { ...base, imageFile: 'vrtacie-kladivo-bosch-gbh-2-26-dfr.webp' },
    })
    const img = card.find('img')

    expect(img.attributes('src')).toBe('/catalog/vrtacie-kladivo-bosch-gbh-2-26-dfr.webp')
    expect(img.attributes('alt')).toBe('')
    expect(card.text()).not.toContain(sk.publicCatalog.imagePlaceholder)
  })

  it('renders a text placeholder, not an <img>, when there is no photograph', async () => {
    const card = await mountSuspended(AssetTypeCard, { props: { ...base, imageFile: null } })

    expect(card.find('img').exists()).toBe(false)
    expect(card.text()).toContain(sk.publicCatalog.imagePlaceholder)
  })

  it('formats the day rate with its currency and the per-day suffix', async () => {
    const card = await mountSuspended(AssetTypeCard, { props: { ...base, imageFile: null } })

    expect(card.text()).toContain(base.name)
    expect(card.text()).toMatch(/15,00\s€/)
    expect(card.text()).toContain(sk.publicCatalog.perDaySuffix)
  })
})
