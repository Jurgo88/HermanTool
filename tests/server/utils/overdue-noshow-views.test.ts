import { beforeEach, describe, expect, it } from 'vitest'
import type { TenantId } from '../../../server/contexts/_shared'
import {
  checkoutReservationGroup,
  confirmReservationGroup,
  recordTermsAcceptance,
} from '../../../server/contexts/availability-reservation'
import { createFakeAssetRegistryRepository, type FakeAssetRegistryRepository } from '../contexts/asset-registry/fake-repository'
import {
  createFakeAvailabilityReservationRepository,
  type FakeAvailabilityReservationRepository,
} from '../contexts/availability-reservation/fake-repository'
import { createFakeCatalogRepository } from '../contexts/catalog/fake-repository'
import { createFakeCustomerIdentityComplianceRepository } from '../contexts/customer-identity-compliance/fake-repository'
import {
  createFakeHandoverPossessionRepository,
  type FakeHandoverPossessionRepository,
} from '../contexts/handover-possession/fake-repository'
import { listNoShows, listOverdue, type OverdueNoShowViewsDeps } from '../../../server/utils/overdue-noshow-views'
import type { CatalogRepository } from '../../../server/contexts/catalog'
import type { CustomerIdentityComplianceRepository } from '../../../server/contexts/customer-identity-compliance'

const tenantA = '11111111-1111-1111-1111-111111111111' as TenantId
const operatorId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const HAMMER = 1
const SCAFFOLD = 2
const TODAY = '2026-03-10'

describe('listNoShows (FR-28, FR-30, W7)', () => {
  let availabilityRepo: FakeAvailabilityReservationRepository
  let handoverRepo: FakeHandoverPossessionRepository
  let assetRegistry: FakeAssetRegistryRepository
  let catalogRepo: CatalogRepository
  let identityRepo: CustomerIdentityComplianceRepository

  beforeEach(() => {
    assetRegistry = createFakeAssetRegistryRepository()
    assetRegistry.seedAssetType(tenantA, HAMMER)
    availabilityRepo = createFakeAvailabilityReservationRepository()
    availabilityRepo.seedCapacity(HAMMER, 10)
    handoverRepo = createFakeHandoverPossessionRepository(assetRegistry)
    catalogRepo = createFakeCatalogRepository()
    identityRepo = createFakeCustomerIdentityComplianceRepository()
  })

  async function confirmedReservation(startDay: string, endDay: string) {
    const { group, reservations } = await checkoutReservationGroup(availabilityRepo, {
      tenantId: tenantA,
      lines: [{ assetTypeId: HAMMER, period: { startDay, endDay } }],
    })
    await recordTermsAcceptance(availabilityRepo, { tenantId: tenantA, reservationGroupId: group.id, termsVersion: 'v1' })
    await confirmReservationGroup(availabilityRepo, { tenantId: tenantA, reservationGroupId: group.id })
    return reservations[0]!
  }

  it('lists a Confirmed Reservation whose period began without a HandoverOut', async () => {
    const reservation = await confirmedReservation(TODAY, '2026-03-12')

    const noShows = await listNoShows({ availabilityRepo, handoverRepo, catalogRepo, identityRepo }, { tenantId: tenantA, today: TODAY })

    expect(noShows.map((e) => e.reservation.id)).toEqual([reservation.id])
  })

  it('stays a NoShow however many days have passed since the pickup day (D-17: no automatic timeout)', async () => {
    const reservation = await confirmedReservation('2026-03-01', '2026-03-03')

    const noShows = await listNoShows({ availabilityRepo, handoverRepo, catalogRepo, identityRepo }, { tenantId: tenantA, today: TODAY })

    expect(noShows.map((e) => e.reservation.id)).toEqual([reservation.id])
  })

  it('excludes a Reservation already handed out', async () => {
    const reservation = await confirmedReservation(TODAY, '2026-03-12')
    const asset = await assetRegistry.insertAsset(tenantA, { assetTypeId: HAMMER, status: 'in_possession', operatorId })
    const now = new Date()
    await handoverRepo.insertRentalAgreement(tenantA, {
      reservationId: reservation.id,
      customerId: 1,
      assetId: asset.id,
      operatorId,
      termsVersion: 'v1',
      handoverOutAt: now,
      handoverOutRecordedAt: now,
      handoverOutBackdateReason: null,
    })

    const noShows = await listNoShows({ availabilityRepo, handoverRepo, catalogRepo, identityRepo }, { tenantId: tenantA, today: TODAY })
    expect(noShows).toHaveLength(0)
  })

  it('excludes a Reservation whose pickup day has not arrived yet', async () => {
    await confirmedReservation('2026-03-15', '2026-03-17')

    const noShows = await listNoShows({ availabilityRepo, handoverRepo, catalogRepo, identityRepo }, { tenantId: tenantA, today: TODAY })
    expect(noShows).toHaveLength(0)
  })

  it('excludes a Pending Reservation (only Confirmed counts)', async () => {
    await checkoutReservationGroup(availabilityRepo, {
      tenantId: tenantA,
      lines: [{ assetTypeId: HAMMER, period: { startDay: TODAY, endDay: '2026-03-12' } }],
    })

    const noShows = await listNoShows({ availabilityRepo, handoverRepo, catalogRepo, identityRepo }, { tenantId: tenantA, today: TODAY })
    expect(noShows).toHaveLength(0)
  })
})

