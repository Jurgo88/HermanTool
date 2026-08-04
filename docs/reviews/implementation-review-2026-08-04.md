# Implementation Review — 04 August 2026

| | |
|---|---|
| **Status** | Review of the implemented codebase against Parts 1–5. Findings only; reconciliation lives in Part 4 §16.2. |
| **Scope** | The repository as of milestone M4 completion. Parts 1–3 frozen; Part 4 extended. |
| **Method** | Full read of `server/`, `app/`, `supabase/migrations/`, `tests/`, plus `pnpm lint`, `pnpm typecheck` and `vitest run` executed locally. |
| **Identifiers** | Findings `IR-01`…`IR-13`. They reference, and never restate, existing `D-`, `FR-`, `NFR-`, `R-`, `W-` and Part 5 `Finding` numbers. |

### What was verified rather than assumed

`pnpm lint` and `pnpm typecheck` both exit clean. `vitest run` reports **229 passing, 64 skipped** across 41 files; the skips are the integration suites, which correctly skip themselves without a database URL rather than failing or, worse, silently passing.

Several things that are usually wrong are right here and are named so that no future change quietly undoes them. D-33's atomic conditional UPSERT is implemented as specified, with the capacity read bound to the same transaction as the increment and the reap-on-contention path resolving the lazy-expiry seam Part 5 Finding 3 opened. `prepare: false` is present with the Supavisor reasoning recorded next to it. The context boundaries hold: no context imports another's internals, and the two places that legitimately compose two contexts — `server/utils/payment-webhook-flow.ts` and the checkout route — say so explicitly and are the only ones. Attestations carry `occurred_at` and `recorded_at` separately, per D-10. The evidence gateway is the sole importer of the S3 SDK and already sets `ResponseCacheControl: no-store` against Finding 8.

The findings below are therefore about absences and about one modelling error, not about code quality.

---

## IR-01 — Availability capacity is read from Asset *status*, so a handed-out Asset is subtracted twice
**Severity: Critical · Category: domain correctness**
**Location:** `server/contexts/asset-registry/repository.ts` (`getRentableCount`), `server/contexts/availability-reservation/reservation.ts` (`acquireDayHold`, `getAvailableCount`), D-08, D-33, FR-03, FR-04

`getRentableCount` counts Assets `where status = 'rentable'`. That count is used as the capacity ceiling for **every** day a hold is attempted on, and as the minuend in `getAvailableCount` for **every** day queried.

The two clocks are conflated by that query. When an Asset is handed out, `performHandoverOut` moves it to `in_possession` — correctly, since that is a fact about the physical clock. But the Reservation that authorised the handover already consumed a row in `asset_type_day_holds` for each of its days, and that hold is the *commercial* record of the same unit. From the moment of HandoverOut until the Asset is returned and passes inspection, capacity for that AssetType is reduced by one for all future days as well, while those future days continue to be measured against the reduced number. A unit out on Monday therefore reduces what can be booked for a Saturday three weeks away, even though nothing about Saturday has changed.

The failure is silent and it is in the direction that loses money quietly: the system under-reports availability and refuses bookings for days that are free. At the pilot's utilisation this will not be rare. With ten drills of a type and four out on any given weekday, every future day of that type is advertised at six.

The mirrored error is worth naming because it is the reason this is a modelling question and not a query bug: an Asset that is Overdue is `in_possession` too, and Part 5 Finding 12 already settled what an Overdue Asset threatens — a per-(AssetType, day) shortfall surfaced through FR-29's ranking, not a reduction in the number of units the business owns. FR-29's ranking is implemented (`server/utils/overdue-noshow-views.ts`) and computes exactly that shortfall. The capacity query contradicts it.

**Proposed improvement:** capacity is the size of the *pool* — Rentable plus InPossession plus UnderInspection — and excludes only Unavailable and Retired, which are statements that a unit has left the pool rather than statements about where it is standing today. Recorded as **D-38**. This does not amend D-08: it names what "Rentable Assets of that type" means once Part 1's own five-status list is applied literally, which Part 1 could not do because it predates the status transitions Handover & Possession now performs. A test asserting that a HandoverOut does not change future availability belongs with the D-08 tests CLAUDE.md already makes mandatory.

