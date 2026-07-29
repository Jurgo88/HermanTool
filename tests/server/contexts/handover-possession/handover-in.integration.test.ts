// Integration tests for the HandoverIn & Settlement migration
// (supabase/migrations/20260730110000_handover_in_settlement.sql)
// against a real Postgres, mirroring
// tests/server/contexts/handover-possession/handover-out.integration.test.ts.
//
// Self-skips when NUXT_DATABASE_URL is not set, matching every other
// integration suite in this repo.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type postgres from 'postgres'
import { createDatabaseClient } from '../../../../server/utils/db'
import type { TenantId } from '../../../../server/contexts/_shared'
import { createPostgresAssetRegistryRepository } from '../../../../server/contexts/asset-registry/repository'
import {
  checkoutReservationGroup,
  confirmReservationGroup,
  recordTermsAcceptance,
} from '../../../../server/contexts/availability-reservation/reservation'
import { createPostgresAvailabilityReservationRepository } from '../../../../server/contexts/availability-reservation/repository'
import { createCustomer } from '../../../../server/contexts/customer-identity-compliance/customer'
import { createPostgresCustomerIdentityComplianceRepository } from '../../../../server/contexts/customer-identity-compliance/repository'
import { completeSettlement, markAssetReturnedToPool, performHandoverIn } from '../../../../server/contexts/handover-possession/handover-in'
import { performHandoverOut } from '../../../../server/contexts/handover-possession/handover-out'
import { createPostgresHandoverPossessionRepository } from '../../../../server/contexts/handover-possession/repository'
import { AssetNotYetReturnableError } from '../../../../server/contexts/handover-possession/types'
import { createFakeConditionReportStorageGateway } from './fake-conditions-gateway'

const databaseUrl = process.env.NUXT_DATABASE_URL ?? ''

