import { beforeEach, describe, expect, it } from 'vitest'
import type { TenantId } from '../../../server/contexts/_shared'
import {
  checkoutReservationGroup,
  confirmReservationGroup,
  recordTermsAcceptance,
} from '../../../server/contexts/availability-reservation'
import { createCustomer } from '../../../server/contexts/customer-identity-compliance'
import { createFakeAssetRegistryRepository, type FakeAssetRegistryRepository } from '../contexts/asset-registry/fake-repository'
import {
  createFakeAvailabilityReservationRepository,
  type FakeAvailabilityReservationRepository,
} from '../contexts/availability-reservation/fake-repository'
import { createFakeCatalogRepository } from '../contexts/catalog/fake-repository'
import {
  createFakeCustomerIdentityComplianceRepository,
  type FakeCustomerIdentityComplianceRepository,
} from '../contexts/customer-identity-compliance/fake-repository'
import {
  createFakeHandoverPossessionRepository,
  type FakeHandoverPossessionRepository,
} from '../contexts/handover-possession/fake-repository'
import { listTodaysPickups, listTodaysReturns, type OperatorCounterViewsDeps } from '../../../server/utils/operator-counter-views'
import type { CatalogRepository } from '../../../server/contexts/catalog'

const tenantA = '11111111-1111-1111-1111-111111111111' as TenantId
const operatorId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const HAMMER = 1
const TODAY = '2026-03-10'

describe('listTodaysPickups / listTodaysReturns (FR-42)', () => {
  let assetRegistry: FakeAssetRegistryRepository
  let availabilityRepo: FakeAvailabilityReservationRepository
  let identityRepo: FakeCustomerIdentityComplianceRepository
  let handoverRepo: FakeHandoverPossessionRepository
  let catalogRepo: CatalogRepository
  let deps: OperatorCounterViewsDeps

  beforeEach(async () => {
    assetRegistry = createFakeAssetRegistryRepository()
    assetRegistry.seedAssetType(tenantA, HAMMER)
    availabilityRepo = createFakeAvailabilityReservationRepository()
    availabilityRepo.seedCapacity(HAMMER, 10)
    identityRepo = createFakeCustomerIdentityComplianceRepository()
    handoverRepo = createFakeHandoverPossessionRepository(assetRegistry)
    catalogRepo = createFakeCatalogRepository()
    deps = { availabilityRepo, handoverRepo, identityRepo, catalogRepo }

    await catalogRepo.insertAssetType(tenantA, {
      name: 'Rotary Hammer',
      description: '',
      dayRate: { amount: 1000, currency: 'EUR' },
      depositAmount: { amount: 5000, currency: 'EUR' },
      operatorId,
    })
  })

  async function confirmedReservation(startDay: string, endDay: string) {
    const { group, reservations } = await checkoutReservationGroup(availabilityRepo, {
      tenantId: tenantA,
      lines: [{ assetTypeId: HAMMER, period: { startDay, endDay } }],
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
    return { reservation: reservations[0]!, customer }
  }

  it('lists a Confirmed Reservation starting today as a pickup, with the customerId issue #80/IR-12 needs for HandoverOut', async () => {
    const { customer } = await confirmedReservation(TODAY, '2026-03-12')

    const pickups = await listTodaysPickups(deps, { tenantId: tenantA, today: TODAY })

    expect(pickups).toHaveLength(1)
    expect(pickups[0]!.assetTypeName).toBe('Rotary Hammer')
    expect(pickups[0]!.customerName).toBe('Jana Nováková')
    expect(pickups[0]!.customerId).toBe(customer.id)
  })

  it('excludes a Reservation already handed out from pickups', async () => {
    const { reservation, customer } = await confirmedReservation(TODAY, '2026-03-12')
    const asset = await assetRegistry.insertAsset(tenantA, { assetTypeId: HAMMER, status: 'rentable', operatorId })
    const now = new Date()
    await handoverRepo.insertRentalAgreement(tenantA, {
      reservationId: reservation.id,
      customerId: customer.id,
      assetId: asset.id,
      operatorId,
      termsVersion: 'v1',
      handoverOutAt: now,
      handoverOutRecordedAt: now,
      handoverOutBackdateReason: null,
    })

    const pickups = await listTodaysPickups(deps, { tenantId: tenantA, today: TODAY })
    expect(pickups).toHaveLength(0)
  })

  it('does not list a Pending Reservation starting today as a pickup', async () => {
    const { group, reservations } = await checkoutReservationGroup(availabilityRepo, {
      tenantId: tenantA,
      lines: [{ assetTypeId: HAMMER, period: { startDay: TODAY, endDay: '2026-03-12' } }],
    })
    void group
    void reservations

    const pickups = await listTodaysPickups(deps, { tenantId: tenantA, today: TODAY })
    expect(pickups).toHaveLength(0)
  })

  it('lists a Reservation ending today, handed out but not back, as a return', async () => {
    const { reservation, customer } = await confirmedReservation('2026-03-08', TODAY)
    const asset = await assetRegistry.insertAsset(tenantA, { assetTypeId: HAMMER, status: 'in_possession', operatorId })
    const now = new Date()
    await handoverRepo.insertRentalAgreement(tenantA, {
      reservationId: reservation.id,
      customerId: customer.id,
      assetId: asset.id,
      operatorId,
      termsVersion: 'v1',
      handoverOutAt: now,
      handoverOutRecordedAt: now,
      handoverOutBackdateReason: null,
    })

    const returns = await listTodaysReturns(deps, { tenantId: tenantA, today: TODAY })

    expect(returns).toHaveLength(1)
    expect(returns[0]!.assetTypeName).toBe('Rotary Hammer')
    expect(returns[0]!.customerName).toBe('Jana Nováková')
  })

  it('excludes a Reservation never handed out from returns', async () => {
    await confirmedReservation('2026-03-08', TODAY)

    const returns = await listTodaysReturns(deps, { tenantId: tenantA, today: TODAY })
    expect(returns).toHaveLength(0)
  })

  it('excludes a Reservation already handed back from returns', async () => {
    const { reservation, customer } = await confirmedReservation('2026-03-08', TODAY)
    const asset = await assetRegistry.insertAsset(tenantA, { assetTypeId: HAMMER, status: 'under_inspection', operatorId })
    const now = new Date()
    await handoverRepo.insertRentalAgreement(tenantA, {
      reservationId: reservation.id,
      customerId: customer.id,
      assetId: asset.id,
      operatorId,
      termsVersion: 'v1',
      handoverOutAt: now,
      handoverOutRecordedAt: now,
      handoverOutBackdateReason: null,
    })
    const openAgreement = await handoverRepo.getRentalAgreementByReservation(tenantA, reservation.id)
    await handoverRepo.setHandoverInAt(tenantA, openAgreement!.id, {
      handoverInAt: now,
      handoverInRecordedAt: now,
      handoverInBackdateReason: null,
    })

    const returns = await listTodaysReturns(deps, { tenantId: tenantA, today: TODAY })
    expect(returns).toHaveLength(0)
  })
})
