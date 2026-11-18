// The Operator's list of upcoming Deliveries and Collections (D-66; #217),
// composed at the root because it joins Logistics & Delivery's legs to the
// group's RentalPeriod (Availability & Reservation) and the Customer's
// phone (Customer Identity & Compliance). Read-only; Tenant-scoped (FR-33).
//
// A Delivery happens on the group's first RentalDay, a Collection on its
// last (D-66, D-09 unchanged). A group's Reservations may carry different
// periods (D-13): first = earliest start, last = latest end, over its
// active Reservations.
import type postgres from 'postgres'
import type { MonetaryAmount, TenantId } from '../contexts/_shared'
import type { DeliveryLeg, TimeWindow } from '../contexts/logistics-delivery'

export interface ScheduledLeg {
  deliveryId: number
  reservationGroupId: number
  leg: DeliveryLeg
  day: string
  timeWindow: TimeWindow
  outsideZone: boolean
  municipality: string | null
  address: string
  fee: MonetaryAmount | null
  distanceKm: number | null
  feeAttested: boolean
  customerName: string | null
  customerPhone: string | null
}

const formatDay = (date: Date) => date.toISOString().slice(0, 10)

export async function listScheduledLegs(
  sql: postgres.Sql,
  params: { tenantId: TenantId; fromDay: string; toDay: string },
): Promise<ScheduledLeg[]> {
  const rows = await sql<
    {
      id: number
      reservation_group_id: number
      leg: DeliveryLeg
      day: Date
      time_window: TimeWindow
      outside_zone: boolean
      municipality: string | null
      address: string
      fee_cents: number | null
      fee_currency: MonetaryAmount['currency']
      distance_km: number | null
      fee_attested: boolean
      customer_name: string | null
      customer_phone: string | null
    }[]
  >`
    with spans as (
      select r.reservation_group_id, min(r.start_day) as first_day, max(r.end_day) as last_day
      from reservations r
      where r.tenant_id = ${params.tenantId}
        and (r.state = 'confirmed' or (r.state = 'pending' and r.pending_expires_at > now()))
      group by r.reservation_group_id
    )
    select d.id, d.reservation_group_id, d.leg,
      case when d.leg = 'delivery' then s.first_day else s.last_day end as day,
      d.time_window, d.outside_zone, m.name as municipality, d.address,
      d.fee_cents, d.fee_currency, d.distance_km,
      exists (select 1 from delivery_fee_payments p where p.tenant_id = d.tenant_id and p.delivery_id = d.id) as fee_attested,
      c.name as customer_name, c.phone as customer_phone
    from deliveries d
    join spans s on s.reservation_group_id = d.reservation_group_id
    left join delivery_zone_municipalities m on m.tenant_id = d.tenant_id and m.id = d.municipality_id
    left join customers c on c.tenant_id = d.tenant_id and c.reservation_group_id = d.reservation_group_id
    where d.tenant_id = ${params.tenantId}
      and (case when d.leg = 'delivery' then s.first_day else s.last_day end)
        between ${params.fromDay}::date and ${params.toDay}::date
    order by day, d.time_window, d.id
  `
  return rows.map((r) => ({
    deliveryId: r.id,
    reservationGroupId: r.reservation_group_id,
    leg: r.leg,
    day: formatDay(r.day),
    timeWindow: r.time_window,
    outsideZone: r.outside_zone,
    municipality: r.municipality,
    address: r.address,
    fee: r.fee_cents === null ? null : { amount: r.fee_cents, currency: r.fee_currency },
    distanceKm: r.distance_km,
    feeAttested: r.fee_attested,
    customerName: r.customer_name,
    customerPhone: r.customer_phone,
  }))
}
