-- Notification core (D-28, FR-32, A-08; issue #35). One table:
-- `notification_dispatches` — "every dispatch is recorded" (FR-32), the
-- artefact pointed at when a Customer says they were never told, and the
-- append-only history D-17 substitutes for an escalation state machine.
--
-- `kind` is the closed, four-value list from
-- server/contexts/notification/types.ts's NotificationKind — this
-- migration only implements 'confirmation' and 'return_reminder' (#35);
-- 'pickup_reminder' and 'overdue_reminder' (#36) are allowed by the
-- check constraint now so that migration doesn't need to touch this
-- constraint later.
--
-- `reference_id` is a generic correlating id whose MEANING depends on
-- `kind` (confirmation: reservation_groups.id; return_reminder:
-- reservations.id) — deliberately not a foreign key to either table,
-- since no single column can reference two different tables. The unique
-- index on (tenant_id, kind, reference_id) is the at-most-once guard
-- against a retried webhook/cron run double-sending.
create table if not exists notification_dispatches (
  id integer generated always as identity primary key,
  tenant_id uuid not null references tenants (id),
  customer_id integer not null references customers (id),
  kind text not null check (kind in ('confirmation', 'pickup_reminder', 'return_reminder', 'overdue_reminder')),
  reference_id integer not null,
  to_address text not null,
  subject text not null,
  provider_message_id text not null,
  sent_at timestamptz not null default now(),
  constraint notification_dispatches_kind_reference_unique unique (tenant_id, kind, reference_id)
);

create index if not exists notification_dispatches_tenant_id_idx on notification_dispatches (tenant_id);
create index if not exists notification_dispatches_customer_id_idx on notification_dispatches (customer_id);

alter table notification_dispatches enable row level security;

-- No RLS policies, matching every other table in this schema: domain
-- logic and tenant scoping live in Nitro (D-25), not RLS. Only the
-- service-role key (bypasses RLS, D-31) reaches this table.
