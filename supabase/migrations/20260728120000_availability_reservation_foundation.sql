-- Availability & Reservation context foundation [MVP · CORE].
-- Governs: D-04, D-08, D-09, D-13, D-18, D-33, D-37, FR-03..FR-10, FR-33.
--
-- Three tables:
--
--   * `reservation_groups` (D-13) — the set of Reservations created in one
--     checkout. Deliberately minimal: no status, no RentalPeriod, no
--     Payment reference. Payments does not exist yet as a context, and
--     terms acceptance (D-35, F1 KNOWN GAP) is out of scope for this
--     migration — both are added when the contexts/workflows that own
--     them are built, not scaffolded ahead of that work.
--
--   * `reservations` — the Reservation aggregate (D-04: binds to
--     AssetType, never to an Asset). States are Pending, Confirmed,
--     Cancelled, Expired and nothing else (D-18) — there is no Fulfilled
--     column value and there must never be one. `start_day`/`end_day` are
--     inclusive (A-05): a 5-7 March RentalPeriod is start_day=5,
--     end_day=7. Ordinary mutable state, not append-only (D-10 requires
--     append-only history only for Possession/condition/attestation
--     facts, not for this context's lifecycle).
--
--   * `asset_type_day_holds` — the D-33 materialised counter enforcing
--     the D-08 invariant under concurrency. One row per (Tenant,
--     AssetType, day); `held_count` is incremented/decremented via an
--     atomic conditional UPSERT in application code (never a bare
--     UPDATE), which is what makes the invariant enforceable without
--     SERIALIZABLE retries or advisory locks over Supabase's transaction
--     pooler (Part 4 §16 D-33, Finding 4, R-08). Deliberately holds no
--     `capacity`/Rentable-count snapshot column: capacity is read live
--     from Asset Registry's published interface at hold-acquisition time
--     (D-02 boundary), inside the same transaction as the increment, so
--     there is nothing here to keep in sync. This table is private to
--     this context — nothing outside Availability & Reservation queries
--     it, and it is not exported from index.ts.
create table if not exists reservation_groups (
  id integer generated always as identity primary key,
  tenant_id uuid not null references tenants (id),
  created_at timestamptz not null default now()
);

create index if not exists reservation_groups_tenant_id_idx on reservation_groups (tenant_id);

alter table reservation_groups enable row level security;

create type reservation_state as enum ('pending', 'confirmed', 'cancelled', 'expired');

create table if not exists reservations (
  id integer generated always as identity primary key,
  tenant_id uuid not null references tenants (id),
  reservation_group_id integer not null references reservation_groups (id),
  asset_type_id integer not null references asset_types (id),
  start_day date not null,
  end_day date not null,
  state reservation_state not null default 'pending',
  -- Always populated at creation (D-18's Pending hold starts immediately)
  -- and simply ignored once state is no longer 'pending'; not cleared on
  -- transition, since it is a fact about when the Pending hold was due to
  -- lapse, not a live flag.
  pending_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  state_changed_at timestamptz not null default now(),
  constraint reservations_period_check check (end_day >= start_day)
);

create index if not exists reservations_tenant_id_idx on reservations (tenant_id);
create index if not exists reservations_group_id_idx on reservations (reservation_group_id);

-- Backs both the read-side lazy-expiry availability query (FR-03: active
-- Reservations for an AssetType covering a given day) and the D-33
-- reap-on-contention lookup (a stale Pending covering a contended day).
create index if not exists reservations_asset_type_range_idx
  on reservations (asset_type_id, start_day, end_day);

alter table reservations enable row level security;

create table if not exists asset_type_day_holds (
  tenant_id uuid not null references tenants (id),
  asset_type_id integer not null references asset_types (id),
  rental_day date not null,
  held_count integer not null default 0,
  primary key (tenant_id, asset_type_id, rental_day),
  constraint asset_type_day_holds_non_negative check (held_count >= 0)
);

alter table asset_type_day_holds enable row level security;

-- No RLS policies on any table above, matching every other table in this
-- schema: domain logic and tenant scoping live in Nitro (D-25), not RLS.
-- Only the service-role key (bypasses RLS, D-31) reaches these tables.
