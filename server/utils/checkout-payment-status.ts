// #190, S-05: what the browser that created a ReservationGroup may do next
// after leaving the payment page. Composes Availability & Reservation's
// Reservations and Payments' Payments at the utility layer (D-02).
//
// A derived answer (FR-28), never stored:
//   - 'paid'     — a Payment succeeded or the group is confirmed;
//   - 'payable'  — every Reservation is still Pending inside its window, so
//                  paying again keeps the days already held (FR-07);
//   - 'expired'  — anything else: the hold lapsed or was released, and a
//                  new attempt starts from the draft.
import type { Reservation } from '../contexts/availability-reservation'
import type { Payment } from '../contexts/payments'

export type CheckoutPaymentState = 'payable' | 'paid' | 'expired'

export interface CheckoutPaymentStatus {
  state: CheckoutPaymentState
  // When the hold lapses, for 'payable' only: the earliest Pending expiry.
  holdUntil: string | null
}

export function checkoutPaymentStatus(
  reservations: Pick<Reservation, 'state' | 'pendingExpiresAt'>[],
  payments: Pick<Payment, 'status'>[],
  now: Date,
): CheckoutPaymentStatus {
  if (payments.some((p) => p.status === 'succeeded')) return { state: 'paid', holdUntil: null }
  if (reservations.length > 0 && reservations.every((r) => r.state === 'confirmed')) {
    return { state: 'paid', holdUntil: null }
  }

  const holding =
    reservations.length > 0 &&
    reservations.every((r) => r.state === 'pending' && r.pendingExpiresAt.getTime() > now.getTime())
  if (!holding) return { state: 'expired', holdUntil: null }

  const earliest = Math.min(...reservations.map((r) => r.pendingExpiresAt.getTime()))
  return { state: 'payable', holdUntil: new Date(earliest).toISOString() }
}
