-- The Customer's self-service surface (D-23, FR-39; issue #31). One
-- table: `customer_access_links` — a tokenised, expiring, single-purpose
-- link, issued once per Customer at ReservationConfirmed
-- (server/api/webhooks/stripe.post.ts) and revoked once at HandoverOut
-- (server/contexts/handover-possession/handover-out.ts).
--
-- `token_hash` stores a SHA-256 digest of the raw bearer token, never
-- the token itself — the same "don't persist the credential in
-- plaintext" discipline as operator_pin's pin_hash, even though this
-- token can never read IdentityEvidence back (NFR-06), only submit it.
-- No unique index on customer_id: revocation clears every row for a
-- Customer, but nothing here assumes at most one was ever issued.
create table if not exists customer_access_links (
  id integer generated always as identity primary key,
  tenant_id uuid not null references tenants (id),
  customer_id integer not null references customers (id),
  token_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint customer_access_links_token_hash_unique unique (token_hash)
);

create index if not exists customer_access_links_tenant_id_idx on customer_access_links (tenant_id);
create index if not exists customer_access_links_customer_id_idx on customer_access_links (customer_id);

alter table customer_access_links enable row level security;

-- No RLS policies, matching every other table in this schema: domain
-- logic and tenant scoping live in Nitro (D-25), not RLS. Only the
-- service-role key (bypasses RLS, D-31) reaches this table.
