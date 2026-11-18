-- Correcting a Delivery fee attestation (D-66, D-65 pattern; issue #237).
-- Expand-only (D-30). Append-only (D-10, P1): a correction is a new row
-- that names the row it supersedes and says why, never an update — the
-- same shape as on_site_payments.

alter table delivery_fee_payments
  add column if not exists supersedes_id integer references delivery_fee_payments (id),
  add column if not exists correction_reason text;

do $$
begin
  -- A row is superseded at most once, so the attestation in force is unique.
  if not exists (select 1 from pg_constraint where conname = 'delivery_fee_payments_supersedes_once') then
    alter table delivery_fee_payments
      add constraint delivery_fee_payments_supersedes_once unique (supersedes_id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'delivery_fee_payments_correction_reasoned') then
    alter table delivery_fee_payments
      add constraint delivery_fee_payments_correction_reasoned
      check ((supersedes_id is null) = (correction_reason is null));
  end if;
end $$;

-- One original attestation per leg: two concurrent first attestations
-- cannot both land (the domain's check-then-insert alone would let them).
create unique index if not exists delivery_fee_payments_one_original_idx
  on delivery_fee_payments (tenant_id, delivery_id) where supersedes_id is null;
