-- Attestation correction & append-only history (D-10, FR-24, W4, W5,
-- Part 5 Finding 9; issue #25). Expand only (D-30) — every attestation
-- gains a `recorded_at` companion to its existing occurred-at column
-- (already named `handover_out_at`/`handover_in_at`/`captured_at`/
-- `taken_at`/`returned_at` from earlier migrations), and
-- `rental_agreements` gains two backdate-reason columns.
--
-- No new "corrections" table: Finding 9's two named repairs — backdated
-- HandoverOut and backdated HandoverIn — are not edits to an existing
-- fact, they are the FIRST and only time that fact is recorded, just
-- with an occurred-at value in the past (the "Operator forgot to scan"
-- case). RentalAgreement rows are only ever inserted once and
-- handover_in_at is guarded to be set only once (see
-- server/contexts/handover-possession/repository.ts's setHandoverInAt) —
-- append-only is already structural here, not a mechanism this
-- migration needs to add.
--
-- `*_backdate_reason` is NOT gated by a check constraint pairing it to
-- "occurred_at differs from recorded_at": exact timestamp inequality is
-- a fragile thing to assert in SQL (clock precision, driver rounding),
-- and the actual rule — FR-24's "a reason is required whenever this is
-- a correction" — is already enforced at the domain layer
-- (BackdateReasonRequiredError in handover-out.ts/handover-in.ts) before
-- either timestamp is ever computed.
alter table rental_agreements
  add column handover_out_recorded_at timestamptz,
  add column handover_out_backdate_reason text,
  add column handover_in_recorded_at timestamptz,
  add column handover_in_backdate_reason text;

update rental_agreements set handover_out_recorded_at = handover_out_at where handover_out_recorded_at is null;
update rental_agreements
  set handover_in_recorded_at = handover_in_at
  where handover_in_at is not null and handover_in_recorded_at is null;

alter table rental_agreements
  alter column handover_out_recorded_at set not null;

alter table condition_reports
  add column recorded_at timestamptz;
update condition_reports set recorded_at = captured_at where recorded_at is null;
alter table condition_reports alter column recorded_at set not null;

alter table deposit_taken
  add column recorded_at timestamptz;
update deposit_taken set recorded_at = taken_at where recorded_at is null;
alter table deposit_taken alter column recorded_at set not null;

alter table deposit_returned
  add column recorded_at timestamptz;
update deposit_returned set recorded_at = returned_at where recorded_at is null;
alter table deposit_returned alter column recorded_at set not null;
