-- Job-run ledger (D-41, Part 4 §16.2; issue #74/IR-06). Every internal
-- scheduled endpoint writes a row here — job name, started-at,
-- finished-at, outcome, processed count — so the owner has one place to
-- see when each job last ran, and whether it succeeded. This closes
-- FR-40 (Must, the retention erasure job specifically) and most of
-- FR-44 (Should, a status page beyond FR-40) in one table rather than a
-- bespoke marker for the erasure job alone: a reminder dispatcher that
-- stops running is silent in exactly the same way.
--
-- An operations record, not a domain event (D-41): not in Part 2's
-- event catalogue, nothing reacts to it, no context owns it — it is
-- platform housekeeping, written from server/utils/job-run-ledger.ts,
-- the same "lives outside any single bounded context" home
-- server/utils/overdue-noshow-views.ts already uses for a
-- composition-root concern that isn't one context's either.
--
-- `job_name` is a closed list, matching every internal scheduled
-- endpoint that exists today plus 'database_backup' (D-32, IR-04 — not
-- built yet) — pre-added so that landing IR-04 later does not need a
-- second migration to widen this constraint, mirroring
-- notification_dispatches' own `kind` column.
create table if not exists job_runs (
  id integer generated always as identity primary key,
  tenant_id uuid not null references tenants (id),
  job_name text not null check (
    job_name in (
      'expiry_sweep',
      'evidence_erasure',
      'pickup_reminder_dispatch',
      'return_reminder_dispatch',
      'overdue_reminder_dispatch',
      'database_backup'
    )
  ),
  started_at timestamptz not null,
  finished_at timestamptz not null,
  outcome text not null check (outcome in ('success', 'failure')),
  processed_count integer not null,
  error_message text,
  constraint job_runs_finished_not_before_started check (finished_at >= started_at)
);

-- FR-40/FR-44's read: "the latest row for this job", and among those,
-- "the latest one that succeeded" — both are an ORDER BY on
-- (tenant_id, job_name, started_at desc), so one index serves both.
create index if not exists job_runs_tenant_job_started_idx on job_runs (tenant_id, job_name, started_at desc);

alter table job_runs enable row level security;

-- No RLS policies, matching every other table in this schema: domain
-- logic and tenant scoping live in Nitro (D-25), not RLS. Only the
-- service-role key (bypasses RLS, D-31) reaches this table.
