// Integration tests for LostAsset declaration
// (supabase/migrations/20260731090000_lost_asset_declaration.sql)
// against a real Postgres, mirroring
// tests/server/contexts/handover-possession/handover-in.integration.test.ts.
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
import { performHandoverOut } from '../../../../server/contexts/handover-possession/handover-out'
import { declareAssetLost } from '../../../../server/contexts/handover-possession/lost-asset'
import { createPostgresHandoverPossessionRepository } from '../../../../server/contexts/handover-possession/repository'
import { RentalAgreementAlreadyDeclaredLostError } from '../../../../server/contexts/handover-possession/types'
import { createFakeConditionReportStorageGateway } from './fake-conditions-gateway'

const databaseUrl = process.env.NUXT_DATABASE_URL ?? ''

describe.skipIf(!databaseUrl)('LostAsset declaration migration (integration)', () => {
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

  it('end-to-end: HandoverOut -> declareAssetLost moves the Asset to Retired atomically with the RentalAgreement (D-17, FR-31, FR-36)', async () => {
    const assetRegistryRepo = createPostgresAssetRegistryRepository(sql)
    const asset = await assetRegistryRepo.insertAsset(tenantId, { assetTypeId: hammerTypeId, status: 'rentable', operatorId })
    await assetRegistryRepo.insertAssetTag(tenantId, { assetId: asset.id, tagCode: 'TAG-INT-LOST', operatorId })

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

    const { rentalAgreement } = await performHandoverOut(
      { repo: handoverRepo, availabilityRepo, identityRepo, conditionsGateway: gateway },
      {
        tenantId,
        tagCode: 'TAG-INT-LOST',
        reservationId: reservations[0]!.id,
        customerId: customer.id,
        operatorId,
        depositAmount: { amount: 5000, currency: 'EUR' },
        conditionPhotoContentTypes: ['image/jpeg'],
      },
    )

    const declared = await declareAssetLost(
      { repo: handoverRepo },
      { tenantId, rentalAgreementId: rentalAgreement.id, operatorId, reason: 'Customer unreachable after Overdue' },
    )
    expect(declared.declaredLostAt).not.toBeNull()
    expect(declared.declaredLostReason).toBe('Customer unreachable after Overdue')
    expect(declared.declaredLostOperatorId).toBe(operatorId)

    const retired = await assetRegistryRepo.getAsset(tenantId, asset.id)
    expect(retired?.status).toBe('retired')

    await expect(
      declareAssetLost(
        { repo: handoverRepo },
        { tenantId, rentalAgreementId: rentalAgreement.id, operatorId, reason: 'Second attempt' },
      ),
    ).rejects.toThrow(RentalAgreementAlreadyDeclaredLostError)
  })
})
