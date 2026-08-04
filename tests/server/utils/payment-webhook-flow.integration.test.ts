// Integration test for the IR-11 concurrency fix
// (server/utils/payment-webhook-flow.ts) against a real Postgres, in the
// style of reservation.integration.test.ts's OQ #23 proof: two
// genuinely concurrent webhook deliveries for the SAME Payment, forced
// to interleave via a test-only hook rather than relying on
// network-timing luck.
//
// Self-skips when NUXT_DATABASE_URL is not set, matching every other
// integration suite in this repo.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type postgres from 'postgres'
import { createDatabaseClient } from '../../../server/utils/db'
import type { TenantId } from '../../../server/contexts/_shared'
import { createPostgresAvailabilityReservationRepository } from '../../../server/contexts/availability-reservation/repository'
import { checkoutReservationGroup } from '../../../server/contexts/availability-reservation/reservation'
import { createPostgresPaymentsRepository } from '../../../server/contexts/payments/repository'
import { applyProviderWebhookEvent } from '../../../server/utils/payment-webhook-flow'
import { createFakePaymentGateway, type FakePaymentGateway } from '../contexts/payments/fake-gateway'

const databaseUrl = process.env.NUXT_DATABASE_URL ?? ''

describe.skipIf(!databaseUrl)('applyProviderWebhookEvent concurrency (IR-11, integration)', () => {
  let sql: postgres.Sql
  let tenantId: TenantId
  let hammerTypeId: number

  async function seedRentableAssets(assetTypeId: number, count: number): Promise<void> {
    const [{ id: operatorId }] = await sql<{ id: string }[]>`select id from operators order by created_at limit 1`
    for (let i = 0; i < count; i++) {
      await sql`
        insert into assets (
          tenant_id, asset_type_id, status, registered_by_operator_id, status_changed_by_operator_id
        ) values (${tenantId}, ${assetTypeId}, 'rentable', ${operatorId}, ${operatorId})
      `
    }
  }

  beforeEach(async () => {
    sql = createDatabaseClient(databaseUrl)

    await sql`truncate table payments restart identity cascade`
    await sql`truncate table reservations, reservation_groups, asset_type_day_holds restart identity cascade`
    await sql`truncate table asset_status_events, asset_tags, assets, asset_types restart identity cascade`

    const [{ id: seededTenantId }] = await sql<{ id: string }[]>`
      select id from tenants order by created_at limit 1
    `
    tenantId = seededTenantId as TenantId

    const [{ id: hammerId }] = await sql<{ id: number }[]>`
      insert into asset_types (tenant_id) values (${tenantId}) returning id
    `
    hammerTypeId = hammerId
  })

  afterEach(async () => {
    await sql?.end()
  })

  it('two concurrent deliveries of the same webhook event: exactly one confirms, the other is already_processed', async () => {
    await seedRentableAssets(hammerTypeId, 1)
    const day = '2026-03-05'

    const availRepo = createPostgresAvailabilityReservationRepository(sql)
    const { group, reservations } = await checkoutReservationGroup(availRepo, {
      tenantId,
      lines: [{ assetTypeId: hammerTypeId, period: { startDay: day, endDay: day } }],
    })

    const paymentsRepo = createPostgresPaymentsRepository(sql)
    const payment = await paymentsRepo.insertPayment(tenantId, {
      reservationGroupId: group.id,
      amount: { amount: 1000, currency: 'EUR' },
      providerReference: 'sess_concurrent',
    })

    let unblockA!: () => void
    const aGate = new Promise<void>((resolve) => {
      unblockA = resolve
    })

    const sqlA = createDatabaseClient(databaseUrl)
    const sqlB = createDatabaseClient(databaseUrl)
    const gatewayA: FakePaymentGateway = createFakePaymentGateway()
    const gatewayB: FakePaymentGateway = createFakePaymentGateway()
    const depsA = {
      tenantId,
      paymentsRepo: createPostgresPaymentsRepository(sqlA),
      availabilityRepo: createPostgresAvailabilityReservationRepository(sqlA),
      gateway: gatewayA,
    }
    const depsB = {
      tenantId,
      paymentsRepo: createPostgresPaymentsRepository(sqlB),
      availabilityRepo: createPostgresAvailabilityReservationRepository(sqlB),
      gateway: gatewayB,
    }
    const event = {
      type: 'checkout_completed' as const,
      providerReference: payment.providerReference,
      providerPaymentReference: 'pi_concurrent',
    }

    try {
      const attemptA = applyProviderWebhookEvent(depsA, event, {
        // Pause here — after A has read the Payment as 'pending', before
        // its atomic transition — until B has run to completion.
        afterPaymentRead: () => aGate,
      })

      // Give A's first DB round trip a chance to actually reach the hook
      // and start waiting before B starts, so the two are provably
      // interleaved rather than B simply winning a race that never truly
      // overlapped (same reasoning as OQ #23's own test).
      await new Promise((resolve) => setTimeout(resolve, 50))

      const resultB = await applyProviderWebhookEvent(depsB, event)
      expect(resultB.outcome).toBe('confirmed')

      unblockA()
      const resultA = await attemptA

      // A read the row before B's transition landed, but A's OWN
      // transition attempt runs after B's has already committed — the
      // guard in applyPaymentSucceeded catches this: already_processed,
      // not a second confirmReservationGroup call.
      expect(resultA.outcome).toBe('already_processed')

      // Never both: the Payment ends up 'succeeded' exactly once, and
      // confirmReservationGroup's effect (the Reservation moving to
      // 'confirmed') happened exactly once, not twice.
      const finalPayment = await paymentsRepo.getPayment(tenantId, payment.id)
      expect(finalPayment?.status).toBe('succeeded')

      const finalReservation = await availRepo.getReservation(tenantId, reservations[0]!.id)
      expect(finalReservation?.state).toBe('confirmed')
    } finally {
      await sqlA.end()
      await sqlB.end()
    }
  })
})
