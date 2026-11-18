// Read-only statistics for S-25 (D-63; issue #211). Pure over a
// ReportingSource: nothing here writes, stores a derived fact, or does
// date arithmetic of its own — periods come from Availability &
// Reservation's RentalPeriod helpers (D-12).
//
// Decisions recorded here because the data forces them:
// - Utilisation's denominator is today's D-38 pool × days in range. The
//   pool is not versioned over time; for a past range it is the closest
//   honest number, and the screen says so.
// - A Payment covers a whole ReservationGroup (D-13) and no per-line price
//   is stored, so per-AssetType revenue shares each confirmed Payment out
//   across the group's confirmed Reservations in proportion to day rate ×
//   days, with largest-remainder rounding so the shares add up to the
//   Payment exactly. Overview revenue is the Payments themselves.
// - "Rentals" and "rented days" count confirmed Reservations (the
//   commercial clock), the same holds that made capacity unavailable.
import { createMonetaryAmount, type MonetaryAmount, type TenantId } from '../_shared'
import {
  intersectRentalPeriods,
  monthOfDay,
  periodOfMonth,
  periodOfYear,
  rentalPeriodLengthInDays,
  shiftMonth,
  validateRentalPeriod,
  type RentalPeriod,
} from '../availability-reservation'
import {
  InvalidReportingRangeError,
  type AssetTypeStatistics,
  type MonthRevenue,
  type ReportedPayment,
  type ReportedReservation,
  type ReportingRange,
  type ReportingSource,
  type StatisticsOverview,
} from './types'

// A custom range is a report, not an export of the whole history.
export const MAX_REPORTING_RANGE_DAYS = 366
export const REVENUE_CHART_MONTHS = 12

export function resolveReportingRange(range: ReportingRange): RentalPeriod {
  try {
    const period =
      range.kind === 'month'
        ? periodOfMonth(range.month)
        : range.kind === 'year'
          ? periodOfYear(range.year)
          : { startDay: range.startDay, endDay: range.endDay }
    validateRentalPeriod(period)
    if (rentalPeriodLengthInDays(period) > MAX_REPORTING_RANGE_DAYS) {
      throw new InvalidReportingRangeError(`longer than ${MAX_REPORTING_RANGE_DAYS} days`)
    }
    return period
  } catch (err) {
    if (err instanceof InvalidReportingRangeError) throw err
    throw new InvalidReportingRangeError('not a month, a year or a valid range of days')
  }
}

// D-21: one sum per currency, never a sum across currencies.
export function sumByCurrency(amounts: MonetaryAmount[]): MonetaryAmount[] {
  const totals = new Map<MonetaryAmount['currency'], number>()
  for (const { amount, currency } of amounts)
    totals.set(currency, (totals.get(currency) ?? 0) + amount)
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) => createMonetaryAmount(amount, currency))
}

// Shares `total` minor units out by weight; the parts always add up to
// `total`. Equal weights when every weight is zero.
export function allocateByWeight(total: number, weights: number[]): number[] {
  if (weights.length === 0) return []
  const effective = weights.every((w) => w <= 0)
    ? weights.map(() => 1)
    : weights.map((w) => Math.max(0, w))
  const sum = effective.reduce((a, b) => a + b, 0)
  const exact = effective.map((w) => (total * w) / sum)
  const parts = exact.map(Math.floor)
  let remainder = total - parts.reduce((a, b) => a + b, 0)
  const byFraction = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
  for (const { index } of byFraction) {
    if (remainder <= 0) break
    parts[index]! += 1
    remainder -= 1
  }
  return parts
}

function rentedDaysInRange(reservations: ReportedReservation[], range: RentalPeriod): number {
  return reservations.reduce((sum, reservation) => {
    const overlap = intersectRentalPeriods(reservation.period, range)
    return sum + (overlap ? rentalPeriodLengthInDays(overlap) : 0)
  }, 0)
}

async function revenueByAssetType(
  source: ReportingSource,
  tenantId: TenantId,
  payments: ReportedPayment[],
  dayRates: Map<number, number>,
): Promise<Map<number, MonetaryAmount[]>> {
  const result = new Map<number, MonetaryAmount[]>()
  if (payments.length === 0) return result
  const groupIds = [...new Set(payments.map((p) => p.reservationGroupId))]
  const reservations = await source.listConfirmedReservationsOfGroups(tenantId, groupIds)

  for (const payment of payments) {
    const lines = reservations.filter((r) => r.reservationGroupId === payment.reservationGroupId)
    const weights = lines.map(
      (line) => (dayRates.get(line.assetTypeId) ?? 0) * rentalPeriodLengthInDays(line.period),
    )
    allocateByWeight(payment.amount.amount, weights).forEach((share, i) => {
      const assetTypeId = lines[i]!.assetTypeId
      const list = result.get(assetTypeId) ?? []
      list.push(createMonetaryAmount(share, payment.amount.currency))
      result.set(assetTypeId, list)
    })
  }
  return result
}

