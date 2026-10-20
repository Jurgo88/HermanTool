import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import AssetTypeEditor from '~/components/AssetTypeEditor.vue'

const assetType = {
  id: 1,
  name: 'Vŕtačka',
  description: '',
  dayRate: { amount: 1500, currency: 'EUR' },
  depositAmount: { amount: 7500, currency: 'EUR' },
  powerSourceId: null,
  useAreaIds: [],
  specifications: [],
  includedContents: '',
  handlingNotice: '',
  imageFile: null,
  principalIds: [],
}

describe('AssetTypeEditor (S-19, FR-37)', () => {
  it('reports when edits become dirty and clean again', async () => {
    const editor = await mountSuspended(AssetTypeEditor, {
      props: {
        assetType,
        powerSources: [],
        useAreas: [],
        images: [],
        principalCandidates: [],
      },
    })

    const name = editor.find('input[type="text"]')
    await name.setValue('Aku vŕtačka')
    await name.setValue(assetType.name)

    expect(editor.emitted('dirty-change')?.map(([dirty]) => dirty)).toEqual([false, true, false])
  })

  it('switches section tabs with the keyboard without losing edited fields', async () => {
    const editor = await mountSuspended(AssetTypeEditor, {
      props: {
        assetType,
        powerSources: [],
        useAreas: [],
        images: [],
        principalCandidates: [],
      },
    })
    const tabs = editor.findAll('[role="tab"]')

    await editor.find('input[type="text"]').setValue('Aku vŕtačka')
    await tabs[0]!.trigger('keydown', { key: 'ArrowRight' })
    await tabs[1]!.trigger('keydown', { key: 'ArrowRight' })

    expect(tabs[2]!.attributes('aria-selected')).toBe('true')
    expect(editor.find('#asset-type-editor-panel-content').attributes('aria-labelledby')).toBe(
      'asset-type-editor-tab-content',
    )

    await tabs[2]!.trigger('keydown', { key: 'Home' })
    expect(tabs[0]!.attributes('aria-selected')).toBe('true')
    expect((editor.find('input[type="text"]').element as HTMLInputElement).value).toBe(
      'Aku vŕtačka',
    )
  })

  it('returns to required basics before saving from another section', async () => {
    const editor = await mountSuspended(AssetTypeEditor, {
      props: {
        assetType,
        powerSources: [],
        useAreas: [],
        images: [],
        principalCandidates: [],
      },
    })

    await editor.find('input[name="asset-type-name"]').setValue('')
    await editor.find('#asset-type-editor-tab-image').trigger('click')
    editor
      .find('form')
      .element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await editor.vm.$nextTick()

    expect(editor.find('#asset-type-editor-tab-basics').attributes('aria-selected')).toBe('true')
    expect(editor.emitted('save')).toBeUndefined()
  })

  it('uses compact accessible arrow controls to reorder specifications', async () => {
    const editor = await mountSuspended(AssetTypeEditor, {
      props: {
        assetType: {
          ...assetType,
          specifications: [
            { label: 'Príkon', value: '1 800 W' },
            { label: 'Hmotnosť', value: '2 kg' },
          ],
        },
        powerSources: [],
        useAreas: [],
        images: [],
        principalCandidates: [],
      },
    })
    await editor.find('#asset-type-editor-tab-content').trigger('click')

    const moveButtons = editor.findAll('.asset-type-editor__spec-move')
    expect(moveButtons.map((button) => button.attributes('title'))).toEqual([
      'Vyššie',
      'Nižšie',
      'Vyššie',
      'Nižšie',
    ])
    expect(moveButtons[0]!.attributes('disabled')).toBeDefined()
    expect(moveButtons[3]!.attributes('disabled')).toBeDefined()

    await moveButtons[1]!.trigger('click')
    editor
      .find('form')
      .element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))

    expect(editor.emitted('save')?.[0]?.[0]).toMatchObject({
      specifications: [
        { label: 'Hmotnosť', value: '2 kg' },
        { label: 'Príkon', value: '1 800 W' },
      ],
    })
  })
})
