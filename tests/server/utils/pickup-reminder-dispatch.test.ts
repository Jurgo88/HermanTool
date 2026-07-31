import { beforeEach, describe, expect, it } from 'vitest'
import type { TenantId } from '../../../server/contexts/_shared'
import {
  checkoutReservationGroup,
  confirmReservationGroup,
  recordTermsAcceptance,
} from '../../../server/contexts/availability-reservation'
import { createCustomer } from '../../../server/contexts/customer-identity-compliance'
import { dispatchDuePickupReminders } from '../../../server/utils/pickup-reminder-dispatch'
import { createFakeAssetRegistryRepository, type FakeAssetRegistryRepository } from '../contexts/asset-registry/fake-repository'
import {
  createFakeAvailabilityReservationRepository,
  type FakeAvailabilityReservationRepository,
} from '../contexts/availability-reservation/fake-repository'
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

const tenantA = '11111111-1111-1111-1111-111111111111' as TenantId
const operatorId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const HAMMER = 1
const TODAY = '2026-03-05'

describe('dispatchDuePickupReminders (FR-41, issue #36)', () => {
  let assetRegistry: FakeAssetRegistryRepository
  let availabilityRepo: FakeAvailabilityReservationRepository
  let handoverRepo: FakeHandoverPossessionRepository
  let identityRepo: FakeCustomerIdentityComplianceRepository
  let notificationRepo: FakeNotificationRepository
  let notificationGateway: FakeNotificationGateway

  beforeEach(() => {
    assetRegistry = createFakeAssetRegistryRepository()
    assetRegistry.seedAssetType(tenantA, HAMMER)
    availabilityRepo = createFakeAvailabilityReservationRepository()
    availabilityRepo.seedCapacity(HAMMER, 5)
    handoverRepo = createFakeHandoverPossessionRepository(assetRegistry)
    identityRepo = createFakeCustomerIdentityComplianceRepository()
    notificationRepo = createFakeNotificationRepository()
    notificationGateway = createFakeNotificationGateway()
  })

  function deps() {
    return { availabilityRepo, handoverRepo, identityRepo, notificationRepo, notificationGateway }
  }

  async function confirmedReservationWithCustomer(startDay: string, endDay: string) {
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

  it('sends a pickup reminder for a Confirmed Reservation whose RentalPeriod starts today, not yet handed out', async () => {
    await confirmedReservationWithCustomer(TODAY, '2026-03-07')

    const dispatched = await dispatchDuePickupReminders(deps(), { tenantId: tenantA, today: TODAY })

    expect(dispatched).toHaveLength(1)
    expect(dispatched[0]!.kind).toBe('pickup_reminder')
    expect(notificationGateway.sentEmails).toHaveLength(1)
    expect(notificationGateway.sentEmails[0]!.to).toBe('jana@example.sk')
  })

  it('excludes a Reservation whose RentalPeriod starts on a different day', async () => {
    await confirmedReservationWithCustomer('2026-03-10', '2026-03-12')

    const dispatched = await dispatchDuePickupReminders(deps(), { tenantId: tenantA, today: TODAY })
    expect(dispatched).toHaveLength(0)
  })

  it('excludes a Reservation already handed out (even a day early)', async () => {
    const { reservation, customer } = await confirmedReservationWithCustomer(TODAY, '2026-03-07')
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

    const dispatched = await dispatchDuePickupReminders(deps(), { tenantId: tenantA, today: TODAY })
    expect(dispatched).toHaveLength(0)
  })

  it('never sends twice for the same Reservation across two runs on the same day', async () => {
    await confirmedReservationWithCustomer(TODAY, '2026-03-07')

    await dispatchDuePickupReminders(deps(), { tenantId: tenantA, today: TODAY })
    const second = await dispatchDuePickupReminders(deps(), { tenantId: tenantA, today: TODAY })

    expect(second).toHaveLength(0)
    expect(notificationGateway.sentEmails).toHaveLength(1)
  })
})
