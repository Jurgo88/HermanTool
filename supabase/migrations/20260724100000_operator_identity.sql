-- Operator identity foundation (D-01, D-22, FR-33, FR-34).
-- Reopens what issue #2 claimed to close but never actually shipped: no
-- Supabase Auth wiring existed in the codebase before this migration.
--
-- `operators` is not a bounded context (Tenant & Access is [Future]) — it
-- is scaffold-level infrastructure, exactly like `tenants`. Exactly two
-- rows, created by hand (owner + employee), no invite flow, no
-- self-service Operator management surface (D-22, issue #2 scope).
--
-- `id` is the Supabase Auth user id (auth.users.id), not a separately
-- generated identity — an Operator seat *is* an authenticated principal,
-- never a profile row disconnected from a real credential.
create table if not exists operators (
  id uuid primary key references auth.users (id),
  tenant_id uuid not null references tenants (id),
  display_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists operators_tenant_id_idx on operators (tenant_id);

alter table operators enable row level security;

-- Backfills the FK the Asset Registry migration deliberately left off,
-- per its own TODO: attribution columns were plain `uuid not null` with
-- no foreign key because D-22 hadn't shipped and there were no real
-- Operator seats to reference. Now there are (or will be, once the two
-- seats below are created by hand) — expand, D-30. Safe because the
-- pilot has no production Asset Registry data predating this migration.
alter table assets
  add constraint assets_registered_by_operator_id_fkey
    foreign key (registered_by_operator_id) references auth.users (id),
  add constraint assets_status_changed_by_operator_id_fkey
    foreign key (status_changed_by_operator_id) references auth.users (id);

alter table asset_status_events
  add constraint asset_status_events_operator_id_fkey
    foreign key (operator_id) references auth.users (id);

alter table asset_tags
  add constraint asset_tags_bound_by_operator_id_fkey
    foreign key (bound_by_operator_id) references auth.users (id),
  add constraint asset_tags_unbound_by_operator_id_fkey
    foreign key (unbound_by_operator_id) references auth.users (id);

-- No RLS policies on `operators`, same reasoning as every other table in
-- this schema: domain logic and tenant scoping live in Nitro (D-25), not
-- in RLS. Only the service-role key (bypasses RLS, D-31) reaches this
-- table, and it never leaves the server.
