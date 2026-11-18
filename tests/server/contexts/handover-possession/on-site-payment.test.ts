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
  OnSitePaymentAlreadyAttestedError,
  OnSitePaymentCorrectionError,
  OnSitePaymentNotExpectedError,
  RentalFeeNotSettledError,
  assertRentalFeeSettled,
  attestOnSitePayment,
  currentOnSitePayment,
} from '../../../../server/contexts/handover-possession/on-site-payment'
import {
  createFakeAssetRegistryRepository,
  type FakeAssetRegistryRepository,
} from '../asset-registry/fake-repository'
import {
  createFakeAvailabilityReservationRepository,
  type FakeAvailabilityReservationRepository,
} from '../availability-reservation/fake-repository'
import {
  createFakeCustomerIdentityComplianceRepository,
  type FakeCustomerIdentityComplianceRepository,
} from '../customer-identity-compliance/fake-repository'
import { createFakeConditionReportStorageGateway } from './fake-conditions-gateway'
import { createFakeOnSitePaymentRepository } from './fake-on-site-payment-repository'
import { createFakeHandoverPossessionRepository } from './fake-repository'

const tenantA = '11111111-1111-1111-1111-111111111111' as TenantId
const tenantB = '22222222-2222-2222-2222-222222222222' as TenantId
const operatorId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const otherOperatorId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const HAMMER = 1
const fee = { amount: 4500, currency: 'EUR' as const }
const onSiteGroup = { id: 7, paymentMethod: 'on_site' as const }

describe('attestOnSitePayment (D-65, P6)', () => {
  let repo: ReturnType<typeof createFakeOnSitePaymentRepository>
  beforeEach(() => {
    repo = createFakeOnSitePaymentRepository()
  })

  it('records amount with currency, method and the attesting Operator (D-21, FR-34)', async () => {
    const attested = await attestOnSitePayment(repo, {
      tenantId: tenantA,
      group: onSiteGroup,
      amount: fee,
      method: 'cash',
      operatorId,
    })
    expect(attested).toMatchObject({
      amount: fee,
      method: 'cash',
      operatorId,
      reservationGroupId: 7,
    })
  })

  it('refuses a group paid online — there is nothing to attest', async () => {
    await expect(
      attestOnSitePayment(repo, {
        tenantId: tenantA,
        group: { id: 7, paymentMethod: 'online' },
        amount: fee,
        method: 'qr',
        operatorId,
      }),
    ).rejects.toThrow(OnSitePaymentNotExpectedError)
  })

  it('refuses a second attestation; a correction supersedes with a reason (P1, D-10)', async () => {
    const first = await attestOnSitePayment(repo, {
      tenantId: tenantA,
      group: onSiteGroup,
      amount: fee,
      method: 'cash',
      operatorId,
    })
    await expect(
      attestOnSitePayment(repo, {
        tenantId: tenantA,
        group: onSiteGroup,
        amount: fee,
        method: 'qr',
        operatorId,
      }),
    ).rejects.toThrow(OnSitePaymentAlreadyAttestedError)
    await expect(
      attestOnSitePayment(repo, {
        tenantId: tenantA,
        group: onSiteGroup,
        amount: fee,
        method: 'qr',
        operatorId,
        correction: { supersedesId: first.id, reason: '  ' },
      }),
    ).rejects.toThrow(OnSitePaymentCorrectionError)

    const corrected = await attestOnSitePayment(repo, {
      tenantId: tenantA,
      group: onSiteGroup,
      amount: fee,
      method: 'card_terminal',
      operatorId: otherOperatorId,
      correction: { supersedesId: first.id, reason: 'Zaplatil kartou, nie hotovosťou' },
    })

    const all = repo.all()
    expect(all).toHaveLength(2)
    expect(all[0]!.method).toBe('cash') // never edited
    expect(currentOnSitePayment(all)?.id).toBe(corrected.id)
  })

  it('reads attestations per Tenant only (FR-33)', async () => {
    await attestOnSitePayment(repo, {
      tenantId: tenantA,
      group: onSiteGroup,
      amount: fee,
      method: 'cash',
      operatorId,
    })
    await expect(
      assertRentalFeeSettled(repo, {
        tenantId: tenantB,
        reservationGroupId: 7,
        paymentMethod: 'on_site',
      }),
    ).rejects.toThrow(RentalFeeNotSettledError)
    await expect(
      assertRentalFeeSettled(repo, {
        tenantId: tenantA,
        reservationGroupId: 7,
        paymentMethod: 'on_site',
      }),
    ).resolves.toBeUndefined()
  })
})

