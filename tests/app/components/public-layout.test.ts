import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import PublicLayout from '~/layouts/public.vue'
import { sk } from '~/i18n/sk'

// S-18, D-14: Operators need a way in from the public site, and Customers
// must not mistake it for theirs (they have no account). So it sits in the
// footer, labelled for staff, and not in the header.
describe('public layout (D-14, S-18)', () => {
  it('offers the Operator sign-in in the footer, labelled for staff', async () => {
    const layout = await mountSuspended(PublicLayout)
    const link = layout.find('footer a[href="/login"]')

    expect(link.exists()).toBe(true)
    expect(link.text()).toBe(sk.publicFooter.staffLogin)
  })

  it('does not put a sign-in in the header, where a Customer would look for an account', async () => {
    const layout = await mountSuspended(PublicLayout)

    expect(layout.find('header a[href="/login"]').exists()).toBe(false)
  })

  it('keeps the legal pages reachable from every page', async () => {
    const layout = await mountSuspended(PublicLayout)
    const hrefs = layout.findAll('footer a').map((a) => a.attributes('href'))

    expect(hrefs).toEqual(expect.arrayContaining(['/podmienky', '/sukromie', '/login']))
  })
})