// S-25 detail: per AssetType for the chosen range.
export async function getAssetTypeStatistics(
  source: ReportingSource,
  params: { tenantId: TenantId; range: ReportingRange },
): Promise<{ period: RentalPeriod; assetTypes: AssetTypeStatistics[] }> {
  const { tenantId } = params
  const period = resolveReportingRange(params.range)
  const daysInRange = rentalPeriodLengthInDays(period)

  const [assetTypes, reservations, payments] = await Promise.all([
    source.listAssetTypes(tenantId),
    source.listConfirmedReservationsOverlapping(tenantId, period),
    source.listConfirmedPayments(tenantId, period),
  ])
  const dayRates = new Map(assetTypes.map((a) => [a.id, a.dayRate.amount]))
  const revenue = await revenueByAssetType(source, tenantId, payments, dayRates)

  const rows = await Promise.all(
    assetTypes.map(async (assetType): Promise<AssetTypeStatistics> => {
      const own = reservations.filter((r) => r.assetTypeId === assetType.id)
      const [pool, perDay] = await Promise.all([
        source.readPoolCount(tenantId, assetType.id),
        source.availablePerDay(tenantId, assetType.id, period),
      ])
      const rentedDays = rentedDaysInRange(own, period)
      return {
        assetTypeId: assetType.id,
        name: assetType.name,
        rentals: own.length,
        rentedDays,
        utilisation: pool > 0 ? rentedDays / (pool * daysInRange) : null,
        pool,
        revenue: sumByCurrency(revenue.get(assetType.id) ?? []),
        unmetDemandDays: perDay.filter((d) => d.available <= 0).length,
      }
    }),
  )
  return { period, assetTypes: rows }
}

// S-25 overview: the first thing the owner sees on opening admin.
export async function getStatisticsOverview(
  source: ReportingSource,
  params: { tenantId: TenantId; today: string },
): Promise<StatisticsOverview> {
  const { tenantId, today } = params
  const month = monthOfDay(today)
  const previousMonth = shiftMonth(month, -1)
  const thisMonth = periodOfMonth(month)
  const lastMonth = periodOfMonth(previousMonth)
  const daysInMonth = rentalPeriodLengthInDays(thisMonth)

  const [
    paymentsNow,
    paymentsBefore,
    onSiteNow,
    onSiteBefore,
    reservations,
    assetTypes,
    openEndDays,
    deposits,
  ] = await Promise.all([
    source.listConfirmedPayments(tenantId, thisMonth),
    source.listConfirmedPayments(tenantId, lastMonth),
    source.listOnSitePayments(tenantId, thisMonth),
    source.listOnSitePayments(tenantId, lastMonth),
    source.listConfirmedReservationsOverlapping(tenantId, thisMonth),
    source.listAssetTypes(tenantId),
    source.listOpenPossessionEndDays(tenantId),
    source.listHeldDeposits(tenantId),
  ])

  const pools = await Promise.all(assetTypes.map((a) => source.readPoolCount(tenantId, a.id)))
  const capacityDays = pools.reduce((sum, pool) => sum + pool * daysInMonth, 0)
  const rentedDays = rentedDaysInRange(reservations, thisMonth)

  return {
    month,
    previousMonth,
    revenueThisMonth: sumByCurrency(paymentsNow.map((p) => p.amount)),
    revenueLastMonth: sumByCurrency(paymentsBefore.map((p) => p.amount)),
    onSiteRevenueThisMonth: sumByCurrency(onSiteNow.map((p) => p.amount)),
    onSiteRevenueLastMonth: sumByCurrency(onSiteBefore.map((p) => p.amount)),
    utilisationThisMonth: capacityDays > 0 ? rentedDays / capacityDays : null,
    reservationsThisMonth: reservations.filter((r) => monthOfDay(r.period.startDay) === month)
      .length,
    outNow: openEndDays.length,
    // FR-28: Overdue is a Possession that outlived its Reservation's last
    // day, the same rule as the counter's Overdue list.
    overdueNow: openEndDays.filter((endDay) => endDay < today).length,
    depositsHeld: sumByCurrency(deposits),
  }
}

// S-25 chart: confirmed online revenue by month, the last twelve months
// up to and including the current one.
export async function getRevenueByMonth(
  source: ReportingSource,
  params: { tenantId: TenantId; today: string; months?: number },
): Promise<MonthRevenue[]> {
  const { tenantId, today, months = REVENUE_CHART_MONTHS } = params
  const lastMonth = monthOfDay(today)
  const keys = Array.from({ length: months }, (_, i) => shiftMonth(lastMonth, i - months + 1))
  const range = {
    startDay: periodOfMonth(keys[0]!).startDay,
    endDay: periodOfMonth(lastMonth).endDay,
  }
  const payments = await source.listConfirmedPayments(tenantId, range)
  return keys.map((month) => ({
    month,
    revenue: sumByCurrency(
      payments.filter((p) => monthOfDay(p.day) === month).map((p) => p.amount),
    ),
  }))
}

// The accountant's CSV (D-63): UTF-8 with a byte-order mark so Excel reads
// the diacritics, semicolon-separated as Slovak Excel expects, money as an
// amount column plus a currency column (D-21). One row per AssetType and
// currency; an AssetType with no revenue gets one row in EUR at 0.
export function toStatisticsCsv(
  period: RentalPeriod,
  rows: AssetTypeStatistics[],
  headers: readonly string[],
): string {
  const escape = (value: string) =>
    /[";\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
  const decimal = (value: number, digits: number) => value.toFixed(digits).replace('.', ',')
  const lines = [headers.map(escape).join(';')]
  for (const row of rows) {
    const amounts = row.revenue.length > 0 ? row.revenue : [createMonetaryAmount(0)]
    for (const money of amounts) {
      lines.push(
        [
          period.startDay,
          period.endDay,
          escape(row.name),
          String(row.rentals),
          String(row.rentedDays),
          row.utilisation === null ? '' : decimal(row.utilisation * 100, 1),
          decimal(money.amount / 100, 2),
          money.currency,
          String(row.unmetDemandDays),
        ].join(';'),
      )
    }
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`
}
