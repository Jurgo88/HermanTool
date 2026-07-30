// Integration tests for the Customer Identity & Compliance migration
// (supabase/migrations/20260729130000_customer_identity_compliance_foundation.sql)
// against a real Postgres, mirroring
// tests/server/contexts/payments/payment.integration.test.ts.
//
// Self-skips when NUXT_DATABASE_URL is not set, matching every other
// integration suite in this repo.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type postgres from 'postgres'
import { createDatabaseClient } from '../../../../server/utils/db'
import type { TenantId } from '../../../../server/contexts/_shared'
import {
  issueCustomerAccessLink,
  resolveCustomerAccessLink,
  revokeCustomerAccessLinksForCustomer,
} from '../../../../server/contexts/customer-identity-compliance/customer-access-link'
import { createPostgresCustomerIdentityComplianceRepository } from '../../../../server/contexts/customer-identity-compliance/repository'
import {
  eraseExpiredIdentityEvidence,
  reanchorRetentionDeadlineForCustomer,
} from '../../../../server/contexts/customer-identity-compliance/retention'
import { RetentionWindowNotConfiguredError } from '../../../../server/contexts/customer-identity-compliance/types'
import { createFakeIdentityEvidenceStorageGateway } from './fake-gateway'

const databaseUrl = process.env.NUXT_DATABASE_URL ?? ''

