// Delivery and Collection (D-66; issue #217). Every fee is computed here,
// on the server; a fee sent by a browser is never read (D-25).
//
// Inside the DeliveryZone: the flat fee per leg, priced at checkout and
// paid with the rental fee (online or on site). D-65's online discount
// never applies to it. Outside the zone: the group completes as an
// ordinary pickup request with no fee; after the phone call the Operator
// records the km and the fee becomes flat fee + km × rate, paid to the
// driver on site and attested (PIN, amount, method) like an OnSitePayment.
//
// The handover itself is untouched: the driver is an Operator running the
// normal HandoverOut / HandoverIn (ID, condition photographs, AssetTag
// scan, deposit), so FR-19 and FR-20 hold without exception. This module
// never touches a RentalAgreement, a ConditionReport or capacity.
import { createMonetaryAmount, type MonetaryAmount, type TenantId } from '../_shared'
import type { LogisticsDeliveryRepository } from './repository'
import {
  DeliveryAddressRequiredError,
  DeliveryFeeAlreadyAttestedError,
  DeliveryFeeCorrectionError,
  DeliveryNotFoundError,
  DeliveryNotOfferedError,
  DuplicateDeliveryLegError,
  MunicipalityNameRequiredError,
  MunicipalityNameTakenError,
  MunicipalityNotInZoneError,
  OutsideZonePricingError,
  type Delivery,
  type DeliveryFeeCorrection,
  type DeliveryFeePayment,
  type DeliveryFeePaymentMethod,
  type DeliveryRequest,
  type DeliverySettings,
  type DeliveryZoneMunicipality,
} from './types'

const MAX_ADDRESS_LENGTH = 300
export const MAX_DISTANCE_KM = 1000

// Offered only when the flat fee is set and the zone names at least one
// municipality — the outside-zone request still needs the flat fee to price.
export function isDeliveryOffered(
  settings: DeliverySettings,
  zone: DeliveryZoneMunicipality[],
): boolean {
  return settings.flatFee !== null && zone.length > 0
}

// Flat fee + km × rate, in the flat fee's currency (D-21).
export function priceOutsideZone(settings: DeliverySettings, distanceKm: number): MonetaryAmount {
  if (!settings.flatFee) throw new DeliveryNotOfferedError()
  if (!settings.perKmRate) throw new OutsideZonePricingError('the per-km rate is not set (OQ #32)')
  if (settings.perKmRate.currency !== settings.flatFee.currency) {
    throw new OutsideZonePricingError(
      'the flat fee and the per-km rate are in different currencies',
    )
  }
  if (!Number.isInteger(distanceKm) || distanceKm < 0 || distanceKm > MAX_DISTANCE_KM) {
    throw new OutsideZonePricingError(`distance must be a whole number of km, 0–${MAX_DISTANCE_KM}`)
  }
  return createMonetaryAmount(
    settings.flatFee.amount + settings.perKmRate.amount * distanceKm,
    settings.flatFee.currency,
  )
}

// Validates the checkout's requests against the zone and settings and
// returns each with its server-computed fee (null outside the zone). Pure
// apart from the zone lookup, so it runs BEFORE anything is held.
export async function quoteDeliveryRequests(
  repo: Pick<LogisticsDeliveryRepository, 'listZone'>,
  params: { tenantId: TenantId; settings: DeliverySettings; requests: DeliveryRequest[] },
): Promise<{ request: DeliveryRequest; fee: MonetaryAmount | null }[]> {
  const { tenantId, settings, requests } = params
  if (requests.length === 0) return []
  const legs = new Set<string>()
  for (const request of requests) {
    if (legs.has(request.leg)) throw new DuplicateDeliveryLegError(request.leg)
    legs.add(request.leg)
  }
  const zone = await repo.listZone(tenantId)
  if (!isDeliveryOffered(settings, zone)) throw new DeliveryNotOfferedError()
  const zoneIds = new Set(zone.map((m) => m.id))

  return requests.map((request) => {
    const address = request.address.trim()
    if (!address || address.length > MAX_ADDRESS_LENGTH) throw new DeliveryAddressRequiredError()
    if (request.outsideZone) {
      return { request: { ...request, municipalityId: null, address }, fee: null }
    }
    // A municipality not in the zone never gets the flat fee.
    if (request.municipalityId === null || !zoneIds.has(request.municipalityId)) {
      throw new MunicipalityNotInZoneError(request.municipalityId)
    }
    return { request: { ...request, address }, fee: settings.flatFee }
  })
}

// Records the quoted legs for a ReservationGroup just created at checkout.
export async function recordDeliveries(
  repo: LogisticsDeliveryRepository,
  params: {
    tenantId: TenantId
    reservationGroupId: number
    quoted: { request: DeliveryRequest; fee: MonetaryAmount | null }[]
  },
): Promise<Delivery[]> {
  const recorded: Delivery[] = []
  for (const { request, fee } of params.quoted) {
    recorded.push(
      await repo.insertDelivery(params.tenantId, {
        reservationGroupId: params.reservationGroupId,
        leg: request.leg,
        timeWindow: request.timeWindow,
        outsideZone: request.outsideZone,
        municipalityId: request.municipalityId,
        address: request.address,
        fee,
      }),
    )
  }
  return recorded
}

