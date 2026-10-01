// S-01 filtering (D-54): OR within a dimension, AND across dimensions. An
// empty dimension does not filter. Pure, so the semantics are testable;
// the whole catalog is one response, so filtering stays in the browser
// (D-58: no pagination, no infinite scroll).

export interface ClassifiedAssetType {
  powerSourceId: number | null
  useAreaIds: number[]
}

export interface ClassificationSelection {
  powerSourceIds: number[]
  useAreaIds: number[]
}

export function matchesSelection(
  assetType: ClassifiedAssetType,
  selection: ClassificationSelection,
): boolean {
  const powerMatches =
    selection.powerSourceIds.length === 0 ||
    (assetType.powerSourceId !== null && selection.powerSourceIds.includes(assetType.powerSourceId))
  const areaMatches =
    selection.useAreaIds.length === 0 ||
    assetType.useAreaIds.some((id) => selection.useAreaIds.includes(id))
  return powerMatches && areaMatches
}

export function toggleId(ids: number[], id: number): number[] {
  return ids.includes(id) ? ids.filter((existing) => existing !== id) : [...ids, id]
}
