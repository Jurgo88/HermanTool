import { describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import CompatibleAssetTypes from '~/components/CompatibleAssetTypes.vue'
import { sk } from '~/i18n/sk'

const washer = {
  id: 7,
  name: 'Vysokotlakový čistič',
  dayRate: { amount: 2500, currency: 'EUR' },
  depositAmount: { amount: 12500, currency: 'EUR' },
  imageFile: null,
}
const busy = {
  id: 8,
  name: 'Rotačná kefa',
  dayRate: { amount: 1500, currency: 'EUR' },
  depositAmount: { amount: 7500, currency: 'EUR' },
  imageFile: null,
}

registerEndpoint('/api/public/asset-types/7/availability', () => ({
  days: [{ day: '2026-10-10', available: 1 }],
}))
registerEndpoint('/api/public/asset-types/8/availability', () => ({
  days: [{ day: '2026-10-10', available: 0 }],
}))
registerEndpoint('/api/public/asset-types/3/nearest-joint-periods', () => ({
  periods: [{ startDay: '2026-10-12', endDay: '2026-10-12' }],
}))

const mount = (props: Partial<{ startDay: string | null; endDay: string | null }>) =>
  mountSuspended(CompatibleAssetTypes, {
    props: {
      assetTypeId: 3,
      suggestions: [washer, busy],
      startDay: null,
      endDay: null,
      quantity: 1,
      ...props,
    },
  })

describe('CompatibleAssetTypes (S-02, D-62)', () => {
  it('renders nothing when there is no compatible AssetType', async () => {
    const view = await mountSuspended(CompatibleAssetTypes, {
      props: { assetTypeId: 3, suggestions: [], startDay: null, endDay: null, quantity: 1 },
    })
    expect(view.find('section').exists()).toBe(false)
  })

  it('asks for a period first and keeps the add control disabled', async () => {
    const view = await mount({})
    expect(view.text()).toContain(sk.assetTypeDetail.compatibleHeading)
    for (const button of view.findAll('button')) {
      expect(button.attributes('disabled')).toBeDefined()
    }
    expect(view.text()).toContain(sk.assetTypeDetail.accessoryPickPeriodFirst)
  })

  it('adds a free one on the same period, and offers joint periods for a busy one', async () => {
    const view = await mount({ startDay: '2026-10-10', endDay: '2026-10-10' })
    await flushPromises()

    const add = view
      .findAll('button')
      .find((b) => b.text() === sk.assetTypeDetail.compatibleAddAction && !b.attributes('disabled'))
    expect(add).toBeDefined()
    await add!.trigger('click')
    expect(view.emitted('add')?.[0]).toEqual([
      washer,
      { startDay: '2026-10-10', endDay: '2026-10-10' },
    ])
    expect(view.text()).toContain(sk.assetTypeDetail.compatibleAdded)

    await vi.waitFor(() => expect(view.findAll('.compatible__periods button')).toHaveLength(1))
    expect(view.text()).toContain(sk.assetTypeDetail.compatibleUnavailable)
    const move = view.findAll('.compatible__periods button')
    expect(move).toHaveLength(1)
    await move[0]!.trigger('click')
    expect(view.emitted('move-period')?.[0]).toEqual([
      { startDay: '2026-10-12', endDay: '2026-10-12' },
    ])
  })
})
