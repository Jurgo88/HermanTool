// Customer creation [MVP] (D-14, W1; issue #29). "The Visitor becomes a
// Customer" at checkout commitment — this module owns that fact's
// mechanics only, never the checkout itself (Availability & Reservation
// owns checkoutReservationGroup; this context never imports it, see
// ./index.ts). Composed at the route layer — see
// server/api/reservations/checkout.post.ts.
import type { TenantId } from '../_shared'
import type { CustomerIdentityComplianceRepository } from './repository'
import { CustomerAlreadyExistsForGroupError, InvalidCustomerDetailsError, type Customer } from './types'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// D-14: a Customer record belongs to exactly one ReservationGroup and is
// never deduplicated — a repeat visitor gets a new row, not a merge.
export async function createCustomer(
  repo: CustomerIdentityComplianceRepository,
  params: { tenantId: TenantId; reservationGroupId: number; name: string; email: string; phone: string },
): Promise<Customer> {
  const { tenantId, reservationGroupId, name, email, phone } = params

  if (!name.trim()) throw new InvalidCustomerDetailsError('name must not be empty')
  if (!EMAIL_PATTERN.test(email)) throw new InvalidCustomerDetailsError('email must be a valid address')
  if (!phone.trim()) throw new InvalidCustomerDetailsError('phone must not be empty')

  const existing = await repo.getCustomerByReservationGroup(tenantId, reservationGroupId)
  if (existing) throw new CustomerAlreadyExistsForGroupError(reservationGroupId)

  return repo.insertCustomer(tenantId, { reservationGroupId, name, email, phone })
}
