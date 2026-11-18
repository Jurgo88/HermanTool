-- AI tool recommendation on S-01 (D-64; issue #214). Expand-only.
--
-- Three records, all Tenant-scoped (FR-33), none linked to a Customer:
--
-- 1. tool_recommendation_questions — the deliberate, bounded exception to
--    Part 2's "a Visitor leaves no record": the question text with e-mail
--    addresses and phone numbers stripped before insert, the recommended
--    AssetType ids and the time. No IP, no visitor key, no Customer. Kept
--    90 days on the Tenant's legitimate interest, purged by a scheduled job
--    recorded in the job-run ledger (D-41, FR-40).
-- 2. tool_recommendation_usage — one row per provider call: tokens and the
--    cost the provider bills, with its currency (D-21). No personal data.
-- 3. tool_recommendation_visitor_calls + _visitor_secrets — the per-visitor
--    limits. The key is an HMAC of the IP under a secret that rotates every
--    UTC day; secrets and calls are discarded after 24 hours. No raw IP is
--    stored anywhere.
create table if not exists tool_recommendation_questions (
  id integer generated always as identity primary key,
  tenant_id uuid not null references tenants (id),
  question_text text not null,
  recommended_asset_type_ids integer[] not null default '{}',
  recorded_at timestamptz not null default now(),
  constraint tool_recommendation_questions_length check (char_length(question_text) between 1 and 500)
);

create index if not exists tool_recommendation_questions_tenant_recorded_idx
  on tool_recommendation_questions (tenant_id, recorded_at desc);

alter table tool_recommendation_questions enable row level security;

create table if not exists tool_recommendation_usage (
  id integer generated always as identity primary key,
  tenant_id uuid not null references tenants (id),
  model text not null,
  input_tokens integer not null check (input_tokens >= 0),
  output_tokens integer not null check (output_tokens >= 0),
  cache_creation_input_tokens integer not null default 0 check (cache_creation_input_tokens >= 0),
  cache_read_input_tokens integer not null default 0 check (cache_read_input_tokens >= 0),
  -- Millionths of the currency unit: one call costs a fraction of a cent.
  cost_micro_units bigint not null check (cost_micro_units >= 0),
  cost_currency text not null check (cost_currency in ('USD')),
  recorded_at timestamptz not null default now()
);

create index if not exists tool_recommendation_usage_tenant_recorded_idx
  on tool_recommendation_usage (tenant_id, recorded_at);

alter table tool_recommendation_usage enable row level security;

create table if not exists tool_recommendation_visitor_secrets (
  tenant_id uuid not null references tenants (id),
  utc_day date not null,
  secret text not null,
  primary key (tenant_id, utc_day)
);

alter table tool_recommendation_visitor_secrets enable row level security;

create table if not exists tool_recommendation_visitor_calls (
  id integer generated always as identity primary key,
  tenant_id uuid not null references tenants (id),
  visitor_key text not null,
  called_at timestamptz not null default now()
);

create index if not exists tool_recommendation_visitor_calls_key_idx
  on tool_recommendation_visitor_calls (tenant_id, visitor_key, called_at);

alter table tool_recommendation_visitor_calls enable row level security;

-- The monthly cap (D-64): NULL means the owner's default of 10 € applies.
alter table tenant_settings add column if not exists recommendation_monthly_cap_cents integer;
alter table tenant_settings add column if not exists recommendation_cap_currency text not null default 'EUR';
alter table tenant_settings drop constraint if exists tenant_settings_recommendation_cap_range;
alter table tenant_settings add constraint tenant_settings_recommendation_cap_range
  check (recommendation_monthly_cap_cents is null or recommendation_monthly_cap_cents between 0 and 100000);

-- Widens D-41's job_runs ledger for the 90-day / 24-hour purge.
alter table job_runs drop constraint job_runs_job_name_check;
alter table job_runs add constraint job_runs_job_name_check check (
  job_name in (
    'expiry_sweep',
    'evidence_erasure',
    'pickup_reminder_dispatch',
    'return_reminder_dispatch',
    'overdue_reminder_dispatch',
    'database_backup',
    'unconfirmed_identity_evidence_sweep',
    'unconfirmed_condition_report_sweep',
    'tool_recommendation_purge'
  )
);
