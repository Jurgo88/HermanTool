-- LostAsset declaration (D-17, FR-31, FR-36, W6; issue #26). Expand only
-- (D-30): three nullable columns on rental_agreements, paralleling the
-- backdate-reason columns added in
-- 20260730120000_attestation_backdating.sql. No check constraint
-- pairing the three columns — FR-31's "always with a reason" and
-- FR-36's per-Operator attribution are enforced at the domain layer
-- (server/contexts/handover-possession/lost-asset.ts), same discipline
-- as *_backdate_reason.
--
-- No new status/event table: AssetDeclaredLost moves the Asset straight
-- to Retired through asset_registry's existing (already append-only)
-- asset_status_events history. These columns only record that THIS
-- context's own RentalAgreement ended via a LostAsset declaration
-- rather than an ordinary HandoverIn, so a declared-Lost Agreement stops
-- surfacing in the Overdue view (server/utils/overdue-noshow-views.ts).
alter table rental_agreements
  add column declared_lost_at timestamptz,
  add column declared_lost_reason text,
  add column declared_lost_operator_id uuid references auth.users (id);
