// S-10 (D-65, P1; #241): the body the counter sends to attest an on-site
// payment, or to correct the attestation in force. Pure, so what is sent
// is testable. The amount is always the server's due amount — never typed.
import type { MonetaryAmountView } from '~/utils/format'

export type OnSitePaymentMethod = 'cash' | 'card_terminal' | 'qr'

export interface OnSitePaymentRequest {
  amount: MonetaryAmountView
  method: OnSitePaymentMethod
  pin: string
  correction?: { supersedesId: number; reason: string }
}

export function onSitePaymentRequest(params: {
  due: MonetaryAmountView
  method: OnSitePaymentMethod
  pin: string
  // Set only when correcting: the attestation in force and why.
  correction?: { supersedesId: number; reason: string }
}): OnSitePaymentRequest {
  const { due, method, pin, correction } = params
  return {
    amount: due,
    method,
    pin,
    ...(correction ? { correction: { ...correction, reason: correction.reason.trim() } } : {}),
  }
}
