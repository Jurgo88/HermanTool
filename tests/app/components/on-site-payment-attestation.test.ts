import { describe, expect, it, vi } from 'vitest'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import OnSitePaymentAttestation from '~/components/OnSitePaymentAttestation.vue'
import { sk } from '~/i18n/sk'

// S-10 (D-65, P1; #241): the correction control's behaviour. The request
// body itself is covered by tests/app/utils/on-site-payment.test.ts — the
// mocked endpoint's request body is not readable the same way on every
// install, so this test never depends on it.
const GROUP = 42
const URL = `/api/handover/reservation-groups/${GROUP}/on-site-payment`
const due = { amount: 3000, currency: 'EUR' }

let current: Record<string, unknown> = {
  id: 7,
  amount: due,
  method: 'cash',
  attestedAt: '2026-11-20T09:00:00.000Z',
  corrected: false,
}
let posts = 0

registerEndpoint(URL, {
  method: 'GET',
  handler: () => ({ paymentMethod: 'on_site', rentalFeeDue: due, current }),
})
registerEndpoint(URL, {
  method: 'POST',
  handler: () => {
    posts++
    current = { ...current, id: 8, method: 'qr', corrected: true }
    return { id: 8 }
  },
})

const button = (view: Awaited<ReturnType<typeof mountSuspended>>, label: string) =>
  view.findAll('button').find((b) => b.text() === label)!

describe('OnSitePaymentAttestation correction (S-10, #241)', () => {
  it('needs a reason, asks for the PIN, then shows the corrected attestation', async () => {
    const view = await mountSuspended(OnSitePaymentAttestation, {
      props: { reservationGroupId: GROUP },
    })
    await vi.waitFor(() => expect(view.text()).toContain(sk.onSitePayment.correctAction))

    await button(view, sk.onSitePayment.correctAction).trigger('click')
    const submit = button(view, sk.onSitePayment.correctionSubmitAction)
    expect(submit.attributes('disabled')).toBeDefined()

    await view.find('input[type="radio"][value="qr"]').setValue(true)
    await view.find('input[type="text"]').setValue('Zákazník platil QR kódom')
    expect(submit.attributes('disabled')).toBeUndefined()

    await submit.element.closest('form')!.dispatchEvent(new Event('submit'))
    const pin = view.find('input[type="password"]')
    await pin.setValue('1234')
    pin.element.closest('form')!.dispatchEvent(new Event('submit'))

    await vi.waitFor(() => expect(posts).toBe(1))
    await vi.waitFor(() => expect(view.text()).toContain(sk.onSitePayment.correctedNote))
    expect(view.text()).toContain(sk.onSitePayment.methods.qr)
  })
})