describe.skipIf(!databaseUrl)('HandoverIn & Settlement migration (integration)', () => {
  let sql: postgres.Sql
  let tenantId: TenantId
  let operatorId: string
  let hammerTypeId: number

  beforeEach(async () => {
    sql = createDatabaseClient(databaseUrl)

    await sql`truncate table deposit_returned restart identity cascade`
    await sql`truncate table deposit_taken, condition_reports, rental_agreements restart identity cascade`
    await sql`truncate table identity_verifications restart identity cascade`
    await sql`truncate table identity_evidence_access_events, identity_evidence, customers restart identity cascade`
    await sql`truncate table scan_events restart identity cascade`
    await sql`truncate table reservations, reservation_groups, asset_type_day_holds restart identity cascade`
    await sql`truncate table asset_status_events, asset_tags, assets, asset_types restart identity cascade`

    const [{ id: seededTenantId }] = await sql<{ id: string }[]>`
      select id from tenants order by created_at limit 1
    `
    tenantId = seededTenantId as TenantId

    const [{ id: seededOperatorId }] = await sql<{ id: string }[]>`
      select id from operators order by created_at limit 1
    `
    operatorId = seededOperatorId

    const [{ id: hammerId }] = await sql<{ id: number }[]>`
      insert into asset_types (tenant_id) values (${tenantId}) returning id
    `
    hammerTypeId = hammerId
  })

  afterEach(async () => {
    await sql?.end()
  })

  it('has RLS enabled with no policies on deposit_returned', async () => {
    const rows = await sql<{ relrowsecurity: boolean }[]>`
      select relrowsecurity from pg_class where relname = 'deposit_returned'
    `
    expect(rows).toHaveLength(1)
    expect(rows[0]?.relrowsecurity).toBe(true)

    const policyCount = await sql<{ count: string }[]>`
      select count(*)::text as count from pg_policies where tablename = 'deposit_returned'
    `
    expect(policyCount[0]?.count).toBe('0')
  })

  it('rejects returned_to_pool_at without settlement_completed_at at the database level (D-09)', async () => {
    const assetRegistryRepo = createPostgresAssetRegistryRepository(sql)
    const asset = await assetRegistryRepo.insertAsset(tenantId, { assetTypeId: hammerTypeId, status: 'rentable', operatorId })

    const availabilityRepo = createPostgresAvailabilityReservationRepository(sql)
    const { reservations } = await checkoutReservationGroup(availabilityRepo, {
      tenantId,
      lines: [{ assetTypeId: hammerTypeId, period: { startDay: '2026-03-05', endDay: '2026-03-05' } }],
    })
    const identityRepo = createPostgresCustomerIdentityComplianceRepository(sql)
    const customer = await createCustomer(identityRepo, {
      tenantId,
      reservationGroupId: reservations[0]!.reservationGroupId,
      name: 'Jana Nováková',
      email: 'jana@example.sk',
      phone: '+421900000000',
    })
    const handoverRepo = createPostgresHandoverPossessionRepository(sql)
    const agreement = await handoverRepo.insertRentalAgreement(tenantId, {
      reservationId: reservations[0]!.id,
      customerId: customer.id,
      assetId: asset.id,
      operatorId,
      termsVersion: 'v1',
    })

    await expect(
      sql`update rental_agreements set returned_to_pool_at = now() where id = ${agreement.id}`,
    ).rejects.toThrow()
  })

  it('enforces at most one DepositReturned per RentalAgreement', async () => {
    const assetRegistryRepo = createPostgresAssetRegistryRepository(sql)
    const asset = await assetRegistryRepo.insertAsset(tenantId, { assetTypeId: hammerTypeId, status: 'rentable', operatorId })

    const availabilityRepo = createPostgresAvailabilityReservationRepository(sql)
    const { reservations } = await checkoutReservationGroup(availabilityRepo, {
      tenantId,
      lines: [{ assetTypeId: hammerTypeId, period: { startDay: '2026-03-05', endDay: '2026-03-05' } }],
    })
    const identityRepo = createPostgresCustomerIdentityComplianceRepository(sql)
    const customer = await createCustomer(identityRepo, {
      tenantId,
      reservationGroupId: reservations[0]!.reservationGroupId,
      name: 'Jana Nováková',
      email: 'jana@example.sk',
      phone: '+421900000000',
    })
    const handoverRepo = createPostgresHandoverPossessionRepository(sql)
    const agreement = await handoverRepo.insertRentalAgreement(tenantId, {
      reservationId: reservations[0]!.id,
      customerId: customer.id,
      assetId: asset.id,
      operatorId,
      termsVersion: 'v1',
    })
    await handoverRepo.insertDepositReturned(tenantId, {
      rentalAgreementId: agreement.id,
      amount: { amount: 5000, currency: 'EUR' },
      deductionReason: null,
      operatorId,
    })

    await expect(
      handoverRepo.insertDepositReturned(tenantId, {
        rentalAgreementId: agreement.id,
        amount: { amount: 5000, currency: 'EUR' },
        deductionReason: null,
        operatorId,
      }),
    ).rejects.toThrow()
  })

  it('end-to-end: HandoverOut -> HandoverIn -> Settlement -> pool return, respecting D-09', async () => {
    const assetRegistryRepo = createPostgresAssetRegistryRepository(sql)
    const asset = await assetRegistryRepo.insertAsset(tenantId, { assetTypeId: hammerTypeId, status: 'rentable', operatorId })
    await assetRegistryRepo.insertAssetTag(tenantId, { assetId: asset.id, tagCode: 'TAG-INT-HI', operatorId })

    const availabilityRepo = createPostgresAvailabilityReservationRepository(sql)
    const { group, reservations } = await checkoutReservationGroup(availabilityRepo, {
      tenantId,
      lines: [{ assetTypeId: hammerTypeId, period: { startDay: '2026-03-05', endDay: '2026-03-05' } }],
    })
    await recordTermsAcceptance(availabilityRepo, { tenantId, reservationGroupId: group.id, termsVersion: 'v1' })
    await confirmReservationGroup(availabilityRepo, { tenantId, reservationGroupId: group.id })

    const identityRepo = createPostgresCustomerIdentityComplianceRepository(sql)
    const customer = await createCustomer(identityRepo, {
      tenantId,
      reservationGroupId: group.id,
      name: 'Jana Nováková',
      email: 'jana@example.sk',
      phone: '+421900000000',
    })
    const evidence = await identityRepo.insertIdentityEvidence(tenantId, {
      customerId: customer.id,
      objectKey: 'obj-1',
      retentionDeadline: new Date(Date.now() + 86_400_000),
    })
    await identityRepo.insertIdentityVerification(tenantId, {
      customerId: customer.id,
      identityEvidenceId: evidence.id,
      operatorId,
      outcome: 'verified',
      reason: null,
    })

    const handoverRepo = createPostgresHandoverPossessionRepository(sql)
    const gateway = createFakeConditionReportStorageGateway()

    const { rentalAgreement: afterOut } = await performHandoverOut(
      { repo: handoverRepo, availabilityRepo, identityRepo, conditionsGateway: gateway },
      {
        tenantId,
        tagCode: 'TAG-INT-HI',
        reservationId: reservations[0]!.id,
        customerId: customer.id,
        operatorId,
        depositAmount: { amount: 5000, currency: 'EUR' },
        conditionPhotoContentTypes: ['image/jpeg'],
      },
    )

    const { rentalAgreement: afterIn } = await performHandoverIn(
      { repo: handoverRepo, conditionsGateway: gateway },
      { tenantId, tagCode: 'TAG-INT-HI', operatorId, conditionPhotoContentTypes: ['image/jpeg'] },
    )
    expect(afterIn.id).toBe(afterOut.id)

    const underInspection = await assetRegistryRepo.getAsset(tenantId, asset.id)
    expect(underInspection?.status).toBe('under_inspection')

    const { rentalAgreement: afterSettlement } = await completeSettlement(handoverRepo, {
      tenantId,
      rentalAgreementId: afterIn.id,
      operatorId,
      returnedAmount: { amount: 5000, currency: 'EUR' },
    })
    expect(afterSettlement.settlementCompletedAt).not.toBeNull()

    // D-09: still Tuesday (the RentalPeriod's own final day) — refused.
    await expect(
      markAssetReturnedToPool(
        { repo: handoverRepo, assetRegistryRepo, availabilityRepo },
        {
          tenantId,
          rentalAgreementId: afterSettlement.id,
          operatorId,
          today: new Date('2026-03-05T20:00:00.000Z'),
        },
      ),
    ).rejects.toThrow(AssetNotYetReturnableError)

    const stillUnderInspection = await assetRegistryRepo.getAsset(tenantId, asset.id)
    expect(stillUnderInspection?.status).toBe('under_inspection')

    // The day after — succeeds.
    const returned = await markAssetReturnedToPool(
      { repo: handoverRepo, assetRegistryRepo, availabilityRepo },
      {
        tenantId,
        rentalAgreementId: afterSettlement.id,
        operatorId,
        today: new Date('2026-03-06T09:00:00.000Z'),
      },
    )
    expect(returned.returnedToPoolAt).not.toBeNull()

    const rentableAgain = await assetRegistryRepo.getAsset(tenantId, asset.id)
    expect(rentableAgain?.status).toBe('rentable')
  })
})
