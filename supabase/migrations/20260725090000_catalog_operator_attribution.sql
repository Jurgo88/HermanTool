-- Catalog admin surface attribution (FR-34, D-16, D-22, issue #10).
-- FR-34: every Operator action records which Operator performed it, with
-- no fallback to "an Operator". The Catalog core migration shipped
-- asset_types with no attribution columns because at that point there
-- was no way to know which Operator acted (D-22 hadn't shipped). Now
-- that operators exist, the admin surface (FR-37) records who created
-- and who last touched each AssetType.
--
-- Nullable, not backfilled with an invented value: existing rows (if
-- any exist before the two real Operator seats are provisioned) get
-- NULL rather than a fabricated attribution. The domain layer
-- (createAssetType, updateAssetType, publishAssetType,
-- unpublishAssetType) requires a real operatorId on every write that
-- goes through the admin surface — the nullable column is migration
-- safety, not a domain allowance, same pattern as the name column in
-- the Catalog core migration.
--
-- This is a "current state" attribution (who created it, who last
-- changed it), not an append-only event history like
-- asset_status_events. Catalog pricing edits are business decisions,
-- not attestations about physical reality or evidence in a dispute
-- (P4) — Asset Registry's full history is proportionate to what it
-- protects; a lighter record is proportionate here.
--
-- No FK to auth.users yet, deliberately (same reasoning as the D-22
-- migration's own deferred backfill on Asset Registry's attribution
-- columns): the two real Operator seats don't exist in any environment
-- yet, including the rehearsal database integration tests run against.
-- Add the FK once they do, not before — otherwise every test that uses
-- a fabricated operatorId fixture fails against a real Postgres.
alter table asset_types
  add column created_by_operator_id uuid,
  add column updated_by_operator_id uuid,
  add column updated_at timestamptz not null default now();
