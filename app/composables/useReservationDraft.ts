// Client-side-only staging area for W1's "Visitor... may assemble several
// AssetTypes with different RentalPeriods" before checkout commitment
// (docs/architecture/architecture-foundation-part-2-users-workflows-events.md,
// W1). Never sent as-is to the server — checkout.vue flattens it
// (app/utils/reservation-draft.ts) into the `lines: ReservationLine[]`
// shape /api/reservations/checkout.post.ts expects, one line per unit
// (the backend has no quantity field: FR-06 is "n AssetTypes -> n
// Reservations", one Reservation per unit).
//
// Kept in this browser's localStorage so a reload or a closed tab does not
// lose it (app/plugins/reservation-draft.client.ts). Only AssetType names,
// days and prices: no Customer data is ever stored here. It is advisory:
// the quote and the checkout hold ask the server again.
//
// Deliberately not named "cart" anywhere (CLAUDE.md's banned-terms list)
// — this models the same pre-commitment browsing state W1 describes, it
// just isn't a domain aggregate, so it gets no domain-sounding name either.
import { withoutLine } from '~/utils/reservation-draft'

export interface DraftReservationLine {
  assetTypeId: number
  assetTypeName: string
  dayRate: { amount: number; currency: string }
  depositAmount: { amount: number; currency: string }
  period: { startDay: string; endDay: string }
  quantity: number
  // D-57: set on an Accessory's line — the principal it was added with,
  // so removing the principal removes it too (checkout would refuse it).
  principalAssetTypeId?: number
}

export function useReservationDraft() {
  const lines = useState<DraftReservationLine[]>('reservationDraftLines', () => [])
  // False until the stored draft has been read after hydration, so a page
  // does not flash "nothing added yet" before it arrives.
  const restored = useState('reservationDraftRestored', () => false)

  function addLine(line: Omit<DraftReservationLine, 'quantity'> & { quantity: number }) {
    const existing = lines.value.find(
      (l) => l.assetTypeId === line.assetTypeId && l.period.startDay === line.period.startDay && l.period.endDay === line.period.endDay,
    )
    if (existing) {
      existing.quantity += line.quantity
    } else {
      lines.value.push({ ...line })
    }
  }

  function removeLine(index: number) {
    lines.value = withoutLine(lines.value, index)
  }

  function clearLines() {
    lines.value = []
  }

  return { lines, restored, addLine, removeLine, clearLines }
}
