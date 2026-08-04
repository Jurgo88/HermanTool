#!/usr/bin/env bash
#
# Creates the GitHub issues for the 04 August 2026 implementation review
# (docs/reviews/implementation-review-2026-08-04.md, findings IR-01…IR-13,
# reconciled in Part 4 §16.2 as D-38…D-41).
#
# Usage:
#   gh auth status                 # confirm you are logged in
#   ./scripts/create-review-issues.sh --dry-run
#   ./scripts/create-review-issues.sh
#
# Idempotent-ish: labels and milestones are created only if absent, and
# an issue whose exact title already exists is skipped rather than
# duplicated. Re-running after a partial failure is safe.

set -euo pipefail

DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

command -v gh >/dev/null || { echo "gh CLI not found."; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "gh is not authenticated. Run: gh auth login"; exit 1; }

REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
echo "Repository: $REPO"
[[ $DRY_RUN -eq 1 ]] && echo "DRY RUN — nothing will be created."
echo

# ---------------------------------------------------------------- labels

ensure_label() { # name colour description
  if gh label list --limit 200 --json name -q '.[].name' | grep -Fxq "$1"; then
    echo "  label exists: $1"
  elif [[ $DRY_RUN -eq 1 ]]; then
    echo "  would create label: $1"
  else
    gh label create "$1" --color "$2" --description "$3" >/dev/null
    echo "  created label: $1"
  fi
}

echo "Labels:"
ensure_label "severity:critical"  "b60205" "Blocks correctness or launch"
ensure_label "severity:high"      "d93f0b" "Resolve before the build reaches it"
ensure_label "severity:medium"    "fbca04" "Resolve within the milestone"
ensure_label "severity:low"       "0e8a16" "Nice to resolve"
ensure_label "implementation-review" "5319e7" "Raised by the 04 Aug 2026 implementation review"
ensure_label "domain-correctness"  "1d76db" "Touches a Part 1 invariant"
ensure_label "operations"          "006b75" "CI, backups, observability"
ensure_label "legal"               "c2e0c6" "Needs a human/lawyer answer"
ensure_label "frontend"            "bfd4f2" "app/ surfaces"
echo

# ------------------------------------------------------------ milestones

ensure_milestone() { # title description
  if gh api "repos/$REPO/milestones?state=all" -q '.[].title' | grep -Fxq "$1"; then
    echo "  milestone exists: $1"
  elif [[ $DRY_RUN -eq 1 ]]; then
    echo "  would create milestone: $1"
  else
    gh api "repos/$REPO/milestones" -f title="$1" -f description="$2" >/dev/null
    echo "  created milestone: $1"
  fi
}

echo "Milestones:"
ensure_milestone "9. Operational foundations"  "CI, backups, error tracking, job-run ledger. IR-03…IR-06."
ensure_milestone "10. Domain corrections"      "Capacity, availability surface, evidence confirmation, webhook idempotency. IR-01, IR-08, IR-10, IR-11."
ensure_milestone "11. Counter and checkout UI" "The surfaces W1…W5 need. IR-12."
ensure_milestone "12. Pre-launch"              "Measurement, bootstrap, restore rehearsal, legal answers. IR-02, IR-07, IR-09, IR-13."
echo

# ---------------------------------------------------------------- issues

create_issue() { # title milestone labels body
  local title="$1" milestone="$2" labels="$3" body="$4"
  if gh issue list --state all --limit 400 --json title -q '.[].title' | grep -Fxq "$title"; then
    echo "  skip (exists): $title"
    return
  fi
  if [[ $DRY_RUN -eq 1 ]]; then
    echo "  would create: [$milestone] $title"
    return
  fi
  gh issue create --title "$title" --milestone "$milestone" --label "$labels" --body "$body" >/dev/null
  echo "  created: $title"
}

echo "Issues:"

# ---------------------------------------------------------------- IR-01
create_issue \
"IR-01 — Availability capacity must be the pool, not the Rentable status count (D-38)" \
"10. Domain corrections" \
"severity:critical,implementation-review,domain-correctness" \
'## Problem

`getRentableCount` (`server/contexts/asset-registry/repository.ts`) counts Assets `where status = '"'"'rentable'"'"'`. That value is used as the capacity ceiling in `acquireDayHold` for **every** day, and as the minuend in `getAvailableCount` for **every** day.