// The in-zone fees of a group, paid with the rental fee (never discounted,
// D-65). Outside-zone fees are paid to the driver and are not in here.
export function inZoneFeeTotal(
  deliveries: Delivery[],
  currency: MonetaryAmount['currency'],
): MonetaryAmount {
  const fees = deliveries.filter((d) => !d.outsideZone && d.fee !== null).map((d) => d.fee!)
  if (fees.some((fee) => fee.currency !== currency)) {
    throw new Error('Mixed currencies between the rental fee and a Delivery fee.')
  }
  return createMonetaryAmount(
    fees.reduce((sum, fee) => sum + fee.amount, 0),
    currency,
  )
}

// After the phone call: the Operator enters the km (FR-34 records who).
// Re-pricing is allowed until the fee has been attested as paid.
export async function priceOutsideZoneDelivery(
  repo: LogisticsDeliveryRepository,
  params: {
    tenantId: TenantId
    deliveryId: number
    distanceKm: number
    settings: DeliverySettings
    operatorId: string
  },
): Promise<Delivery> {
  const delivery = await repo.getDelivery(params.tenantId, params.deliveryId)
  if (!delivery) throw new DeliveryNotFoundError(params.deliveryId)
  if (!delivery.outsideZone) throw new OutsideZonePricingError('this leg is inside the zone')
  if ((await repo.listFeePayments(params.tenantId, delivery.id)).length > 0) {
    throw new DeliveryFeeAlreadyAttestedError(delivery.id)
  }
  const fee = priceOutsideZone(params.settings, params.distanceKm)
  return repo.setOutsideZonePrice(params.tenantId, delivery.id, {
    distanceKm: params.distanceKm,
    fee,
    operatorId: params.operatorId,
  })
}

// The attestation in force: the one no later attestation supersedes.
export function currentDeliveryFeePayment(
  payments: DeliveryFeePayment[],
): DeliveryFeePayment | null {
  const superseded = new Set(
    payments.map((p) => p.supersedesId).filter((id): id is number => id !== null),
  )
  const current = payments.filter((p) => !superseded.has(p.id))
  return current.sort((a, b) => b.id - a.id)[0] ?? null
}

// The driver attests the outside-zone fee received on site (PIN-resolved
// Operator, D-48). Amount is the server's price, never typed in.
//
// #237 (P1, D-10, D-65 pattern): a mistake is corrected by a new
// attestation that supersedes the one in force and says why. A wrong km
// is corrected in the same act — the leg is re-priced and the new
// attestation carries the new price, atomically. Only a correction may
// re-price an attested leg; priceOutsideZoneDelivery still refuses.
export async function attestDeliveryFeePayment(
  repo: LogisticsDeliveryRepository,
  params: {
    tenantId: TenantId
    deliveryId: number
    method: DeliveryFeePaymentMethod
    operatorId: string
    correction?: DeliveryFeeCorrection
    // Needed only to re-price a corrected km.
    settings?: DeliverySettings
  },
): Promise<DeliveryFeePayment> {
  const { tenantId, correction } = params
  return repo.transaction(async (tx) => {
    const delivery = await tx.getDelivery(tenantId, params.deliveryId)
    if (!delivery) throw new DeliveryNotFoundError(params.deliveryId)
    if (!delivery.outsideZone || !delivery.fee) {
      throw new OutsideZonePricingError('only a priced outside-zone leg is paid to the driver')
    }

    const current = currentDeliveryFeePayment(await tx.listFeePayments(tenantId, delivery.id))
    let amount = delivery.fee
    if (!correction) {
      if (current) throw new DeliveryFeeAlreadyAttestedError(delivery.id)
    } else {
      if (!correction.reason.trim()) throw new DeliveryFeeCorrectionError('a reason is required')
      if (!current || current.id !== correction.supersedesId) {
        throw new DeliveryFeeCorrectionError('only the attestation in force can be corrected')
      }
      if (correction.distanceKm !== undefined && correction.distanceKm !== delivery.distanceKm) {
        if (!params.settings) throw new DeliveryFeeCorrectionError('re-pricing needs the fee settings')
        const fee = priceOutsideZone(params.settings, correction.distanceKm)
        const repriced = await tx.setOutsideZonePrice(tenantId, delivery.id, {
          distanceKm: correction.distanceKm,
          fee,
          operatorId: params.operatorId,
        })
        amount = repriced.fee ?? fee
      }
    }

    return tx.insertFeePayment(tenantId, {
      deliveryId: delivery.id,
      amount,
      method: params.method,
      operatorId: params.operatorId,
      supersedesId: correction?.supersedesId ?? null,
      correctionReason: correction ? correction.reason.trim() : null,
    })
  })
}

export async function addZoneMunicipality(
  repo: LogisticsDeliveryRepository,
  params: { tenantId: TenantId; name: string; operatorId: string },
): Promise<DeliveryZoneMunicipality> {
  const name = params.name.trim()
  if (!name) throw new MunicipalityNameRequiredError()
  const zone = await repo.listZone(params.tenantId)
  if (zone.some((m) => m.name.toLocaleLowerCase('sk') === name.toLocaleLowerCase('sk'))) {
    throw new MunicipalityNameTakenError(name)
  }
  return repo.insertZoneMunicipality(params.tenantId, { name, operatorId: params.operatorId })
}

export async function removeZoneMunicipality(
  repo: LogisticsDeliveryRepository,
  params: { tenantId: TenantId; id: number; operatorId: string },
): Promise<void> {
  const existing = await repo.getZoneMunicipality(params.tenantId, params.id)
  if (!existing) throw new MunicipalityNotInZoneError(params.id)
  await repo.markZoneMunicipalityRemoved(params.tenantId, params.id, params.operatorId)
}
