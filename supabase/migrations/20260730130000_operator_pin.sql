-- Per-Operator PIN reconfirmation (D-22, FR-36, F8, Part 5 Finding 8;
-- issue #28). Expand only (D-30) — two nullable columns on the existing
-- `operators` table.
--
-- F8: D-22 chose individual Operator authentication assuming one device
-- per Operator; the pilot's reality is one shared counter phone, so a
-- session cookie alone no longer proves who is physically attesting a
-- critical action. `pin_hash`/`pin_salt` let server/utils/operator-pin.ts
-- resolve WHICH Operator is attesting, independent of whichever
-- Operator's session happens to be live on the shared phone.
--
-- Both columns nullable: an Operator who has not yet set a PIN simply
-- cannot be resolved by verifyOperatorPin (skipped, never a null-hash
-- match) — gated attesting actions refuse until a PIN exists, which is
-- the correct default (CLAUDE.md: "do not ship attesting actions
-- without a guard for this").
alter table operators
  add column pin_salt text,
  add column pin_hash text;

-- No RLS policy change: operators already has RLS enabled with zero
-- policies (D-25, D-31) — only the service-role key reaches this table,
-- same as everywhere else in this schema.
