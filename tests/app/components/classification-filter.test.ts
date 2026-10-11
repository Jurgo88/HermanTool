import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import ClassificationFilter from '~/components/ClassificationFilter.vue'
import { sk } from '~/i18n/sk'

// C-22 (D-54, S-01). The OR/AND rule lives in catalog-filter.ts and is tested
// there; this guards what only a mounted component can get wrong: the chips
// report the right selection, show state without relying on colour (§8), and
// offer "clear" only when there is something to clear.
const powerSources = [
  { id: 1, label: 'Aku' },
  { id: 3, label: 'Benzín' },
]
const useAreas = [
  { id: 10, label: 'Záhrada' },
  { id: 11, label: 'Stavba' },
]
const none = { powerSourceIds: [], useAreaIds: [] }

const mountFilter = (modelValue = none) =>
  mountSuspended(ClassificationFilter, { props: { powerSources, useAreas, modelValue } })

describe('ClassificationFilter (C-22, D-54)', () => {
  it('renders one chip per option, grouped and labelled', async () => {
    const filter = await mountFilter()

    expect(filter.findAll('button.classification-filter__chip').map((b) => b.text())).toEqual([
      'Aku',
      'Benzín',
      'Záhrada',
      'Stavba',
    ])
  })

  it('names each group with a visible label, which also labels it for a screen reader', async () => {
    const filter = await mountFilter()

    for (const [id, label] of [
      ['classification-filter-power', sk.publicCatalog.powerSourceGroup],
      ['classification-filter-area', sk.publicCatalog.useAreaGroup],
    ] as const) {
      expect(filter.find(`#${id}`).text()).toBe(label)
      expect(filter.find(`[role="group"][aria-labelledby="${id}"]`).exists()).toBe(true)
    }
  })

  it('reports a PowerSource and a UseArea into their own dimension', async () => {
    const filter = await mountFilter()
    const chips = filter.findAll('button.classification-filter__chip')

    await chips[0]!.trigger('click') // Aku
    await chips[3]!.trigger('click') // Stavba

    expect(filter.emitted('update:modelValue')).toEqual([
      [{ powerSourceIds: [1], useAreaIds: [] }],
      [{ powerSourceIds: [], useAreaIds: [11] }],
    ])
  })

  it('deselects a chip that is already selected', async () => {
    const filter = await mountFilter({ powerSourceIds: [1, 3], useAreaIds: [] })

    await filter.findAll('button.classification-filter__chip')[0]!.trigger('click')

    expect(filter.emitted('update:modelValue')![0]).toEqual([
      { powerSourceIds: [3], useAreaIds: [] },
    ])
  })

  it('states selection through aria-pressed, not colour alone', async () => {
    const filter = await mountFilter({ powerSourceIds: [3], useAreaIds: [10] })
    const pressed = filter
      .findAll('button.classification-filter__chip')
      .map((b) => b.attributes('aria-pressed'))

    expect(pressed).toEqual(['false', 'true', 'true', 'false'])
  })

  it('offers "clear filters" only with a selection, and clears both dimensions', async () => {
    expect((await mountFilter()).text()).not.toContain(sk.publicCatalog.clearFilters)

    const filter = await mountFilter({ powerSourceIds: [1], useAreaIds: [10] })
    const clear = filter.findAll('button').find((b) => b.text() === sk.publicCatalog.clearFilters)
    await clear!.trigger('click')

    expect(filter.emitted('update:modelValue')![0]).toEqual([none])
  })

  it('omits a group with no options', async () => {
    const filter = await mountSuspended(ClassificationFilter, {
      props: { powerSources: [], useAreas, modelValue: none },
    })

    expect(filter.find('#classification-filter-power').exists()).toBe(false)
    expect(filter.find('#classification-filter-area').exists()).toBe(true)
  })
})
