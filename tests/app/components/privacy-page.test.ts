import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import PrivacyPage from '~/pages/sukromie.vue'
import { sk } from '~/i18n/sk'

// S-07, P7, D-61, #247: the privacy notice drafted for counsel.
describe('privacy page (S-07, P7)', () => {
  const allText = JSON.stringify(sk.draft.privacy.sections)

  it('numbers the sections 1…n with no gap or duplicate', () => {
    const numbers = sk.draft.privacy.sections.map((section) =>
      Number(/^(\d+)\./.exec(section.heading)?.[1]),
    )

    expect(numbers).toEqual(numbers.map((_, index) => index + 1))
  })

  // D-61 is the decided IdentityEvidence window. The client's 7-day
  // request (#246) must not reach the notice until an ADR supersedes D-61:
  // promising 7 days while the system keeps 365 would be a false statement.
  it('states the IdentityEvidence window D-61 decided, and no other', () => {
    expect(allText).toContain('365 dní po vyúčtovaní zálohy')
    expect(allText).not.toMatch(/\b7 dní\b/)
  })

  // OQ #27: open retention periods are left visibly open, never invented.
  it('leaves the undecided retention periods as placeholders', () => {
    const openRetention = allText.match(/uchovávame \[doplniť: doba uchovávania/g) ?? []

    // Reservation data, condition photos, Delivery address, marketing consent.
    expect(openRetention).toHaveLength(4)
  })

  it('lists exactly the cookies the D-42 inventory found', () => {
    for (const cookie of ['ht_checkout_group', 'ht_operator_at', 'ht_operator_rt']) {
      expect(allText).toContain(cookie)
    }
  })

  it('renders every section with the draft notice and the version', async () => {
    const page = await mountSuspended(PrivacyPage)

    expect(page.findAll('.legal-page__section')).toHaveLength(sk.draft.privacy.sections.length)
    expect(page.text()).toContain(sk.draft.privacyPageBody)
    expect(page.text()).toContain(sk.draft.privacy.version)
  })
})
