-- Delivery and Collection (D-66; issue #217). Expand-only (D-30).
-- Supersedes A-01 in the narrowest form: an Operator-maintained
-- DeliveryZone with a flat fee; outside it, flat fee + km the Operator
-- enters after a phone call. No maps provider; the address never leaves
-- the platform (its retention is under OQ #27).

-- Tenant policy values (D-21: money with its currency). NULL = not set:
-- no Delivery is offered until the Tenant sets the flat fee (OQ #32), and
-- outside-zone pricing waits for the per-km rate. Nothing is invented.
alter table tenant_settings
  add column if not exists delivery_flat_fee_cents integer,
  add column if not exists delivery_per_km_cents integer,
  add column if not exists delivery_fee_currency text not null default 'EUR';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tenant_settings_delivery_fees_non_negative') then
    alter table tenant_settings
      add constraint tenant_settings_delivery_fees_non_negative
      check (
        (delivery_flat_fee_cents is null or delivery_flat_fee_cents >= 0)
        and (delivery_per_km_cents is null or delivery_per_km_cents >= 0)
      );
  end if;
end $$;

-- DeliveryZone: the municipalities with the flat fee. Removal is a mark,
-- so a Delivery that named a municipality keeps its reference.
create table if not exists delivery_zone_municipalities (
  id integer generated always as identity primary key,
  tenant_id uuid not null references tenants (id),
  name text not null,
  created_by_operator_id uuid not null,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by_operator_id uuid,
  constraint delivery_zone_municipalities_tenant_id_id_key unique (tenant_id, id),
  constraint delivery_zone_municipalities_removal_attributed
    check ((removed_at is null) = (removed_by_operator_id is null))
);

create unique index if not exists delivery_zone_municipalities_active_name_idx
  on delivery_zone_municipalities (tenant_id, lower(name)) where removed_at is null;

alter table delivery_zone_municipalities enable row level security;

-- One Delivery and/or one Collection per ReservationGroup. Never holds
-- capacity of its own (downstream of Availability & Reservation).
create table if not exists deliveries (
  id integer generated always as identity primary key,
  tenant_id uuid not null references tenants (id),
  reservation_group_id integer not null references reservation_groups (id),
  leg text not null check (leg in ('delivery', 'collection')),
  time_window text not null check (time_window in ('morning', 'afternoon')),
  outside_zone boolean not null default false,
  municipality_id integer,
  address text not null,
  -- In the zone: the flat fee, priced at checkout. Outside: NULL until the
  -- Operator records the km after the call; then flat + km × rate.
  fee_cents integer check (fee_cents is null or fee_cents >= 0),
  fee_currency text not null default 'EUR',
  distance_km integer check (distance_km is null or distance_km >= 0),
  priced_by_operator_id uuid,
  priced_at timestamptz,
  created_at timestamptz not null default now(),
  constraint deliveries_one_leg_per_group unique (reservation_group_id, leg),
  foreign key (tenant_id, municipality_id) references delivery_zone_municipalities (tenant_id, id),
  constraint deliveries_zone_has_municipality
    check (outside_zone or municipality_id is not null),
  constraint deliveries_priced_attributed
    check ((priced_at is null) = (priced_by_operator_id is null))
);

create index if not exists deliveries_tenant_group_idx on deliveries (tenant_id, reservation_group_id);

alter table deliveries enable row level security;

-- The outside-zone fee is paid to the driver on site and attested like an
-- OnSitePayment (D-65): PIN-gated, amount + method, append-only.
create table if not exists delivery_fee_payments (
  id integer generated always as identity primary key,
  tenant_id uuid not null references tenants (id),
  delivery_id integer not null references deliveries (id),
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'EUR',
  method text not null check (method in ('cash', 'card_terminal', 'qr')),
  operator_id uuid not null references auth.users (id),
  attested_at timestamptz not null default now()
);

create index if not exists delivery_fee_payments_delivery_idx on delivery_fee_payments (tenant_id, delivery_id);

alter table delivery_fee_payments enable row level security;
