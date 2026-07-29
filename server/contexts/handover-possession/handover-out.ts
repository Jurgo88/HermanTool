// HandoverOut at the counter [MVP · CORE] (D-04, D-05, FR-14, FR-15,
// FR-18, FR-19, FR-21, FR-22, W4; issue #23). "The thirty seconds the
// whole product exists to make fast" — Customer identified, deposit
// taken, instance chosen, condition recorded, possession opened.
//
// Composes Availability & Reservation and Customer Identity &
// Compliance's published interfaces directly (permitted — this context
// is downstream of both, see ./index.ts). Never composes Catalog: the
// deposit amount is Catalog's own data (AssetType.depositAmount) and
// must be resolved by the caller (a route composing Catalog's published
// interface) and passed in as an already-authoritative MonetaryAmount —
// this module never looks it up and never trusts a client-supplied one
// either, since the caller is expected to have read it from Catalog,
// not from the request body.
import { randomUUID } from 'node:crypto'
import type { AvailabilityReservationRepository } from '../availability-reservation'
import type { CustomerIdentityComplianceRepository } from '../customer-identity-compliance'
import type { MonetaryAmount, TenantId } from '../_shared'
import { resolveScanEvent } from './scan-resolution'
import type { ConditionReportStorageGateway } from './r2-gateway'
import type { HandoverPossessionRepository } from './repository'
import {
  AssetTypeMismatchError,
  CustomerReservationMismatchError,
  EmptyConditionReportError,
  IdentityVerificationRequiredError,
  ReservationNotConfirmedError,
  UnexpectedScanResolutionError,
  type ConditionReport,
  type DepositTaken,
  type RentalAgreement,
} from './types'

export interface PerformHandoverOutDeps {
  repo: HandoverPossessionRepository
  availabilityRepo: AvailabilityReservationRepository
  identityRepo: CustomerIdentityComplianceRepository
  conditionsGateway: ConditionReportStorageGateway
}

export interface PerformHandoverOutParams {
  tenantId: TenantId
  tagCode: string
  reservationId: number
  customerId: number
  operatorId: string
  depositAmount: MonetaryAmount
  conditionPhotoContentTypes: string[]
}

export interface PerformHandoverOutResult {
  rentalAgreement: RentalAgreement
  conditionReport: ConditionReport
  depositTaken: DepositTaken
  conditionPhotoUploadUrls: string[]
}

export async function performHandoverOut(
  deps: PerformHandoverOutDeps,
  params: PerformHandoverOutParams,
): Promise<PerformHandoverOutResult> {
  const { repo, availabilityRepo, identityRepo, conditionsGateway } = deps
  const { tenantId, tagCode, reservationId, customerId, operatorId, depositAmount, conditionPhotoContentTypes } =
    params

  if (conditionPhotoContentTypes.length === 0) throw new EmptyConditionReportError()

  // Read-side checks first, outside any transaction — cheap to fail
  // before opening one, and none of them mutate anything.
  const reservation = await availabilityRepo.getReservation(tenantId, reservationId)
  if (!reservation || reservation.state !== 'confirmed') throw new ReservationNotConfirmedError(reservationId)

  const customer = await identityRepo.getCustomer(tenantId, customerId)
  if (!customer || customer.reservationGroupId !== reservation.reservationGroupId) {
    throw new CustomerReservationMismatchError(customerId, reservationId)
  }

  const verified = await identityRepo.hasSuccessfulIdentityVerification(tenantId, customerId)
  if (!verified) throw new IdentityVerificationRequiredError(customerId)

  const group = await availabilityRepo.getReservationGroup(tenantId, reservation.reservationGroupId)
  // FR-09/D-35: terms acceptance is a precondition of payment, which is a
  // precondition of Confirmed — a Confirmed Reservation with no recorded
  // terms acceptance would mean an earlier invariant already broke.
  const termsVersion = group?.termsVersion
  if (!termsVersion) throw new ReservationNotConfirmedError(reservationId)

  // The presigned upload URLs are generated up front so the object keys
  // they name can be recorded in the same ConditionReport row created
  // inside the transaction below — generating them doesn't touch the
  // database and doesn't need to roll back if the transaction later
  // fails; an unused presigned URL that nobody uploads to is inert.
  const photoObjectKeys = conditionPhotoContentTypes.map(() => `${tenantId}/handover-out/${randomUUID()}`)
  const uploads = await Promise.all(
    photoObjectKeys.map((objectKey, i) => conditionsGateway.generateUploadUrl(objectKey, conditionPhotoContentTypes[i]!)),
  )

  return repo.transaction(async (trx, assetRegistryRepo) => {
    const resolution = await resolveScanEvent(trx, assetRegistryRepo, { tenantId, tagCode, operatorId })
    if (resolution.kind !== 'handover_out') {
      throw new UnexpectedScanResolutionError(resolution.asset.id, resolution.kind)
    }
    const asset = resolution.asset

    // FR-18: instance choice is free, AssetType is not — the Operator
    // may grab any Rentable unit, but it must be a unit of the
    // Reservation's own AssetType.
    if (asset.assetTypeId !== reservation.assetTypeId) {
      throw new AssetTypeMismatchError(asset.id, reservationId)
    }

    // FR-22, D-13: one RentalAgreement per Asset, never one per
    // ReservationGroup.
    const rentalAgreement = await trx.insertRentalAgreement(tenantId, {
      reservationId,
      customerId,
      assetId: asset.id,
      operatorId,
      termsVersion,
    })

    // FR-19: photographs captured at HandoverOut.
    const conditionReport = await trx.insertConditionReport(tenantId, {
      rentalAgreementId: rentalAgreement.id,
      stage: 'handover_out',
      photoObjectKeys,
      operatorId,
    })

    // FR-21/D-07: an attestation, not a transaction — no Payments
    // involvement, the platform moves no money here.
    const depositTaken = await trx.insertDepositTaken(tenantId, {
      rentalAgreementId: rentalAgreement.id,
      amount: depositAmount,
      operatorId,
    })

    // Possession opens: the Asset becomes InPossession. Calls the
    // repository primitives directly rather than Asset Registry's own
    // markAssetRentable-style domain functions — see ./repository.ts's
    // transaction() doc for why.
    await assetRegistryRepo.updateAssetStatus(tenantId, asset.id, {
      status: 'in_possession',
      operatorId,
      reason: null,
    })
    await assetRegistryRepo.insertStatusEvent(tenantId, {
      assetId: asset.id,
      fromStatus: asset.status,
      toStatus: 'in_possession',
      reason: null,
      operatorId,
    })

    return {
      rentalAgreement,
      conditionReport,
      depositTaken,
      conditionPhotoUploadUrls: uploads.map((u) => u.uploadUrl),
    }
  })
}
