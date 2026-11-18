import { describe, expect, it } from 'vitest'
import { createMonetaryAmount, type TenantId } from '../../../server/contexts/_shared'
import type { CatalogRepository } from '../../../server/contexts/catalog'
import type { Delivery } from '../../../server/contexts/logistics-delivery'
import { computeGroupCharges } from '../../../server/utils/group-charges'

const tenantId = '11111111-1111-1111-1111-111111111111' as TenantId

const catalogRepo = {
  async getAssetType(_tenant: TenantId, id: number) {
    return {
      id,
      tenantId,
      name: 'Vŕtačka',
      description: '',
      dayRate: createMonetaryAmount(2500),
      depositAmount: createMonetaryAmount(12500),
      published: true,
    }
  },
} as unknown as CatalogRepository

const leg = (patch: Partial<Delivery>): Delivery => ({
  id: 1,
  tenantId,
  reservationGroupId: 1,
  leg: 'delivery',
  timeWindow: 'morning',
  outsideZone: false,
  municipalityId: 1,
  address: 'Hlavná 1',
  fee: createMonetaryAmount(1500),
  distanceKm: null,
  pricedByOperatorId: null,
  pricedAt: null,
  ...patch,
})

describe('computeGroupCharges (D-65 discount, D-66 fees)', () => {
  it('discounts only the rental fee; in-zone Delivery fees are added in full; outside-zone ones are not', async () => {
    const charges = await computeGroupCharges({
      tenantId,
      reservations: [{ assetTypeId: 1, period: { startDay: '2026-10-05', endDay: '2026-10-06' } }],
      catalogRepo,
      deliveries: [
        leg({}),
        leg({
          id: 2,
          leg: 'collection',
          outsideZone: true,
          municipalityId: null,
          fee: createMonetaryAmount(4000),
        }),
      ],
      onlineDiscountBasisPoints: 1000,
    })
    expect(charges.rentalFee).toEqual(createMonetaryAmount(5000))
    expect(charges.onlineRentalFee).toEqual(createMonetaryAmount(4500))
    expect(charges.inZoneDeliveryFee).toEqual(createMonetaryAmount(1500))
    expect(charges.onlineTotal).toEqual(createMonetaryAmount(6000))
    expect(charges.onSiteTotal).toEqual(createMonetaryAmount(6500))
  })
})
