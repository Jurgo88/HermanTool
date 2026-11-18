// Utilisation & Reporting — opened narrowly by D-63 (issue #211) as
// read-only statistics for the owner (S-25). Part 1 §3 lists it as
// [Future]; this is the read-only slice only: no aggregate, no table of
// its own, no stored derived fact. Everything is computed on request.
//
// Dependency direction: downstream of Availability & Reservation, whose
// RentalPeriod helpers do every piece of period arithmetic (D-12). It
// reads other contexts' facts only through the ReportingSource interface,
// implemented at the composition root (server/utils/statistics-source.ts).
export type {
  AssetTypeStatistics,
  MonthRevenue,
  ReportedAssetType,
  ReportedPayment,
  ReportedReservation,
  ReportingRange,
  ReportingSource,
  StatisticsOverview,
} from './types'
export { InvalidReportingRangeError, UtilisationReportingError } from './types'
export {
  MAX_REPORTING_RANGE_DAYS,
  REVENUE_CHART_MONTHS,
  allocateByWeight,
  getAssetTypeStatistics,
  getRevenueByMonth,
  getStatisticsOverview,
  resolveReportingRange,
  sumByCurrency,
  toStatisticsCsv,
} from './statistics'
