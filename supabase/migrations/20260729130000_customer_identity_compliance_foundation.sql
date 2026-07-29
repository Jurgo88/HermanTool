-- Customer Identity & Compliance context foundation, Customer creation
-- and IdentityEvidence submission only (D-06, D-14, D-27, NFR-06, FR-11;
-- issue #29). IdentityVerification (#30), the tokenised self-service link
-- (#31), and the scheduled retention/erasure job (#32) are NOT built
-- here — this migration lays down only what those issues react to.
--
-- Three tables:
--
--   * `customers` (D-14) — a Customer record is created per
--     ReservationGroup and never deduplicated across a repeat visitor;
--     the unique index enforces "per ReservationGroup", not "per
--     person". No account, no password (D-14) — this is contact
--     information only.
--
--   * `identity_evidence` (D-06, D-27) — deliberately its own table,
--     separate from `customers`, because it has a different legal
--     lifecycle: the photograph is erasable on a schedule (P7, D-11)
--     while the Customer/rental/accounting record is not. `object_key`
--     points into the R2 `evidence` bucket (D-27) and is never a public
--     URL. `retention_deadline` is NOT NULL — FR-12/P7 make an
--     IdentityEvidence row without a deadline unrepresentable, not
--     merely disallowed. The application layer (see
--     server/contexts/customer-identity-compliance/identity-evidence.ts)
--     refuses to compute a real deadline until OQ #2 (the actual window
--     value + legal basis) is answered — this is a structural guard, not
--     a placeholder value, per CLAUDE.md's "do NOT invent defaults" for
--     launch-blocking Open Questions.
--
--   * `identity_evidence_access_events` (NFR-06) — "every access to
--     evidence is itself an attributed act." Append-only; nothing here
--     is ever updated or deleted (P4).
create table if not exists customers (
  id integer generated always as identity primary key,
  tenant_id uuid not null references tenants (id),
  reservation_group_id integer not null references reservation_groups (id),
  name text not null,
  email text not null,
  phone text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists customers_reservation_group_id_idx
  on customers (reservation_group_id);
create index if not exists customers_tenant_id_idx on customers (tenant_id);

alter table customers enable row level security;

create table if not exists identity_evidence (
  id integer generated always as identity primary key,
  tenant_id uuid not null references tenants (id),
  customer_id integer not null references customers (id),
  object_key text not null,
  retention_deadline timestamptz not null,
  created_at timestamptz not null default now(),
  constraint identity_evidence_object_key_unique unique (object_key)
);

create index if not exists identity_evidence_tenant_id_idx on identity_evidence (tenant_id);
create index if not exists identity_evidence_customer_id_idx on identity_evidence (customer_id);

alter table identity_evidence enable row level security;

create table if not exists identity_evidence_access_events (
  id integer generated always as identity primary key,
  tenant_id uuid not null references tenants (id),
  identity_evidence_id integer not null references identity_evidence (id),
  operator_id uuid not null references auth.users (id),
  accessed_at timestamptz not null default now()
);

create index if not exists identity_evidence_access_events_evidence_id_idx
  on identity_evidence_access_events (identity_evidence_id);
create index if not exists identity_evidence_access_events_tenant_id_idx
  on identity_evidence_access_events (tenant_id);

alter table identity_evidence_access_events enable row level security;

-- No RLS policies on any table above, matching every other table in this
-- schema: domain logic and tenant scoping live in Nitro (D-25), not RLS.
-- Only the service-role key (bypasses RLS, D-31) reaches these tables.
