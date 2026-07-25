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

-- No RLS policies on `operators`, same reasoning as every other table in
-- this schema: domain logic and tenant scoping live in Nitro (D-25), not
-- in RLS. Only the service-role key (bypasses RLS, D-31) reaches this
-- table, and it never leaves the server.
--
-- NOT done here, deliberately: backfilling the FK the Asset Registry
-- migration's own TODO promised on registered_by_operator_id,
-- status_changed_by_operator_id, operator_id and bound/unbound_by_
-- operator_id. The two real Operator seats (owner + employee) do not
-- exist yet in any environment, including the rehearsal database
-- integration tests run against — adding that FK now would make every
-- existing Asset Registry integration test's fabricated operatorId
-- fixture (crypto.randomUUID()) fail with a foreign-key violation the
-- moment someone points NUXT_DATABASE_URL at a real Postgres. Add that
-- FK in its own follow-up migration once the two seats reliably exist
-- everywhere tests run, not before.
