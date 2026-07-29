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
import { createPostgresCustomerIdentityComplianceRepository } from '../../../../server/contexts/customer-identity-compliance/repository'

const databaseUrl = process.env.NUXT_DATABASE_URL ?? ''

describe.skipIf(!databaseUrl)('Customer Identity & Compliance migration (integration)', () => {
  let sql: postgres.Sql
  let tenantId: TenantId
  let operatorId: string
  let reservationGroupId: number

  beforeEach(async () => {
    sql = createDatabaseClient(databaseUrl)

    await sql`truncate table identity_evidence_access_events, identity_evidence, customers restart identity cascade`
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

  it('has RLS enabled with no policies on all three new tables', async () => {
    const rows = await sql<{ relname: string; relrowsecurity: boolean }[]>`
      select relname, relrowsecurity from pg_class
      where relname in ('customers', 'identity_evidence', 'identity_evidence_access_events')
    `
    expect(rows).toHaveLength(3)
    expect(rows.every((r) => r.relrowsecurity)).toBe(true)

    const policyCount = await sql<{ count: string }[]>`
      select count(*)::text as count from pg_policies
      where tablename in ('customers', 'identity_evidence', 'identity_evidence_access_events')
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
})
