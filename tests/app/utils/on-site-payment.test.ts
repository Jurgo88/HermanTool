import { describe, expect, it } from 'vitest'
import { onSitePaymentRequest } from '../../../app/utils/on-site-payment'

// S-10 (D-65, P1; #241): what the counter sends.
const due = { amount: 3000, currency: 'EUR' }

describe('onSitePaymentRequest', () => {
  it('attests the due amount with the method and PIN, and no correction', () => {
    expect(onSitePaymentRequest({ due, method: 'cash', pin: '1234' })).toEqual({
      amount: due,
      method: 'cash',
      pin: '1234',
    })
  })

  it('corrects by naming the attestation in force, with a trimmed reason', () => {
    expect(
      onSitePaymentRequest({
        due,
        method: 'qr',
        pin: '1234',
        correction: { supersedesId: 7, reason: '  Zákazník platil QR kódom ' },
      }),
    ).toEqual({
      amount: due,
      method: 'qr',
      pin: '1234',
      correction: { supersedesId: 7, reason: 'Zákazník platil QR kódom' },
    })
  })
})
