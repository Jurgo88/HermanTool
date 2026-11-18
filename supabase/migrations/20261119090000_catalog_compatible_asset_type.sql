-- CompatibleAssetType link (D-62; issue #210). Expand-only (D-30).
--
-- One row per unordered pair of AssetTypes that suit each other — both
-- rentable on their own, a suggestion on S-02 and never a checkout rule
-- (contrast D-57's asset_type_accessories). The link is symmetric, so a
-- pair is stored once in canonical order (lower id first) and read from
-- either side.
--
-- Composite (tenant_id, id) FKs keep both ends in one Tenant (FR-33),
-- relying on asset_types_tenant_id_id_key from 20261001090000. The
-- Operator who created the link is recorded (FR-34); removing a link
-- deletes its row, and the AssetType update that replaced the set stamps
-- asset_types.updated_by_operator_id, the same lighter attribution the
-- rest of Catalog uses.
create table if not exists asset_type_compatibilities (
  tenant_id uuid not null,
  asset_type_a_id integer not null,
  asset_type_b_id integer not null,
  -- No FK to operators, matching power_sources/use_areas (see the
  -- operator-identity migration's note on test fixtures).
  created_by_operator_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, asset_type_a_id, asset_type_b_id),
  foreign key (tenant_id, asset_type_a_id) references asset_types (tenant_id, id) on delete restrict,
  foreign key (tenant_id, asset_type_b_id) references asset_types (tenant_id, id) on delete restrict,
  -- Canonical order: rules out a self-link and the reversed duplicate.
  constraint asset_type_compatibilities_canonical check (asset_type_a_id < asset_type_b_id)
);

create index if not exists asset_type_compatibilities_b_idx
  on asset_type_compatibilities (tenant_id, asset_type_b_id);

alter table asset_type_compatibilities enable row level security;
