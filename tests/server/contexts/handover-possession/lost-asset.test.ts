import { beforeEach, describe, expect, it } from 'vitest'
import type { TenantId } from '../../../../server/contexts/_shared'
import {
  checkoutReservationGroup,
  confirmReservationGroup,
  recordTermsAcceptance,
} from '../../../../server/contexts/availability-reservation'
import { createCustomer } from '../../../../server/contexts/customer-identity-compliance'
import { performHandoverOut } from '../../../../server/contexts/handover-possession/handover-out'
import { performHandoverIn } from '../../../../server/contexts/handover-possession/handover-in'
import { declareAssetLost } from '../../../../server/contexts/handover-possession/lost-asset'
import {
  LostAssetReasonRequiredError,
  RentalAgreementAlreadyDeclaredLostError,
  RentalAgreementAlreadyHandedInError,
  RentalAgreementNotFoundError,
} from '../../../../server/contexts/handover-possession/types'
import { createFakeAssetRegistryRepository, type FakeAssetRegistryRepository } from '../asset-registry/fake-repository'
import {
  createFakeAvailabilityReservationRepository,
  type FakeAvailabilityReservationRepository,
} from '../availability-reservation/fake-repository'
import {
  createFakeCustomerIdentityComplianceRepository,
  type FakeCustomerIdentityComplianceRepository,
} from '../customer-identity-compliance/fake-repository'
import { createFakeConditionReportStorageGateway, type FakeConditionReportStorageGateway } from './fake-conditions-gateway'
import { createFakeHandoverPossessionRepository, type FakeHandoverPossessionRepository } from './fake-repository'

const tenantA = '11111111-1111-1111-1111-111111111111' as TenantId
const operatorId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const HAMMER = 1