An Asset handed out today becomes `in_possession`, but the Reservation that authorised the handover has already consumed a row in `asset_type_day_holds` for each of its days. The same unit is subtracted twice — and it is subtracted from all future days, not only the days it is out. Availability is therefore under-reported and bookings are refused for days that are free.

## Decision

**D-38** (Part 4 §16.2). Capacity is the size of the rentable *pool*: Rentable + InPossession + UnderInspection. Unavailable and Retired are excluded, because those statuses are statements that a unit has left the pool.

This does not amend D-08. It supersedes the literal reading of "Rentable Assets of that type" in D-08, FR-03 and FR-04, which was written before Handover & Possession existed to move Assets out of Rentable status.

## Scope

- [ ] Rename and rewrite the Asset Registry capacity read so the name states the concept (pool membership), not the status filter.
- [ ] Verify both call sites in `availability-reservation/reservation.ts`.
- [ ] Test: a HandoverOut does not change availability for any day outside the Reservation'"'"'s own RentalPeriod.
- [ ] Test: an Asset marked Unavailable does reduce availability.
- [ ] Test: an Overdue Asset does not reduce capacity — its consequence is FR-29 ranking, which already computes the shortfall (Part 5 Finding 12).
- [ ] Update the integration suite for the D-08 invariant.

## Governing identifiers

D-38, D-08, D-33, FR-03, FR-04, FR-29, P1 §3, IR-01

## Notes

OQ #24 is open and does **not** block this: whether an Unavailable Asset should leave the pool only until a recorded return-to-service date affects Unavailable alone. Implement the immediate-exclusion behaviour now.'

# ---------------------------------------------------------------- IR-02
create_issue \
"IR-02 — No end-to-end rental is possible until the retention window has a value (OQ #2)" \
"12. Pre-launch" \
"severity:critical,implementation-review,legal" \
'## Problem

`RETENTION_WINDOW_DAYS` is `null` and `computeRetentionDeadline` throws `RetentionWindowNotConfiguredError`. **This behaviour is correct** — an unconfigured window must refuse rather than guess — but the consequence is that no IdentityEvidence can be created, so no IdentityVerification can reference one, so FR-14 refuses every HandoverOut.

There is today no way to exercise a complete W1…W5 rental against a real database.

## What is actually needed

Not code. OQ #2: the retention window **number** and its **lawful basis**, in writing, recorded in the specification — set with the card-scheme dispute horizon in scope (R-15, Part 5 Finding 5), not in isolation.

OQ #3 (backup retention horizon) is coupled: NFR-07'"'"'s promise to customers is the sum of the two.

## Scope

- [ ] Obtain the window value and basis from a lawyer.
- [ ] Record both in Part 4 §16.2 alongside D-11'"'"'s reference, as D-11 requires.
- [ ] Set `RETENTION_WINDOW_DAYS` and remove nothing else — the guard stays for the next unconfigured value.
- [ ] Run one full W1…W5 rental against the rehearsal database and record the result.

## Governing identifiers

OQ #2, OQ #3, D-11, D-36, R-02, R-15, FR-12, FR-16, IR-02

## Blocks

Every end-to-end verification task, including the pre-launch rehearsal.'

# ---------------------------------------------------------------- IR-03
create_issue \
"IR-03 — Implement D-34: CI with banned-term, boundary and date-arithmetic enforcement" \
"9. Operational foundations" \
"severity:high,implementation-review,operations" \
'## Problem

D-34 states that banned terms and dependency direction are linted in CI and the build fails on violation. `eslint.config.mjs` is `withNuxt(eslintConfigPrettier)` and nothing more, and `.github/workflows/` contains only the migration applier and five cron dispatchers — nothing runs on `push` or `pull_request`.

So nothing runs the tests, nothing fails a build on an `Order`/`Role`/`Fulfilled`, nothing checks context dependency direction, nothing flags inline date arithmetic outside Availability & Reservation. NFR-13 and Part 5 Finding 11 both make the argument: a discipline that is only greppable is enforced by whoever remembers to grep.

## Scope

