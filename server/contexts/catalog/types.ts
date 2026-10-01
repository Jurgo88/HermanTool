// Domain types for Catalog [MVP] (Part 1 §4, §5; FR-01, FR-35, D-03, D-21).
// See ./index.ts for the context's boundary and citations.
import type { MonetaryAmount, TenantId } from '../_shared'

// AssetType (Part 1 §5) — the bookable kind, never an instance. Catalog
// does not own Assets and does not know how many exist (D-03).
//
// createdByOperatorId/updatedByOperatorId are nullable because the
// Catalog core migration shipped before D-22 existed — a pre-existing
// row can carry no attribution. Every write that goes through the admin
// surface (FR-37) requires a real operatorId; the domain layer enforces
// that, not the column (FR-34).
export interface AssetType {
  id: number
  tenantId: TenantId
  name: string
  description: string
  dayRate: MonetaryAmount
  depositAmount: MonetaryAmount
  published: boolean
  powerSourceId: number | null
  useAreaIds: number[]
  specifications: Specification[]
  includedContents: string
  handlingNotice: string
  imageFile: string | null
  // D-57: the AssetTypes this one is an Accessory of. Non-empty means it
  // is an Accessory: never listed on its own, offered on its principals.
  principalIds: number[]
  createdByOperatorId: string | null
  updatedByOperatorId: string | null
  updatedAt: Date
}

// D-55: presentation content only — no domain rule reads it.
export interface Specification {
  label: string
  value: string
}

// D-54: the two filter dimensions share a shape and their list
// maintenance; they differ in how an AssetType holds them (at most one
// PowerSource, any number of UseAreas), which lives on AssetType.
export type ClassificationKind = 'powerSource' | 'useArea'

export interface ClassificationEntry {
  id: number
  tenantId: TenantId
  kind: ClassificationKind
  label: string
  position: number
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

export class PowerSourceNotFoundError extends CatalogError {
  constructor(powerSourceId: number) {
    super(`PowerSource ${powerSourceId} does not exist for this Tenant.`)
  }
}

export class UseAreaNotFoundError extends CatalogError {
  constructor(useAreaId: number) {
    super(`UseArea ${useAreaId} does not exist for this Tenant.`)
  }
}

export class ClassificationLabelRequiredError extends CatalogError {
  constructor() {
    super('A PowerSource or UseArea requires a non-empty label.')
  }
}

export class ClassificationLabelTakenError extends CatalogError {
  constructor(label: string) {
    super(`A PowerSource or UseArea labelled "${label}" already exists for this Tenant.`)
  }
}

// D-54: removal is refused while any AssetType still uses it — the
// Operator unassigns first, deliberately. Carries the names so the admin
// surface can say which AssetTypes are in the way.
export class ClassificationInUseError extends CatalogError {
  readonly assetTypeNames: string[]

  constructor(assetTypeNames: string[]) {
    super(`Still used by ${assetTypeNames.length} AssetType(s): ${assetTypeNames.join(', ')}.`)
    this.assetTypeNames = assetTypeNames
  }
}

// A reorder must name every entry of the list exactly once — a partial
// or duplicated order would leave positions ambiguous.
export class ClassificationSequenceMismatchError extends CatalogError {
  constructor() {
    super('A reorder must list every PowerSource or UseArea of the Tenant exactly once.')
  }
}

export class InvalidSpecificationError extends CatalogError {
  constructor() {
    super('Every specification needs a non-empty label and value.')
  }
}

// D-56: a file name under public/catalog/, never a path or URL. The
// shipped-file manifest check arrives with the image pipeline (#153).
export class InvalidImageFileError extends CatalogError {
  constructor(imageFile: string) {
    super(`"${imageFile}" is not a valid catalog image file name.`)
  }
}

// D-57 keeps Accessory one level deep: a principal is never itself an
// Accessory, and an Accessory has no Accessories of its own. Anything
// deeper would make the checkout rule recursive for no pilot need.
export class AccessoryChainError extends CatalogError {
  constructor(assetTypeId: number) {
    super(`AssetType ${assetTypeId} would make an Accessory chain; Accessories are one level deep.`)
  }
}

export class AccessoryOfItselfError extends CatalogError {
  constructor(assetTypeId: number) {
    super(`AssetType ${assetTypeId} cannot be an Accessory of itself.`)
  }
}
