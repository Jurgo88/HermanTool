// Integration tests for the Delivery fee correction migration
// (supabase/migrations/20261121090000_delivery_fee_correction.sql, #237)
// against a real Postgres: the supersede columns and constraints, the
// one-original index under concurrency, the km re-price transaction, and
// the S-29 schedule's "attestation in force".
//
// Self-skips when NUXT_DATABASE_URL is not set, matching every other
// integration suite in this repo.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type postgres from 'postgres'
import { createDatabaseClient } from '../../../../server/utils/db'
import { createMonetaryAmount, type TenantId } from '../../../../server/contexts/_shared'
import {
  attestDeliveryFeePayment,
  priceOutsideZoneDelivery,
} from '../../../../server/contexts/logistics-delivery/delivery'
import { createPostgresLogisticsDeliveryRepository } from '../../../../server/contexts/logistics-delivery/repository'
import {
  DeliveryFeeAlreadyAttestedError,
  DeliveryFeeCorrectionError,
} from '../../../../server/contexts/logistics-delivery/types'
import { listScheduledLegs } from '../../../../server/utils/delivery-schedule'

const databaseUrl = process.env.NUXT_DATABASE_URL ?? ''

const settings = { flatFee: createMonetaryAmount(1500), perKmRate: createMonetaryAmount(80) }