describe('declareAssetLost (D-17, FR-31, FR-36, W6)', () => {
  let assetRegistry: FakeAssetRegistryRepository
  let availabilityRepo: FakeAvailabilityReservationRepository
  let identityRepo: FakeCustomerIdentityComplianceRepository
  let handoverRepo: FakeHandoverPossessionRepository
  let gateway: FakeConditionReportStorageGateway

  let tagCode: string
  let assetId: number
  const depositAmount = { amount: 5000, currency: 'EUR' as const }

  beforeEach(async () => {
    assetRegistry = createFakeAssetRegistryRepository()
    assetRegistry.seedAssetType(tenantA, HAMMER)
    availabilityRepo = createFakeAvailabilityReservationRepository()
    availabilityRepo.seedCapacity(HAMMER, 5)
    identityRepo = createFakeCustomerIdentityComplianceRepository()
    handoverRepo = createFakeHandoverPossessionRepository(assetRegistry)
    gateway = createFakeConditionReportStorageGateway()

    const { group, reservations } = await checkoutReservationGroup(availabilityRepo, {
      tenantId: tenantA,
      lines: [{ assetTypeId: HAMMER, period: { startDay: '2026-03-05', endDay: '2026-03-07' } }],
    })
    await recordTermsAcceptance(availabilityRepo, { tenantId: tenantA, reservationGroupId: group.id, termsVersion: 'v1' })
    await confirmReservationGroup(availabilityRepo, { tenantId: tenantA, reservationGroupId: group.id })

    const customer = await createCustomer(identityRepo, {
      tenantId: tenantA,
      reservationGroupId: group.id,
      name: 'Jana Nováková',
      email: 'jana@example.sk',
      phone: '+421900000000',
    })
    const evidence = await identityRepo.insertIdentityEvidence(tenantA, {
      customerId: customer.id,
      objectKey: 'obj-1',
      retentionDeadline: new Date(Date.now() + 86_400_000),
    })
    await identityRepo.insertIdentityVerification(tenantA, {
      customerId: customer.id,
      identityEvidenceId: evidence.id,
      operatorId,
      outcome: 'verified',
      reason: null,
    })

    tagCode = 'TAG-1'
    const asset = await assetRegistry.insertAsset(tenantA, { assetTypeId: HAMMER, status: 'rentable', operatorId })
    assetId = asset.id
    await assetRegistry.insertAssetTag(tenantA, { assetId: asset.id, tagCode, operatorId })

    await performHandoverOut(
      { repo: handoverRepo, availabilityRepo, identityRepo, conditionsGateway: gateway },
      {
        tenantId: tenantA,
        tagCode,
        reservationId: reservations[0]!.id,
        customerId: customer.id,
        operatorId,
        depositAmount,
        conditionPhotoContentTypes: ['image/jpeg'],
      },
    )
  })

  it('records the declaration with reason and attesting Operator, and moves the Asset to Retired (AssetDeclaredLost)', async () => {
    const openAgreement = await handoverRepo.getOpenRentalAgreementForAsset(tenantA, assetId)

    const result = await declareAssetLost(
      { repo: handoverRepo },
      { tenantId: tenantA, rentalAgreementId: openAgreement!.id, operatorId, reason: 'Customer unreachable, Asset not returned' },
    )

    expect(result.declaredLostAt).not.toBeNull()
    expect(result.declaredLostReason).toBe('Customer unreachable, Asset not returned')
    expect(result.declaredLostOperatorId).toBe(operatorId)

    const asset = await assetRegistry.getAsset(tenantA, assetId)
    expect(asset?.status).toBe('retired')
    expect(asset?.statusChangeReason).toBe('Customer unreachable, Asset not returned')
  })

  it('refuses a declaration with no reason (FR-31)', async () => {
    const openAgreement = await handoverRepo.getOpenRentalAgreementForAsset(tenantA, assetId)

    await expect(
      declareAssetLost({ repo: handoverRepo }, { tenantId: tenantA, rentalAgreementId: openAgreement!.id, operatorId, reason: '   ' }),
    ).rejects.toThrow(LostAssetReasonRequiredError)

    const asset = await assetRegistry.getAsset(tenantA, assetId)
    expect(asset?.status).toBe('in_possession') // unchanged
  })

  it('refuses when the RentalAgreement does not exist', async () => {
    await expect(
      declareAssetLost({ repo: handoverRepo }, { tenantId: tenantA, rentalAgreementId: 999_999, operatorId, reason: 'Lost' }),
    ).rejects.toThrow(RentalAgreementNotFoundError)
  })

  it('refuses when the Asset has already been handed back — nothing left to declare lost', async () => {
    const { rentalAgreement } = await performHandoverIn(
      { repo: handoverRepo, conditionsGateway: gateway },
      { tenantId: tenantA, tagCode, operatorId, conditionPhotoContentTypes: ['image/jpeg'] },
    )

    await expect(
      declareAssetLost({ repo: handoverRepo }, { tenantId: tenantA, rentalAgreementId: rentalAgreement.id, operatorId, reason: 'Lost' }),
    ).rejects.toThrow(RentalAgreementAlreadyHandedInError)
  })

  it('refuses declaring the same RentalAgreement lost twice (idempotency)', async () => {
    const openAgreement = await handoverRepo.getOpenRentalAgreementForAsset(tenantA, assetId)
    await declareAssetLost(
      { repo: handoverRepo },
      { tenantId: tenantA, rentalAgreementId: openAgreement!.id, operatorId, reason: 'Lost' },
    )

    await expect(
      declareAssetLost(
        { repo: handoverRepo },
        { tenantId: tenantA, rentalAgreementId: openAgreement!.id, operatorId, reason: 'Lost again' },
      ),
    ).rejects.toThrow(RentalAgreementAlreadyDeclaredLostError)
  })

  it('never surfaces a declared-Lost Agreement as Overdue again (D-17: the view has nothing left to show)', async () => {
    const openAgreement = await handoverRepo.getOpenRentalAgreementForAsset(tenantA, assetId)
    await declareAssetLost(
      { repo: handoverRepo },
      { tenantId: tenantA, rentalAgreementId: openAgreement!.id, operatorId, reason: 'Lost' },
    )

    const { listOverdue } = await import('../../../../server/utils/overdue-noshow-views')
    const overdue = await listOverdue(
      { availabilityRepo, handoverRepo, assetRegistryRepo: assetRegistry },
      { tenantId: tenantA, today: '2026-03-10' },
    )
    expect(overdue).toHaveLength(0)
  })
})
