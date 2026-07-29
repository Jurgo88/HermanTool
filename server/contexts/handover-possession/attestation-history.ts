// Asset attestation history [MVP] (FR-43, P4). "The artefact P4's
// append-only history exists to produce" — what an Operator pulls up
// when a Customer disputes a deduction. Entirely self-contained to this
// context's own data (RentalAgreement, ConditionReport, DepositTaken,
// DepositReturned) — no cross-context composition needed, unlike
// server/utils/operator-counter-views.ts's pickups/returns view.
import type { TenantId } from '../_shared'
import type { HandoverPossessionRepository } from './repository'
import type { ConditionReport, DepositReturned, DepositTaken, RentalAgreement } from './types'

export interface AssetAttestationHistoryEntry {
  rentalAgreement: RentalAgreement
  conditionReports: ConditionReport[]
  depositTaken: DepositTaken | null
  depositReturned: DepositReturned | null
}

// Ordered oldest-first (listRentalAgreementsForAsset orders by
// handoverOutAt) — the Asset's story, read top to bottom.
export async function getAssetAttestationHistory(
  repo: HandoverPossessionRepository,
  params: { tenantId: TenantId; assetId: number },
): Promise<AssetAttestationHistoryEntry[]> {
  const { tenantId, assetId } = params
  const rentalAgreements = await repo.listRentalAgreementsForAsset(tenantId, assetId)

  return Promise.all(
    rentalAgreements.map(async (rentalAgreement) => {
      const [conditionReports, depositTaken, depositReturned] = await Promise.all([
        repo.listConditionReportsForAgreement(tenantId, rentalAgreement.id),
        repo.getDepositTakenForAgreement(tenantId, rentalAgreement.id),
        repo.getDepositReturnedForAgreement(tenantId, rentalAgreement.id),
      ])
      return { rentalAgreement, conditionReports, depositTaken, depositReturned }
    }),
  )
}
