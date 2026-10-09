// S-20 label sheet layout (FR-26, #130). The grid is 3 columns by 7 rows
// of the --ht-label-* tokens; tests/shared/asset-tag-sheet.test.ts checks
// these counts against the tokens and the A4 page, so changing a label size
// cannot silently leave a sheet that runs onto a second page.
export const ASSET_TAG_COLUMNS = 3
export const ASSET_TAG_ROWS = 7
export const ASSET_TAGS_PER_SHEET = ASSET_TAG_COLUMNS * ASSET_TAG_ROWS

export function chunkIntoSheets<T>(entries: T[], perSheet = ASSET_TAGS_PER_SHEET): T[][] {
  const sheets: T[][] = []
  for (let start = 0; start < entries.length; start += perSheet) {
    sheets.push(entries.slice(start, start + perSheet))
  }
  return sheets
}
