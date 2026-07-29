// Integration tests for the HandoverOut workflow migration
// (supabase/migrations/20260730100000_handover_out_workflow.sql) against
// a real Postgres, mirroring
// tests/server/contexts/availability-reservation/reservation.integration.test.ts.
//
// Self-skips when NUXT_DATABASE_URL is not set, matching every other
// integration suite in this repo.
//
// Asset Registry rows are seeded BEFORE checkoutReservationGroup in every
// test here, not after: D-08's strict no-overbooking invariant means
// checkout itself refuses when an AssetType has zero Rentable capacity,
// regardless of how the real physical W1->W4 sequence reads (reserve
// first, an Asset is only chosen at the counter later, D-04) — the
// SYSTEM still needs at least one Rentable unit to exist at reservation
// time for the day to be reservable at all.
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
import { performHandoverOut } from '../../../../server/contexts/handover-possession/handover-out'
import { createPostgresHandoverPossessionRepository } from '../../../../server/contexts/handover-possession/repository'
import { AssetTypeMismatchError } from '../../../../server/contexts/handover-possession/types'
import { createFakeConditionReportStorageGateway } from './fake-conditions-gateway'

const databaseUrl = process.env.NUXT_DATABASE_URL ?? ''

describe.skipIf(!databaseUrl)('HandoverOut workflow migration (integration)', () => {
  let sql: postgres.Sql
  let tenantId: TenantId
  let operatorId: string
  let hammerTypeId: number
  let scaffoldTypeId: number

  beforeEach(async () => {
    sql = createDatabaseClient(databaseUrl)

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
    const [{ id: scaffoldId }] = await sql<{ id: number }[]>`
      insert into asset_types (tenant_id) values (${tenantId}) returning id
    `
    scaffoldTypeId = scaffoldId
  })

  afterEach(async () => {
    await sql?.end()
  })

  it('has RLS enabled with no policies on all three new tables', async () => {
    const rows = await sql<{ relname: string; relrowsecurity: boolean }[]>`
      select relname, relrowsecurity from pg_class
      where relname in ('rental_agreements', 'condition_reports', 'deposit_taken')
    `
    expect(rows).toHaveLength(3)
    expect(rows.every((r) => r.relrowsecurity)).toBe(true)

    const policyCount = await sql<{ count: string }[]>`
      select count(*)::text as count from pg_policies
      where tablename in ('rental_agreements', 'condition_reports', 'deposit_taken')
    `
    expect(policyCount[0]?.count).toBe('0')
  })

  it('rejects a ConditionReport with an empty photo array (FR-19)', async () => {
    const assetRegistryRepo = createPostgresAssetRegistryRepository(sql)
    const asset = await assetRegistryRepo.insertAsset(tenantId, { assetTypeId: hammerTypeId, status: 'rentable', operatorId })

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

    const handoverRepo = createPostgresHandoverPossessionRepository(sql)
    const agreement = await handoverRepo.insertRentalAgreement(tenantId, {
      reservationId: reservations[0]!.id,
      customerId: customer.id,
      assetId: asset.id,
      operatorId,
      termsVersion: 'v1',
    })

    await expect(
      sql`
        insert into condition_reports (tenant_id, rental_agreement_id, stage, photo_object_keys, operator_id)
        values (${tenantId}, ${agreement.id}, 'handover_out', '{}', ${operatorId})
      `,
    ).rejects.toThrow()
  })

  it('enforces at most one RentalAgreement per Reservation (FR-22)', async () => {
    const assetRegistryRepo = createPostgresAssetRegistryRepository(sql)
    const assetA = await assetRegistryRepo.insertAsset(tenantId, { assetTypeId: hammerTypeId, status: 'rentable', operatorId })
    const assetB = await assetRegistryRepo.insertAsset(tenantId, { assetTypeId: hammerTypeId, status: 'rentable', operatorId })

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
    await handoverRepo.insertRentalAgreement(tenantId, {
      reservationId: reservations[0]!.id,
      customerId: customer.id,
      assetId: assetA.id,
      operatorId,
      termsVersion: 'v1',
    })

    await expect(
      handoverRepo.insertRentalAgreement(tenantId, {
        reservationId: reservations[0]!.id,
        customerId: customer.id,
        assetId: assetB.id,
        operatorId,
        termsVersion: 'v1',
      }),
    ).rejects.toThrow()
  })

  it('end-to-end: performHandoverOut opens Possession atomically (D-04, D-05, W4)', async () => {
    const assetRegistryRepo = createPostgresAssetRegistryRepository(sql)
    const asset = await assetRegistryRepo.insertAsset(tenantId, { assetTypeId: hammerTypeId, status: 'rentable', operatorId })
    await assetRegistryRepo.insertAssetTag(tenantId, { assetId: asset.id, tagCode: 'TAG-INT-1', operatorId })

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

    const result = await performHandoverOut(
      { repo: handoverRepo, availabilityRepo, identityRepo, conditionsGateway: gateway },
      {
        tenantId,
        tagCode: 'TAG-INT-1',
        reservationId: reservations[0]!.id,
        customerId: customer.id,
        operatorId,
        depositAmount: { amount: 5000, currency: 'EUR' },
        conditionPhotoContentTypes: ['image/jpeg'],
      },
    )

    expect(result.rentalAgreement.handoverInAt).toBeNull()

    const updatedAsset = await assetRegistryRepo.getAsset(tenantId, asset.id)
    expect(updatedAsset?.status).toBe('in_possession')

    // Reservation itself is untouched — Possession and Reservation are
    // separate clocks (D-18: no Fulfilled state, ever).
    const reservation = await availabilityRepo.getReservation(tenantId, reservations[0]!.id)
    expect(reservation?.state).toBe('confirmed')
  })

  it('rolls back the whole transaction when the scanned Asset does not match the Reservation\'s AssetType (FR-18)', async () => {
    const assetRegistryRepo = createPostgresAssetRegistryRepository(sql)
    // A Rentable hammer purely for checkout capacity — never scanned.
    await assetRegistryRepo.insertAsset(tenantId, { assetTypeId: hammerTypeId, status: 'rentable', operatorId })
    // The Asset actually scanned — wrong AssetType on purpose.
    const wrongAsset = await assetRegistryRepo.insertAsset(tenantId, {
      assetTypeId: scaffoldTypeId,
      status: 'rentable',
      operatorId,
    })
    await assetRegistryRepo.insertAssetTag(tenantId, { assetId: wrongAsset.id, tagCode: 'TAG-INT-WRONG', operatorId })

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

    await expect(
      performHandoverOut(
        { repo: handoverRepo, availabilityRepo, identityRepo, conditionsGateway: gateway },
        {
          tenantId,
          tagCode: 'TAG-INT-WRONG',
          reservationId: reservations[0]!.id,
          customerId: customer.id,
          operatorId,
          depositAmount: { amount: 5000, currency: 'EUR' },
          conditionPhotoContentTypes: ['image/jpeg'],
        },
      ),
    ).rejects.toThrow(AssetTypeMismatchError)

    // Nothing left behind: no RentalAgreement, and the Asset's status is
    // untouched — the ScanEvent recorded inside the same transaction
    // rolled back along with everything else.
    const rows = await sql<{ count: string }[]>`select count(*)::text as count from rental_agreements`
    expect(rows[0]?.count).toBe('0')
    const scanRows = await sql<{ count: string }[]>`select count(*)::text as count from scan_events`
    expect(scanRows[0]?.count).toBe('0')
    const stillRentable = await assetRegistryRepo.getAsset(tenantId, wrongAsset.id)
    expect(stillRentable?.status).toBe('rentable')
  })
})
