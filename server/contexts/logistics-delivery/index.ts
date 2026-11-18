// Logistics & Delivery — opened by D-66 (issue #217) in the narrowest form
// Part 1 §3 allows: Delivery, Collection and the DeliveryZone. Depots and
// everything else stay [Future]. Supersedes A-01.
//
// Dependency direction: downstream of Availability & Reservation — a
// Delivery belongs to one ReservationGroup and never holds capacity. This
// context imports no other context; the composition root joins it to the
// group, the Customer and the e-mails.
export type {
  Delivery,
  DeliveryFeePayment,
  DeliveryFeePaymentMethod,
  DeliveryLeg,
  DeliveryRequest,
  DeliverySettings,
  DeliveryZoneMunicipality,
  TimeWindow,
} from './types'
export {
  DeliveryAddressRequiredError,
  DeliveryFeeAlreadyAttestedError,
  DeliveryNotFoundError,
  DeliveryNotOfferedError,
  DuplicateDeliveryLegError,
  LogisticsDeliveryError,
  MunicipalityNameRequiredError,
  MunicipalityNameTakenError,
  MunicipalityNotInZoneError,
  OutsideZonePricingError,
} from './types'
export type { LogisticsDeliveryRepository, NewDelivery } from './repository'
export { createPostgresLogisticsDeliveryRepository } from './repository'
export {
  MAX_DISTANCE_KM,
  addZoneMunicipality,
  attestDeliveryFeePayment,
  inZoneFeeTotal,
  isDeliveryOffered,
  priceOutsideZone,
  priceOutsideZoneDelivery,
  quoteDeliveryRequests,
  recordDeliveries,
  removeZoneMunicipality,
} from './delivery'
