// The ReportingSource behind S-25 (D-63; issue #211), at the composition
// root: Catalog's and Availability & Reservation's published interfaces
// where they already answer the question, read-only SQL over Payments'
// and Handover & Possession's tables where they publish no read for it.
// Nothing here writes. Every query filters by tenant_id (FR-33).
import type postgres from 'postgres'
import { createMonetaryAmount, type MonetaryAmount, type TenantId } from '../contexts/_shared'
import {
  TENANT_TIME_ZONE,
  createPostgresAvailabilityReservationRepository,
  getAvailableCountsForPeriod,
} from '../contexts/availability-reservation'
import { createPostgresCatalogRepository } from '../contexts/catalog'
import type { ReportedReservation, ReportingSource } from '../contexts/utilisation-reporting'

const formatDay = (date: Date) => date.toISOString().slice(0, 10)

interface ReservationRow {
  id: number
  reservation_group_id: number
  asset_type_id: number
  start_day: Date
  end_day: Date
  day_rate_cents: number | null
  day_rate_currency: MonetaryAmount['currency'] | null
}

const mapReservation = (row: ReservationRow): ReportedReservation => ({
  id: row.id,
  reservationGroupId: row.reservation_group_id,
  assetTypeId: row.asset_type_id,
  period: { startDay: formatDay(row.start_day), endDay: formatDay(row.end_day) },
  dayRate:
    row.day_rate_cents === null || row.day_rate_currency === null
      ? null
      : createMonetaryAmount(row.day_rate_cents, row.day_rate_currency),
})

export function createPostgresReportingSource(sql: postgres.Sql): ReportingSource {
  const catalog = createPostgresCatalogRepository(sql)
  const availability = createPostgresAvailabilityReservationRepository(sql)

  return {
    async listAssetTypes(tenantId) {
      const assetTypes = await catalog.listAssetTypes(tenantId)
      return assetTypes.map(({ id, name, dayRate }) => ({ id, name, dayRate }))
    },

    readPoolCount: (tenantId, assetTypeId) =>
      availability.readRentablePoolCount(tenantId, assetTypeId),

    availablePerDay: (tenantId, assetTypeId, period) =>
      getAvailableCountsForPeriod(availability, availability.readRentablePoolCount, {
        tenantId,
        assetTypeId,
        period,
      }),

    async listConfirmedReservationsOverlapping(tenantId, period) {
      const rows = await sql<ReservationRow[]>`
        select id, reservation_group_id, asset_type_id, start_day, end_day,
          day_rate_cents, day_rate_currency
        from reservations
        where tenant_id = ${tenantId} and state = 'confirmed'
          and start_day <= ${period.endDay}::date and end_day >= ${period.startDay}::date
        order by id
      `
      return rows.map(mapReservation)
    },

    async listConfirmedReservationsOfGroups(tenantId, reservationGroupIds) {
      if (reservationGroupIds.length === 0) return []
      const rows = await sql<ReservationRow[]>`
        select id, reservation_group_id, asset_type_id, start_day, end_day,
          day_rate_cents, day_rate_currency
        from reservations
        where tenant_id = ${tenantId} and state = 'confirmed'
          and reservation_group_id in ${sql(reservationGroupIds)}
        order by id
      `
      return rows.map(mapReservation)
    },

    // Payments' 'succeeded' is the confirmation; updated_at is when the
    // webhook set it. Dated by the Tenant's local day (A-04).
    async listConfirmedPayments(tenantId, period) {
      const rows = await sql<
        { reservation_group_id: number; amount_cents: number; currency: string; day: Date }[]
      >`
        select reservation_group_id, amount_cents, currency,
          (updated_at at time zone ${TENANT_TIME_ZONE})::date as day
        from payments
        where tenant_id = ${tenantId} and status = 'succeeded'
          and (updated_at at time zone ${TENANT_TIME_ZONE})::date
            between ${period.startDay}::date and ${period.endDay}::date
        order by id
      `
      return rows.map((row) => ({
        reservationGroupId: row.reservation_group_id,
        amount: createMonetaryAmount(row.amount_cents, row.currency as MonetaryAmount['currency']),
        day: formatDay(row.day),
      }))
    },

    // D-65: only the attestations in force — a superseded one is not money.
    async listOnSitePayments(tenantId, period) {
      const rows = await sql<
        { reservation_group_id: number; amount_cents: number; currency: string; day: Date }[]
      >`
        select p.reservation_group_id, p.amount_cents, p.currency,
          (p.attested_at at time zone ${TENANT_TIME_ZONE})::date as day
        from on_site_payments p
        where p.tenant_id = ${tenantId}
          and not exists (
            select 1 from on_site_payments s
            where s.tenant_id = p.tenant_id and s.supersedes_id = p.id
          )
          and (p.attested_at at time zone ${TENANT_TIME_ZONE})::date
            between ${period.startDay}::date and ${period.endDay}::date
        order by p.id
      `
      return rows.map((row) => ({
        reservationGroupId: row.reservation_group_id,
        amount: createMonetaryAmount(row.amount_cents, row.currency as MonetaryAmount['currency']),
        day: formatDay(row.day),
      }))
    },

    async listOpenPossessionEndDays(tenantId: TenantId) {
      const rows = await sql<{ end_day: Date }[]>`
        select r.end_day from rental_agreements ra
        join reservations r on r.tenant_id = ra.tenant_id and r.id = ra.reservation_id
        where ra.tenant_id = ${tenantId}
          and ra.handover_in_at is null and ra.declared_lost_at is null
      `
      return rows.map((row) => formatDay(row.end_day))
    },

    async listHeldDeposits(tenantId: TenantId) {
      const rows = await sql<{ amount_cents: number; currency: string }[]>`
        select d.amount_cents, d.currency from deposit_taken d
        where d.tenant_id = ${tenantId}
          and not exists (
            select 1 from deposit_returned x
            where x.tenant_id = d.tenant_id and x.rental_agreement_id = d.rental_agreement_id
          )
      `
      return rows.map((row) =>
        createMonetaryAmount(row.amount_cents, row.currency as MonetaryAmount['currency']),
      )
    },
  }
}
