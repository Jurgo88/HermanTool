// Catalog [MVP] — owns AssetType: the bookable kind, name, description,
// day rate, deposit amount, and publication status. Part 1 §4 "Catalog";
// D-03 (Catalog kept separate from Asset Registry).
//
// Dependency direction (Part 1 §4 context map): Catalog is upstream of
// Availability & Reservation. It must never import from it — this file
// is the only surface other contexts may import from.
export type { AssetType } from './types'

// Error classes are exported as values (not `export type`) so callers
// can use `instanceof` — they are thrown, not just typed, by
// ./asset-type.
export { CatalogError, AssetTypeNotFoundError, AssetTypeNameRequiredError } from './types'

export type { CatalogRepository, NewAssetType, AssetTypeUpdate } from './repository'
export { createPostgresCatalogRepository } from './repository'

export {
  listAssetTypes,
  createAssetType,
  updateAssetType,
  publishAssetType,
  unpublishAssetType,
} from './asset-type'
