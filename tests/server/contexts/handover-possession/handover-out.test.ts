import { beforeEach, describe, expect, it } from 'vitest'
import type { TenantId } from '../../../../server/contexts/_shared'
import {
  checkoutReservationGroup,
  confirmReservationGroup,
  recordTermsAcceptance,
} from '../../../../server/contexts/availability-reservation'
import { createCustomer } from '../../../../server/contexts/customer-identity-compliance'
import { performHandoverOut } from '../../../../server/contexts/handover-possession/handover-out'
import {
  AssetTypeMismatchError,
  CustomerReservationMismatchError,
  EmptyConditionReportError,
  IdentityVerificationRequiredError,
  ReservationNotConfirmedError,
  UnexpectedScanResolutionError,
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
const SCAFFOLD = 2

describe('performHandoverOut', () => {
  let assetRegistry: FakeAssetRegistryRepository
  let availabilityRepo: FakeAvailabilityReservationRepository
  let identityRepo: FakeCustomerIdentityComplianceRepository
  let handoverRepo: FakeHandoverPossessionRepository
  let gateway: FakeConditionReportStorageGateway

  let reservationId: number
  let customerId: number
  let tagCode: string

  beforeEach(async () => {
    assetRegistry = createFakeAssetRegistryRepository()
    assetRegistry.seedAssetType(tenantA, HAMMER)
    assetRegistry.seedAssetType(tenantA, SCAFFOLD)
    availabilityRepo = createFakeAvailabilityReservationRepository()
    availabilityRepo.seedCapacity(HAMMER, 5)
    availabilityRepo.seedCapacity(SCAFFOLD, 5)
    identityRepo = createFakeCustomerIdentityComplianceRepository()
    handoverRepo = createFakeHandoverPossessionRepository(assetRegistry)
    gateway = createFakeConditionReportStorageGateway()

    const { group, reservations } = await checkoutReservationGroup(availabilityRepo, {
      tenantId: tenantA,
      lines: [{ assetTypeId: HAMMER, period: { startDay: '2026-03-05', endDay: '2026-03-07' } }],
    })
    await recordTermsAcceptance(availabilityRepo, { tenantId: tenantA, reservationGroupId: group.id, termsVersion: 'v1' })
    await confirmReservationGroup(availabilityRepo, { tenantId: tenantA, reservationGroupId: group.id })
    reservationId = reservations[0]!.id

    const customer = await createCustomer(identityRepo, {
      tenantId: tenantA,
      reservationGroupId: group.id,
      name: 'Jana Nováková',
      email: 'jana@example.sk',
      phone: '+421900000000',
    })
    customerId = customer.id

    const evidence = await identityRepo.insertIdentityEvidence(tenantA, {
      customerId,
      objectKey: 'obj-1',
      retentionDeadline: new Date(Date.now() + 86_400_000),
    })
    await identityRepo.insertIdentityVerification(tenantA, {
      customerId,
      identityEvidenceId: evidence.id,
      operatorId,
      outcome: 'verified',
      reason: null,
    })

    tagCode = 'TAG-1'
    const asset = await assetRegistry.insertAsset(tenantA, { assetTypeId: HAMMER, status: 'rentable', operatorId })
    await assetRegistry.insertAssetTag(tenantA, { assetId: asset.id, tagCode, operatorId })
  })

  function deps() {
    return { repo: handoverRepo, availabilityRepo, identityRepo, conditionsGateway: gateway }
  }

  const depositAmount = { amount: 5000, currency: 'EUR' as const }

  it('creates a RentalAgreement, ConditionReport, and DepositTaken, and opens Possession (D-04, D-05, FR-19, FR-21, FR-22, W4)', async () => {
    const result = await performHandoverOut(deps(), {
      tenantId: tenantA,
      tagCode,
      reservationId,
      customerId,
      operatorId,
      depositAmount,
      conditionPhotoContentTypes: ['image/jpeg', 'image/jpeg'],
    })

    expect(result.rentalAgreement.reservationId).toBe(reservationId)
    expect(result.rentalAgreement.customerId).toBe(customerId)
    expect(result.rentalAgreement.termsVersion).toBe('v1')
    expect(result.rentalAgreement.handoverInAt).toBeNull()

    expect(result.conditionReport.stage).toBe('handover_out')
    expect(result.conditionReport.photoObjectKeys).toHaveLength(2)

    expect(result.depositTaken.amount).toEqual(depositAmount)

    expect(result.conditionPhotoUploadUrls).toHaveLength(2)
    expect(gateway.uploadUrlCalls).toHaveLength(2)

    const asset = await assetRegistry.getAsset(tenantA, result.rentalAgreement.assetId)
    expect(asset?.status).toBe('in_possession')
  })

  it('refuses when the Reservation is not Confirmed', async () => {
    const { group, reservations } = await checkoutReservationGroup(availabilityRepo, {
      tenantId: tenantA,
      lines: [{ assetTypeId: HAMMER, period: { startDay: '2026-04-01', endDay: '2026-04-02' } }],
    })
    const pendingReservationId = reservations[0]!.id
    // No recordTermsAcceptance / confirmReservationGroup — stays Pending.
    void group

    await expect(
      performHandoverOut(deps(), {
        tenantId: tenantA,
        tagCode,
        reservationId: pendingReservationId,
        customerId,
        operatorId,
        depositAmount,
        conditionPhotoContentTypes: ['image/jpeg'],
      }),
    ).rejects.toThrow(ReservationNotConfirmedError)
  })

  it('refuses when the Customer does not belong to the Reservation\'s group', async () => {
    const { group: otherGroup } = await checkoutReservationGroup(availabilityRepo, {
      tenantId: tenantA,
      lines: [{ assetTypeId: HAMMER, period: { startDay: '2026-05-01', endDay: '2026-05-02' } }],
    })
    const otherCustomer = await createCustomer(identityRepo, {
      tenantId: tenantA,
      reservationGroupId: otherGroup.id,
      name: 'Peter Horváth',
      email: 'peter@example.sk',
      phone: '+421900000001',
    })

    await expect(
      performHandoverOut(deps(), {
        tenantId: tenantA,
        tagCode,
        reservationId,
        customerId: otherCustomer.id,
        operatorId,
        depositAmount,
        conditionPhotoContentTypes: ['image/jpeg'],
      }),
    ).rejects.toThrow(CustomerReservationMismatchError)
  })

  it('refuses without a successful IdentityVerification (FR-14)', async () => {
    const { group, reservations } = await checkoutReservationGroup(availabilityRepo, {
      tenantId: tenantA,
      lines: [{ assetTypeId: HAMMER, period: { startDay: '2026-06-01', endDay: '2026-06-02' } }],
    })
    await recordTermsAcceptance(availabilityRepo, { tenantId: tenantA, reservationGroupId: group.id, termsVersion: 'v1' })
    await confirmReservationGroup(availabilityRepo, { tenantId: tenantA, reservationGroupId: group.id })
    const unverifiedCustomer = await createCustomer(identityRepo, {
      tenantId: tenantA,
      reservationGroupId: group.id,
      name: 'Unverified Customer',
      email: 'unverified@example.sk',
      phone: '+421900000002',
    })

    await expect(
      performHandoverOut(deps(), {
        tenantId: tenantA,
        tagCode,
        reservationId: reservations[0]!.id,
        customerId: unverifiedCustomer.id,
        operatorId,
        depositAmount,
        conditionPhotoContentTypes: ['image/jpeg'],
      }),
    ).rejects.toThrow(IdentityVerificationRequiredError)
  })

  it('refuses when the scanned Asset is not Rentable (already InPossession)', async () => {
    const busyAsset = await assetRegistry.insertAsset(tenantA, { assetTypeId: HAMMER, status: 'in_possession', operatorId })
    await assetRegistry.insertAssetTag(tenantA, { assetId: busyAsset.id, tagCode: 'TAG-BUSY', operatorId })

    await expect(
      performHandoverOut(deps(), {
        tenantId: tenantA,
        tagCode: 'TAG-BUSY',
        reservationId,
        customerId,
        operatorId,
        depositAmount,
        conditionPhotoContentTypes: ['image/jpeg'],
      }),
    ).rejects.toThrow(UnexpectedScanResolutionError)
  })

  it('refuses when the scanned Asset is of the wrong AssetType (FR-18)', async () => {
    const wrongTypeAsset = await assetRegistry.insertAsset(tenantA, { assetTypeId: SCAFFOLD, status: 'rentable', operatorId })
    await assetRegistry.insertAssetTag(tenantA, { assetId: wrongTypeAsset.id, tagCode: 'TAG-WRONG-TYPE', operatorId })

    await expect(
      performHandoverOut(deps(), {
        tenantId: tenantA,
        tagCode: 'TAG-WRONG-TYPE',
        reservationId,
        customerId,
        operatorId,
        depositAmount,
        conditionPhotoContentTypes: ['image/jpeg'],
      }),
    ).rejects.toThrow(AssetTypeMismatchError)
  })

  it('refuses an empty ConditionReport (FR-19)', async () => {
    await expect(
      performHandoverOut(deps(), {
        tenantId: tenantA,
        tagCode,
        reservationId,
        customerId,
        operatorId,
        depositAmount,
        conditionPhotoContentTypes: [],
      }),
    ).rejects.toThrow(EmptyConditionReportError)

    expect(gateway.uploadUrlCalls).toHaveLength(0)
  })
})
