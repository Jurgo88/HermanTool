import { beforeEach, describe, expect, it } from 'vitest'
import { createMonetaryAmount, type TenantId } from '../../../../server/contexts/_shared'
import {
  attestDeliveryFeePayment,
  inZoneFeeTotal,
  priceOutsideZone,
  priceOutsideZoneDelivery,
  quoteDeliveryRequests,
  recordDeliveries,
} from '../../../../server/contexts/logistics-delivery/delivery'
import type { LogisticsDeliveryRepository } from '../../../../server/contexts/logistics-delivery/repository'
import {
  DeliveryAddressRequiredError,
  DeliveryFeeAlreadyAttestedError,
  DeliveryNotOfferedError,
  DuplicateDeliveryLegError,
  MunicipalityNotInZoneError,
  OutsideZonePricingError,
  type Delivery,
  type DeliveryFeePayment,
  type DeliveryRequest,
  type DeliveryZoneMunicipality,
} from '../../../../server/contexts/logistics-delivery/types'

const tenantA = '11111111-1111-1111-1111-111111111111' as TenantId
const tenantB = '22222222-2222-2222-2222-222222222222' as TenantId
const operatorId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

const settings = { flatFee: createMonetaryAmount(1500), perKmRate: createMonetaryAmount(80) }

function fakeRepo(): LogisticsDeliveryRepository {
  const zone: DeliveryZoneMunicipality[] = []
  const deliveries: Delivery[] = []
  const payments: DeliveryFeePayment[] = []
  return {
    async listZone(tenantId) {
      return zone.filter((m) => m.tenantId === tenantId)
    },
    async getZoneMunicipality(tenantId, id) {
      return zone.find((m) => m.tenantId === tenantId && m.id === id) ?? null
    },
    async insertZoneMunicipality(tenantId, { name }) {
      const m = { id: zone.length + 1, tenantId, name }
      zone.push(m)
      return m
    },
    async markZoneMunicipalityRemoved(tenantId, id) {
      const i = zone.findIndex((m) => m.tenantId === tenantId && m.id === id)
      if (i >= 0) zone.splice(i, 1)
    },
    async insertDelivery(tenantId, p) {
      const d: Delivery = {
        id: deliveries.length + 1,
        tenantId,
        ...p,
        distanceKm: null,
        pricedByOperatorId: null,
        pricedAt: null,
      }
      deliveries.push(d)
      return { ...d }
    },
    async getDelivery(tenantId, id) {
      const d = deliveries.find((x) => x.tenantId === tenantId && x.id === id)
      return d ? { ...d } : null
    },
    async listDeliveriesForGroup(tenantId, groupId) {
      return deliveries.filter((d) => d.tenantId === tenantId && d.reservationGroupId === groupId)
    },
    async setOutsideZonePrice(tenantId, id, { distanceKm, fee, operatorId: by }) {
      const d = deliveries.find((x) => x.tenantId === tenantId && x.id === id)!
      Object.assign(d, { distanceKm, fee, pricedByOperatorId: by, pricedAt: new Date() })
      return { ...d }
    },
    async insertFeePayment(tenantId, p) {
      const row = { id: payments.length + 1, tenantId, attestedAt: new Date(), ...p }
      payments.push(row)
      return row
    },
    async listFeePayments(tenantId, deliveryId) {
      return payments.filter((p) => p.tenantId === tenantId && p.deliveryId === deliveryId)
    },
  }
}

let repo: LogisticsDeliveryRepository
let bratislava: DeliveryZoneMunicipality
let foreign: DeliveryZoneMunicipality

const request = (patch: Partial<DeliveryRequest> = {}): DeliveryRequest => ({
  leg: 'delivery',
  timeWindow: 'morning',
  outsideZone: false,
  municipalityId: bratislava.id,
  address: 'Hlavná 1',
  ...patch,
})

beforeEach(async () => {
  repo = fakeRepo()
  bratislava = await repo.insertZoneMunicipality(tenantA, { name: 'Bratislava', operatorId })
  foreign = await repo.insertZoneMunicipality(tenantB, { name: 'Košice', operatorId })
})