---

## IR-02 — The unset retention window blocks every end-to-end path, correctly and completely
**Severity: Critical · Category: launch blocker (no code fix)**
**Location:** `server/contexts/customer-identity-compliance/identity-evidence.ts` (`RETENTION_WINDOW_DAYS = null`), OQ #2, D-11, R-02, FR-12

`RETENTION_WINDOW_DAYS` is `null` and `computeRetentionDeadline` throws `RetentionWindowNotConfiguredError`. This is the right behaviour and the code says so in a comment: an unconfigured window must refuse rather than guess.

The consequence is worth stating as a finding anyway, because it is a schedule fact rather than a defect. No IdentityEvidence can be created; therefore no IdentityVerification can reference one; therefore FR-14 refuses every HandoverOut. **There is today no way to exercise a complete rental against a real database**, which means the whole W1–W5 loop is untested end to end and will stay that way until OQ #2 has a value.

**Proposed improvement:** none in code. OQ #2 is the cheapest unblocking action available in the entire project — a number and a written basis — and it should be answered before any further build work, not before launch. It also gates OQ #3, since NFR-07's promise is the sum of the two.

---

## IR-03 — D-34 is a decision with no implementation, and there is no CI at all
**Severity: High · Category: enforcement discipline**
**Location:** `.github/workflows/` (six workflows, none of them CI), `eslint.config.mjs`, D-34, NFR-13, Part 5 Finding 11

D-34 states that banned terms and dependency direction are linted in CI and that the build fails on violations. `eslint.config.mjs` is `withNuxt(eslintConfigPrettier)` and nothing else. The six workflow files are the migration applier and five cron dispatchers; none runs on `push` or `pull_request`, and none runs lint, typecheck or tests.

So today: nothing runs the test suite except a human remembering to; nothing fails a build that introduces an `Order`, a `Role` or a `granularity === 'hour'` branch; nothing checks that Catalog has not started importing Handover & Possession's internals; nothing catches an inline date subtraction outside Availability & Reservation, which is the whole of what D-12 substituted for a structure. NFR-13 states the stakes precisely — an agent that generates a banned identifier "has silently reversed a decision that was argued for" — and Finding 11 already observed that greppable means detectable by someone who greps.

The repository is currently in the best possible state to add this: lint and typecheck are clean, so the job goes green on its first run and every subsequent failure is a real regression rather than a backlog.

**Proposed improvement:** one workflow on `push` and `pull_request` running `pnpm lint`, `pnpm typecheck`, `pnpm test`, plus a banned-identifier rule and a dependency-direction check matching Part 1's context map. Integration suites run against the second free Supabase project R-05 already provisions for migration rehearsal, so the 64 currently-skipped tests stop being conditional. No new decision — this is D-34 being implemented.

---

## IR-04 — D-32's nightly backup does not exist, so R-04 is unmitigated
**Severity: High · Category: operational**
**Location:** `.github/workflows/`, D-32, R-04, R-05, R-07, R-12, NFR-03, NFR-07

D-32 is `accepted` in the ADR log. There is no `pg_dump` workflow. The database therefore has no backup of any kind: Supabase Free provides none (F-1), and the data includes the rental and accounting history D-11 explicitly requires to survive the erasure of the photograph.

Three separate mitigations in Part 4 are load-bearing on this one workflow and all three are currently absent: R-04's recoverability, R-07's "a plain SQL file any competent Postgres person can restore" as the only concrete answer to the bus factor, and R-12's keep-the-project-alive side effect. R-05 raises the stakes — production-only migrations against an unbacked database is named as the single most plausible way this pilot loses data.

**Proposed improvement:** implement D-32 as written, including the `conditions` bucket on the same schedule and the deliberate exclusion of `evidence`. The retention horizon is OQ #3 and is not a reason to defer the mechanism — build it with the horizon as a named constant that the OQ fills in.

---

