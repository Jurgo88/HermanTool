// Client-side-only staging area for W1's "Visitor... may assemble several
// AssetTypes with different RentalPeriods" before checkout commitment
// (docs/architecture/architecture-foundation-part-2-users-workflows-events.md,
// W1). Never persisted, never sent as-is to the server — checkout.vue
// flattens it into the `lines: ReservationLine[]` shape
// /api/reservations/checkout.post.ts expects, one line per unit
// (the backend has no quantity field: FR-06 is "n AssetTypes -> n
// Reservations", one Reservation per unit).
//
// Deliberately not named "cart" anywhere (CLAUDE.md's banned-terms list)
// — this models the same pre-commitment browsing state W1 describes, it
// just isn't a domain aggregate, so it gets no domain-sounding name either.
export interface DraftReservationLine {
  assetTypeId: number
  assetTypeName: string
  dayRate: { amount: number; currency: string }
  depositAmount: { amount: number; currency: string }
  period: { startDay: string; endDay: string }
  quantity: number
}

export function useReservationDraft() {
  const lines = useState<DraftReservationLine[]>('reservationDraftLines', () => [])

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
    lines.value.splice(index, 1)
  }

  function clearLines() {
    lines.value = []
  }

  return { lines, addLine, removeLine, clearLines }
}
