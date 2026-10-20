import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import SidePanel from '~/components/SidePanel.vue'

describe('SidePanel (C-29, S-19)', () => {
  it('provides a footer outside the scrolling panel content', async () => {
    const panel = await mountSuspended(SidePanel, {
      props: { open: false, titleText: 'Upraviť' },
      slots: { footer: '<button type="submit">Uložiť</button>' },
    })

    expect(panel.find('.side-panel__footer button[type="submit"]').text()).toBe('Uložiť')
  })

  it('keeps native Escape from closing before the owner handles the request', async () => {
    const panel = await mountSuspended(SidePanel, {
      props: { open: false, titleText: 'Upraviť' },
    })
    const event = new Event('cancel', { cancelable: true })

    panel.element.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(panel.emitted('close')).toEqual([[]])
  })

  it('does not request closing while a save is pending', async () => {
    const panel = await mountSuspended(SidePanel, {
      props: { open: false, titleText: 'Upraviť', closeDisabled: true },
    })
    const event = new Event('cancel', { cancelable: true })

    panel.element.dispatchEvent(event)
    await panel.find('.side-panel__close').trigger('click')

    expect(event.defaultPrevented).toBe(true)
    expect(panel.emitted('close')).toBeUndefined()
  })
})
