-- Handover & Possession context foundation, ScanEvent resolution only
-- (P3, FR-17, FR-45; issue #22). Governs the primary counter interaction:
-- a scan is recorded as an intent, and the domain resolves its meaning
-- from the Asset's current state — no caller declares the transition.
--
-- Deliberately the ONLY table this migration adds. RentalAgreement,
-- Possession, DepositObligation and ConditionReport (D-05, D-07) belong
-- to later issues (#23, #24) that react to a resolved HandoverOut/
-- HandoverIn — this migration does not anticipate them.
--
-- `operator_id` is FK'd directly to `auth.users(id)` from the start
-- (unlike the Asset Registry foundation migration's deferred FK): the two
-- real Operator seats already exist everywhere tests run as of
-- 20260728100000_asset_registry_operator_fk_backfill.sql.
create table if not exists scan_events (
  id integer generated always as identity primary key,
  tenant_id uuid not null references tenants (id),
  asset_id integer not null references assets (id),
  operator_id uuid not null references auth.users (id),
  occurred_at timestamptz not null default now()
);

create index if not exists scan_events_tenant_id_idx on scan_events (tenant_id);
create index if not exists scan_events_asset_id_idx on scan_events (asset_id);

alter table scan_events enable row level security;

-- No RLS policies, matching every other table in this schema: domain
-- logic and tenant scoping live in Nitro (D-25), not RLS. Only the
-- service-role key (bypasses RLS, D-31) reaches this table.
