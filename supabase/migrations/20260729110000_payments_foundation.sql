-- Payments context foundation [MVP · generic]. Governs: D-07, D-26, D-37,
-- FR-09, FR-10, NFR-05, P6.
--
-- One table: `payments`. Payments owns the online rental-fee charge and
-- its refunds only (D-07) — it never models the DepositObligation, which
-- is cash recorded by Handover & Possession, not a transaction this
-- context executes. Amounts are minor-unit integers with an explicit
-- currency (D-21), matching every other MonetaryAmount column in this
-- schema.
--
-- `provider_reference` / `provider_payment_reference` hold the payment
-- provider's own identifiers (currently Stripe's Checkout Session id and
-- PaymentIntent id) as opaque strings. Storing them here is a storage
-- detail, not a boundary violation: the anti-corruption layer (NFR-05,
-- P6) is about the domain TYPES this context exposes through its
-- published interface, not about what a repository column is allowed to
-- persist. No other context ever reads this table.
--
-- FR-09: "One card payment covers exactly one ReservationGroup. Partial
-- payment is not representable." The partial unique index below is the
-- enforcement — at most one 'succeeded' Payment can ever exist per
-- ReservationGroup, guarding against a duplicated webhook delivery or a
-- second checkout attempt both landing as paid.
create table if not exists payments (
  id integer generated always as identity primary key,
  tenant_id uuid not null references tenants (id),
  reservation_group_id integer not null references reservation_groups (id),
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'EUR',
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'refunded', 'failed')),
  provider_reference text not null,
  provider_payment_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_provider_reference_unique unique (provider_reference)
);

create index if not exists payments_tenant_id_idx on payments (tenant_id);
create index if not exists payments_reservation_group_id_idx on payments (reservation_group_id);

create unique index if not exists payments_one_succeeded_per_group_idx
  on payments (reservation_group_id)
  where status = 'succeeded';

alter table payments enable row level security;

-- No RLS policies, matching every other table in this schema: domain
-- logic and tenant scoping live in Nitro (D-25), not RLS. Only the
-- service-role key (bypasses RLS, D-31) reaches this table.
