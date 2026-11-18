-- Marketing consent (issue #216; D-35 pattern, D-14, P7). Expand-only.
--
-- Append-only events per contact (the normalised e-mail the offers would
-- go to): a consent given at checkout with the version of the text shown,
-- or a withdrawal through the unsubscribe link. The contact's status is
-- derived from the events, never stored (a withdrawal wins over every
-- earlier consent; a later consent at a new checkout grants again).
--
-- Retention of these records and of the e-mail they cover is with the
-- lawyer, together with OQ #27 — no RetentionDeadline is invented here,
-- and the gap is recorded in the PR and the morning report (IR-07).
create table if not exists marketing_consent_events (
  id integer generated always as identity primary key,
  tenant_id uuid not null references tenants (id),
  email_normalised text not null,
  customer_id integer references customers (id),
  granted boolean not null,
  consent_text_version text,
  source text not null check (source in ('checkout', 'unsubscribe')),
  recorded_at timestamptz not null default now(),
  -- A consent always names the text it was given to (D-35 pattern).
  constraint marketing_consent_events_version_when_granted
    check (not granted or consent_text_version is not null)
);

create index if not exists marketing_consent_events_contact_idx
  on marketing_consent_events (tenant_id, email_normalised, id);

alter table marketing_consent_events enable row level security;

-- The tokenised, login-free unsubscribe link carried by every marketing
-- e-mail. Stored hashed; reusable (unsubscribing twice is harmless).
create table if not exists marketing_unsubscribe_tokens (
  id integer generated always as identity primary key,
  tenant_id uuid not null references tenants (id),
  email_normalised text not null,
  token_hash text not null,
  created_at timestamptz not null default now(),
  constraint marketing_unsubscribe_tokens_hash_unique unique (token_hash)
);

alter table marketing_unsubscribe_tokens enable row level security;
