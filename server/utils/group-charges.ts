// What a ReservationGroup owes, computed in one place so the S-03 quote,
// the Stripe amount, the on-site e-mails and the counter can never
// disagree (D-65, D-66; #215, #217).
//
// - rental fee: day rate × days (Payments' computeRentalFeeAmount);
// - online: less the Tenant's discount (D-65) — the rental fee only;
// - in-zone Delivery/Collection fees (D-66): added to both totals, never
//   discounted; outside-zone fees are paid to the driver and not in here.
import { createMonetaryAmount, type MonetaryAmount, type TenantId } from '../contexts/_shared'
import type { Reservation } from '../contexts/availability-reservation'
import type { CatalogRepository } from '../contexts/catalog'
import { inZoneFeeTotal, type Delivery } from '../contexts/logistics-delivery'
import { quoteReservationLines } from './reservation-quote'

export interface GroupCharges {
  rentalFee: MonetaryAmount
  onlineRentalFee: MonetaryAmount
  inZoneDeliveryFee: MonetaryAmount
  onlineTotal: MonetaryAmount
  onSiteTotal: MonetaryAmount
}

export function addAmounts(a: MonetaryAmount, b: MonetaryAmount): MonetaryAmount {
  if (a.currency !== b.currency)
    throw new Error('Cannot add amounts in different currencies (D-21).')
  return createMonetaryAmount(a.amount + b.amount, a.currency)
}

export async function computeGroupCharges(params: {
  tenantId: TenantId
  reservations: Pick<Reservation, 'assetTypeId' | 'period'>[]
  catalogRepo: CatalogRepository
  deliveries: Delivery[]
  onlineDiscountBasisPoints: number | null
}): Promise<GroupCharges> {
  const quote = await quoteReservationLines(
    params.reservations.map((r) => ({ assetTypeId: r.assetTypeId, period: r.period, quantity: 1 })),
    (assetTypeId) => params.catalogRepo.getAssetType(params.tenantId, assetTypeId),
    { onlineDiscountBasisPoints: params.onlineDiscountBasisPoints },
  )
  const inZoneDeliveryFee = inZoneFeeTotal(params.deliveries, quote.rentalFeeTotal.currency)
  return {
    rentalFee: quote.rentalFeeTotal,
    onlineRentalFee: quote.onlineRentalFeeTotal,
    inZoneDeliveryFee,
    onlineTotal: addAmounts(quote.onlineRentalFeeTotal, inZoneDeliveryFee),
    onSiteTotal: addAmounts(quote.rentalFeeTotal, inZoneDeliveryFee),
  }
}
