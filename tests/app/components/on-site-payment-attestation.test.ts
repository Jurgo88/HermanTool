import { describe, expect, it, vi } from 'vitest'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import OnSitePaymentAttestation from '~/components/OnSitePaymentAttestation.vue'
import { sk } from '~/i18n/sk'

// S-10 (D-65, P1; #241): an attested on-site payment is corrected by a
// new attestation that supersedes it — method, reason, PIN; the amount is
// the server's due amount, never typed.
const GROUP = 42
const URL = `/api/handover/reservation-groups/${GROUP}/on-site-payment`
const due = { amount: 3000, currency: 'EUR' }

let current: Record<string, unknown> | null = {
  id: 7,
  amount: due,
  method: 'cash',
  attestedAt: '2026-11-20T09:00:00.000Z',
  corrected: false,
}
let posted: unknown = null

registerEndpoint(URL, {
  method: 'GET',
  handler: () => ({ paymentMethod: 'on_site', rentalFeeDue: due, current }),
})
registerEndpoint(URL, {
  method: 'POST',
  // The test endpoint runs on test-utils' h3 v1 event, whose body is a web
  // stream on `_requestBody` — read it directly rather than via the app's h3.
  handler: async (event) => {
    posted = await new Response(
      (event as unknown as { _requestBody: BodyInit })._requestBody,
    ).json()
    current = {
      id: 8,
      amount: due,
      method: 'qr',
      attestedAt: '2026-11-20T09:05:00.000Z',
      corrected: true,
    }
    return { id: 8 }
  },
})

const button = (view: Awaited<ReturnType<typeof mountSuspended>>, label: string) =>
  view.findAll('button').find((b) => b.text() === label)!

describe('OnSitePaymentAttestation correction (S-10, #241)', () => {
  it('needs a reason, then sends a superseding attestation with the PIN', async () => {
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

    await vi.waitFor(() => expect(posted).not.toBeNull())
    expect(posted).toEqual({
      amount: due,
      method: 'qr',
      pin: '1234',
      correction: { supersedesId: 7, reason: 'Zákazník platil QR kódom' },
    })
    await vi.waitFor(() => expect(view.text()).toContain(sk.onSitePayment.correctedNote))
  })
})
