// The 200-asset pilot bootstrap (F10, FR-25, W9; issue #9). Registers N
// Assets and generates+binds N fresh AssetTags in one call, for a CSV of
// (assetTypeId, quantity) lines — the "bulk-registration import" FR-25
// requires as one of its two Must-have bootstrap paths (the other,
// explicit manual-only registration one Asset at a time, is already
// exercised by ./asset-lifecycle.ts's registerAsset/bindAssetTag
// directly and needs nothing new).
//
// Deliberately NOT wrapped in one outer transaction: registerAsset and
// bindAssetTag each already open and manage their OWN transaction (see
// ./asset-lifecycle.ts), and this repository's transaction() guard
// refuses a nested one (see ./repository.ts's own transaction() doc) —
// wrapping this loop in a second, outer transaction would make every
// call inside it throw immediately. Each unit therefore commits (or
// fails) independently, same "no saga machinery, the record diverges,
// the product corrects it" stance already established throughout this
// codebase (e.g. server/api/reservations/checkout.post.ts's own
// comment) — a failure partway through a 200-unit import leaves
// whatever succeeded so far in place, and the result reports exactly how
// far it got so the Operator can resume rather than guess.
import type { TenantId } from '../_shared'
import type { AssetRegistryRepository } from './repository'
import { bindAssetTag, registerAsset } from './asset-lifecycle'
import type { Asset, AssetTag } from './types'
import { AssetRegistryError } from './types'
import { formatTagCode } from './tag-code'

export interface BulkRegistrationLine {
  assetTypeId: number
  quantity: number
}

export interface BulkRegisteredUnit {
  asset: Asset
  tag: AssetTag
}

// FR-25/W9: each line must name a positive whole number of units — a
// line requesting zero or a fractional/negative count is a malformed
// request, not a domain fact about the Tenant's fleet.
export class InvalidBulkRegistrationLineError extends AssetRegistryError {
  constructor(assetTypeId: number, quantity: number) {
    super(`Invalid bulk registration line for AssetType ${assetTypeId}: quantity must be a positive integer, got ${quantity}.`)
  }
}

export class EmptyBulkRegistrationError extends AssetRegistryError {
  constructor() {
    super('Bulk registration requires at least one line.')
  }
}

export class MalformedCsvRowError extends AssetRegistryError {
  constructor(rowNumber: number, raw: string) {
    super(`Bulk registration CSV row ${rowNumber} is malformed (expected "assetTypeId,quantity"): "${raw}"`)
  }
}

// FR-25/W9's bulk-registration import path — deliberately a two-column,
// header-optional CSV rather than a new dependency: this format has no
// quoting, no escaping, and no third column, so a hand-rolled split is
// both correct and legible, unlike a general CSV parser this codebase
// would otherwise need to pull in for a two-integer-column file.
export function parseBulkRegistrationCsv(csv: string): BulkRegistrationLine[] {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length > 0 && lines[0]!.toLowerCase() === 'assettypeid,quantity') {
    lines.shift()
  }

  return lines.map((raw, index) => {
    const parts = raw.split(',').map((p) => p.trim())
    const assetTypeId = Number(parts[0])
    const quantity = Number(parts[1])
    if (parts.length !== 2 || !Number.isInteger(assetTypeId) || !Number.isInteger(quantity)) {
      throw new MalformedCsvRowError(index + 1, raw)
    }
    return { assetTypeId, quantity }
  })
}

export async function bulkRegisterAssets(
  repo: AssetRegistryRepository,
  params: { tenantId: TenantId; operatorId: string; lines: BulkRegistrationLine[] },
): Promise<BulkRegisteredUnit[]> {
  const { tenantId, operatorId, lines } = params

  if (lines.length === 0) throw new EmptyBulkRegistrationError()
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new InvalidBulkRegistrationLineError(line.assetTypeId, line.quantity)
    }
  }

  const units: BulkRegisteredUnit[] = []
  for (const line of lines) {
    for (let i = 0; i < line.quantity; i++) {
      const asset = await registerAsset(repo, { tenantId, assetTypeId: line.assetTypeId, operatorId })
      const n = await repo.nextTagCodeNumber(tenantId)
      const tag = await bindAssetTag(repo, { tenantId, assetId: asset.id, tagCode: formatTagCode(n), operatorId })
      units.push({ asset, tag })
    }
  }
  return units
}