describe('listOverdue (FR-28, FR-29, D-17, W6, Finding 12)', () => {
  let availabilityRepo: FakeAvailabilityReservationRepository
  let handoverRepo: FakeHandoverPossessionRepository
  let assetRegistry: FakeAssetRegistryRepository
  let catalogRepo: CatalogRepository
  let identityRepo: CustomerIdentityComplianceRepository
  let deps: OverdueNoShowViewsDeps

  beforeEach(() => {
    assetRegistry = createFakeAssetRegistryRepository()
    assetRegistry.seedAssetType(tenantA, HAMMER)
    assetRegistry.seedAssetType(tenantA, SCAFFOLD)
    availabilityRepo = createFakeAvailabilityReservationRepository()
    availabilityRepo.seedCapacity(HAMMER, 10)
    availabilityRepo.seedCapacity(SCAFFOLD, 10)
    handoverRepo = createFakeHandoverPossessionRepository(assetRegistry)
    catalogRepo = createFakeCatalogRepository()
    identityRepo = createFakeCustomerIdentityComplianceRepository()
    deps = { availabilityRepo, handoverRepo, assetRegistryRepo: assetRegistry, catalogRepo, identityRepo }
  })

  async function confirmedReservation(assetTypeId: number, startDay: string, endDay: string) {
    const { group, reservations } = await checkoutReservationGroup(availabilityRepo, {
      tenantId: tenantA,
      lines: [{ assetTypeId, period: { startDay, endDay } }],
    })
    await recordTermsAcceptance(availabilityRepo, { tenantId: tenantA, reservationGroupId: group.id, termsVersion: 'v1' })
    await confirmReservationGroup(availabilityRepo, { tenantId: tenantA, reservationGroupId: group.id })
    return reservations[0]!
  }

  async function handOverAndLeaveOpen(reservationId: number, assetTypeId: number) {
    const asset = await assetRegistry.insertAsset(tenantA, { assetTypeId, status: 'in_possession', operatorId })
    const now = new Date()
    return handoverRepo.insertRentalAgreement(tenantA, {
      reservationId,
      customerId: 1,
      assetId: asset.id,
      operatorId,
      termsVersion: 'v1',
      handoverOutAt: now,
      handoverOutRecordedAt: now,
      handoverOutBackdateReason: null,
    })
  }

  it('lists a Reservation whose Possession has outlived its RentalPeriod', async () => {
    const reservation = await confirmedReservation(HAMMER, '2026-03-05', '2026-03-07')
    await handOverAndLeaveOpen(reservation.id, HAMMER)

    const overdue = await listOverdue(deps, { tenantId: tenantA, today: TODAY })

    expect(overdue).toHaveLength(1)
    expect(overdue[0]!.reservation.id).toBe(reservation.id)
    expect(overdue[0]!.daysOverdue).toBe(3)
  })

  it('excludes a Reservation whose RentalPeriod has not ended yet', async () => {
    const reservation = await confirmedReservation(HAMMER, '2026-03-08', '2026-03-15')
    await handOverAndLeaveOpen(reservation.id, HAMMER)

    const overdue = await listOverdue(deps, { tenantId: tenantA, today: TODAY })
    expect(overdue).toHaveLength(0)
  })

  it('excludes a Reservation already handed back', async () => {
    const reservation = await confirmedReservation(HAMMER, '2026-03-05', '2026-03-07')
    const agreement = await handOverAndLeaveOpen(reservation.id, HAMMER)
    await handoverRepo.setHandoverInAt(tenantA, agreement.id, {
      handoverInAt: new Date(),
      handoverInRecordedAt: new Date(),
      handoverInBackdateReason: null,
    })

    const overdue = await listOverdue(deps, { tenantId: tenantA, today: TODAY })
    expect(overdue).toHaveLength(0)
  })

  it('excludes a Reservation whose period ended but was never handed out (that is NoShow territory, not Overdue)', async () => {
    await confirmedReservation(HAMMER, '2026-03-05', '2026-03-07')

    const overdue = await listOverdue(deps, { tenantId: tenantA, today: TODAY })
    expect(overdue).toHaveLength(0)
  })

  it("ranks by earliest shortfall day, not by days late — an Overdue with no future demand pressure ranks last even though it's overdue longer (Finding 12)", async () => {
    // HAMMER: one Rentable unit exists besides the stuck one, and two
    // OTHER confirmed Reservations already claim a future day — the
    // stuck Asset's absence causes a real shortfall on 2026-03-15.
    await assetRegistry.insertAsset(tenantA, { assetTypeId: HAMMER, status: 'rentable', operatorId })
    const hammerReservation = await confirmedReservation(HAMMER, '2026-02-01', '2026-02-03') // overdue by far the longest
    await handOverAndLeaveOpen(hammerReservation.id, HAMMER)
    await confirmedReservation(HAMMER, '2026-03-15', '2026-03-16')
    await confirmedReservation(HAMMER, '2026-03-15', '2026-03-16')

    // SCAFFOLD: overdue too, but nothing else is booked for it ever —
    // its absence never causes a shortfall within the scan horizon.
    const scaffoldReservation = await confirmedReservation(SCAFFOLD, '2026-03-05', '2026-03-07')
    await handOverAndLeaveOpen(scaffoldReservation.id, SCAFFOLD)

    const overdue = await listOverdue(deps, { tenantId: tenantA, today: TODAY })

    expect(overdue).toHaveLength(2)
    expect(overdue[0]!.reservation.id).toBe(hammerReservation.id)
    expect(overdue[0]!.shortfallDay).toBe('2026-03-15')
    expect(overdue[1]!.reservation.id).toBe(scaffoldReservation.id)
    expect(overdue[1]!.shortfallDay).toBeNull()
    // Confirms this is NOT a days-late ranking: SCAFFOLD is overdue by
    // far FEWER days than HAMMER, yet HAMMER is still ranked first,
    // because only HAMMER's absence causes an actual shortfall.
    expect(overdue[0]!.daysOverdue).toBeGreaterThan(overdue[1]!.daysOverdue)
  })
})
