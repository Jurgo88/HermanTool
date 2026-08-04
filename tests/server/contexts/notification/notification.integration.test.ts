// Integration tests for the Notification migration
// (supabase/migrations/20260731120000_notification_dispatches.sql)
// against a real Postgres, mirroring
// tests/server/contexts/customer-identity-compliance/customer-identity.integration.test.ts.
//
// Self-skips when NUXT_DATABASE_URL is not set, matching every other
// integration suite in this repo.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type postgres from 'postgres'
import { createDatabaseClient } from '../../../../server/utils/db'
import type { TenantId } from '../../../../server/contexts/_shared'
import { createPostgresCustomerIdentityComplianceRepository } from '../../../../server/contexts/customer-identity-compliance/repository'
import { dispatchReservationConfirmation } from '../../../../server/contexts/notification/notification'
import { createPostgresNotificationRepository } from '../../../../server/contexts/notification/repository'
import { createFakeNotificationGateway } from './fake-gateway'

const databaseUrl = process.env.NUXT_DATABASE_URL ?? ''

describe.skipIf(!databaseUrl)('Notification migration (integration)', () => {
  let sql: postgres.Sql
  let tenantId: TenantId
  let customerId: number

  beforeEach(async () => {
    sql = createDatabaseClient(databaseUrl)

    await sql`truncate table notification_dispatches restart identity cascade`
    await sql`truncate table reservations, reservation_groups, asset_type_day_holds restart identity cascade`
    await sql`truncate table customers restart identity cascade`

    const [{ id: seededTenantId }] = await sql<{ id: string }[]>`
      select id from tenants order by created_at limit 1
    `
    tenantId = seededTenantId as TenantId

    const [{ id: groupId }] = await sql<{ id: number }[]>`
      insert into reservation_groups (tenant_id) values (${tenantId}) returning id
    `
    const identityRepo = createPostgresCustomerIdentityComplianceRepository(sql)
    const customer = await identityRepo.insertCustomer(tenantId, {
      reservationGroupId: groupId,
      name: 'Jana Nováková',
      email: 'jana@example.sk',
      phone: '+421900000000',
    })
    customerId = customer.id
  })

  afterEach(async () => {
    await sql?.end()
  })

  it('has RLS enabled with no policies on notification_dispatches', async () => {
    const rows = await sql<{ relrowsecurity: boolean }[]>`
      select relrowsecurity from pg_class where relname = 'notification_dispatches'
    `
    expect(rows).toHaveLength(1)
    expect(rows[0]?.relrowsecurity).toBe(true)

    const policyCount = await sql<{ count: string }[]>`
      select count(*)::text as count from pg_policies where tablename = 'notification_dispatches'
    `
    expect(policyCount[0]?.count).toBe('0')
  })

  it('rejects an unrecognised kind at the database level', async () => {
    await expect(
      sql`
        insert into notification_dispatches (
          tenant_id, customer_id, kind, reference_id, to_address, subject, provider_message_id
        ) values (
          ${tenantId}, ${customerId}, 'campaign_blast', 1, 'jana@example.sk', 'Subject', 'msg-1'
        )
      `,
    ).rejects.toThrow()
  })

  it('enforces at most one dispatch per (tenant, kind, reference_id) at the database level', async () => {
    const repo = createPostgresNotificationRepository(sql)
    await repo.insertNotificationDispatch(tenantId, {
      customerId,
      kind: 'confirmation',
      referenceId: 1,
      to: 'jana@example.sk',
      subject: 'Your reservation is confirmed',
      providerMessageId: 'msg-1',
    })

    await expect(
      repo.insertNotificationDispatch(tenantId, {
        customerId,
        kind: 'confirmation',
        referenceId: 1,
        to: 'jana@example.sk',
        subject: 'Your reservation is confirmed',
        providerMessageId: 'msg-2',
      }),
    ).rejects.toThrow()
  })

  it('end-to-end: dispatchReservationConfirmation round-trips through a real Postgres repository', async () => {
    const repo = createPostgresNotificationRepository(sql)
    const gateway = createFakeNotificationGateway()

    const result = await dispatchReservationConfirmation(
      { repo, gateway },
      {
        tenantId,
        customerId,
        reservationGroupId: 1,
        to: 'jana@example.sk',
        customerName: 'Jana Nováková',
        lines: [{ assetTypeId: 1, startDay: '2026-03-05', endDay: '2026-03-07' }],
        accessLinkUrl: 'https://example.test/reservations/access/tok',
      },
    )
    expect(result).not.toBeNull()

    const second = await dispatchReservationConfirmation(
      { repo, gateway },
      {
        tenantId,
        customerId,
        reservationGroupId: 1,
        to: 'jana@example.sk',
        customerName: 'Jana Nováková',
        lines: [{ assetTypeId: 1, startDay: '2026-03-05', endDay: '2026-03-07' }],
        accessLinkUrl: 'https://example.test/reservations/access/tok',
      },
    )
    expect(second).toBeNull()
    expect(gateway.sentEmails).toHaveLength(1)
  })
})
