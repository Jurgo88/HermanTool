-- Evidence confirmation (D-40, Part 4 §16.2; issue #78/IR-10). A
-- photograph row is created unconfirmed (presigned URLs are generated,
-- object keys committed) and counts as evidence only once a HEAD
-- against the bucket confirms the object actually exists. Expand only
-- (D-30): a nullable column on each table, null means unconfirmed.
--
-- identity_evidence.confirmed_at: set by confirmIdentityEvidenceUpload
-- (server/contexts/customer-identity-compliance/identity-evidence.ts).
--
-- condition_reports.confirmed_at: set by confirmConditionReportUpload
-- (server/contexts/handover-possession/condition-report-confirmation.ts)
-- once EVERY key in photo_object_keys is confirmed present — a report
-- claims "these N photographs exist"; if even one does not, the claim
-- is false and FR-20 must not count it.
alter table identity_evidence add column confirmed_at timestamptz;
alter table condition_reports add column confirmed_at timestamptz;

-- Both sweeps (see job_runs_job_name_check below) scan for unconfirmed
-- rows older than the presigned URL lifetime.
create index if not exists identity_evidence_unconfirmed_idx
  on identity_evidence (created_at)
  where confirmed_at is null;

create index if not exists condition_reports_unconfirmed_idx
  on condition_reports (recorded_at)
  where confirmed_at is null;

-- Widens D-41's job_runs ledger for the two new sweeps this issue adds.
-- Expand only: drop and recreate the check constraint with the same
-- values plus two more, never narrowing an existing row's validity.
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
    'unconfirmed_condition_report_sweep'
  )
);
