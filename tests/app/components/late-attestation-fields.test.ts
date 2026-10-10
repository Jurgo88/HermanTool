import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import LateAttestationFields from '~/components/LateAttestationFields.vue'
import { sk } from '~/i18n/sk'
import { emptyLateAttestation } from '~/utils/late-attestation'

// C-25 (FR-24, S-17). Off by default, because the ordinary case is a live
// scan; once on, the time and the reason are both asked for and both
// reported back unchanged for the page to send.
const mountFields = (modelValue = emptyLateAttestation()) =>
  mountSuspended(LateAttestationFields, { props: { modelValue } })

describe('LateAttestationFields (C-25, FR-24)', () => {
  it('shows only the switch until it is turned on', async () => {
    const fields = await mountFields()

    expect(fields.find('input[type="checkbox"]').exists()).toBe(true)
    expect(fields.find('input[type="datetime-local"]').exists()).toBe(false)
    expect(fields.text()).not.toContain(sk.lateAttestation.hint)
  })

  it('reports being switched on', async () => {
    const fields = await mountFields()

    await fields.find('input[type="checkbox"]').setValue(true)

    expect(fields.emitted('update:modelValue')![0]).toEqual([
      { enabled: true, occurredAt: '', reason: '' },
    ])
  })

  it('asks for the time and the reason once on, and keeps both as they are typed', async () => {
    const fields = await mountFields({ enabled: true, occurredAt: '', reason: '' })

    expect(fields.text()).toContain(sk.lateAttestation.hint)
    await fields.find('input[type="datetime-local"]').setValue('2026-10-09T14:30')
    await fields.find('input[type="text"]').setValue('Výpadok internetu')

    const emitted = fields.emitted('update:modelValue')!
    expect(emitted[0]).toEqual([{ enabled: true, occurredAt: '2026-10-09T14:30', reason: '' }])
    // The second report carries the time typed before it: the field is one
    // value, not two that overwrite each other.
    expect(emitted[1]).toEqual([
      { enabled: true, occurredAt: '2026-10-09T14:30', reason: 'Výpadok internetu' },
    ])
  })
})
