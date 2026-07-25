// Domain types for Catalog [MVP] (Part 1 §4, §5; FR-01, FR-35, D-03, D-21).
// See ./index.ts for the context's boundary and citations.
import type { MonetaryAmount, TenantId } from '../_shared'

// AssetType (Part 1 §5) — the bookable kind, never an instance. Catalog
// does not own Assets and does not know how many exist (D-03).
export interface AssetType {
  id: number
  tenantId: TenantId
  name: string
  description: string
  dayRate: MonetaryAmount
  depositAmount: MonetaryAmount
  published: boolean
}

export class CatalogError extends Error {
  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

export class AssetTypeNotFoundError extends CatalogError {
  constructor(assetTypeId: number) {
    super(`AssetType ${assetTypeId} does not exist for this Tenant.`)
  }
}

// FR-01/W1: a Visitor and an Operator both distinguish AssetTypes by
// name, not by id — an unnamed AssetType cannot be created through the
// normal flow, even though the migration defaults the column to '' for
// safe backfill of any pre-existing stub rows.
export class AssetTypeNameRequiredError extends CatalogError {
  constructor() {
    super('AssetType requires a non-empty name.')
  }
}
