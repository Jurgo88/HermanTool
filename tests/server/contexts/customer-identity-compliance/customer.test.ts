import { beforeEach, describe, expect, it } from 'vitest'
import type { TenantId } from '../../../../server/contexts/_shared'
import { createCustomer } from '../../../../server/contexts/customer-identity-compliance/customer'
import {
  CustomerAlreadyExistsForGroupError,
  InvalidCustomerDetailsError,
} from '../../../../server/contexts/customer-identity-compliance/types'
import {
  createFakeCustomerIdentityComplianceRepository,
  type FakeCustomerIdentityComplianceRepository,
} from './fake-repository'

const tenantA = '11111111-1111-1111-1111-111111111111' as TenantId

const validParams = {
  tenantId: tenantA,
  reservationGroupId: 1,
  name: 'Jana Nováková',
  email: 'jana@example.sk',
  phone: '+421900000000',
}

describe('createCustomer', () => {
  let repo: FakeCustomerIdentityComplianceRepository

  beforeEach(() => {
    repo = createFakeCustomerIdentityComplianceRepository()
  })

  it('creates a Customer record for the ReservationGroup (D-14, W1)', async () => {
    const customer = await createCustomer(repo, validParams)

    expect(customer.reservationGroupId).toBe(1)
    expect(customer.name).toBe('Jana Nováková')
    expect(customer.email).toBe('jana@example.sk')
  })

  it('refuses a second Customer for the same ReservationGroup (D-14: one record per group)', async () => {
    await createCustomer(repo, validParams)

    await expect(createCustomer(repo, validParams)).rejects.toThrow(CustomerAlreadyExistsForGroupError)
  })

  it('allows the same person to become a new Customer on a different ReservationGroup (D-14: never deduplicated)', async () => {
    await createCustomer(repo, validParams)

    const second = await createCustomer(repo, { ...validParams, reservationGroupId: 2 })

    expect(second.reservationGroupId).toBe(2)
    expect(repo.allCustomers()).toHaveLength(2)
  })

  it.each([
    { field: 'name', value: '   ' },
    { field: 'email', value: 'not-an-email' },
    { field: 'phone', value: '' },
  ])('refuses an invalid $field', async ({ field, value }) => {
    await expect(createCustomer(repo, { ...validParams, [field]: value })).rejects.toThrow(
      InvalidCustomerDetailsError,
    )
  })
})
