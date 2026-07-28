-- Terms acceptance mechanics on ReservationGroup (D-35, F1 KNOWN GAP,
-- Part 5 Finding 1). Governs: FR-09, FR-10.
--
-- This is deliberately the mechanical scaffold only, not the workflow:
-- no legal counsel has reviewed the actual terms content or the
-- pre-contractual information catalogue yet (F1, CLAUDE.md), and the
-- withdrawal-right section specifically depends on OQ #1 (cancellation
-- policy), which remains unresolved. This migration adds nowhere for
-- that content to live — `terms_version` is an opaque, versioned
-- identifier referencing wherever the terms document actually lives
-- (a future content/frontend concern), never the terms text itself.
-- The domain only needs to know THAT a specific version was accepted
-- and WHEN, not what it said.
--
-- Both columns nullable: a ReservationGroup exists from checkout
-- (Milestone 4, before this migration) and terms acceptance is a
-- separate, later step, before payment (D-35, FR-09) — there is no
-- Payments/checkout flow yet (Milestone 5) to record it from.
alter table reservation_groups
  add column terms_version text,
  add column terms_accepted_at timestamptz;

-- Paired presence: a version with no timestamp is meaningless (accepted
-- when?) and a timestamp with no version is meaningless (accepted what
-- exactly, in a dispute) (P1: a correction/audit trail must be provable).
alter table reservation_groups
  add constraint reservation_groups_terms_acceptance_paired_check
  check ((terms_version is null) = (terms_accepted_at is null));
