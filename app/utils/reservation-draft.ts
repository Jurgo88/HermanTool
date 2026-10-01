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
