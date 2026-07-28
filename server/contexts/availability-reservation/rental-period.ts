// RentalPeriod (D-12, Part 1 §6 Ubiquitous Language): a closed interval of
// whole calendar days, inclusive of both endpoints (A-05) — 5-7 March is
// three RentalDays and the Asset is due back on the 7th.
//
// D-12 does not add a `rentalGranularity` property; instead it obliges a
// discipline: RentalPeriod owns its own arithmetic, and no other context
// (and no other file within this one) subtracts or enumerates its days
// directly. This is the one place that discipline lives.
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MS_PER_DAY = 24 * 60 * 60 * 1000

export interface RentalPeriod {
  startDay: string // 'YYYY-MM-DD', UTC calendar day — see A-04 (single local timezone, DST mostly ignored)
  endDay: string
}

export class InvalidRentalPeriodError extends Error {
  constructor(period: RentalPeriod) {
    super(
      `RentalPeriod ${period.startDay}..${period.endDay} is invalid: both days must be real ` +
        `calendar dates (YYYY-MM-DD) and endDay must not be before startDay (A-05).`,
    )
    this.name = new.target.name
  }
}

// Formats a Postgres `date` value (postgres.js returns these as JS Date
// objects at UTC midnight) back into the 'YYYY-MM-DD' form used
// throughout this context's domain layer — the inverse of parseDay.
export function formatRentalDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

// Rejects malformed strings and calendar dates that don't round-trip
// (e.g. '2026-02-30', which JS's Date silently rolls over to March 2
// rather than rejecting).
function parseDay(day: string): Date | null {
  if (!DAY_PATTERN.test(day)) return null
  const date = new Date(`${day}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return null
  return formatRentalDay(date) === day ? date : null
}

export function validateRentalPeriod(period: RentalPeriod): void {
  const start = parseDay(period.startDay)
  const end = parseDay(period.endDay)
  if (!start || !end || end.getTime() < start.getTime()) {
    throw new InvalidRentalPeriodError(period)
  }
}

// A-05: inclusive of both endpoints. 5-7 March enumerates ['2026-03-05',
// '2026-03-06', '2026-03-07'] — the day D-09 says the Asset rejoins the
// pool (the 8th) is deliberately not included.
export function eachDayOfPeriod(period: RentalPeriod): string[] {
  validateRentalPeriod(period)
  const days: string[] = []
  let cursor = parseDay(period.startDay)!.getTime()
  const endTime = parseDay(period.endDay)!.getTime()
  while (cursor <= endTime) {
    days.push(formatRentalDay(new Date(cursor)))
    cursor += MS_PER_DAY
  }
  return days
}

// A-05: 5-7 March is three RentalDays.
export function rentalPeriodLengthInDays(period: RentalPeriod): number {
  return eachDayOfPeriod(period).length
}
