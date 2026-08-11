// One formatting module (D-51; docs/design/interface-design-foundation.md
// §3 UI-D-09). Money, days and timestamps are never formatted in a
// component — this replaces the four private `toEuros` implementations
// (index.vue, checkout.vue, admin/catalog.vue, admin/counter.vue — UIF-02).
//
// Deliberately formatting only, never computing: `formatDay`/`formatDayRange`
// take an already-known `YYYY-MM-DD` RentalDay string and never derive
// "today" or add/subtract days — that's Availability & Reservation's job
// server-side. Fixing where "today" itself comes from (UIF-01's UTC bug
// in index.vue) is WP-4.1's job, not this module's.
export interface MonetaryAmountView {
  amount: number // minor units, e.g. cents
  currency: string
}

const LOCALE = 'sk-SK'
const TIME_ZONE = 'Europe/Bratislava'

// D-21: every amount carries its currency — this signature makes it
// impossible to format one without the other.
export function formatMoney({ amount, currency }: MonetaryAmountView): string {
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency }).format(amount / 100)
}

// A RentalDay is a pure calendar day with no time component (D-09) —
// parsed and formatted in UTC so the same string always renders the same
// digits regardless of the reader's own clock. Never use this for a real
// instant; see formatDateTime.
function parseRentalDay(isoDay: string): Date {
  return new Date(`${isoDay}T00:00:00.000Z`)
}

export function formatDay(isoDay: string): string {
  return new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(
    parseRentalDay(isoDay),
  )
}

// "12. – 14. 8. 2026" when the range shares a month and year (the common
// case for a short rental); falls back to two full dates otherwise.
export function formatDayRange(startIsoDay: string, endIsoDay: string): string {
  const start = parseRentalDay(startIsoDay)
  const end = parseRentalDay(endIsoDay)
  const sameMonthYear = start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth()

  if (sameMonthYear) {
    // sk-SK's day-only format already appends its own "." (e.g. "12."),
    // so this does not add a second one.
    const startDay = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', timeZone: 'UTC' }).format(start)
    return `${startDay} – ${formatDay(endIsoDay)}`
  }
  return `${formatDay(startIsoDay)} – ${formatDay(endIsoDay)}`
}

// A real instant (recorded_at, occurred_at, ...) — Europe/Bratislava,
// never raw ISO (D-51).
export function formatDateTime(isoTimestamp: string | Date): string {
  const instant = typeof isoTimestamp === 'string' ? new Date(isoTimestamp) : isoTimestamp
  return new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TIME_ZONE,
  }).format(instant)
}
