-- HandoverIn & Settlement (D-09, FR-19, FR-20, FR-21, FR-23, W5, W8;
-- issue #24). Expand only (D-30) — adds columns to the existing
-- `rental_agreements` table and one new table, `deposit_returned`.
--
-- `rental_agreements.settlement_completed_at` is the SettlementCompleted
-- "event" (FR-23) — a timestamp, not a dispatched message, since there is
-- no second consumer yet (D-19; #32's retention re-anchoring will read
-- this field directly once it exists).
--
-- `rental_agreements.returned_to_pool_at` is deliberately a SEPARATE
-- timestamp from settlement_completed_at — D-09 requires the Asset to
-- stay out of the pool until the day after its RentalPeriod's final day,
-- which can be later than the (possibly same-day) moment Settlement
-- completes. Two facts, two clocks, same discipline P1 already applies
-- to Reservation vs Possession.
alter table rental_agreements
  add column settlement_completed_at timestamptz,
  add column returned_to_pool_at timestamptz;

-- returned_to_pool_at can only be set once settlement has completed —
-- D-09's rule is about WHEN the Asset may rejoin the pool, and it
-- presupposes Settlement already happened.
alter table rental_agreements
  add constraint rental_agreements_pool_return_requires_settlement_check
  check (returned_to_pool_at is null or settlement_completed_at is not null);

-- D-07/FR-21/W8: the counterpart attestation to `deposit_taken`. No
-- Payments involvement anywhere in this table.
create table if not exists deposit_returned (
  id integer generated always as identity primary key,
  tenant_id uuid not null references tenants (id),
  rental_agreement_id integer not null references rental_agreements (id),
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'EUR',
  deduction_reason text,
  operator_id uuid not null references auth.users (id),
  returned_at timestamptz not null default now(),
  -- One settlement per RentalAgreement — DepositReturned is recorded
  -- once, at Settlement, never appended-to (unlike ConditionReport/
  -- IdentityVerification's append-only correction model, D-10): there is
  -- no "correct the deposit return" concept in this milestone, only
  -- FR-24's general attestation-correction mechanism (#25, not built).
  constraint deposit_returned_rental_agreement_id_unique unique (rental_agreement_id)
);

create index if not exists deposit_returned_tenant_id_idx on deposit_returned (tenant_id);

alter table deposit_returned enable row level security;

-- No RLS policies, matching every other table in this schema: domain
-- logic and tenant scoping live in Nitro (D-25), not RLS. Only the
-- service-role key (bypasses RLS, D-31) reaches this table.
