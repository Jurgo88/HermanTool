-- Catalog context: extends the asset_types stub with the fields Catalog
-- owns (D-03). Governs: FR-01, FR-35, D-20, D-21, D-30.
--
-- The Asset Registry migration created asset_types minimally (id,
-- tenant_id, created_at) purely so assets.asset_type_id had a real FK
-- from day one. This migration does not recreate that table — it ALTERs
-- it (expand, D-30), adding the columns Catalog actually owns: name,
-- description, day rate, deposit amount, and publication state.
--
-- All six new columns get a default, so this ALTER is safe regardless of
-- whether any asset_types rows already exist: existing rows backfill to
-- an unpublished, unpriced, unnamed AssetType rather than erroring.
-- Requiring a non-empty name/rate/deposit is a domain-layer rule
-- (Catalog's createAssetType), not a migration-time constraint — the
-- default exists for migration safety, not as a valid end state.
alter table asset_types
  add column name text not null default '',
  add column description text not null default '',
  add column day_rate_amount integer not null default 0,
  add column day_rate_currency text not null default 'EUR',
  add column deposit_amount integer not null default 0,
  add column deposit_currency text not null default 'EUR',
  add column published boolean not null default false;

-- D-21: currency is an invariant on the amount, not a convention. EUR is
-- the only value in the pilot; loosening this to allow a second currency
-- is itself an expand (drop and recreate the constraint with the wider
-- list), never a destructive change.
alter table asset_types
  add constraint asset_types_currency_check
  check (day_rate_currency = 'EUR' and deposit_currency = 'EUR');

-- name/description are single-valued Slovak content (D-20): no per-locale
-- modelling, and deliberately not named name_sk — a language-suffixed
-- column is the specific thing D-20 rules out. Translation is deferred to
-- the trigger named in D-20 (the first Tenant or market needing a second
-- locale), not built here.
