-- Backfills the Operator attribution foreign keys that
-- 20260724100000_operator_identity.sql deliberately deferred (D-22, D-30,
-- FR-34). That migration's TODO said: add the FK once the two real
-- Operator seats exist everywhere tests run, not before.
--
-- Discovered during Milestone 4 (Availability & Reservation) prep: the two
-- real seats now exist (Majsterko, Pokladník), and the live database
-- already carries these five FK constraints — applied directly against
-- the database, not through a committed migration file. This migration
-- formalises what is already live so the schema history in the repo
-- matches reality (D-30: migrations are files in the repo, reviewed in
-- the diff). It is written as `if not exists`-safe via a guard on
-- `pg_constraint` so it is idempotent whether the target environment
-- already has the constraint (this one, and the rehearsal project) or
-- not (a fresh environment created from the migration files alone).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'assets_registered_by_operator_id_fkey'
  ) then
    alter table assets
      add constraint assets_registered_by_operator_id_fkey
      foreign key (registered_by_operator_id) references auth.users (id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'assets_status_changed_by_operator_id_fkey'
  ) then
    alter table assets
      add constraint assets_status_changed_by_operator_id_fkey
      foreign key (status_changed_by_operator_id) references auth.users (id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'asset_status_events_operator_id_fkey'
  ) then
    alter table asset_status_events
      add constraint asset_status_events_operator_id_fkey
      foreign key (operator_id) references auth.users (id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'asset_tags_bound_by_operator_id_fkey'
  ) then
    alter table asset_tags
      add constraint asset_tags_bound_by_operator_id_fkey
      foreign key (bound_by_operator_id) references auth.users (id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'asset_tags_unbound_by_operator_id_fkey'
  ) then
    alter table asset_tags
      add constraint asset_tags_unbound_by_operator_id_fkey
      foreign key (unbound_by_operator_id) references auth.users (id);
  end if;
end $$;