- [ ] Workflow on `push` and `pull_request`: `pnpm lint`, `pnpm typecheck`, `pnpm test`.
- [ ] ESLint rule failing on banned identifiers: Booking, Order, Item, Product, Inventory, User, Role, Permission, Account, Cart, Session (as a domain term), Fulfilled, Escalation, Case, Ticket, `name_sk`, `rentalGranularity`.
- [ ] Dependency-direction check between `server/contexts/*` matching Part 1'"'"'s context map, including the two sanctioned cross-context composition points (`server/utils/payment-webhook-flow.ts`, the checkout route) as explicit exceptions.
- [ ] Rule flagging date subtraction outside `availability-reservation/rental-period.ts` (D-12'"'"'s substituted discipline).
- [ ] Run the integration suites against the rehearsal Supabase project (R-05) so the 64 skipped tests stop being conditional in CI.

## Governing identifiers

D-34, NFR-13, D-12, D-20, D-02, R-05, Part 5 Finding 11, IR-03

## Notes

Lint and typecheck are currently clean, so this goes green on the first run and every later failure is a real regression. Do this before the frontend work (IR-12) multiplies the surface.'

# ---------------------------------------------------------------- IR-04
create_issue \
"IR-04 — Implement D-32: nightly pg_dump to R2; R-04 is currently unmitigated" \
"9. Operational foundations" \
"severity:high,implementation-review,operations" \
'## Problem

D-32 is `accepted` in the ADR log and does not exist. There is no backup workflow, and Supabase Free provides no automatic backups and no PITR (F-1). The database holds the rental and accounting history that D-11 explicitly requires to survive the erasure of the identity photograph.

Three Part 4 mitigations rest on this one workflow and all three are currently absent: R-04 (recoverability), R-07 (a plain SQL file restorable by anyone — the only concrete answer to the bus factor), R-12 (keeping the project from idling into a pause).

R-05 raises the stakes: production-only migrations against an unbacked database is named as the single most plausible way this pilot loses data.

## Scope

- [ ] Scheduled GitHub Actions workflow running `pg_dump` into the R2 backup location.
- [ ] Retention horizon as a **named constant** — OQ #3 fills in the value; the mechanism does not wait for it.
- [ ] Back up the `conditions` bucket on the same schedule; the `evidence` bucket is deliberately **not** backed up (D-27, NFR-07).
- [ ] Record the run under the D-41 job ledger (see IR-06) once that exists.
- [ ] Rehearse a restore into the second free Supabase project and write down how long it took.

## Governing identifiers

D-32, D-27, R-04, R-05, R-07, R-12, NFR-03, NFR-07, OQ #3, F-1, IR-04

## Notes

The restore rehearsal is the part that actually discharges the risk. An untested backup is a belief.'

# ---------------------------------------------------------------- IR-05
create_issue \
"IR-05 — Implement D-29: Sentry with SDK-level scrubbing, in a single change" \
"9. Operational foundations" \
"severity:high,implementation-review,operations,legal" \
'## Problem

`.env.example` declares `NUXT_SENTRY_DSN`. No Sentry package is installed, no DSN is read in `nuxt.config.ts`, no `beforeSend` exists. NFR-14 is unimplemented and D-29'"'"'s specific requirements have no home.

## The ordering constraint

R-11 and NFR-08 are about the day an upload route throws and the error tracker becomes a second, unmanaged copy of an identity document — outside every retention clock, in a third party, with no erasure job pointed at it. **The scrubbing configuration must land in the same change as the SDK.** If the SDK ships first and scrubbing follows, there is a window in which exactly that can happen.

Vendor-side Advanced Data Scrubbing is a $80/month Business feature and is the wrong answer anyway: it means the passport arrived and was then cleaned.

## Scope

- [ ] Install and configure Sentry with `sendDefaultPii: false`, no request bodies, EU data residency (R-13).
- [ ] `beforeSend` dropping events from the identity-evidence routes entirely.
- [ ] Per-key rate limiting so one bad deploy cannot spend the month'"'"'s quota in an hour.
- [ ] Sentry Crons against the erasure job as the second signal alongside FR-40 (see IR-06).
- [ ] A test asserting `beforeSend` drops an event carrying an evidence route path.

## Governing identifiers

D-29, NFR-08, NFR-14, R-11, R-13, P7, IR-05'

# ---------------------------------------------------------------- IR-06
create_issue \
"IR-06 — Implement FR-40 via a job-run ledger (D-41)" \
"9. Operational foundations" \
"severity:high,implementation-review,operations" \
'## Problem

FR-40 is a **Must**: the owner can see when the retention erasure job last ran successfully. Nothing records a job run. The internal endpoint returns its result to its caller and the GitHub Actions log holds it for as long as Actions retains logs — which is visibility for the developer, in a third-party console, not for the owner.

NFR-14 made the argument that this single requirement closes the only hole in the observability posture: every other failure here is loud, and W10'"'"'s erasure is silent by construction.

## Decision

**D-41** (Part 4 §16.2). Every internal scheduled endpoint writes a job-run row — job name, started-at, finished-at, outcome, processed count. Not a bespoke marker for the erasure job alone: there are now six scheduled jobs and a reminder dispatcher that stops running is silent in the same way, with the return reminder being the highest-leverage operational lever the business has (Part 1 §4).

## Scope

- [ ] Migration for the job-run ledger (expand/contract, D-30).
- [ ] Write a row from all six internal endpoints: expiry sweep, evidence erasure, pickup/return/overdue reminders, and the D-32 backup once it exists.
- [ ] Owner-visible page showing last successful run per job — satisfies FR-40 (Must) and most of FR-44 (Should).
- [ ] This is an operations record, **not** a domain event: not in Part 2'"'"'s catalogue, nothing reacts to it.

## Governing identifiers

D-41, FR-40, FR-44, NFR-14, W10, D-30, IR-06'

# ---------------------------------------------------------------- IR-07
create_issue \
"IR-07 — F6 has shipped: Customer records carry no RetentionDeadline (OQ #27)" \
"12. Pre-launch" \
"severity:high,implementation-review,legal" \
'## Problem

Part 5 Finding 6 identified that P7 — "*every* piece of personal data is created with a retention deadline attached" — was implemented for the photograph and nothing else. CLAUDE.md listed it under KNOWN GAPS with the instruction to decide the basis "when building the Customer model".

The Customer model is now built. Name, email and phone are persisted, one record per ReservationGroup (D-14), with no deadline column and no erasure path. The gap has crossed from documentation into live behaviour, and the pile grows monotonically — the exact shape of liability P7 exists to refuse.

D-11 requires that a retention basis be recorded in writing. That rigour was applied to the photograph and silently waived here.

## Scope

- [ ] Obtain the period and its basis — Slovak accounting/limitation statute is the likely answer. Same lawyer, same conversation as OQ #2, so brief them together.
- [ ] Record it as a policy value in the Part 3 §12(e) style, via a Part 4 §16.2 supersession since Part 3 is frozen.
- [ ] Deadline column populated at Customer creation; unrepresentable without one, exactly as FR-12 does for evidence.
- [ ] Erasure path reusing the D-41-instrumented scheduled job pattern.

## Note on shape

P7 demands a clock, not a short one. If the basis mandates long retention, a long deadline satisfies the principle. The failure is the absence of a clock, not its length.

## Governing identifiers

P7, D-11, D-14, NFR-10, OQ #27, Part 5 Finding 6, IR-07'

# ---------------------------------------------------------------- IR-08
create_issue \
"IR-08 — Expose availability; FR-02 is only half met" \
"10. Domain corrections" \
"severity:medium,implementation-review,domain-correctness" \
'## Problem

`getAvailableCount` is implemented and unit-tested. No HTTP route calls it. The public browse route returns name, description, day rate and deposit only, and `app/pages/index.vue` carries a now-stale comment saying availability "belongs to Availability & Reservation (Milestone 4), not built yet".

FR-02 is a Must and reads: a Visitor browses published AssetTypes and **sees availability and DepositObligation**. Half of it is unmet.

Worse for the domain: `POST /api/reservations/checkout` is reachable with no way for the Visitor to have known whether the days were free, so the first signal is a 409 from `AssetTypeUnavailableError` — the phone call D-08 exists to prevent, relocated into the browser.

## Scope

- [ ] Public route taking an AssetType and a RentalPeriod, returning per-day availability. No session, no cookie, no record written (FR-02, P2 §7).
- [ ] Render it on the browse page; delete the stale comment.
- [ ] Keep it import-light — it is on the pre-commitment path and R-08'"'"'s cold-start discipline applies as it does to the scan route.
- [ ] Depends on **IR-01/D-38**: shipping this against the current capacity query would publish wrong numbers. Land D-38 first.

## Governing identifiers

FR-02, FR-03, D-08, D-38, W1, R-08, IR-08'

# ---------------------------------------------------------------- IR-09
create_issue \
"IR-09 — Reuse the database client and verify sessions locally on the request path (D-39)" \
"12. Pre-launch" \
"severity:medium,implementation-review,operations" \
'## Problem

Each `*-deps.ts` creates a Postgres client and each route ends it. `requireOperator` opens a **second** client for the Operator lookup and makes a remote Supabase Auth `getUser` call before it.

A scan therefore pays, before any domain work: one auth round trip plus two TLS handshakes and connection setups. NFR-02 names exactly one latency requirement in the whole system and this is the path it names (P3). It also holds two pooler connections per request where one would do — Part 5 Finding 4'"'"'s exhaustion cliff, which R-08 does not cover (now R-16).

The per-request create/end is justified in comments by NFR-04'"'"'s refusal of scaling apparatus. That reads the right principle onto the wrong thing: postgres.js already owns a pool, so creating one per request discards apparatus that already exists.

## Decision

**D-39** (Part 4 §16.2).

## Scope

- [ ] Module-scope Postgres client reused across invocations.
- [ ] One client per request shared by every dependency, including `requireOperator`.
- [ ] Local verification of the access token'"'"'s signature and expiry; remote call reserved for the refresh path.
- [ ] **Carve-out:** any route handing out a presigned read URL for IdentityEvidence keeps the remote check (NFR-06 is what bought individual authentication in the first place).
- [ ] **`prepare: false` stays.** Supavisor transaction pooling requires it; reuse makes it more important, not less.
- [ ] Name the access-token lifetime (OQ #25) — it is the accepted revocation lag against NFR-09.
- [ ] Measure scan-to-resolution on Netlify as built, not a cold start in isolation (OQ #22).

## Governing identifiers

D-39, R-16, R-08, NFR-02, NFR-09, NFR-06, D-22, D-24, OQ #22, OQ #25, IR-09'

# ---------------------------------------------------------------- IR-10
create_issue \
"IR-10 — A photograph must be confirmed stored before it counts as evidence (D-40)" \
"10. Domain corrections" \
"severity:high,implementation-review,domain-correctness" \
'## Problem

Presigned upload URLs are generated, object keys are written into the ConditionReport / IdentityEvidence row, and the row is committed. **Nothing verifies that bytes ever arrived.** A dropped connection at the counter, a closed tab or an expired five-minute URL leaves a report that names objects which do not exist — and that report satisfies FR-20.

FR-20 is the guard that makes a deduction defensible rather than a shouting match (P1 corollary, W8). A deduction passing it against two rows pointing at absent objects is worse than no check, because it manufactures confidence exactly where a dispute needs the opposite.

Secondly, the presigned `PutObjectCommand` constrains content type but not content length. The D-23 link is by design a bearer token that lands in an inbox, and it currently grants an unconstrained upload URL against a 10 GB free tier (R-10).

## Decision

**D-40** (Part 4 §16.2).

## Scope

- [ ] Photograph rows created in an unconfirmed state (migration, expand/contract).
- [ ] Confirmation step verifying object presence (HEAD) before a row counts as evidence.
- [ ] FR-20 counts **confirmed** reports only.
- [ ] Sweep unconfirmed rows older than the presigned URL lifetime; record the run under D-41.
- [ ] Content-length range on presigned uploads for both buckets (value: OQ #26).
- [ ] Test: a deduction is refused when a paired report exists but its object was never confirmed.

## Governing identifiers

D-40, R-17, FR-19, FR-20, W8, P1 corollary, D-23, D-27, R-10, OQ #26, IR-10

## Rejected alternative

Proxying uploads through Nitro: multi-megabyte bodies against a 10s synchronous cap (R-08), double egress, and it defeats why R2 was chosen for photographs (D-27).'

# ---------------------------------------------------------------- IR-11
create_issue \
"IR-11 — Stripe webhook idempotency is check-then-act and two redeliveries can pass it" \
"10. Domain corrections" \
"severity:medium,implementation-review,domain-correctness" \
'## Problem

`applyProviderWebhookEvent` (`server/utils/payment-webhook-flow.ts`) reads the Payment, returns `already_processed` if its status is `succeeded` or `refunded`, and otherwise calls `applyPaymentSucceeded` then `confirmReservationGroup`.

The read and the write are separate statements with no guard between them. Stripe'"'"'s at-least-once retry semantics permit two simultaneous deliveries of the same event — and its retry-on-timeout behaviour makes that likely precisely when the function is slow. Both can observe `pending` and both proceed to confirm. The code'"'"'s own comment notes that `confirmReservationGroup` is not safe to call twice against a group that may have moved on.

This is the same class of defect D-33 was written to close on the reservation side, left open one context over.

## Scope

- [ ] Make the status transition itself the guard: conditional `UPDATE ... WHERE status = '"'"'pending'"'"' ... RETURNING`.
- [ ] Zero rows returned means another delivery won — outcome `already_processed`.
- [ ] Test with two concurrent invocations of the same event against the real database, in the style of the OQ #23 concurrency proof.

## Governing identifiers

FR-10, D-37, D-33, D-26, Part 5 Finding 3, IR-11

## Notes

Mechanics, not policy. No open question is involved and this does not wait on OQ #1.'

# ---------------------------------------------------------------- IR-12
create_issue \
"IR-12 — Build the counter, checkout and Customer-link surfaces" \
"11. Counter and checkout UI" \
"severity:medium,implementation-review,frontend" \
'## Problem

`app/` contains four pages (563 lines) against roughly 17,500 lines of server code: public browse, login, and two admin pages. There is no scan surface, no HandoverOut/HandoverIn flow, no PIN re-confirmation prompt, no condition-photo capture, no deposit entry, no checkout flow, no terms acceptance screen, and no page behind the D-23 tokenised link — even though the server side of every one of these is built, routed and tested.

Not a defect; this is where the remaining pilot work is. Recorded so the ratio is visible when planning.

## Suggested sequence

1. **Counter** — scan → resolved intent → HandoverOut / HandoverIn, PIN re-confirmation (F8), photo capture, deposit entry, settlement. W4 is the thirty seconds the product exists to make fast, and it is the only surface whose absence means the pilot cannot operate at all.
2. **Checkout** — availability (depends on IR-08), line assembly, terms acceptance (D-35), Stripe hosted page (NFR-05).
3. **Customer link** — D-23 scope only: view the ReservationGroup, submit IdentityEvidence. Never reads evidence back (NFR-06).

## Constraints that already bind

- No client–database access; the browser never declares a transition (D-25, FR-17).
- No string literal outside the string catalogue, including emails (D-20).
- PWA, no offline mode, no client-side authority (NFR-12).
- Terms acceptance cannot be skipped — HandoverOut already refuses a group with no recorded acceptance (D-35).

## Governing identifiers

W1…W5, D-23, D-25, D-35, FR-17, FR-39, FR-42, NFR-05, NFR-06, NFR-12, D-20, IR-12

## Notes

Consider splitting into three issues once the counter surface is scoped in detail.'

# ---------------------------------------------------------------- IR-13
create_issue \
"IR-13 — Check whether FR-38's cookie banner is the right obligation" \
"12. Pre-launch" \
"severity:low,implementation-review,legal" \
'## Problem

FR-38 is a Must: a cookie banner declining non-essential by default. Nothing implements one. Before implementing it, it is worth checking whether it should be.

The cookies this application sets are the Operator session pair and the checkout group cookie — all httpOnly, all strictly necessary to deliver a service the person explicitly requested, and therefore exempt from consent under the ePrivacy rule FR-38 exists to satisfy. There is no analytics, no advertising, no third-party script; Sentry is server-side under D-29.

A banner asking consent for cookies that need none trains people to click through banners and adds a surface for no legal benefit.

## Scope

- [ ] Complete the cookie inventory once Sentry (IR-05) and the frontend (IR-12) have landed — this is the step that could change the answer.
- [ ] If it stays essential-only: reword FR-38 as a Part 4 §16.2 supersession (Part 3 is frozen) and put a maintained statement of what is set and why in the privacy notice.
- [ ] If any non-essential cookie appears: implement the banner as written, declining by default.
- [ ] Fold into the OQ #4 legal conversation, which is already about paperwork rather than code.

## Governing identifiers

FR-38, NFR-10, D-23, D-29, OQ #4, OQ #28, IR-13'

echo
echo "Done."
[[ $DRY_RUN -eq 1 ]] && echo "That was a dry run. Re-run without --dry-run to create."