## IR-05 — Sentry is not installed, and NFR-08's scrubbing has nothing to scrub in
**Severity: High · Category: legal, operational**
**Location:** `package.json`, `nuxt.config.ts` (`NUXT_SENTRY_DSN` is in `.env.example` and nowhere else), D-29, NFR-08, NFR-14, R-11

`.env.example` declares `NUXT_SENTRY_DSN`; no Sentry package is installed, no DSN is read in `nuxt.config.ts`, and no `beforeSend` exists. NFR-14's error tracking is therefore unimplemented, and D-29's specific requirements — `sendDefaultPii: false`, no request bodies, the evidence-upload route excluded from instrumentation entirely, per-key rate limiting — have no home.

The ordering matters more than the absence. R-11 and NFR-08 are about the day an upload route throws and the error tracker becomes a second, unmanaged copy of an identity document outside every retention clock. If the SDK is added first and scrubbed afterwards, there is a window in which exactly that can happen. The scrubbing configuration must land in the same change as the SDK, not in the next one.

**Proposed improvement:** implement D-29 in a single change, scrubbing included, and configure Sentry Crons against the erasure job as the second signal D-29 asks for alongside FR-40. EU data residency per R-13.

---

## IR-06 — FR-40 is a Must with no implementation and nowhere to store the fact
**Severity: High · Category: missing requirement**
**Location:** absent throughout, FR-40, FR-44, NFR-14, W10

FR-40 — the owner can see when the retention erasure job last ran successfully — is a Must. Nothing records a job run. `server/api/internal/customer-identity-compliance/erase-expired-evidence.post.ts` returns its result to the caller and the GitHub Actions log holds it for as long as Actions retains logs.

NFR-14 made the argument that this single requirement closes the only hole in the observability posture: every other failure in this system is loud, and W10's erasure is silent by construction — nothing breaks, nobody complains, and a GDPR liability accrues invisibly. That reasoning is why FR-40 is a Must while the rest of the status page is a Should.

**Proposed improvement:** a job-run ledger written by every internal scheduled endpoint, not a bespoke marker for the erasure job alone — the sweep, the three reminder dispatchers and the future backup all have the same silent-failure shape. Recorded as **D-41**. One table serves FR-40 (Must) and most of FR-44 (Should).

---

## IR-07 — F6 has shipped: Customer records exist and carry no retention deadline
**Severity: High · Category: legal**
**Location:** `server/contexts/customer-identity-compliance/customer.ts`, `supabase/migrations/20260729130000_...sql`, P7, D-14, Part 5 Finding 6, NFR-10

Finding 6 identified that P7's "*every* piece of personal data is created with a retention deadline attached" was implemented for the photograph and for nothing else. CLAUDE.md lists it under KNOWN GAPS with the instruction to decide the basis "when building the Customer model". The Customer model is now built. Name, email and phone are persisted, one record per ReservationGroup per D-14, with no deadline column and no erasure path.

This has crossed from a documentation gap into live behaviour. The pile is currently small and will grow monotonically, which is the exact shape of liability P7 exists to refuse, and D-11's requirement that a retention basis be recorded in writing was applied to the photograph and silently waived here.

**Proposed improvement:** as Finding 6 proposed — one row in Part 3 §12(e)'s policy-value table, a constant with its basis recorded, and a deadline column populated at creation. The likely basis is the Slovak accounting/limitation period, which is a long deadline rather than a short one; P7 demands a clock, not a short one. Folded into the OQ #2 legal brief, since it is the same conversation with the same person. Recorded as OQ #27.

---

## IR-08 — Availability is computed, tested, and never exposed; FR-02 is incomplete
**Severity: Medium · Category: missing surface**
**Location:** `server/contexts/availability-reservation/reservation.ts` (`getAvailableCount`), `server/api/public/`, `app/pages/index.vue`, FR-02, FR-03, W1

`getAvailableCount` is implemented and has unit tests. No HTTP route calls it. `server/api/public/asset-types.get.ts` returns name, description, day rate and deposit; `app/pages/index.vue` renders those and carries a comment stating that availability "belongs to Availability & Reservation (Milestone 4), not built yet" — which is now stale, since M4 built it.

