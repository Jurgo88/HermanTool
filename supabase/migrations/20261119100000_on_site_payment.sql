-- On-site payment (D-65; issue #215). Expand-only (D-30): new columns
-- with safe defaults, new tables, and one widened check constraint.

-- How the ReservationGroup's rental fee is paid. Existing groups were all
-- paid online (the only path until now), hence the default.
alter table reservation_groups
  add column if not exists payment_method text not null default 'online';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'reservation_groups_payment_method_check'
  ) then
    alter table reservation_groups
      add constraint reservation_groups_payment_method_check
      check (payment_method in ('online', 'on_site'));
  end if;
end $$;

-- Tenant policy values, one row per Tenant. D-65's discount for paying
-- online is the first; later policy values (D-66 delivery fees) add
-- columns here. NULL means "not set": no discount applies until the
-- Tenant sets one (OQ #31 — the value is deliberately not invented).
-- Basis points: 1000 = 10 %.
create table if not exists tenant_settings (
  tenant_id uuid primary key references tenants (id),
  online_payment_discount_basis_points integer,
  updated_by_operator_id uuid,
  updated_at timestamptz not null default now(),
  constraint tenant_settings_online_discount_range
    check (online_payment_discount_basis_points between 1 and 9999)
);

alter table tenant_settings enable row level security;

-- OnSitePayment (D-65, P6, D-07): the Operator's PIN-gated attestation
-- that the rental fee was received through the Tenant's own eKasa. Not a
-- Payment — the platform moves no money. Append-only (D-10): a correction
-- is a new row that names the row it supersedes (P1), never an update.
create table if not exists on_site_payments (
  id integer generated always as identity primary key,
  tenant_id uuid not null references tenants (id),
  reservation_group_id integer not null references reservation_groups (id),
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'EUR',
  method text not null check (method in ('cash', 'card_terminal', 'qr')),
  operator_id uuid not null references auth.users (id),
  attested_at timestamptz not null default now(),
  supersedes_id integer references on_site_payments (id),
  correction_reason text,
  constraint on_site_payments_supersedes_once unique (supersedes_id),
  constraint on_site_payments_correction_reasoned
    check ((supersedes_id is null) = (correction_reason is null))
);

create index if not exists on_site_payments_tenant_group_idx
  on on_site_payments (tenant_id, reservation_group_id);

alter table on_site_payments enable row level security;

-- The e-mail confirmation of an on-site ReservationGroup (D-65, D-28):
-- one single-use, expiring token per group, stored hashed only.
create table if not exists on_site_confirmation_tokens (
  id integer generated always as identity primary key,
  tenant_id uuid not null references tenants (id),
  reservation_group_id integer not null references reservation_groups (id),
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint on_site_confirmation_tokens_hash_unique unique (token_hash),
  constraint on_site_confirmation_tokens_group_unique unique (reservation_group_id)
);

alter table on_site_confirmation_tokens enable row level security;

-- Notification: one more closed kind, the confirmation request sent to an
-- on-site ReservationGroup (FR-32's at-most-once index covers it). The
-- check is widened, never narrowed — existing rows all still satisfy it.
alter table notification_dispatches
  drop constraint if exists notification_dispatches_kind_check;
alter table notification_dispatches
  add constraint notification_dispatches_kind_check
  check (kind in (
    'confirmation', 'pickup_reminder', 'return_reminder', 'overdue_reminder',
    'on_site_confirmation_request'
  ));
