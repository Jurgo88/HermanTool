// Logistics & Delivery's HTTP plumbing (D-66; #217): the repository on the
// shared connection (D-39) and the typed-error translation.
import { createError, getRouterParam, type H3Event } from 'h3'
import { useRuntimeConfig } from '#imports'
import {
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
  createPostgresLogisticsDeliveryRepository,
} from '../contexts/logistics-delivery'
import { getSharedDatabaseClient } from './db'

export function createLogisticsDeliveryDeps(event: H3Event) {
  const sql = getSharedDatabaseClient(useRuntimeConfig(event).databaseUrl)
  return { repo: createPostgresLogisticsDeliveryRepository(sql), sql }
}

export function getPositiveIdParam(event: H3Event, name: string): number {
  const raw = getRouterParam(event, name)
  const id = Number(raw)
  if (!raw || !Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: `Invalid ${name}.` })
  }
  return id
}

export function translateLogisticsDeliveryError(err: unknown): never {
  const reply = (statusCode: number, e: Error) =>
    createError({ statusCode, statusMessage: e.message, data: { code: e.constructor.name } })
  if (err instanceof DeliveryNotFoundError) throw reply(404, err)
  if (
    err instanceof DeliveryNotOfferedError ||
    err instanceof DeliveryFeeAlreadyAttestedError ||
    err instanceof MunicipalityNameTakenError
  ) {
    throw reply(409, err)
  }
  if (
    err instanceof MunicipalityNotInZoneError ||
    err instanceof DeliveryAddressRequiredError ||
    err instanceof DuplicateDeliveryLegError ||
    err instanceof OutsideZonePricingError ||
    err instanceof MunicipalityNameRequiredError ||
    err instanceof LogisticsDeliveryError
  ) {
    throw reply(400, err)
  }
  throw err
}
