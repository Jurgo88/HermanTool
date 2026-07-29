// HandoverIn & Settlement [MVP · CORE] (D-09, FR-19, FR-20, FR-21, W5,
// W8; issue #24). Closes the Possession opened by ./handover-out.ts,
// resolves the deposit, and returns the Asset to the pool — but not
// before D-09's day-after rule allows it.
//
// Composes Asset Registry's and Availability & Reservation's published
// interfaces directly (permitted — this context is downstream of both,
// see ./index.ts). Never imports Customer Identity & Compliance for the
// retention-clock reaction (FR-23, D-06): SettlementCompleted is
// recorded as a timestamp on the RentalAgreement, not dispatched as a
// message — there is no second consumer yet (D-19), and #32 (not built)
// is expected to read this field directly when it exists.
import { randomUUID } from 'node:crypto'
import { markAssetRentable, type AssetRegistryRepository } from '../asset-registry'
import type { AvailabilityReservationRepository } from '../availability-reservation'
import type { MonetaryAmount, TenantId } from '../_shared'
import type { ConditionReportStorageGateway } from './r2-gateway'
import { resolveScanEvent } from './scan-resolution'
import type { HandoverPossessionRepository } from './repository'
import {
  AssetNotYetReturnableError,
  DeductionReasonRequiredError,
  DeductionRequiresPairedConditionReportsError,
  DepositReturnExceedsTakenError,
  EmptyConditionReportError,
  NoOpenRentalAgreementError,
  RentalAgreementAlreadySettledError,
  RentalAgreementNotFoundError,
  RentalAgreementNotHandedInError,
  SettlementNotCompleteError,
  UnexpectedScanResolutionError,
  type ConditionReport,
  type DepositReturned,
  type RentalAgreement,
} from './types'

