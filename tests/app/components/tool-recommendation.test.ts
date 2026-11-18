import { describe, expect, it, vi } from 'vitest'
import { createError } from 'h3'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import ToolRecommendation from '~/components/ToolRecommendation.vue'
import { sk } from '~/i18n/sk'

type Reply = () => unknown
let reply: Reply = () => ({ matched: false, safetyNote: null, recommendations: [] })

registerEndpoint('/api/public/tool-recommendation', { method: 'POST', handler: () => reply() })

async function askWith(next: Reply) {
  reply = next
  const view = await mountSuspended(ToolRecommendation)
  await view.find('textarea').setValue('Vyvŕtať dieru do betónu')
  await view.find('form').trigger('submit')
  return view
}

describe('ToolRecommendation (S-01, D-64)', () => {
  it('keeps the submit disabled until something is typed', async () => {
    const view = await mountSuspended(ToolRecommendation)
    expect(view.find('button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it('shows the recommended AssetTypes with their reasons and the safety note, linking to S-02', async () => {
    const view = await askWith(() => ({
      matched: true,
      safetyNote: 'Používajte ochranné okuliare.',
      recommendations: [
        { assetTypeId: 31, reason: 'Vŕta do betónu.', name: 'Vŕtacie kladivo', dayRate: { amount: 1500, currency: 'EUR' }, imageFile: null },
      ],
    }))
    await vi.waitFor(() => expect(view.text()).toContain('Vŕtacie kladivo'))
    expect(view.text()).toContain('Vŕta do betónu.')
    expect(view.text()).toContain('Používajte ochranné okuliare.')
    expect(view.find('a[href="/naradie/31"]').exists()).toBe(true)
  })

  it('offers personal advice when nothing fits', async () => {
    const view = await askWith(() => ({ matched: false, safetyNote: null, recommendations: [] }))
    await vi.waitFor(() => expect(view.text()).toContain(sk.toolRecommendation.noMatch))
  })

  it('maps the visitor limit to its own message and keeps the input', async () => {
    const view = await askWith(() => {
      throw createError({ statusCode: 429, data: { code: 'VisitorLimitReachedError', window: 'hour' } })
    })
    await vi.waitFor(() => expect(view.text()).toContain(sk.toolRecommendation.limitHour))
    expect(view.find('textarea').exists()).toBe(true)
  })

  it('hides the input when recommendations are unavailable (cap reached)', async () => {
    const view = await askWith(() => {
      throw createError({ statusCode: 503, data: { code: 'MonthlyCapReachedError' } })
    })
    await vi.waitFor(() => expect(view.text()).toContain(sk.toolRecommendation.unavailable))
    expect(view.find('textarea').exists()).toBe(false)
  })
})
