// LostAsset declaration (D-17, FR-31, FR-36, W6; issue #26). The
// terminal state for an Asset the system will never see back, reached
// ONLY through an explicit Operator declaration with a reason — never
// automatic, never a timer, never driven by the Overdue view's own
// shortfall-day computation (Finding 12's threshold gates a PROMPT to an
// Operator, per D-17/OQ #5, not this transition). Composes Asset
// Registry's repository primitives directly rather than its
// retireAsset domain function, for the same "no nested transactions"
// reason ./handover-in.ts's markAssetReturnedToPool documents.
import type { AssetRegistryRepository } from '../asset-registry'
import { AssetNotFoundError, AssetRetiredError } from '../asset-registry'
import type { TenantId } from '../_shared'
import type { HandoverPossessionRepository } from './repository'
import {
  LostAssetReasonRequiredError,
  RentalAgreementAlreadyDeclaredLostError,
  RentalAgreementAlreadyHandedInError,
  RentalAgreementNotFoundError,
  type RentalAgreement,
} from './types'

export interface DeclareAssetLostDeps {
  repo: HandoverPossessionRepository
}

export interface DeclareAssetLostParams {
  tenantId: TenantId
  rentalAgreementId: number
  operatorId: string
  reason: string
}

// FR-31/D-17: the RentalAgreement's Possession must still be open
// (nothing to declare lost once the Asset is physically back) — the
// same "no automation, a human acts" philosophy as D-17's Overdue
// handling and D-09's pool-return, extended to this terminal
// transition. AssetDeclaredLost moves the Asset straight to Retired in
// Asset Registry (issue #26's scope), atomically with recording the
// declaration on the RentalAgreement.
export async function declareAssetLost(
  deps: DeclareAssetLostDeps,
  params: DeclareAssetLostParams,
): Promise<RentalAgreement> {
  const { repo } = deps
  const { tenantId, rentalAgreementId, operatorId, reason } = params

  const trimmedReason = reason.trim()
  if (!trimmedReason) throw new LostAssetReasonRequiredError()

  return repo.transaction(async (trx, assetRegistryRepo: AssetRegistryRepository) => {
    const agreement = await trx.getRentalAgreement(tenantId, rentalAgreementId)
    if (!agreement) throw new RentalAgreementNotFoundError(rentalAgreementId)
    if (agreement.handoverInAt) throw new RentalAgreementAlreadyHandedInError(rentalAgreementId)
    if (agreement.declaredLostAt) throw new RentalAgreementAlreadyDeclaredLostError(rentalAgreementId)

    const asset = await assetRegistryRepo.getAsset(tenantId, agreement.assetId)
    // Unreachable via FK integrity — kept as a checked invariant.
    if (!asset) throw new AssetNotFoundError(agreement.assetId)
    if (asset.status === 'retired') throw new AssetRetiredError(asset.id)

    await assetRegistryRepo.updateAssetStatus(tenantId, asset.id, {
      status: 'retired',
      operatorId,
      reason: trimmedReason,
    })
    await assetRegistryRepo.insertStatusEvent(tenantId, {
      assetId: asset.id,
      fromStatus: asset.status,
      toStatus: 'retired',
      reason: trimmedReason,
      operatorId,
    })

    const now = new Date()
    const updated = await trx.declareRentalAgreementLost(tenantId, rentalAgreementId, {
      reason: trimmedReason,
      operatorId,
      at: now,
    })
    // Guard miss is unreachable in practice (already checked both
    // conditions above under the same transaction) — kept as a checked
    // invariant, not a silent `!`.
    if (!updated) throw new RentalAgreementAlreadyDeclaredLostError(rentalAgreementId)

    return updated
  })
}
