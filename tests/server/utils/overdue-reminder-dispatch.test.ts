import { beforeEach, describe, expect, it } from 'vitest'
import type { TenantId } from '../../../server/contexts/_shared'
import {
  checkoutReservationGroup,
  confirmReservationGroup,
  recordTermsAcceptance,
} from '../../../server/contexts/availability-reservation'
import { createCustomer } from '../../../server/contexts/customer-identity-compliance'
import { dispatchDueOverdueReminders } from '../../../server/utils/overdue-reminder-dispatch'
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
import { createFakeNotificationGateway, type FakeNotificationGateway } from '../contexts/notification/fake-gateway'
import { createFakeNotificationRepository, type FakeNotificationRepository } from '../contexts/notification/fake-repository'
import type { CatalogRepository } from '../../../server/contexts/catalog'

const tenantA = '11111111-1111-1111-1111-111111111111' as TenantId
const operatorId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const HAMMER = 1
const TODAY = '2026-03-10'

describe('dispatchDueOverdueReminders (D-17, W6, FR-41, issue #36)', () => {
  let assetRegistry: FakeAssetRegistryRepository
  let availabilityRepo: FakeAvailabilityReservationRepository
  let handoverRepo: FakeHandoverPossessionRepository
  let catalogRepo: CatalogRepository
  let identityRepo: FakeCustomerIdentityComplianceRepository
  let notificationRepo: FakeNotificationRepository
  let notificationGateway: FakeNotificationGateway

  beforeEach(async () => {
    assetRegistry = createFakeAssetRegistryRepository()
    assetRegistry.seedAssetType(tenantA, HAMMER)
    availabilityRepo = createFakeAvailabilityReservationRepository()
    availabilityRepo.seedCapacity(HAMMER, 5)
    handoverRepo = createFakeHandoverPossessionRepository(assetRegistry)
    catalogRepo = createFakeCatalogRepository()
    identityRepo = createFakeCustomerIdentityComplianceRepository()
    notificationRepo = createFakeNotificationRepository()
    notificationGateway = createFakeNotificationGateway()

    await catalogRepo.insertAssetType(tenantA, {
      name: 'Rotary Hammer',
      description: '',
      dayRate: { amount: 1000, currency: 'EUR' },
      depositAmount: { amount: 5000, currency: 'EUR' },
      operatorId,
    })
  })

  function deps() {
    return {
      availabilityRepo,
      handoverRepo,
      assetRegistryRepo: assetRegistry,
      catalogRepo,
      identityRepo,
      notificationRepo,
      notificationGateway,
    }
  }

  async function overdueReservationWithCustomer() {
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

    const asset = await assetRegistry.insertAsset(tenantA, { assetTypeId: HAMMER, status: 'in_possession', operatorId })
    const now = new Date()
    await handoverRepo.insertRentalAgreement(tenantA, {
      reservationId: reservations[0]!.id,
      customerId: customer.id,
      assetId: asset.id,
      operatorId,
      termsVersion: 'v1',
      handoverOutAt: now,
      handoverOutRecordedAt: now,
      handoverOutBackdateReason: null,
    })

    return { reservation: reservations[0]!, customer }
  }

  it('sends an Overdue reminder for a Reservation whose Possession has outlived its RentalPeriod', async () => {
    await overdueReservationWithCustomer()

    const dispatched = await dispatchDueOverdueReminders(deps(), { tenantId: tenantA, today: TODAY })

    expect(dispatched).toHaveLength(1)
    expect(dispatched[0]!.kind).toBe('overdue_reminder')
    expect(notificationGateway.sentEmails).toHaveLength(1)
    expect(notificationGateway.sentEmails[0]!.to).toBe('jana@example.sk')
  })

  it('never sends a second Overdue reminder across two scans on different days (D-17: no repeated nagging)', async () => {
    await overdueReservationWithCustomer()

    await dispatchDueOverdueReminders(deps(), { tenantId: tenantA, today: TODAY })
    const second = await dispatchDueOverdueReminders(deps(), { tenantId: tenantA, today: '2026-03-15' })

    expect(second).toHaveLength(0)
    expect(notificationGateway.sentEmails).toHaveLength(1)
  })

  it('excludes a Reservation whose RentalPeriod has not ended yet', async () => {
    const { group, reservations } = await checkoutReservationGroup(availabilityRepo, {
      tenantId: tenantA,
      lines: [{ assetTypeId: HAMMER, period: { startDay: '2026-03-08', endDay: '2026-03-15' } }],
    })
    await recordTermsAcceptance(availabilityRepo, { tenantId: tenantA, reservationGroupId: group.id, termsVersion: 'v1' })
    await confirmReservationGroup(availabilityRepo, { tenantId: tenantA, reservationGroupId: group.id })
    await createCustomer(identityRepo, {
      tenantId: tenantA,
      reservationGroupId: group.id,
      name: 'Jana Nováková',
      email: 'jana@example.sk',
      phone: '+421900000000',
    })
    const asset = await assetRegistry.insertAsset(tenantA, { assetTypeId: HAMMER, status: 'in_possession', operatorId })
    const now = new Date()
    await handoverRepo.insertRentalAgreement(tenantA, {
      reservationId: reservations[0]!.id,
      customerId: 1,
      assetId: asset.id,
      operatorId,
      termsVersion: 'v1',
      handoverOutAt: now,
      handoverOutRecordedAt: now,
      handoverOutBackdateReason: null,
    })

    const dispatched = await dispatchDueOverdueReminders(deps(), { tenantId: tenantA, today: TODAY })
    expect(dispatched).toHaveLength(0)
  })
})
