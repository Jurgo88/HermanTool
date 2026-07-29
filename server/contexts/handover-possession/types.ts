// Domain types for Handover & Possession [MVP · CORE] — ScanEvent
// resolution only (P3, FR-17, FR-45; issue #22). See ./index.ts for the
// context's boundary and citations. RentalAgreement, Possession,
// DepositObligation and ConditionReport are NOT modelled here — they
// belong to the issues that react to a resolved HandoverOut/HandoverIn,
// not to resolution itself.
import type { Asset } from '../asset-registry'
import type { TenantId } from '../_shared'

// FR-17, P3: an intent, not a transition. Recorded unconditionally for
// every scan, whatever it resolves to — including a bare "show me this
// asset" lookup (FR-45). No `place` field: A-01 fixes exactly one
// physical pickup location, so modelling a location that never varies
// would be optionality this system doesn't get to spend for free (P8).
export interface ScanEvent {
  id: number
  tenantId: TenantId
  assetId: number
  operatorId: string
  occurredAt: Date
}

// P3: "a scan must resolve to exactly one meaningful domain event given
// the asset's current state." 'handover_out' (Asset is Rentable) and
// 'handover_in' (Asset is InPossession) are the two transition intents;
// everything else (UnderInspection, Unavailable, Retired) resolves to
// 'asset_lookup' — FR-45's "outside a handover" fallback — never an
// error. This union IS the resolution; nothing downstream re-derives it
// from `asset.status` independently.
export type ScanResolution =
  | { kind: 'handover_out'; asset: Asset; scanEvent: ScanEvent }
  | { kind: 'handover_in'; asset: Asset; scanEvent: ScanEvent }
  | { kind: 'asset_lookup'; asset: Asset; scanEvent: ScanEvent }

export class HandoverPossessionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

// A scanned AssetTag has no active binding — a torn-off tag, a typo'd
// code, or a stale one from a rebind (FR-26). Distinct from Asset
// Registry's own tag errors: this is "the tag scanned means nothing
// right now," not a registration-time conflict.
export class ScanEventTagNotBoundError extends HandoverPossessionError {
  constructor(tagCode: string) {
    super(`AssetTag "${tagCode}" has no active binding — nothing to resolve.`)
  }
}
