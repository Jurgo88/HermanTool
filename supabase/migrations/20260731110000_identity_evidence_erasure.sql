-- Retention & scheduled erasure (D-11, D-36, FR-12, FR-16, W10; issue
-- #32). Expand only (D-30): one nullable column on identity_evidence.
--
-- The row itself is never deleted (P4, append-only) — FR-16 requires
-- "the erasure is recorded", and `object_key` stays in place as a
-- historical pointer to an object no longer in R2 once `erased_at` is
-- set (see server/contexts/customer-identity-compliance/identity-evidence.ts's
-- generateIdentityEvidenceReadUrl, which refuses once this is set rather
-- than minting a dead presigned URL).
alter table identity_evidence
  add column erased_at timestamptz;

create index if not exists identity_evidence_retention_deadline_idx
  on identity_evidence (retention_deadline)
  where erased_at is null;
