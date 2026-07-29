-- IdentityVerification (D-15, FR-14, FR-15, W3; issue #30). Governs the
-- counter-side act: an Operator compares IdentityEvidence to the human
-- in front of them and records the outcome. Deliberately a separate
-- table from `identity_evidence` (D-15's "two acts, two names" — the
-- evidence is submitted online after payment, the verification happens
-- later, at the counter).
--
-- No `Reserved`-style mutable status column: this is an append-only
-- attestation (D-10) — a Customer who is rejected once and re-verified
-- later (e.g. brought a second document) gets a second row, not an
-- updated one. FR-14's "successful IdentityVerification" query
-- (hasSuccessfulIdentityVerification) reads across all rows for a
-- Customer, never assumes exactly one exists.
create type identity_verification_outcome as enum ('verified', 'rejected');

create table if not exists identity_verifications (
  id integer generated always as identity primary key,
  tenant_id uuid not null references tenants (id),
  customer_id integer not null references customers (id),
  identity_evidence_id integer not null references identity_evidence (id),
  operator_id uuid not null references auth.users (id),
  outcome identity_verification_outcome not null,
  reason text,
  occurred_at timestamptz not null default now(),
  -- FR-15: "a rejected IdentityVerification records a reason." A
  -- 'verified' outcome carries no reason — there is nothing to explain.
  constraint identity_verifications_rejection_reason_check
    check ((outcome = 'rejected') = (reason is not null))
);

create index if not exists identity_verifications_tenant_id_idx on identity_verifications (tenant_id);
create index if not exists identity_verifications_customer_id_idx on identity_verifications (customer_id);

alter table identity_verifications enable row level security;

-- No RLS policies, matching every other table in this schema: domain
-- logic and tenant scoping live in Nitro (D-25), not RLS. Only the
-- service-role key (bypasses RLS, D-31) reaches this table.