describe('quoteDeliveryRequests (D-66)', () => {
  it('prices an in-zone leg at the flat fee and leaves an outside-zone leg unpriced', async () => {
    const quoted = await quoteDeliveryRequests(repo, {
      tenantId: tenantA,
      settings,
      requests: [
        request(),
        request({
          leg: 'collection',
          outsideZone: true,
          municipalityId: null,
          address: 'Senec, Nová 5',
        }),
      ],
    })
    expect(quoted.map((q) => q.fee)).toEqual([createMonetaryAmount(1500), null])
  })

  it('is not offered while the flat fee is unset or the zone is empty (OQ #32)', async () => {
    await expect(
      quoteDeliveryRequests(repo, {
        tenantId: tenantA,
        settings: { flatFee: null, perKmRate: null },
        requests: [request()],
      }),
    ).rejects.toThrow(DeliveryNotOfferedError)
    await expect(
      quoteDeliveryRequests(fakeRepo(), { tenantId: tenantA, settings, requests: [request()] }),
    ).rejects.toThrow(DeliveryNotOfferedError)
  })

  it("never gives the flat fee to a municipality outside the zone — another Tenant's included (FR-33)", async () => {
    await expect(
      quoteDeliveryRequests(repo, {
        tenantId: tenantA,
        settings,
        requests: [request({ municipalityId: foreign.id })],
      }),
    ).rejects.toThrow(MunicipalityNotInZoneError)
    await expect(
      quoteDeliveryRequests(repo, {
        tenantId: tenantA,
        settings,
        requests: [request({ municipalityId: null })],
      }),
    ).rejects.toThrow(MunicipalityNotInZoneError)
  })

  it('refuses a missing address and a second leg of the same kind', async () => {
    await expect(
      quoteDeliveryRequests(repo, {
        tenantId: tenantA,
        settings,
        requests: [request({ address: '  ' })],
      }),
    ).rejects.toThrow(DeliveryAddressRequiredError)
    await expect(
      quoteDeliveryRequests(repo, {
        tenantId: tenantA,
        settings,
        requests: [request(), request()],
      }),
    ).rejects.toThrow(DuplicateDeliveryLegError)
  })

  it('requires nothing when no leg is asked for — a pickup stays a pickup', async () => {
    expect(
      await quoteDeliveryRequests(repo, {
        tenantId: tenantA,
        settings: { flatFee: null, perKmRate: null },
        requests: [],
      }),
    ).toEqual([])
  })
})

describe('outside-zone pricing and the driver fee (D-66, D-21, FR-34)', () => {
  async function outsideLeg() {
    const quoted = await quoteDeliveryRequests(repo, {
      tenantId: tenantA,
      settings,
      requests: [request({ outsideZone: true, municipalityId: null, address: 'Senec' })],
    })
    const [delivery] = await recordDeliveries(repo, {
      tenantId: tenantA,
      reservationGroupId: 9,
      quoted,
    })
    return delivery!
  }

  it('is flat fee + km × rate, computed on the server', () => {
    expect(priceOutsideZone(settings, 12)).toEqual(createMonetaryAmount(1500 + 12 * 80))
    expect(() => priceOutsideZone({ ...settings, perKmRate: null }, 12)).toThrow(
      OutsideZonePricingError,
    )
    expect(() => priceOutsideZone(settings, 2.5)).toThrow(OutsideZonePricingError)
  })

  it('records who priced it and refuses re-pricing once the fee is attested', async () => {
    const leg = await outsideLeg()
    const priced = await priceOutsideZoneDelivery(repo, {
      tenantId: tenantA,
      deliveryId: leg.id,
      distanceKm: 20,
      settings,
      operatorId,
    })
    expect(priced).toMatchObject({
      distanceKm: 20,
      fee: createMonetaryAmount(3100),
      pricedByOperatorId: operatorId,
    })

    const paid = await attestDeliveryFeePayment(repo, {
      tenantId: tenantA,
      deliveryId: leg.id,
      method: 'cash',
      operatorId,
    })
    expect(paid).toMatchObject({ amount: createMonetaryAmount(3100), method: 'cash', operatorId })
    await expect(
      attestDeliveryFeePayment(repo, {
        tenantId: tenantA,
        deliveryId: leg.id,
        method: 'qr',
        operatorId,
      }),
    ).rejects.toThrow(DeliveryFeeAlreadyAttestedError)
    await expect(
      priceOutsideZoneDelivery(repo, {
        tenantId: tenantA,
        deliveryId: leg.id,
        distanceKm: 5,
        settings,
        operatorId,
      }),
    ).rejects.toThrow(DeliveryFeeAlreadyAttestedError)
  })

  it('refuses to price an in-zone leg or to take a fee before pricing', async () => {
    const quoted = await quoteDeliveryRequests(repo, {
      tenantId: tenantA,
      settings,
      requests: [request()],
    })
    const [inZone] = await recordDeliveries(repo, {
      tenantId: tenantA,
      reservationGroupId: 9,
      quoted,
    })
    await expect(
      priceOutsideZoneDelivery(repo, {
        tenantId: tenantA,
        deliveryId: inZone!.id,
        distanceKm: 3,
        settings,
        operatorId,
      }),
    ).rejects.toThrow(OutsideZonePricingError)

    const outside = await outsideLeg()
    await expect(
      attestDeliveryFeePayment(repo, {
        tenantId: tenantA,
        deliveryId: outside.id,
        method: 'cash',
        operatorId,
      }),
    ).rejects.toThrow(OutsideZonePricingError)
  })
})

describe('inZoneFeeTotal (paid with the rental fee, never discounted)', () => {
  it('sums in-zone legs and leaves outside-zone legs to the driver', async () => {
    const quoted = await quoteDeliveryRequests(repo, {
      tenantId: tenantA,
      settings,
      requests: [
        request(),
        request({ leg: 'collection', outsideZone: true, municipalityId: null, address: 'Senec' }),
      ],
    })
    const recorded = await recordDeliveries(repo, {
      tenantId: tenantA,
      reservationGroupId: 3,
      quoted,
    })
    expect(inZoneFeeTotal(recorded, 'EUR')).toEqual(createMonetaryAmount(1500))
  })
})