FR-02 is a Must and reads: a Visitor browses published AssetTypes and **sees availability and DepositObligation**. Half of it is unmet. Worse for the domain, `POST /api/reservations/checkout` is reachable without any way for the Visitor to have known whether the days were free, so the first signal is a 409 from `AssetTypeUnavailableError` — the phone call D-08 exists to prevent, relocated into the browser.

**Proposed improvement:** a public availability route taking an AssetType and a RentalPeriod, and the browse page rendering it. Delete the stale comment. Note that this endpoint is on the path a Visitor hits before committing, so R-08's import-lightness discipline applies to it as it does to the scan route.

---

## IR-09 — Every request opens a fresh connection and makes a remote auth call, on the one path with a latency budget
**Severity: Medium · Category: technology under stress**
**Location:** `server/utils/db.ts`, `server/utils/operator-session.ts`, all `*-deps.ts`, NFR-02, P3, R-08, D-22, D-24

Each `*-deps.ts` calls `createDatabaseClient(...)` and each route ends it in a `finally`. `requireOperator` calls `createAuthDeps`, which opens a **second** Postgres client for the Operator lookup, and calls Supabase Auth's `getUser` over the network before that.

A scan therefore costs, before any domain work begins: a Supabase Auth round trip, one TLS handshake and connection to Supavisor for the Operator lookup, and a second one for the handover repository. NFR-02 names exactly one latency requirement in the entire system and this is it — scan-to-resolution must feel instant, because P3's thirty seconds are the reason the product exists. R-08 covers cold starts and does not cover this; Part 5 Finding 4 flagged connection exhaustion against the pooler as the classic free-tier cliff and this doubles the connection count per request.

The comments justify the per-request create/end by NFR-04's "no scaling apparatus at pilot load", which is a fair reading — but postgres.js already owns a pool, so creating one per request does not avoid apparatus, it discards apparatus that is already there.

