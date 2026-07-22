// Domain types for Asset Registry [MVP] (Part 1 §4, §5; FR-25, FR-26, FR-27).
import type { TenantId } from '../_shared'

// FR-27, Part 1 §6 — the complete list. No `Reserved`: availability is a
// calendar property, never a flag on an Asset instance.
export type AssetStatus = 'rentable' | 'in_possession' | 'under_inspection' | 'unavailable' | 'retired'

export interface Asset {
  id: number
  tenantId: TenantId
  assetTypeId: number
  status: AssetStatus
  registeredAt: Date
  registeredByOperatorId: string
  statusChangedAt: Date
  statusChangedByOperatorId: string
  statusChangeReason: string | null
}

export interface AssetStatusEvent {
  id: number
  tenantId: TenantId
  assetId: number
  fromStatus: AssetStatus | null
  toStatus: AssetStatus
  reason: string | null
  occurredAt: Date
  recordedAt: Date
  operatorId: string
}

// AssetTag (FR-26) — bound to an Asset, re-bindable because tags physically
// fail. `tagCode` is an opaque identity supplied by the caller; nothing in
// this context generates one (F10, deferred).
export interface AssetTag {
  id: number
  tenantId: TenantId
  assetId: number
  tagCode: string
  boundAt: Date
  boundByOperatorId: string
  unboundAt: Date | null
  unboundByOperatorId: string | null
}

export class AssetRegistryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

export class AssetTypeNotFoundError extends AssetRegistryError {
  constructor(assetTypeId: number) {
    super(`AssetType ${assetTypeId} does not exist for this Tenant.`)
  }
}

export class AssetNotFoundError extends AssetRegistryError {
  constructor(assetId: number) {
    super(`Asset ${assetId} does not exist for this Tenant.`)
  }
}

export class TagAlreadyBoundError extends AssetRegistryError {
  constructor(tagCode: string) {
    super(`AssetTag "${tagCode}" is already actively bound to another Asset.`)
  }
}

export class AssetNotTaggedError extends AssetRegistryError {
  constructor(assetId: number) {
    super(`Asset ${assetId} has no active AssetTag and cannot be made Rentable.`)
  }
}

export class AssetRetiredError extends AssetRegistryError {
  constructor(assetId: number) {
    super(`Asset ${assetId} is Retired and cannot change status again.`)
  }
}
