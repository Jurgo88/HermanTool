import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import PublicHero from '~/components/PublicHero.vue'

// C-27 (D-59, style C). The band holds whatever the page opens with; narrow
// lines it up with a single centred column of cards.
describe('PublicHero (C-27)', () => {
  it('renders the page opening inside the band', async () => {
    const hero = await mountSuspended(PublicHero, { slots: { default: () => 'Požičovňa náradia' } })

    expect(hero.find('section.public-hero').text()).toContain('Požičovňa náradia')
    expect(hero.find('.public-hero__inner--narrow').exists()).toBe(false)
  })

  it('narrows to the card column when asked', async () => {
    const hero = await mountSuspended(PublicHero, { props: { narrow: true } })

    expect(hero.find('.public-hero__inner--narrow').exists()).toBe(true)
  })
})
