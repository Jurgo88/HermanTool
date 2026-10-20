import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import QuantityStepper from '~/components/QuantityStepper.vue'

// C-26 (S-02). − and + step by one inside min and max; a typed value is
// rounded and clamped; each button has its own accessible name.
const mountStepper = (modelValue: number, extra: Record<string, unknown> = {}) =>
  mountSuspended(QuantityStepper, {
    props: { modelValue, decreaseLabel: 'Menej kusov', increaseLabel: 'Viac kusov', ...extra },
  })

describe('QuantityStepper (C-26)', () => {
  it('steps up and down by one', async () => {
    const stepper = await mountStepper(2)
    const [minus, plus] = stepper.findAll('button')

    await plus!.trigger('click')
    await minus!.trigger('click')

    expect(stepper.emitted('update:modelValue')).toEqual([[3], [2]])
  })

  it('cannot go below min or above max', async () => {
    const atMin = await mountStepper(1)
    expect(atMin.findAll('button')[0]!.attributes('disabled')).toBeDefined()

    const atMax = await mountStepper(5, { max: 5 })
    expect(atMax.findAll('button')[1]!.attributes('disabled')).toBeDefined()
  })

  it('rounds and clamps a typed value', async () => {
    const stepper = await mountStepper(1, { max: 10 })

    await stepper.find('input').setValue('99')
    await stepper.find('input').setValue('2.6')

    expect(stepper.emitted('update:modelValue')).toEqual([[10], [3]])
  })

  it('names both buttons for a screen reader', async () => {
    const stepper = await mountStepper(1)
    const labels = stepper.findAll('button').map((button) => button.attributes('aria-label'))

    expect(labels).toEqual(['Menej kusov', 'Viac kusov'])
  })
})