describe.skipIf(!databaseUrl)('Delivery fee correction (integration, #237)', () => {
  let sql: postgres.Sql
  let tenantId: TenantId
  let operatorId: string
  let deliveryId: number

  beforeEach(async () => {
    sql = createDatabaseClient(databaseUrl)
    await sql`truncate table delivery_fee_payments, deliveries restart identity cascade`
    await sql`truncate table reservations, reservation_groups, asset_type_day_holds restart identity cascade`

    const [tenant] = await sql<{ id: string }[]>`select id from tenants order by created_at limit 1`
    tenantId = tenant!.id as TenantId
    const [operator] = await sql<
      { id: string }[]
    >`select id from operators order by created_at limit 1`
    operatorId = operator!.id

    const [assetType] = await sql<{ id: number }[]>`
      insert into asset_types (tenant_id) values (${tenantId}) returning id
    `
    const [group] = await sql<{ id: number }[]>`
      insert into reservation_groups (tenant_id) values (${tenantId}) returning id
    `
    await sql`
      insert into reservations (tenant_id, reservation_group_id, asset_type_id, start_day, end_day, state, pending_expires_at)
      values (${tenantId}, ${group!.id}, ${assetType!.id}, '2026-12-01', '2026-12-03', 'confirmed', now())
    `
    const [delivery] = await sql<{ id: number }[]>`
      insert into deliveries (tenant_id, reservation_group_id, leg, time_window, outside_zone, address)
      values (${tenantId}, ${group!.id}, 'delivery', 'morning', true, 'Senec, Nová 5')
      returning id
    `
    deliveryId = delivery!.id

    await priceOutsideZoneDelivery(createPostgresLogisticsDeliveryRepository(sql), {
      tenantId,
      deliveryId,
      distanceKm: 20,
      settings,
      operatorId,
    })
  })

  afterEach(async () => {
    await sql?.end()
  })

  it('stores a correction that names the row it supersedes, and refuses an unreasoned one', async () => {
    const repo = createPostgresLogisticsDeliveryRepository(sql)
    const original = await attestDeliveryFeePayment(repo, {
      tenantId,
      deliveryId,
      method: 'cash',
      operatorId,
    })
    const corrected = await attestDeliveryFeePayment(repo, {
      tenantId,
      deliveryId,
      method: 'qr',
      operatorId,
      correction: { supersedesId: original.id, reason: 'QR' },
    })
    expect(corrected).toMatchObject({
      supersedesId: original.id,
      correctionReason: 'QR',
      method: 'qr',
    })

    // The schema itself, not only the domain, ties a supersede to a reason.
    await expect(sql`
      insert into delivery_fee_payments (tenant_id, delivery_id, amount_cents, method, operator_id, supersedes_id)
      values (${tenantId}, ${deliveryId}, 3100, 'cash', ${operatorId}, ${corrected.id})
    `).rejects.toThrow()
  })

  it('lets only one of two concurrent first attestations land', async () => {
    const attempt = () =>
      attestDeliveryFeePayment(createPostgresLogisticsDeliveryRepository(sql), {
        tenantId,
        deliveryId,
        method: 'cash',
        operatorId,
      })
    const results = await Promise.allSettled([attempt(), attempt()])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
    expect(rejected.reason).toBeInstanceOf(DeliveryFeeAlreadyAttestedError)
    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count from delivery_fee_payments where delivery_id = ${deliveryId}
    `
    expect(count).toBe(1)
  })

  it('lets only one of two concurrent corrections of the same row land', async () => {
    const original = await attestDeliveryFeePayment(
      createPostgresLogisticsDeliveryRepository(sql),
      {
        tenantId,
        deliveryId,
        method: 'cash',
        operatorId,
      },
    )
    const correct = (method: 'qr' | 'card_terminal') =>
      attestDeliveryFeePayment(createPostgresLogisticsDeliveryRepository(sql), {
        tenantId,
        deliveryId,
        method,
        operatorId,
        correction: { supersedesId: original.id, reason: method },
      })
    const results = await Promise.allSettled([correct('qr'), correct('card_terminal')])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
    expect(rejected.reason).toBeInstanceOf(DeliveryFeeCorrectionError)
  })

  it('re-prices a corrected km and attests the new price in one transaction', async () => {
    const repo = createPostgresLogisticsDeliveryRepository(sql)
    const original = await attestDeliveryFeePayment(repo, {
      tenantId,
      deliveryId,
      method: 'cash',
      operatorId,
    })
    const corrected = await attestDeliveryFeePayment(repo, {
      tenantId,
      deliveryId,
      method: 'cash',
      operatorId,
      correction: { supersedesId: original.id, reason: 'Zlé km', distanceKm: 10 },
      settings,
    })
    expect(corrected.amount).toEqual(createMonetaryAmount(2300))
    expect(await repo.getDelivery(tenantId, deliveryId)).toMatchObject({
      distanceKm: 10,
      fee: createMonetaryAmount(2300),
    })
  })

  it('rolls the re-price back when the attestation fails', async () => {
    const repo = createPostgresLogisticsDeliveryRepository(sql)
    const original = await attestDeliveryFeePayment(repo, {
      tenantId,
      deliveryId,
      method: 'cash',
      operatorId,
    })
    await attestDeliveryFeePayment(repo, {
      tenantId,
      deliveryId,
      method: 'qr',
      operatorId,
      correction: { supersedesId: original.id, reason: 'QR' },
    })
    // A stale correction of the original: refused, and the km stays 20.
    await expect(
      attestDeliveryFeePayment(repo, {
        tenantId,
        deliveryId,
        method: 'cash',
        operatorId,
        correction: { supersedesId: original.id, reason: 'km', distanceKm: 3 },
        settings,
      }),
    ).rejects.toThrow(DeliveryFeeCorrectionError)
    expect(await repo.getDelivery(tenantId, deliveryId)).toMatchObject({ distanceKm: 20 })
  })

  it('shows the attestation in force on the S-29 schedule', async () => {
    const repo = createPostgresLogisticsDeliveryRepository(sql)
    const before = await listScheduledLegs(sql, {
      tenantId,
      fromDay: '2026-11-25',
      toDay: '2026-12-10',
    })
    expect(before).toHaveLength(1)
    expect(before[0]).toMatchObject({ feeAttested: false, feePayment: null })

    const original = await attestDeliveryFeePayment(repo, {
      tenantId,
      deliveryId,
      method: 'cash',
      operatorId,
    })
    const corrected = await attestDeliveryFeePayment(repo, {
      tenantId,
      deliveryId,
      method: 'qr',
      operatorId,
      correction: { supersedesId: original.id, reason: 'QR' },
    })

    const [leg] = await listScheduledLegs(sql, {
      tenantId,
      fromDay: '2026-11-25',
      toDay: '2026-12-10',
    })
    expect(leg).toMatchObject({
      feeAttested: true,
      feePayment: {
        id: corrected.id,
        method: 'qr',
        amount: createMonetaryAmount(3100),
        corrected: true,
      },
    })
  })
})
