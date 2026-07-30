import { beforeEach, describe, expect, it } from 'vitest'
import type { TenantId } from '../../../../server/contexts/_shared'
import {
  issueCustomerAccessLink,
  resolveCustomerAccessLink,
  revokeCustomerAccessLinksForCustomer,
} from '../../../../server/contexts/customer-identity-compliance/customer-access-link'
import { createCustomer } from '../../../../server/contexts/customer-identity-compliance/customer'
import { CustomerNotFoundError } from '../../../../server/contexts/customer-identity-compliance/types'
import {
  createFakeCustomerIdentityComplianceRepository,
  type FakeCustomerIdentityComplianceRepository,
} from './fake-repository'

const tenantA = '11111111-1111-1111-1111-111111111111' as TenantId

describe('CustomerAccessLink (D-23, FR-39)', () => {
  let repo: FakeCustomerIdentityComplianceRepository
  let customerId: number

  beforeEach(async () => {
    repo = createFakeCustomerIdentityComplianceRepository()
    const customer = await createCustomer(repo, {
      tenantId: tenantA,
      reservationGroupId: 1,
      name: 'Jana Nováková',
      email: 'jana@example.sk',
      phone: '+421900000000',
    })
    customerId = customer.id
  })

  describe('issueCustomerAccessLink', () => {
    it('returns the raw token exactly once and persists only its hash', async () => {
      const { link, token } = await issueCustomerAccessLink(repo, { tenantId: tenantA, customerId })

      expect(token).toBeTruthy()
      expect(link.tokenHash).not.toBe(token)
      expect(repo.allCustomerAccessLinks()).toHaveLength(1)
      expect(repo.allCustomerAccessLinks()[0]!.tokenHash).toBe(link.tokenHash)
    })

    it('refuses for an unknown Customer', async () => {
      await expect(issueCustomerAccessLink(repo, { tenantId: tenantA, customerId: 999 })).rejects.toThrow(
        CustomerNotFoundError,
      )
    })

    it('issues a different token each time, even for the same Customer', async () => {
      const first = await issueCustomerAccessLink(repo, { tenantId: tenantA, customerId })
      const second = await issueCustomerAccessLink(repo, { tenantId: tenantA, customerId })

      expect(first.token).not.toBe(second.token)
      expect(repo.allCustomerAccessLinks()).toHaveLength(2)
    })
  })

  describe('resolveCustomerAccessLink', () => {
    it('resolves a freshly issued token', async () => {
      const { token } = await issueCustomerAccessLink(repo, { tenantId: tenantA, customerId })

      const resolved = await resolveCustomerAccessLink(repo, { tenantId: tenantA, token })

      expect(resolved?.customerId).toBe(customerId)
    })

    it('returns null for a token that was never issued (no oracle: same result as expired/revoked)', async () => {
      const resolved = await resolveCustomerAccessLink(repo, { tenantId: tenantA, token: 'never-issued' })
      expect(resolved).toBeNull()
    })

    it('returns null for an expired token', async () => {
      const now = new Date('2026-01-01T00:00:00.000Z')
      const { token } = await issueCustomerAccessLink(repo, { tenantId: tenantA, customerId, now })

      const resolved = await resolveCustomerAccessLink(repo, {
        tenantId: tenantA,
        token,
        now: new Date('2026-02-15T00:00:00.000Z'), // past the 30-day TTL
      })
      expect(resolved).toBeNull()
    })

    it('returns null for a revoked token, even if not yet expired', async () => {
      const { token } = await issueCustomerAccessLink(repo, { tenantId: tenantA, customerId })
      await revokeCustomerAccessLinksForCustomer(repo, { tenantId: tenantA, customerId })

      const resolved = await resolveCustomerAccessLink(repo, { tenantId: tenantA, token })
      expect(resolved).toBeNull()
    })

    it('never resolves across Tenants', async () => {
      const { token } = await issueCustomerAccessLink(repo, { tenantId: tenantA, customerId })

      const otherTenant = '22222222-2222-2222-2222-222222222222' as TenantId
      const resolved = await resolveCustomerAccessLink(repo, { tenantId: otherTenant, token })
      expect(resolved).toBeNull()
    })
  })

  describe('revokeCustomerAccessLinksForCustomer', () => {
    it("ends the token's purpose at HandoverOut, per D-23", async () => {
      const { token } = await issueCustomerAccessLink(repo, { tenantId: tenantA, customerId })
      expect(await resolveCustomerAccessLink(repo, { tenantId: tenantA, token })).not.toBeNull()

      await revokeCustomerAccessLinksForCustomer(repo, { tenantId: tenantA, customerId })

      expect(await resolveCustomerAccessLink(repo, { tenantId: tenantA, token })).toBeNull()
    })

    it('revokes every active link for the Customer, not just the latest', async () => {
      const first = await issueCustomerAccessLink(repo, { tenantId: tenantA, customerId })
      const second = await issueCustomerAccessLink(repo, { tenantId: tenantA, customerId })

      await revokeCustomerAccessLinksForCustomer(repo, { tenantId: tenantA, customerId })

      expect(await resolveCustomerAccessLink(repo, { tenantId: tenantA, token: first.token })).toBeNull()
      expect(await resolveCustomerAccessLink(repo, { tenantId: tenantA, token: second.token })).toBeNull()
    })

    it('is a no-op for a Customer with no links', async () => {
      await expect(
        revokeCustomerAccessLinksForCustomer(repo, { tenantId: tenantA, customerId: 999 }),
      ).resolves.toBeUndefined()
    })
  })
})
