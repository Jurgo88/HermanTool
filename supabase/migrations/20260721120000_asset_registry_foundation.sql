-- Asset Registry context foundation.
-- Governs: FR-25, FR-26, FR-27, FR-33, FR-34, D-01, D-24, D-25, D-30, W9.
--
-- This is the first migration in the project, so it also lays down two
-- things Asset Registry itself does not own:
--
--   * `tenants` — every aggregate root carries a Tenant identity from day
--     one (D-01), but Tenant & Access (which would own tenant management)
--     is [Future]. Exactly one row is seeded and there is no onboarding
--     surface.
--
--   * `asset_types` — a stub only (id, tenant_id, created_at). AssetType is
--     owned by Catalog (D-03), which has not shipped yet. It exists here
--     purely so `assets.asset_type_id` is a real, enforced foreign key
--     from day one instead of an unconstrained column. Catalog's own
--     migration will ALTER this table to add rate, deposit, description
--     and publication state (expand, D-30) — it must not be recreated.
create extension if not exists pgcrypto;

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

insert into tenants (id)
  select gen_random_uuid()
  where not exists (select 1 from tenants);

-- `integer` rather than `bigint` identity for the tables below: postgres.js
-- returns `bigint` columns as JS strings to avoid precision loss, which
-- would force string-typed ids through the whole domain layer for no
-- benefit at this scale (~200 Assets, NFR-04). `integer`'s ~2.1 billion
-- range is not a constraint here and maps directly to a JS `number`.
create table if not exists asset_types (
  id integer generated always as identity primary key,
  tenant_id uuid not null references tenants (id),
  created_at timestamptz not null default now()
);

create index if not exists asset_types_tenant_id_idx on asset_types (tenant_id);

alter table asset_types enable row level security;

-- Asset lifecycle status (FR-27, Part 1 §6). This is the complete list —
-- deliberately no `Reserved` value: availability is a calendar property,
-- never a flag on an Asset instance.
create type asset_status as enum (
  'rentable',
  'in_possession',
  'under_inspection',
  'unavailable',
  'retired'
);

-- Operator attribution below (`registered_by_operator_id`,
-- `status_changed_by_operator_id`, `asset_status_events.operator_id`,
-- `asset_tags.bound_by_operator_id` / `unbound_by_operator_id`) is a plain
-- `uuid not null`, deliberately NOT foreign-keyed to `auth.users(id)` yet.
-- D-22 (individual Operator authentication via Supabase Auth) has not been
-- implemented in this codebase — there are no Operator seats to reference
-- yet. The column carries the right semantic type (a Supabase Auth user
-- id) and FR-34's attribution requirement, but not yet referential
-- integrity against auth.users.
-- TODO(D-22): once Operator authentication ships and the two Operator
-- seats exist as real auth.users rows, add
--   alter table <table> add constraint <name>
--     foreign key (<column>) references auth.users (id);
-- for every attribution column below. Do not let this remain unenforced
-- permanently.
create table if not exists assets (
  id integer generated always as identity primary key,
  tenant_id uuid not null references tenants (id),
  asset_type_id integer not null references asset_types (id),
  status asset_status not null default 'unavailable',
  registered_at timestamptz not null default now(),
  registered_by_operator_id uuid not null,
  status_changed_at timestamptz not null default now(),
  status_changed_by_operator_id uuid not null,
  status_change_reason text
);

create index if not exists assets_tenant_id_idx on assets (tenant_id);
create index if not exists assets_asset_type_id_idx on assets (asset_type_id);

alter table assets enable row level security;

-- Append-only status-change history (D-10, P1 correctability, FR-34
-- attribution). Every transition, including the initial registration
-- (from_status null), is recorded with who performed it, when it
-- happened, and why. Never edited in place — a correction appends a new
-- row rather than rewriting history.
create table if not exists asset_status_events (
  id integer generated always as identity primary key,
  tenant_id uuid not null references tenants (id),
  asset_id integer not null references assets (id),
  from_status asset_status,
  to_status asset_status not null,
  reason text,
  occurred_at timestamptz not null default now(),
  recorded_at timestamptz not null default now(),
  operator_id uuid not null
);

create index if not exists asset_status_events_asset_id_idx on asset_status_events (asset_id);
create index if not exists asset_status_events_tenant_id_idx on asset_status_events (tenant_id);

alter table asset_status_events enable row level security;

-- AssetTag: bound to an Asset, re-bindable because tags physically fail
-- (FR-26, Part 1 §5). The tag is not the Asset. `tag_code` is an opaque
-- identity supplied by the caller — this table never generates or derives
-- one. QR tag *generation* is F10 (KNOWN GAP), explicitly out of scope
-- here; AssetTag binding assumes a tag identity is already provided.
create table if not exists asset_tags (
  id integer generated always as identity primary key,
  tenant_id uuid not null references tenants (id),
  asset_id integer not null references assets (id),
  tag_code text not null,
  bound_at timestamptz not null default now(),
  bound_by_operator_id uuid not null,
  unbound_at timestamptz,
  unbound_by_operator_id uuid
);

-- At most one active tag per Asset, and at most one active binding per
-- tag_code within a Tenant. Rebinding is: unbind the old row, insert a
-- new one — never an update in place.
create unique index if not exists asset_tags_active_asset_idx
  on asset_tags (asset_id) where unbound_at is null;

create unique index if not exists asset_tags_active_tag_code_idx
  on asset_tags (tenant_id, tag_code) where unbound_at is null;

create index if not exists asset_tags_tenant_id_idx on asset_tags (tenant_id);

alter table asset_tags enable row level security;

-- No RLS policies are defined on any table above: this is deliberate.
-- Domain logic and tenant scoping live in Nitro (D-25), never in RLS.
-- With RLS enabled and zero policies, `anon` and `authenticated` have no
-- access at all; only the service-role key (which bypasses RLS entirely,
-- D-31) can reach these tables, and it never leaves the server.
