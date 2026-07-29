// ScanEvent resolution [MVP · CORE] (P3, FR-17, FR-45; issue #22). The
// primary interaction of the physical side (P3): the Operator scans, and
// the domain — never the caller — decides what that means.
//
// Deliberately does nothing beyond resolving and recording the intent.
// It does NOT transition the Asset's status, create a RentalAgreement,
// open or close a Possession, or check IdentityVerification — those are
// the reactions of a future caller (#23's HandoverOut workflow, #24's
// HandoverIn & Settlement), which act ONLY on the resolved
// 'handover_out'/'handover_in' outcome, never on a raw scan (per this
// context's own module doc).
import { AssetNotFoundError, type AssetRegistryRepository } from '../asset-registry'
import type { HandoverPossessionRepository } from './repository'
import { ScanEventTagNotBoundError, type ScanResolution } from './types'
import type { TenantId } from '../_shared'

// FR-17: resolves an AssetTag scan to HandoverOut, HandoverIn, or (FR-45)
// a plain lookup — purely from the Asset's current status, read through
// Asset Registry's published interface (D-02: this context never queries
// `assets`/`asset_tags` directly). No shared transaction with Asset
// Registry is needed: there is no cross-row invariant at stake here (unlike
// D-33's holds counter) — just a read followed by an append-only insert.
export async function resolveScanEvent(
  repo: HandoverPossessionRepository,
  assetRegistry: AssetRegistryRepository,
  params: { tenantId: TenantId; tagCode: string; operatorId: string },
): Promise<ScanResolution> {
  const { tenantId, tagCode, operatorId } = params

  const tag = await assetRegistry.getActiveTagBinding(tenantId, tagCode)
  if (!tag) throw new ScanEventTagNotBoundError(tagCode)

  const asset = await assetRegistry.getAsset(tenantId, tag.assetId)
  // FK integrity between asset_tags and assets makes this unreachable in
  // practice; kept as a checked invariant rather than a silent `!`.
  if (!asset) throw new AssetNotFoundError(tag.assetId)

  const scanEvent = await repo.insertScanEvent(tenantId, { assetId: asset.id, operatorId })

  if (asset.status === 'rentable') return { kind: 'handover_out', asset, scanEvent }
  if (asset.status === 'in_possession') return { kind: 'handover_in', asset, scanEvent }
  return { kind: 'asset_lookup', asset, scanEvent }
}