describe('HandoverOut guard for a group paid on site (D-65)', () => {
  let assetRegistry: FakeAssetRegistryRepository
  let availabilityRepo: FakeAvailabilityReservationRepository
  let identityRepo: FakeCustomerIdentityComplianceRepository
  let onSiteRepo: ReturnType<typeof createFakeOnSitePaymentRepository>
  let groupId: number
  let reservationId: number
  let customerId: number

  beforeEach(async () => {
    assetRegistry = createFakeAssetRegistryRepository()
    assetRegistry.seedAssetType(tenantA, HAMMER)
    availabilityRepo = createFakeAvailabilityReservationRepository()
    availabilityRepo.seedCapacity(HAMMER, 5)
    identityRepo = createFakeCustomerIdentityComplianceRepository()
    onSiteRepo = createFakeOnSitePaymentRepository()

    const { group, reservations } = await checkoutReservationGroup(availabilityRepo, {
      tenantId: tenantA,
      lines: [{ assetTypeId: HAMMER, period: { startDay: '2026-03-05', endDay: '2026-03-07' } }],
      paymentMethod: 'on_site',
    })
    groupId = group.id
    reservationId = reservations[0]!.id
    await recordTermsAcceptance(availabilityRepo, {
      tenantId: tenantA,
      reservationGroupId: group.id,
      termsVersion: 'v1',
    })
    // Confirmed by the e-mailed link, not by a Payment.
    await confirmReservationGroup(availabilityRepo, {
      tenantId: tenantA,
      reservationGroupId: group.id,
    })

    const customer = await createCustomer(identityRepo, {
      tenantId: tenantA,
      reservationGroupId: group.id,
      name: 'Jana Nováková',
      email: 'jana@example.sk',
      phone: '+421900000000',
    })
    customerId = customer.id
    // D-15 (c): the Operator captures and verifies the document at the counter.
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
    const asset = await assetRegistry.insertAsset(tenantA, {
      assetTypeId: HAMMER,
      status: 'rentable',
      operatorId,
    })
    await assetRegistry.insertAssetTag(tenantA, { assetId: asset.id, tagCode: 'TAG-1', operatorId })
  })

  const handOut = (withRepo = true) =>
    performHandoverOut(
      {
        repo: createFakeHandoverPossessionRepository(assetRegistry),
        availabilityRepo,
        identityRepo,
        conditionsGateway: createFakeConditionReportStorageGateway(),
        ...(withRepo ? { onSitePaymentRepo: onSiteRepo } : {}),
      },
      {
        tenantId: tenantA,
        tagCode: 'TAG-1',
        reservationId,
        customerId,
        operatorId,
        depositAmount: { amount: 5000, currency: 'EUR' },
        conditionPhotoContentTypes: ['image/jpeg'],
      },
    )

  it('refuses HandoverOut while the rental fee is not attested', async () => {
    await expect(handOut()).rejects.toThrow(RentalFeeNotSettledError)
  })

  it('fails closed when no attestation store is wired', async () => {
    await expect(handOut(false)).rejects.toThrow(RentalFeeNotSettledError)
  })

  it('hands out once the Operator attested the on-site payment', async () => {
    await attestOnSitePayment(onSiteRepo, {
      tenantId: tenantA,
      group: { id: groupId, paymentMethod: 'on_site' },
      amount: fee,
      method: 'qr',
      operatorId,
    })
    const result = await handOut()
    expect(result.rentalAgreement.reservationId).toBe(reservationId)
  })
})
