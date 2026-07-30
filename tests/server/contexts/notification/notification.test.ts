import { beforeEach, describe, expect, it } from 'vitest'
import type { TenantId } from '../../../../server/contexts/_shared'
import { dispatchReservationConfirmation, dispatchReturnReminder } from '../../../../server/contexts/notification/notification'
import { createFakeNotificationGateway, type FakeNotificationGateway } from './fake-gateway'
import { createFakeNotificationRepository, type FakeNotificationRepository } from './fake-repository'

const tenantA = '11111111-1111-1111-1111-111111111111' as TenantId
const customerId = 1

describe('dispatchReservationConfirmation (D-28, FR-32, issue #35)', () => {
  let repo: FakeNotificationRepository
  let gateway: FakeNotificationGateway

  beforeEach(() => {
    repo = createFakeNotificationRepository()
    gateway = createFakeNotificationGateway()
  })

  it('sends the confirmation email and records the dispatch', async () => {
    const result = await dispatchReservationConfirmation(
      { repo, gateway },
      {
        tenantId: tenantA,
        customerId,
        reservationGroupId: 1,
        to: 'jana@example.sk',
        customerName: 'Jana Nováková',
        lines: [{ assetTypeId: 1, startDay: '2026-03-05', endDay: '2026-03-07' }],
      },
    )

    expect(result).not.toBeNull()
    expect(result!.kind).toBe('confirmation')
    expect(result!.referenceId).toBe(1)
    expect(gateway.sentEmails).toHaveLength(1)
    expect(gateway.sentEmails[0]!.to).toBe('jana@example.sk')
    expect(gateway.sentEmails[0]!.text).toBeTruthy()
    expect(repo.allDispatches()).toHaveLength(1)
  })

  it('never sends twice for the same ReservationGroup — a redelivered webhook event is a no-op', async () => {
    await dispatchReservationConfirmation(
      { repo, gateway },
      {
        tenantId: tenantA,
        customerId,
        reservationGroupId: 1,
        to: 'jana@example.sk',
        customerName: 'Jana Nováková',
        lines: [{ assetTypeId: 1, startDay: '2026-03-05', endDay: '2026-03-07' }],
      },
    )

    const second = await dispatchReservationConfirmation(
      { repo, gateway },
      {
        tenantId: tenantA,
        customerId,
        reservationGroupId: 1,
        to: 'jana@example.sk',
        customerName: 'Jana Nováková',
        lines: [{ assetTypeId: 1, startDay: '2026-03-05', endDay: '2026-03-07' }],
      },
    )

    expect(second).toBeNull()
    expect(gateway.sentEmails).toHaveLength(1)
    expect(repo.allDispatches()).toHaveLength(1)
  })

  it('dispatches independently per ReservationGroup', async () => {
    await dispatchReservationConfirmation(
      { repo, gateway },
      { tenantId: tenantA, customerId, reservationGroupId: 1, to: 'a@example.sk', customerName: 'A', lines: [] },
    )
    await dispatchReservationConfirmation(
      { repo, gateway },
      { tenantId: tenantA, customerId, reservationGroupId: 2, to: 'b@example.sk', customerName: 'B', lines: [] },
    )

    expect(gateway.sentEmails).toHaveLength(2)
    expect(repo.allDispatches()).toHaveLength(2)
  })
})

describe('dispatchReturnReminder (A-08, FR-32, issue #35)', () => {
  let repo: FakeNotificationRepository
  let gateway: FakeNotificationGateway

  beforeEach(() => {
    repo = createFakeNotificationRepository()
    gateway = createFakeNotificationGateway()
  })

  it('sends the return reminder email and records the dispatch, distinct from an Overdue reminder (P1 §4)', async () => {
    const result = await dispatchReturnReminder(
      { repo, gateway },
      {
        tenantId: tenantA,
        customerId,
        reservationId: 42,
        to: 'jana@example.sk',
        customerName: 'Jana Nováková',
        assetTypeId: 1,
        endDay: '2026-03-07',
      },
    )

    expect(result).not.toBeNull()
    expect(result!.kind).toBe('return_reminder')
    expect(result!.referenceId).toBe(42)
    expect(gateway.sentEmails).toHaveLength(1)
  })

  it('never sends twice for the same Reservation', async () => {
    const params = {
      tenantId: tenantA,
      customerId,
      reservationId: 42,
      to: 'jana@example.sk',
      customerName: 'Jana Nováková',
      assetTypeId: 1,
      endDay: '2026-03-07',
    }
    await dispatchReturnReminder({ repo, gateway }, params)
    const second = await dispatchReturnReminder({ repo, gateway }, params)

    expect(second).toBeNull()
    expect(gateway.sentEmails).toHaveLength(1)
  })

  it("a confirmation and a return reminder for the same reference id are independent kinds — neither blocks the other", async () => {
    await dispatchReservationConfirmation(
      { repo, gateway },
      { tenantId: tenantA, customerId, reservationGroupId: 42, to: 'jana@example.sk', customerName: 'Jana', lines: [] },
    )
    const result = await dispatchReturnReminder(
      { repo, gateway },
      {
        tenantId: tenantA,
        customerId,
        reservationId: 42, // same numeric id, different kind
        to: 'jana@example.sk',
        customerName: 'Jana',
        assetTypeId: 1,
        endDay: '2026-03-07',
      },
    )

    expect(result).not.toBeNull()
    expect(gateway.sentEmails).toHaveLength(2)
  })
})
