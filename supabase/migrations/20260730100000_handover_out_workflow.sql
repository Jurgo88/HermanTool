-- HandoverOut workflow (D-04, D-05, FR-14, FR-15, FR-18, FR-19, FR-21,
-- FR-22, W4; issue #23). Three tables:
--
--   * `rental_agreements` (D-13, FR-22) — the contract that comes into
--     being at HandoverOut, binding one Customer, one Asset and one
--     Reservation. `handover_in_at` is nullable and IS Possession's
--     clock (P1: derived, never a separate stored entity) — null means
--     Possession is still open. One Reservation produces at most one
--     RentalAgreement (the unique index below), matching FR-22's "one
--     RentalAgreement per Asset, never one per ReservationGroup"
--     extended to "never twice for the same Reservation".
--
--   * `condition_reports` (FR-19, D-05) — captured at each end of every
--     rental. `photo_object_keys` points into R2's `conditions` bucket
--     (D-27, backed up). No uniqueness constraint on
--     (rental_agreement_id, stage): append-only (D-10) — a correction
--     (#25, not built yet) appends a new row rather than editing this
--     one, same discipline as identity_verifications.
--
--   * `deposit_taken` (D-07, FR-21) — an attestation that cash changed
--     hands. No Payments involvement anywhere in this schema.
create table if not exists rental_agreements (
  id integer generated always as identity primary key,
  tenant_id uuid not null references tenants (id),
  reservation_id integer not null references reservations (id),
  customer_id integer not null references customers (id),
  asset_id integer not null references assets (id),
  operator_id uuid not null references auth.users (id),
  terms_version text not null,
  handover_out_at timestamptz not null default now(),
  handover_in_at timestamptz,
  constraint rental_agreements_reservation_id_unique unique (reservation_id)
);

create index if not exists rental_agreements_tenant_id_idx on rental_agreements (tenant_id);
create index if not exists rental_agreements_asset_id_idx on rental_agreements (asset_id);
create index if not exists rental_agreements_customer_id_idx on rental_agreements (customer_id);

alter table rental_agreements enable row level security;

create type condition_report_stage as enum ('handover_out', 'handover_in');

create table if not exists condition_reports (
  id integer generated always as identity primary key,
  tenant_id uuid not null references tenants (id),
  rental_agreement_id integer not null references rental_agreements (id),
  stage condition_report_stage not null,
  photo_object_keys text[] not null,
  operator_id uuid not null references auth.users (id),
  captured_at timestamptz not null default now(),
  -- cardinality(), not array_length(..., 1): array_length returns NULL
  -- (not 0) for an empty array, and a NULL check-constraint expression
  -- passes rather than fails — `array_length(x, 1) > 0` would silently
  -- accept '{}'. cardinality() returns 0 for an empty array, so this
  -- actually rejects it. Caught by this migration's own integration test.
  constraint condition_reports_photos_not_empty check (cardinality(photo_object_keys) > 0)
);

create index if not exists condition_reports_tenant_id_idx on condition_reports (tenant_id);
create index if not exists condition_reports_rental_agreement_id_idx on condition_reports (rental_agreement_id);

alter table condition_reports enable row level security;

create table if not exists deposit_taken (
  id integer generated always as identity primary key,
  tenant_id uuid not null references tenants (id),
  rental_agreement_id integer not null references rental_agreements (id),
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'EUR',
  operator_id uuid not null references auth.users (id),
  taken_at timestamptz not null default now()
);

create index if not exists deposit_taken_tenant_id_idx on deposit_taken (tenant_id);
create index if not exists deposit_taken_rental_agreement_id_idx on deposit_taken (rental_agreement_id);

alter table deposit_taken enable row level security;

-- No RLS policies on any table above, matching every other table in this
-- schema: domain logic and tenant scoping live in Nitro (D-25), not RLS.
-- Only the service-role key (bypasses RLS, D-31) reaches these tables.