describe.skipIf(!databaseUrl)('Customer Identity & Compliance migration (integration)', () => {
  let sql: postgres.Sql
  let tenantId: TenantId
  let operatorId: string
  let reservationGroupId: number

  beforeEach(async () => {
    sql = createDatabaseClient(databaseUrl)

    await sql`truncate table identity_verifications restart identity cascade`
    await sql`truncate table identity_evidence_access_events, identity_evidence restart identity cascade`
    await sql`truncate table customer_access_links, customers restart identity cascade`
    await sql`truncate table reservations, reservation_groups, asset_type_day_holds restart identity cascade`

    const [{ id: seededTenantId }] = await sql<{ id: string }[]>`
      select id from tenants order by created_at limit 1
    `
    tenantId = seededTenantId as TenantId

    const [{ id: seededOperatorId }] = await sql<{ id: string }[]>`
      select id from operators order by created_at limit 1
    `
    operatorId = seededOperatorId

    const [{ id: groupId }] = await sql<{ id: number }[]>`
      insert into reservation_groups (tenant_id) values (${tenantId}) returning id
    `
    reservationGroupId = groupId
  })

  afterEach(async () => {
    await sql?.end()
  })

  it('has RLS enabled with no policies on all four tables', async () => {
    const rows = await sql<{ relname: string; relrowsecurity: boolean }[]>`
      select relname, relrowsecurity from pg_class
      where relname in ('customers', 'identity_evidence', 'identity_evidence_access_events', 'identity_verifications')
    `
    expect(rows).toHaveLength(4)
    expect(rows.every((r) => r.relrowsecurity)).toBe(true)

    const policyCount = await sql<{ count: string }[]>`
      select count(*)::text as count from pg_policies
      where tablename in ('customers', 'identity_evidence', 'identity_evidence_access_events', 'identity_verifications')
    `
    expect(policyCount[0]?.count).toBe('0')
  })

  it('enforces at most one Customer per ReservationGroup (D-14)', async () => {
    const repo = createPostgresCustomerIdentityComplianceRepository(sql)
    await repo.insertCustomer(tenantId, {
      reservationGroupId,
      name: 'Jana Nováková',
      email: 'jana@example.sk',
      phone: '+421900000000',
    })

    await expect(
      repo.insertCustomer(tenantId, {
        reservationGroupId,
        name: 'Iné Meno',
        email: 'ine@example.sk',
        phone: '+421900000001',
      }),
    ).rejects.toThrow()
  })

  it('rejects an IdentityEvidence row with no retention_deadline at the database level (FR-12, P7)', async () => {
    const repo = createPostgresCustomerIdentityComplianceRepository(sql)
    const customer = await repo.insertCustomer(tenantId, {
      reservationGroupId,
      name: 'Jana Nováková',
      email: 'jana@example.sk',
      phone: '+421900000000',
    })

    await expect(
      sql`insert into identity_evidence (tenant_id, customer_id, object_key) values (${tenantId}, ${customer.id}, 'obj-1')`,
    ).rejects.toThrow()
  })

  it('round-trips IdentityEvidence and an attributed access event (NFR-06)', async () => {
    const repo = createPostgresCustomerIdentityComplianceRepository(sql)
    const customer = await repo.insertCustomer(tenantId, {
      reservationGroupId,
      name: 'Jana Nováková',
      email: 'jana@example.sk',
      phone: '+421900000000',
    })
    const evidence = await repo.insertIdentityEvidence(tenantId, {
      customerId: customer.id,
      objectKey: 'obj-1',
      retentionDeadline: new Date(Date.now() + 86_400_000),
    })

    const accessEvent = await repo.insertIdentityEvidenceAccessEvent(tenantId, {
      identityEvidenceId: evidence.id,
      operatorId,
    })

    expect(accessEvent.operatorId).toBe(operatorId)
  })

  it('enforces reason iff rejected at the database level (FR-15)', async () => {
    const repo = createPostgresCustomerIdentityComplianceRepository(sql)
    const customer = await repo.insertCustomer(tenantId, {
      reservationGroupId,
      name: 'Jana Nováková',
      email: 'jana@example.sk',
      phone: '+421900000000',
    })
    const evidence = await repo.insertIdentityEvidence(tenantId, {
      customerId: customer.id,
      objectKey: 'obj-1',
      retentionDeadline: new Date(Date.now() + 86_400_000),
    })

    // rejected with no reason
    await expect(
      sql`
        insert into identity_verifications (tenant_id, customer_id, identity_evidence_id, operator_id, outcome)
        values (${tenantId}, ${customer.id}, ${evidence.id}, ${operatorId}, 'rejected')
      `,
    ).rejects.toThrow()

    // verified with a reason
    await expect(
      sql`
        insert into identity_verifications (
          tenant_id, customer_id, identity_evidence_id, operator_id, outcome, reason
        ) values (
          ${tenantId}, ${customer.id}, ${evidence.id}, ${operatorId}, 'verified', 'unnecessary reason'
        )
      `,
    ).rejects.toThrow()
  })

  it('round-trips IdentityVerification and FR-14\'s hasSuccessfulIdentityVerification query', async () => {
    const repo = createPostgresCustomerIdentityComplianceRepository(sql)
    const customer = await repo.insertCustomer(tenantId, {
      reservationGroupId,
      name: 'Jana Nováková',
      email: 'jana@example.sk',
      phone: '+421900000000',
    })
    const evidence = await repo.insertIdentityEvidence(tenantId, {
      customerId: customer.id,
      objectKey: 'obj-1',
      retentionDeadline: new Date(Date.now() + 86_400_000),
    })

    expect(await repo.hasSuccessfulIdentityVerification(tenantId, customer.id)).toBe(false)

    await repo.insertIdentityVerification(tenantId, {
      customerId: customer.id,
      identityEvidenceId: evidence.id,
      operatorId,
      outcome: 'rejected',
      reason: 'Blurry photo',
    })
    expect(await repo.hasSuccessfulIdentityVerification(tenantId, customer.id)).toBe(false)

    await repo.insertIdentityVerification(tenantId, {
      customerId: customer.id,
      identityEvidenceId: evidence.id,
      operatorId,
      outcome: 'verified',
      reason: null,
    })
    expect(await repo.hasSuccessfulIdentityVerification(tenantId, customer.id)).toBe(true)
  })

  it('has RLS enabled with no policies on customer_access_links', async () => {
    const rows = await sql<{ relrowsecurity: boolean }[]>`
      select relrowsecurity from pg_class where relname = 'customer_access_links'
    `
    expect(rows).toHaveLength(1)
    expect(rows[0]?.relrowsecurity).toBe(true)

    const policyCount = await sql<{ count: string }[]>`
      select count(*)::text as count from pg_policies where tablename = 'customer_access_links'
    `
    expect(policyCount[0]?.count).toBe('0')
  })

  it('enforces a unique token_hash at the database level', async () => {
    const repo = createPostgresCustomerIdentityComplianceRepository(sql)
    const customer = await repo.insertCustomer(tenantId, {
      reservationGroupId,
      name: 'Jana Nováková',
      email: 'jana@example.sk',
      phone: '+421900000000',
    })
    const expiresAt = new Date(Date.now() + 86_400_000)
    await repo.insertCustomerAccessLink(tenantId, { customerId: customer.id, tokenHash: 'same-hash', expiresAt })

    await expect(
      repo.insertCustomerAccessLink(tenantId, { customerId: customer.id, tokenHash: 'same-hash', expiresAt }),
    ).rejects.toThrow()
  })

  it('end-to-end: issue -> resolve -> revoke, against a real Postgres (D-23, FR-39)', async () => {
    const repo = createPostgresCustomerIdentityComplianceRepository(sql)
    const customer = await repo.insertCustomer(tenantId, {
      reservationGroupId,
      name: 'Jana Nováková',
      email: 'jana@example.sk',
      phone: '+421900000000',
    })

    const { token } = await issueCustomerAccessLink(repo, { tenantId, customerId: customer.id })
    const resolved = await resolveCustomerAccessLink(repo, { tenantId, token })
    expect(resolved?.customerId).toBe(customer.id)

    await revokeCustomerAccessLinksForCustomer(repo, { tenantId, customerId: customer.id })
    expect(await resolveCustomerAccessLink(repo, { tenantId, token })).toBeNull()
  })

  it('erases expired IdentityEvidence, records erasedAt, and excludes it from further candidate scans (FR-16, W10)', async () => {
    const repo = createPostgresCustomerIdentityComplianceRepository(sql)
    const gateway = createFakeIdentityEvidenceStorageGateway()
    const customer = await repo.insertCustomer(tenantId, {
      reservationGroupId,
      name: 'Jana Nováková',
      email: 'jana@example.sk',
      phone: '+421900000000',
    })
    await repo.insertIdentityEvidence(tenantId, {
      customerId: customer.id,
      objectKey: 'obj-expired',
      retentionDeadline: new Date('2026-01-01T00:00:00.000Z'),
    })

    const now = new Date('2026-02-01T00:00:00.000Z')
    const erased = await eraseExpiredIdentityEvidence({ repo, gateway }, { tenantId, now })

    expect(erased).toHaveLength(1)
    expect(erased[0]!.erasedAt).toEqual(now)
    expect(gateway.deletedObjectKeys).toEqual(['obj-expired'])

    const second = await eraseExpiredIdentityEvidence({ repo, gateway }, { tenantId, now })
    expect(second).toHaveLength(0)
  })

  it('re-anchors a Customer\'s IdentityEvidence deadline at Settlement once OQ #2 is set — currently refuses (D-36)', async () => {
    const repo = createPostgresCustomerIdentityComplianceRepository(sql)
    const customer = await repo.insertCustomer(tenantId, {
      reservationGroupId,
      name: 'Jana Nováková',
      email: 'jana@example.sk',
      phone: '+421900000000',
    })
    await repo.insertIdentityEvidence(tenantId, {
      customerId: customer.id,
      objectKey: 'obj-1',
      retentionDeadline: new Date(Date.now() + 86_400_000),
    })

    await expect(
      reanchorRetentionDeadlineForCustomer(repo, { tenantId, customerId: customer.id, settledAt: new Date() }),
    ).rejects.toThrow(RetentionWindowNotConfiguredError)
  })
})
