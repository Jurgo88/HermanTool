// Domain types for Logistics & Delivery (D-66; issue #217). See ./index.ts.
import type { MonetaryAmount, TenantId } from '../_shared'

// Delivery takes a ReservationGroup's Assets to the Customer on the first
// day of its RentalPeriod; Collection fetches them back on the last day.
export type DeliveryLeg = 'delivery' | 'collection'

// The Customer picks a half-day; the exact time is agreed by phone.
export type TimeWindow = 'morning' | 'afternoon'

export interface DeliveryZoneMunicipality {
  id: number
  tenantId: TenantId
  name: string
}

// Tenant policy values (D-21). Null = not set (OQ #32): without a flat fee
// no Delivery is offered; without a per-km rate no outside-zone price.
export interface DeliverySettings {
  flatFee: MonetaryAmount | null
  perKmRate: MonetaryAmount | null
}

export interface Delivery {
  id: number
  tenantId: TenantId
  reservationGroupId: number
  leg: DeliveryLeg
  timeWindow: TimeWindow
  outsideZone: boolean
  municipalityId: number | null
  address: string
  // Null outside the zone until the Operator prices it after the call.
  fee: MonetaryAmount | null
  distanceKm: number | null
  pricedByOperatorId: string | null
  pricedAt: Date | null
}

// What the Customer asks for at checkout, per leg.
export interface DeliveryRequest {
  leg: DeliveryLeg
  timeWindow: TimeWindow
  outsideZone: boolean
  municipalityId: number | null
  address: string
}

export type DeliveryFeePaymentMethod = 'cash' | 'card_terminal' | 'qr'

export interface DeliveryFeePayment {
  id: number
  tenantId: TenantId
  deliveryId: number
  amount: MonetaryAmount
  method: DeliveryFeePaymentMethod
  operatorId: string
  attestedAt: Date
}

export class LogisticsDeliveryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

export class DeliveryNotOfferedError extends LogisticsDeliveryError {
  constructor() {
    super('Delivery and Collection are not offered: the Tenant has not set the flat fee (OQ #32).')
  }
}

export class MunicipalityNotInZoneError extends LogisticsDeliveryError {
  constructor(municipalityId: number | null) {
    super(`Municipality ${municipalityId ?? '(none)'} is not in this Tenant's DeliveryZone.`)
  }
}

export class DeliveryAddressRequiredError extends LogisticsDeliveryError {
  constructor() {
    super('A Delivery or Collection needs an address (street, or the place outside the zone).')
  }
}

export class DuplicateDeliveryLegError extends LogisticsDeliveryError {
  constructor(leg: DeliveryLeg) {
    super(`A ReservationGroup has at most one ${leg}.`)
  }
}

export class DeliveryNotFoundError extends LogisticsDeliveryError {
  constructor(deliveryId: number) {
    super(`Delivery ${deliveryId} does not exist for this Tenant.`)
  }
}

export class OutsideZonePricingError extends LogisticsDeliveryError {
  constructor(detail: string) {
    super(`Outside-zone pricing refused: ${detail}.`)
  }
}

export class MunicipalityNameRequiredError extends LogisticsDeliveryError {
  constructor() {
    super('A municipality needs a name.')
  }
}

export class MunicipalityNameTakenError extends LogisticsDeliveryError {
  constructor(name: string) {
    super(`"${name}" is already in the DeliveryZone.`)
  }
}

export class DeliveryFeeAlreadyAttestedError extends LogisticsDeliveryError {
  constructor(deliveryId: number) {
    super(`The fee for Delivery ${deliveryId} is already attested.`)
  }
}
