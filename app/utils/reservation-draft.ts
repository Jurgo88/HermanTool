// Shapes the client-side Reservation draft into the two requests built
// from it (issue #164). Pure, so the flattening is testable.
import type { DraftReservationLine } from '~/composables/useReservationDraft'

export interface CheckoutLine {
  assetTypeId: number
  period: { startDay: string; endDay: string }
}

// FR-06: one Reservation per unit, so a draft line of quantity n becomes
// n checkout lines. The server has no quantity field.
export function toCheckoutLines(lines: DraftReservationLine[]): CheckoutLine[] {
  return lines.flatMap((line) =>
    Array.from({ length: line.quantity }, () => ({
      assetTypeId: line.assetTypeId,
      period: { ...line.period },
    })),
  )
}

export function toQuoteLines(lines: DraftReservationLine[]) {
  return lines.map((line) => ({
    assetTypeId: line.assetTypeId,
    period: { ...line.period },
    quantity: line.quantity,
  }))
}

export const DRAFT_STORAGE_KEY = 'rentstar.reservationDraft.v1'

const isMoney = (v: unknown): v is { amount: number; currency: string } =>
  typeof v === 'object' &&
  v !== null &&
  Number.isInteger((v as { amount: unknown }).amount) &&
  typeof (v as { currency: unknown }).currency === 'string'

const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

// Reads what an earlier visit stored. Anything malformed (an older shape,
// a hand-edited value) yields an empty draft rather than an error: the
// draft is a convenience, and the server re-checks every line anyway.
export function parseStoredDraft(raw: string | null): DraftReservationLine[] {
  if (!raw) return []
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(data)) return []
  const valid = data.every(
    (line) =>
      typeof line === 'object' &&
      line !== null &&
      Number.isInteger(line.assetTypeId) &&
      typeof line.assetTypeName === 'string' &&
      isMoney(line.dayRate) &&
      isMoney(line.depositAmount) &&
      isDay(line.period?.startDay) &&
      isDay(line.period?.endDay) &&
      Number.isInteger(line.quantity) &&
      line.quantity > 0 &&
      (line.principalAssetTypeId === undefined || Number.isInteger(line.principalAssetTypeId)),
  )
  return valid ? (data as DraftReservationLine[]) : []
}

// An Accessory is shown under its principal (D-57). Each entry keeps the
// line's index in the draft, which the quote's lines and removeLine use.
export function orderForDisplay(
  lines: DraftReservationLine[],
): { line: DraftReservationLine; index: number; isAccessory: boolean }[] {
  const entries = lines.map((line, index) => ({ line, index }))
  const belongsTo = (accessory: DraftReservationLine, principal: DraftReservationLine) =>
    accessory.principalAssetTypeId === principal.assetTypeId &&
    accessory.period.startDay === principal.period.startDay &&
    accessory.period.endDay === principal.period.endDay
  const placed = new Set<number>()
  const ordered: { line: DraftReservationLine; index: number; isAccessory: boolean }[] = []
  for (const entry of entries) {
    if (entry.line.principalAssetTypeId !== undefined) continue
    ordered.push({ ...entry, isAccessory: false })
    placed.add(entry.index)
    for (const other of entries) {
      if (!placed.has(other.index) && belongsTo(other.line, entry.line)) {
        ordered.push({ ...other, isAccessory: true })
        placed.add(other.index)
      }
    }
  }
  for (const entry of entries) {
    if (!placed.has(entry.index)) ordered.push({ ...entry, isAccessory: entry.line.principalAssetTypeId !== undefined })
  }
  return ordered
}

// Removes a line and, when it is a principal, the Accessory lines added
// with it for the same RentalPeriod (D-57) — left behind they would only
// be refused at checkout.
export function withoutLine(lines: DraftReservationLine[], index: number): DraftReservationLine[] {
  const removed = lines[index]
  if (!removed) return lines
  return lines.filter(
    (line, i) =>
      i !== index &&
      !(
        line.principalAssetTypeId === removed.assetTypeId &&
        line.period.startDay === removed.period.startDay &&
        line.period.endDay === removed.period.endDay
      ),
  )
}