// A-05-style day arithmetic, reimplemented locally rather than importing
// Availability & Reservation's private rental-period.ts helpers (not
// part of its published interface) — this context only needs "add one
// day to a YYYY-MM-DD string", not the rest of RentalPeriod's machinery.
function addOneDay(day: string): string {
  const date = new Date(`${day}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export interface PerformHandoverInDeps {
  repo: HandoverPossessionRepository
  conditionsGateway: ConditionReportStorageGateway
}

export interface PerformHandoverInParams {
  tenantId: TenantId
  tagCode: string
  operatorId: string
  conditionPhotoContentTypes: string[]
}

export interface PerformHandoverInResult {
  rentalAgreement: RentalAgreement
  conditionReport: ConditionReport
  conditionPhotoUploadUrls: string[]
}

// W5: "the Operator scans; the domain resolves the ScanEvent to
// HandoverIn and Possession closes. The Asset moves to UnderInspection."
// D-04/D-13 make the open RentalAgreement lookup unambiguous — an Asset
// holds at most one at a time.
export async function performHandoverIn(
  deps: PerformHandoverInDeps,
  params: PerformHandoverInParams,
): Promise<PerformHandoverInResult> {
  const { repo, conditionsGateway } = deps
  const { tenantId, tagCode, operatorId, conditionPhotoContentTypes } = params

  if (conditionPhotoContentTypes.length === 0) throw new EmptyConditionReportError()

  const photoObjectKeys = conditionPhotoContentTypes.map(() => `${tenantId}/handover-in/${randomUUID()}`)
  const uploads = await Promise.all(
    photoObjectKeys.map((objectKey, i) => conditionsGateway.generateUploadUrl(objectKey, conditionPhotoContentTypes[i]!)),
  )

  return repo.transaction(async (trx, assetRegistryRepo) => {
    const resolution = await resolveScanEvent(trx, assetRegistryRepo, { tenantId, tagCode, operatorId })
    if (resolution.kind !== 'handover_in') {
      throw new UnexpectedScanResolutionError(resolution.asset.id, resolution.kind)
    }
    const asset = resolution.asset

    const agreement = await trx.getOpenRentalAgreementForAsset(tenantId, asset.id)
    if (!agreement) throw new NoOpenRentalAgreementError(asset.id)

    const updated = await trx.setHandoverInAt(tenantId, agreement.id, new Date())
    // Guard miss is unreachable in practice (resolveScanEvent already
    // proved the Asset was InPossession, and only one open Agreement can
    // exist per Asset) — kept as a checked invariant, not a silent `!`.
    if (!updated) throw new NoOpenRentalAgreementError(asset.id)

    const conditionReport = await trx.insertConditionReport(tenantId, {
      rentalAgreementId: agreement.id,
      stage: 'handover_in',
      photoObjectKeys,
      operatorId,
    })

    await assetRegistryRepo.updateAssetStatus(tenantId, asset.id, {
      status: 'under_inspection',
      operatorId,
      reason: null,
    })
    await assetRegistryRepo.insertStatusEvent(tenantId, {
      assetId: asset.id,
      fromStatus: asset.status,
      toStatus: 'under_inspection',
      reason: null,
      operatorId,
    })

    return { rentalAgreement: updated, conditionReport, conditionPhotoUploadUrls: uploads.map((u) => u.uploadUrl) }
  })
}

export interface CompleteSettlementParams {
  tenantId: TenantId
  rentalAgreementId: number
  operatorId: string
  returnedAmount: MonetaryAmount
  deductionReason?: string
}

export interface CompleteSettlementResult {
  rentalAgreement: RentalAgreement
  depositReturned: DepositReturned
}

// FR-20/P1 corollary, FR-21, W8: resolves the deposit. Deliberately
// independent of the Asset's own status — Settlement can complete the
// same day the Asset came back; D-09's pool-return rule is
// markAssetReturnedToPool's concern, not this one's.
export async function completeSettlement(
  repo: HandoverPossessionRepository,
  params: CompleteSettlementParams,
): Promise<CompleteSettlementResult> {
  const { tenantId, rentalAgreementId, operatorId, returnedAmount, deductionReason } = params

  const agreement = await repo.getRentalAgreement(tenantId, rentalAgreementId)
  if (!agreement) throw new RentalAgreementNotFoundError(rentalAgreementId)
  if (!agreement.handoverInAt) throw new RentalAgreementNotHandedInError(rentalAgreementId)
  if (agreement.settlementCompletedAt) throw new RentalAgreementAlreadySettledError(rentalAgreementId)

  const depositTaken = await repo.getDepositTakenForAgreement(tenantId, rentalAgreementId)
  if (!depositTaken) throw new RentalAgreementNotFoundError(rentalAgreementId)
  if (returnedAmount.amount > depositTaken.amount.amount) {
    throw new DepositReturnExceedsTakenError(rentalAgreementId)
  }

  const isDeduction = returnedAmount.amount < depositTaken.amount.amount
  if (isDeduction) {
    if (!deductionReason?.trim()) throw new DeductionReasonRequiredError()

    const conditionReports = await repo.listConditionReportsForAgreement(tenantId, rentalAgreementId)
    const hasHandoverOutReport = conditionReports.some((r) => r.stage === 'handover_out')
    const hasHandoverInReport = conditionReports.some((r) => r.stage === 'handover_in')
    if (!hasHandoverOutReport || !hasHandoverInReport) {
      throw new DeductionRequiresPairedConditionReportsError(rentalAgreementId)
    }
  }

  const depositReturned = await repo.insertDepositReturned(tenantId, {
    rentalAgreementId,
    amount: returnedAmount,
    deductionReason: isDeduction ? deductionReason!.trim() : null,
    operatorId,
  })

  const settled = await repo.setSettlementCompletedAt(tenantId, rentalAgreementId, new Date())
  if (!settled) throw new RentalAgreementAlreadySettledError(rentalAgreementId)

  return { rentalAgreement: settled, depositReturned }
}

export interface MarkAssetReturnedToPoolDeps {
  repo: HandoverPossessionRepository
  assetRegistryRepo: AssetRegistryRepository
  availabilityRepo: AvailabilityReservationRepository
}

// D-09: "the RentalPeriod's final day is consumed and the Asset rejoins
// the pool on X+1." An explicit Operator action, gated by a refusal
// rather than driven by a scheduled process (mirrors D-17's Overdue
// handling: the system refuses or notices, a human acts — no
// automation, no fake system identity attesting an Asset status
// change). Delegates the actual status transition to Asset Registry's
// own markAssetRentable (already validates not-Retired and has-an-
// active-tag) rather than duplicating that logic here.
export async function markAssetReturnedToPool(
  deps: MarkAssetReturnedToPoolDeps,
  params: { tenantId: TenantId; rentalAgreementId: number; operatorId: string; today?: Date },
): Promise<RentalAgreement> {
  const { repo, assetRegistryRepo, availabilityRepo } = deps
  const { tenantId, rentalAgreementId, operatorId, today = new Date() } = params

  const agreement = await repo.getRentalAgreement(tenantId, rentalAgreementId)
  if (!agreement) throw new RentalAgreementNotFoundError(rentalAgreementId)
  if (!agreement.settlementCompletedAt) throw new SettlementNotCompleteError(rentalAgreementId)

  const reservation = await availabilityRepo.getReservation(tenantId, agreement.reservationId)
  // Unreachable via FK integrity — kept as a checked invariant.
  if (!reservation) throw new RentalAgreementNotFoundError(rentalAgreementId)

  const readyDay = addOneDay(reservation.period.endDay)
  if (formatDay(today) < readyDay) throw new AssetNotYetReturnableError(agreement.assetId, readyDay)

  await markAssetRentable(assetRegistryRepo, { tenantId, assetId: agreement.assetId, operatorId })

  const updated = await repo.markReturnedToPool(tenantId, rentalAgreementId, today)
  if (!updated) throw new RentalAgreementNotFoundError(rentalAgreementId)
  return updated
}