**Proposed improvement:** recorded as **D-39**. A module-scope client reused across invocations, one client per request passed to every dependency rather than one per dependency, and local verification of the access token's signature and expiry with the remote call reserved for the refresh path. The honest cost is that revocation lag becomes the access token's lifetime, so that lifetime must be named (OQ #25) and the routes that hand out presigned evidence URLs keep the remote check, since NFR-06 is what bought individual authentication in the first place. `prepare: false` is unaffected and must stay.

---

## IR-10 — A photograph is recorded as evidence before anyone has confirmed it exists
**Severity: High · Category: domain correctness**
**Location:** `server/contexts/handover-possession/handover-out.ts`, `handover-in.ts`, `customer-identity-compliance/identity-evidence.ts`, both `r2-gateway.ts`, FR-19, FR-20, W8, P1 corollary

Presigned upload URLs are generated, object keys are written into the ConditionReport row, and the row is committed. Nothing ever verifies that bytes arrived. If the upload fails — a dropped connection at the counter, a closed tab, an expired five-minute URL — the ConditionReport exists, names objects that are not there, and satisfies FR-20's paired-evidence check.

That check is the single most important guard in the settlement story: "no deduction without both reports", the mechanism by which a deduction becomes defensible rather than a shouting match. A deduction that passes FR-20 against two rows pointing at absent objects is worse than no check at all, because it produces false confidence at exactly the moment a dispute needs the opposite.

A second, smaller problem sits in the same code: the presigned `PutObjectCommand` constrains content type but not content length. The D-23 Customer link is by design a bearer token that will land in an inbox, and it grants an unconstrained upload URL against a 10 GB free tier (R-10).

**Proposed improvement:** recorded as **D-40**. A photograph row is created in an unconfirmed state; a confirmation step verifies the object's presence before it counts as evidence; FR-20 counts only confirmed reports; unconfirmed rows are swept. Presigned uploads carry a content-length range (value at OQ #26).

---

## IR-11 — Webhook idempotency is check-then-act and two concurrent redeliveries can pass it
**Severity: Medium · Category: concurrency**
**Location:** `server/utils/payment-webhook-flow.ts`, `server/api/webhooks/stripe.post.ts`, FR-10, D-37, Part 5 Finding 3

`applyProviderWebhookEvent` reads the Payment, returns `already_processed` if its status is `succeeded` or `refunded`, and otherwise calls `applyPaymentSucceeded` followed by `confirmReservationGroup`. The read and the write are separate statements with no guard between them, so two simultaneous deliveries of the same event — which Stripe's at-least-once retry semantics permit, and which its retry-on-timeout behaviour makes likely precisely when the function is slow — can both observe `pending` and both proceed to confirm. The comment correctly notes that `confirmReservationGroup` is not safe to call twice against a group that may have moved on.

This is the same class of defect D-33 was written to close on the reservation side, left open one context over. The fix is the same shape and is cheap: make the status transition itself the guard.

**Proposed improvement:** a conditional `UPDATE ... WHERE status = 'pending' ... RETURNING`, with a zero-row result meaning another delivery won and the outcome being `already_processed`. Mechanics, not policy — no OQ is involved.

---

## IR-12 — The counter, checkout and Customer-link surfaces do not exist
**Severity: Medium · Category: scope**
**Location:** `app/` (four pages, 563 lines against ~17,500 lines of server code), W1–W5, D-23, FR-39, FR-42, NFR-12

`app/` contains the public browse page, a login page and two admin pages. There is no scan surface, no HandoverOut or HandoverIn flow, no PIN re-confirmation prompt, no condition-photo capture, no deposit entry, no checkout flow, no terms acceptance screen, and no page behind the D-23 tokenised link — even though the server side of every one of these is built, routed and tested.

This is not a defect; it is where the remaining pilot work actually is, and it is recorded as a finding so that the ratio is visible when the next milestone is planned. The counter surface should come first: W4 is the thirty seconds the product exists to make fast, and it is the only surface whose absence means the pilot cannot operate at all.

**Proposed improvement:** sequence the remaining frontend as counter, then checkout, then the Customer link. Terms acceptance (D-35) is on the checkout path and its server side already refuses a HandoverOut whose group has no recorded acceptance, so the screen cannot be skipped.

---

## IR-13 — FR-38's cookie banner is absent, and it may be the requirement that is wrong
**Severity: Low · Category: requirement accuracy**
**Location:** absent throughout, FR-38, NFR-10, D-23, `server/utils/checkout-session.ts`, `server/utils/operator-session.ts`

FR-38 is a Must: a cookie banner declining non-essential by default. Nothing implements one. Before it is implemented, it is worth checking whether it should be.

The cookies this application actually sets are the Operator session pair and the checkout group cookie — both httpOnly, both strictly necessary to deliver a service the person explicitly requested, and both therefore exempt from consent under the ePrivacy rule that FR-38 exists to satisfy. There is no analytics, no advertising, and no third-party script; Sentry (IR-05) is server-side under D-29. A banner that asks consent for cookies that need none trains people to click through banners and adds a surface for no legal benefit.

**Proposed improvement:** confirm the cookie inventory when Sentry and the frontend land, and if it stays essential-only, reword FR-38 rather than implement it — a maintained statement of what is set and why, in the privacy notice, is the accurate obligation. Since Part 3 is frozen, that rewording is a Part 4 §16 supersession. Folded into OQ #4's legal conversation, which is already about paperwork rather than code.

---

## Closing note

Eleven of these thirteen findings are absences rather than errors, and the two that are errors — IR-01 and IR-10 — share a shape worth naming. Both are places where a *record* was created correctly and the *thing it records* was never checked: a status column standing in for pool membership, an object key standing in for a photograph. The specification's own P1 is the antidote it already contains — the physical world is the source of truth and the system is a ledger of claims about it — and both findings are the ledger quietly promoting one of its own claims to a fact. The remaining absences cluster in operations (IR-03 through IR-06), which is the predictable consequence of a build sequenced by domain milestone; they are cheap now and get no cheaper.
