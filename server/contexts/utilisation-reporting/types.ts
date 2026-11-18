// Domain types for Utilisation & Reporting (D-63; issue #211). Read-only:
// no aggregate, nothing stored, every figure computed on request from
// facts other contexts own. See ./index.ts for the boundary.
import type { MonetaryAmount, TenantId } from '../_shared'
import type { RentalPeriod } from '../availability-reservation'

// The reporting range an Operator picks on S-25: a calendar month, a
// calendar year, or any range of RentalDays.
export type ReportingRange =
  | { kind: 'month'; month: string }
  | { kind: 'year'; year: string }
  | { kind: 'custom'; startDay: string; endDay: string }

export interface ReportedAssetType {
  id: number
  name: string
  dayRate: MonetaryAmount
}

export interface ReportedReservation {
  id: number
  reservationGroupId: number
  assetTypeId: number
  period: RentalPeriod
}

// A confirmed online Payment (Payments' 'succeeded'), dated by the
// Tenant-local day it was confirmed.
export interface ReportedPayment {
  reservationGroupId: number
  amount: MonetaryAmount
  day: string
}

// The narrow read model this context computes over. Every method takes
// the Tenant first (FR-33). Implemented at the composition root over the
// owning contexts' tables and published interfaces
// (server/utils/statistics-source.ts); faked in unit tests.
export interface ReportingSource {
  listAssetTypes(tenantId: TenantId): Promise<ReportedAssetType[]>
  // D-38: Rentable + InPossession + UnderInspection, never Rentable alone.
  readPoolCount(tenantId: TenantId, assetTypeId: number): Promise<number>
  // Availability & Reservation's own per-day count, the same one the S-02
  // calendar uses, so unmet-demand days are its "none" days.
  availablePerDay(
    tenantId: TenantId,
    assetTypeId: number,
    period: RentalPeriod,
  ): Promise<{ day: string; available: number }[]>
  listConfirmedReservationsOverlapping(
    tenantId: TenantId,
    period: RentalPeriod,
  ): Promise<ReportedReservation[]>
  listConfirmedReservationsOfGroups(
    tenantId: TenantId,
    reservationGroupIds: number[],
  ): Promise<ReportedReservation[]>
  listConfirmedPayments(tenantId: TenantId, period: RentalPeriod): Promise<ReportedPayment[]>
  // D-65: rental fees attested on site (the attestations in force only),
  // dated by the Tenant-local day of attestation. Money the platform only
  // records (P6) — never summed into confirmed revenue.
  listOnSitePayments(tenantId: TenantId, period: RentalPeriod): Promise<ReportedPayment[]>
  // Open Possessions (handed out, not back, not declared lost): the last
  // day of each one's Reservation. Overdue is derived from it (FR-28).
  listOpenPossessionEndDays(tenantId: TenantId): Promise<string[]>
  // Deposits attested taken and not yet returned (P6, D-07): cash the
  // platform only records.
  listHeldDeposits(tenantId: TenantId): Promise<MonetaryAmount[]>
}

export interface AssetTypeStatistics {
  assetTypeId: number
  name: string
  rentals: number
  rentedDays: number
  // rentedDays / (pool × days in range); null when the pool is empty.
  utilisation: number | null
  pool: number
  // Confirmed online revenue attributed to this AssetType (see
  // ./statistics.ts on how a group's Payment is shared out).
  revenue: MonetaryAmount[]
  // Days on which the AssetType had no capacity left (D-58 "none").
  unmetDemandDays: number
}

export interface StatisticsOverview {
  month: string
  previousMonth: string
  // Confirmed online revenue only (P6). Sums are per currency (D-21).
  revenueThisMonth: MonetaryAmount[]
  revenueLastMonth: MonetaryAmount[]
  // D-65: rental fees attested on site, their own line (P6).
  onSiteRevenueThisMonth: MonetaryAmount[]
  onSiteRevenueLastMonth: MonetaryAmount[]
  utilisationThisMonth: number | null
  reservationsThisMonth: number
  // Derived facts (FR-28): computed now, never read from a stored status.
  outNow: number
  overdueNow: number
  depositsHeld: MonetaryAmount[]
}

export interface MonthRevenue {
  month: string
  revenue: MonetaryAmount[]
}

export class UtilisationReportingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

export class InvalidReportingRangeError extends UtilisationReportingError {
  constructor(detail: string) {
    super(`Invalid reporting range: ${detail}.`)
  }
}
