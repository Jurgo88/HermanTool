// Catalog [MVP] — owns AssetType: the bookable kind, name, description,
// day rate, deposit amount, publication status, and (D-54, D-55, D-56)
// its classification and presentation content. Part 1 §4 "Catalog";
// D-03 (Catalog kept separate from Asset Registry).
//
// Dependency direction (Part 1 §4 context map): Catalog is upstream of
// Availability & Reservation. It must never import from it — this file
// is the only surface other contexts may import from.
export type { AssetType, ClassificationEntry, ClassificationKind, Specification } from './types'

// Error classes are exported as values (not `export type`) so callers
// can use `instanceof` — they are thrown, not just typed, by
// ./asset-type and ./classification.
export {
  CatalogError,
  AssetTypeNotFoundError,
  AssetTypeNameRequiredError,
  PowerSourceNotFoundError,
  UseAreaNotFoundError,
  ClassificationLabelRequiredError,
  ClassificationLabelTakenError,
  ClassificationInUseError,
  ClassificationSequenceMismatchError,
  InvalidSpecificationError,
  InvalidImageFileError,
  AccessoryChainError,
  AccessoryOfItselfError,
} from './types'

export type {
  CatalogRepository,
  NewAssetType,
  AssetTypeUpdate,
  AssetTypeContent,
} from './repository'
export { createPostgresCatalogRepository } from './repository'

export {
  listAssetTypes,
  listPublishedAssetTypes,
  listBrowsableAssetTypes,
  getPublishedAssetType,
  listPublishedAccessoriesOf,
  createAssetType,
  updateAssetType,
  publishAssetType,
  unpublishAssetType,
} from './asset-type'

export {
  listClassification,
  createClassificationEntry,
  renameClassificationEntry,
  reorderClassification,
  removeClassificationEntry,
} from './classification'
