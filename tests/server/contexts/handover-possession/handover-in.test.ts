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
  completeSettlement,
  markAssetReturnedToPool,
  performHandoverIn,
} from '../../../../server/contexts/handover-possession/handover-in'
import {
  AssetNotYetReturnableError,
  BackdateReasonRequiredError,
  DeductionReasonRequiredError,
  DeductionRequiresPairedConditionReportsError,
  DepositReturnExceedsTakenError,
  RentalAgreementAlreadySettledError,
  RentalAgreementNotHandedInError,
  SettlementNotCompleteError,
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

describe('performHandoverIn / completeSettlement / markAssetReturnedToPool', () => {
  let assetRegistry: FakeAssetRegistryRepository
  let availabilityRepo: FakeAvailabilityReservationRepository
  let identityRepo: FakeCustomerIdentityComplianceRepository
  let handoverRepo: FakeHandoverPossessionRepository
  let gateway: FakeConditionReportStorageGateway

  let reservationId: number
  let tagCode: string
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
    reservationId = reservations[0]!.id

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
    await assetRegistry.insertAssetTag(tenantA, { assetId: asset.id, tagCode, operatorId })

    await performHandoverOut(
      { repo: handoverRepo, availabilityRepo, identityRepo, conditionsGateway: gateway },
      {
        tenantId: tenantA,
        tagCode,
        reservationId,
        customerId: customer.id,
        operatorId,
        depositAmount,
        conditionPhotoContentTypes: ['image/jpeg'],
      },
    )
  })

  describe('performHandoverIn', () => {
    it('closes Possession, captures a ConditionReport, and moves the Asset to UnderInspection (D-09, FR-19, W5)', async () => {
      const result = await performHandoverIn(
        { repo: handoverRepo, conditionsGateway: gateway },
        { tenantId: tenantA, tagCode, operatorId, conditionPhotoContentTypes: ['image/jpeg'] },
      )

      expect(result.rentalAgreement.handoverInAt).not.toBeNull()
      expect(result.conditionReport.stage).toBe('handover_in')

      const asset = await assetRegistry.getAsset(tenantA, result.rentalAgreement.assetId)
      expect(asset?.status).toBe('under_inspection')

      // D-10/Finding 9: an ordinary live scan has occurred-at and
      // recorded-at equal, and no backdate reason.
      expect(result.rentalAgreement.handoverInAt).toEqual(result.rentalAgreement.handoverInRecordedAt)
      expect(result.rentalAgreement.handoverInBackdateReason).toBeNull()
    })

    it('records a backdated HandoverIn — the "return went unscanned" repair (D-10, FR-24, Finding 9)', async () => {
      const occurredAt = new Date('2026-03-07T18:00:00.000Z')

      const result = await performHandoverIn(
        { repo: handoverRepo, conditionsGateway: gateway },
        {
          tenantId: tenantA,
          tagCode,
          operatorId,
          conditionPhotoContentTypes: ['image/jpeg'],
          backdate: { occurredAt, reason: 'Return was placed on the shelf unscanned' },
        },
      )

      expect(result.rentalAgreement.handoverInAt).toEqual(occurredAt)
      expect(result.rentalAgreement.handoverInBackdateReason).toBe('Return was placed on the shelf unscanned')
      expect(result.rentalAgreement.handoverInRecordedAt!.getTime()).toBeGreaterThan(occurredAt.getTime())
      expect(result.conditionReport.capturedAt).toEqual(occurredAt)
    })

    it('refuses a backdated HandoverIn with no reason', async () => {
      await expect(
        performHandoverIn(
          { repo: handoverRepo, conditionsGateway: gateway },
          {
            tenantId: tenantA,
            tagCode,
            operatorId,
            conditionPhotoContentTypes: ['image/jpeg'],
            backdate: { occurredAt: new Date('2026-03-07T18:00:00.000Z'), reason: '' },
          },
        ),
      ).rejects.toThrow(BackdateReasonRequiredError)
    })

    it('refuses when the Asset has no open RentalAgreement (already handed in)', async () => {
      await performHandoverIn(
        { repo: handoverRepo, conditionsGateway: gateway },
        { tenantId: tenantA, tagCode, operatorId, conditionPhotoContentTypes: ['image/jpeg'] },
      )

      // The Asset is now UnderInspection — scanning it again resolves to
      // 'asset_lookup', not 'handover_in', so this manifests as
      // UnexpectedScanResolutionError rather than NoOpenRentalAgreementError;
      // covered by scan-resolution.test.ts's own FR-45 cases. Here we
      // confirm no second open Agreement exists.
      const stillOpen = await handoverRepo.getOpenRentalAgreementForAsset(tenantA, 1)
      expect(stillOpen).toBeNull()
    })
  })

  describe('completeSettlement', () => {
    async function handIn() {
      return performHandoverIn(
        { repo: handoverRepo, conditionsGateway: gateway },
        { tenantId: tenantA, tagCode, operatorId, conditionPhotoContentTypes: ['image/jpeg'] },
      )
    }

    it('records a full return with no deduction reason (D-07, FR-21)', async () => {
      const { rentalAgreement } = await handIn()

      const result = await completeSettlement(handoverRepo, {
        tenantId: tenantA,
        rentalAgreementId: rentalAgreement.id,
        operatorId,
        returnedAmount: depositAmount,
      })

      expect(result.depositReturned.deductionReason).toBeNull()
      expect(result.rentalAgreement.settlementCompletedAt).not.toBeNull()
    })

    it('records a partial return with a deduction reason when both ConditionReports exist (FR-20)', async () => {
      const { rentalAgreement } = await handIn()

      const result = await completeSettlement(handoverRepo, {
        tenantId: tenantA,
        rentalAgreementId: rentalAgreement.id,
        operatorId,
        returnedAmount: { amount: 3000, currency: 'EUR' },
        deductionReason: 'Scratched casing',
      })

      expect(result.depositReturned.deductionReason).toBe('Scratched casing')
      expect(result.depositReturned.amount.amount).toBe(3000)
    })

    it('refuses a deduction with no reason', async () => {
      const { rentalAgreement } = await handIn()

      await expect(
        completeSettlement(handoverRepo, {
          tenantId: tenantA,
          rentalAgreementId: rentalAgreement.id,
          operatorId,
          returnedAmount: { amount: 3000, currency: 'EUR' },
        }),
      ).rejects.toThrow(DeductionReasonRequiredError)
    })

    it('refuses a returned amount exceeding what was taken', async () => {
      const { rentalAgreement } = await handIn()

      await expect(
        completeSettlement(handoverRepo, {
          tenantId: tenantA,
          rentalAgreementId: rentalAgreement.id,
          operatorId,
          returnedAmount: { amount: 9999, currency: 'EUR' },
        }),
      ).rejects.toThrow(DepositReturnExceedsTakenError)
    })

    it('refuses settlement before HandoverIn', async () => {
      const openAgreement = await handoverRepo.getOpenRentalAgreementForAsset(tenantA, 1)

      await expect(
        completeSettlement(handoverRepo, {
          tenantId: tenantA,
          rentalAgreementId: openAgreement!.id,
          operatorId,
          returnedAmount: depositAmount,
        }),
      ).rejects.toThrow(RentalAgreementNotHandedInError)
    })

    it('refuses settling the same RentalAgreement twice', async () => {
      const { rentalAgreement } = await handIn()
      await completeSettlement(handoverRepo, {
        tenantId: tenantA,
        rentalAgreementId: rentalAgreement.id,
        operatorId,
        returnedAmount: depositAmount,
      })

      await expect(
        completeSettlement(handoverRepo, {
          tenantId: tenantA,
          rentalAgreementId: rentalAgreement.id,
          operatorId,
          returnedAmount: depositAmount,
        }),
      ).rejects.toThrow(RentalAgreementAlreadySettledError)
    })

    it('refuses a deduction when a ConditionReport is missing (FR-20, P1 corollary)', async () => {
      // Constructs the missing-evidence scenario directly against the
      // repository, bypassing performHandoverOut/performHandoverIn (which
      // always insert both reports by construction) — this exercises
      // completeSettlement's own defensive guard, not an end-to-end path
      // this codebase's flows can currently reach.
      const asset = await assetRegistry.insertAsset(tenantA, { assetTypeId: HAMMER, status: 'in_possession', operatorId })
      const now = new Date()
      const bareAgreement = await handoverRepo.insertRentalAgreement(tenantA, {
        reservationId,
        customerId: 1,
        assetId: asset.id,
        operatorId,
        termsVersion: 'v1',
        handoverOutAt: now,
        handoverOutRecordedAt: now,
        handoverOutBackdateReason: null,
      })
      await handoverRepo.insertDepositTaken(tenantA, {
        rentalAgreementId: bareAgreement.id,
        amount: depositAmount,
        operatorId,
        takenAt: now,
        recordedAt: now,
      })
      await handoverRepo.setHandoverInAt(tenantA, bareAgreement.id, {
        handoverInAt: now,
        handoverInRecordedAt: now,
        handoverInBackdateReason: null,
      })
      // Only a HandoverOut-stage report — no HandoverIn-stage one.
      await handoverRepo.insertConditionReport(tenantA, {
        rentalAgreementId: bareAgreement.id,
        stage: 'handover_out',
        photoObjectKeys: ['obj-1'],
        operatorId,
        capturedAt: now,
        recordedAt: now,
      })

      await expect(
        completeSettlement(handoverRepo, {
          tenantId: tenantA,
          rentalAgreementId: bareAgreement.id,
          operatorId,
          returnedAmount: { amount: 1000, currency: 'EUR' },
          deductionReason: 'Missing parts',
        }),
      ).rejects.toThrow(DeductionRequiresPairedConditionReportsError)
    })
  })

  describe('markAssetReturnedToPool', () => {
    async function handInAndSettle() {
      const { rentalAgreement } = await performHandoverIn(
        { repo: handoverRepo, conditionsGateway: gateway },
        { tenantId: tenantA, tagCode, operatorId, conditionPhotoContentTypes: ['image/jpeg'] },
      )
      return completeSettlement(handoverRepo, {
        tenantId: tenantA,
        rentalAgreementId: rentalAgreement.id,
        operatorId,
        returnedAmount: depositAmount,
      })
    }

    it('refuses before HandoverIn has even happened (a fortiori before Settlement)', async () => {
      const openAgreement = await handoverRepo.getOpenRentalAgreementForAsset(tenantA, 1)

      await expect(
        markAssetReturnedToPool(
          { repo: handoverRepo, assetRegistryRepo: assetRegistry, availabilityRepo },
          { tenantId: tenantA, rentalAgreementId: openAgreement!.id, operatorId },
        ),
      ).rejects.toThrow(SettlementNotCompleteError)
    })

    it("refuses before the day after the RentalPeriod's final day (D-09)", async () => {
      const { rentalAgreement } = await handInAndSettle()

      await expect(
        markAssetReturnedToPool(
          { repo: handoverRepo, assetRegistryRepo: assetRegistry, availabilityRepo },
          {
            tenantId: tenantA,
            rentalAgreementId: rentalAgreement.id,
            operatorId,
            today: new Date('2026-03-07T12:00:00.000Z'), // the RentalPeriod's own final day
          },
        ),
      ).rejects.toThrow(AssetNotYetReturnableError)

      const asset = await assetRegistry.getAsset(tenantA, rentalAgreement.assetId)
      expect(asset?.status).toBe('under_inspection')
    })

    it('returns the Asset to Rentable on the day after the RentalPeriod ends (D-09)', async () => {
      const { rentalAgreement } = await handInAndSettle()

      const result = await markAssetReturnedToPool(
        { repo: handoverRepo, assetRegistryRepo: assetRegistry, availabilityRepo },
        {
          tenantId: tenantA,
          rentalAgreementId: rentalAgreement.id,
          operatorId,
          today: new Date('2026-03-08T09:00:00.000Z'),
        },
      )

      expect(result.returnedToPoolAt).not.toBeNull()
      const asset = await assetRegistry.getAsset(tenantA, rentalAgreement.assetId)
      expect(asset?.status).toBe('rentable')
    })

    it('refuses when Settlement has not completed yet, even after HandoverIn', async () => {
      const { rentalAgreement } = await performHandoverIn(
        { repo: handoverRepo, conditionsGateway: gateway },
        { tenantId: tenantA, tagCode, operatorId, conditionPhotoContentTypes: ['image/jpeg'] },
      )

      await expect(
        markAssetReturnedToPool(
          { repo: handoverRepo, assetRegistryRepo: assetRegistry, availabilityRepo },
          {
            tenantId: tenantA,
            rentalAgreementId: rentalAgreement.id,
            operatorId,
            today: new Date('2026-03-08T09:00:00.000Z'),
          },
        ),
      ).rejects.toThrow(SettlementNotCompleteError)
    })
  })
})
