-- Accessory link (D-57; issue #151). Expand-only (D-30).
--
-- A row says "accessory_asset_type_id is offered alongside
-- principal_asset_type_id". The link is current-state Catalog
-- configuration: it is replaced as a set through the AssetType update,
-- which stamps asset_types.updated_by_operator_id on the Accessory
-- (FR-34), the same lighter attribution the rest of Catalog uses.
--
-- Composite (tenant_id, id) FKs keep both ends in one Tenant (FR-33),
-- relying on asset_types_tenant_id_id_key from 20261001090000.
create table if not exists asset_type_accessories (
  tenant_id uuid not null,
  principal_asset_type_id integer not null,
  accessory_asset_type_id integer not null,
  primary key (principal_asset_type_id, accessory_asset_type_id),
  foreign key (tenant_id, principal_asset_type_id) references asset_types (tenant_id, id) on delete restrict,
  foreign key (tenant_id, accessory_asset_type_id) references asset_types (tenant_id, id) on delete restrict,
  constraint asset_type_accessories_not_self check (principal_asset_type_id <> accessory_asset_type_id)
);

create index if not exists asset_type_accessories_accessory_idx
  on asset_type_accessories (tenant_id, accessory_asset_type_id);

alter table asset_type_accessories enable row level security;
