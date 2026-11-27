import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import TermsPage from '~/pages/podmienky.vue'
import { sk } from '~/i18n/sk'

// S-07, D-35, #248: the owner's draft of the rental terms. The articles
// cross-reference each other by number ("podľa článku 9"), so a new
// article must not leave a gap or a duplicate in the numbering.
describe('terms page (S-07, D-35)', () => {
  it('numbers the articles 1…n with no gap or duplicate', () => {
    const numbers = sk.draft.terms.sections
      .map((section) => /^(\d+)\./.exec(section.heading)?.[1])
      .filter((n): n is string => n !== undefined)
      .map(Number)

    expect(numbers).toEqual(numbers.map((_, index) => index + 1))
  })

  it('renders the emphasised paragraph distinctly, with its text', async () => {
    const page = await mountSuspended(TermsPage)
    const emphasis = page.findAll('.legal-page__emphasis')

    expect(emphasis).toHaveLength(1)
    expect(emphasis[0]!.find('strong').text()).toContain('ako keby bolo vaše vlastné')
  })

  it('shows the version that checkout records on acceptance', async () => {
    const page = await mountSuspended(TermsPage)

    expect(page.text()).toContain(sk.draft.terms.version)
  })
})
