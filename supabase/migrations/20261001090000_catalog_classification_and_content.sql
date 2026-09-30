-- Catalog classification and presentation content (D-54, D-55, D-56;
-- issue #150). Expand-only (D-30): two new tables, one link table, and
-- nullable/defaulted columns on asset_types.
--
-- Tenant consistency is enforced by the schema, not only by the query
-- predicate (FR-33): every link below is a composite (tenant_id, id)
-- foreign key, so an AssetType in one Tenant cannot reference a
-- PowerSource or UseArea of another. Postgres needs a (tenant_id, id)
-- unique constraint on each referenced table to allow that.
--
-- Removal is a soft delete (removed_at + removed_by_operator_id):
-- FR-34 requires the removing Operator to be recorded, and a deleted row
-- records nothing. The label is unique among entries that are not
-- removed, so a removed label can be reused.
--
-- Attribution columns follow 20260725090000_catalog_operator_attribution:
-- plain uuid, no FK to auth.users yet.

alter table asset_types
  add constraint asset_types_tenant_id_id_key unique (tenant_id, id);

create table if not exists power_sources (
  id integer generated always as identity primary key,
  tenant_id uuid not null references tenants (id),
  label text not null,
  position integer not null,
  created_by_operator_id uuid not null,
  updated_by_operator_id uuid not null,
  updated_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by_operator_id uuid,
  constraint power_sources_tenant_id_id_key unique (tenant_id, id),
  constraint power_sources_removal_attributed check ((removed_at is null) = (removed_by_operator_id is null))
);

create unique index if not exists power_sources_active_label_idx
  on power_sources (tenant_id, label) where removed_at is null;

alter table power_sources enable row level security;

create table if not exists use_areas (
  id integer generated always as identity primary key,
  tenant_id uuid not null references tenants (id),
  label text not null,
  position integer not null,
  created_by_operator_id uuid not null,
  updated_by_operator_id uuid not null,
  updated_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by_operator_id uuid,
  constraint use_areas_tenant_id_id_key unique (tenant_id, id),
  constraint use_areas_removal_attributed check ((removed_at is null) = (removed_by_operator_id is null))
);

create unique index if not exists use_areas_active_label_idx
  on use_areas (tenant_id, label) where removed_at is null;

alter table use_areas enable row level security;

create table if not exists asset_type_use_areas (
  tenant_id uuid not null,
  asset_type_id integer not null,
  use_area_id integer not null,
  primary key (asset_type_id, use_area_id),
  foreign key (tenant_id, asset_type_id) references asset_types (tenant_id, id) on delete restrict,
  foreign key (tenant_id, use_area_id) references use_areas (tenant_id, id) on delete restrict
);

create index if not exists asset_type_use_areas_use_area_idx on asset_type_use_areas (tenant_id, use_area_id);

alter table asset_type_use_areas enable row level security;

-- D-55: `specifications` is an ordered array of {label, value}; the
-- check keeps it an array, element shape is validated in the domain.
-- D-56: `image_file` names a file shipped under public/catalog/; null
-- means no photograph.
alter table asset_types
  add column power_source_id integer,
  add column specifications jsonb not null default '[]'::jsonb,
  add column included_contents text not null default '',
  add column handling_notice text not null default '',
  add column image_file text,
  add constraint asset_types_specifications_is_array check (jsonb_typeof(specifications) = 'array'),
  add constraint asset_types_power_source_fk
    foreign key (tenant_id, power_source_id) references power_sources (tenant_id, id) on delete restrict;
