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
