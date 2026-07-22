// Asset Registry [MVP] — owns Asset, AssetTag, and Asset lifecycle status
// (Rentable, InPossession, UnderInspection, Unavailable, Retired).
// Part 1 §4 "Asset Registry"; D-02 (contexts are modules, not services).
//
// Dependency direction (Part 1 §4 context map): Asset Registry is
// upstream of Availability & Reservation and of Handover & Possession.
// It must never import from either — this file is the only surface
// other contexts may import from.
export type { Asset, AssetStatus, AssetStatusEvent, AssetTag } from './types'

// Error classes are exported as values (not `export type`) so callers can
// use `instanceof` — they are thrown, not just typed, by ./asset-lifecycle.
export {
  AssetRegistryError,
  AssetTypeNotFoundError,
  AssetNotFoundError,
  TagAlreadyBoundError,
  AssetNotTaggedError,
  AssetRetiredError,
} from './types'

export type { AssetRegistryRepository } from './repository'
export { createPostgresAssetRegistryRepository } from './repository'

export {
  registerAsset,
  bindAssetTag,
  markAssetRentable,
  markAssetUnavailable,
  retireAsset,
} from './asset-lifecycle'
