# Architecture Foundation Specification
## Part 4 — Risks, Technology & Decision Log

| | |
|---|---|
| **Status** | Draft — authoritative for technology selection and risk |
| **Scope** | Sections 13–16 and the Open Questions appendix. Section 17 (Independent Review) is Part 5. Section 16.2 reconciles the 04 August 2026 implementation review (`docs/reviews/implementation-review-2026-08-04.md`, findings `IR-01`…`IR-13`). |
| **Depends on** | Parts 1, 2 and 3, all **frozen**. Their identifiers are referenced, never restated or renumbered. Section 16 reconciles Part 5's independent review; because Parts 1–3 are frozen, its corrections are expressed here as new decisions and flagged supersessions rather than as edits to those parts. |
| **Adds** | Decisions `D-24`…`D-32` (technology); in the §16 reconciliation pass, `D-10` and `D-33`…`D-37`; in the §16.2 implementation-review pass, `D-38`…`D-42`. Risks `R-01`…`R-17`. No new Ubiquitous Language. |
| **Prices verified** | 18 July 2026, against vendor pricing pages. Every number below has a date on it because every number below will move. |

### Flags: two contradictions and two defects

Parts 1–3 are frozen, so these are raised rather than resolved.

**F-1 — NFR-03 cannot be satisfied as written at €0. `[contradiction]`** NFR-03 says 24-hour backup granularity, "whatever the provider's basic plan gives". Verified today: the Supabase Free plan gives **no automatic backups and no point-in-time recovery** — daily backups begin at Pro, $25/month. The basic plan gives nothing. NFR-03's *intent* is met by D-32 at €0 through a self-rolled nightly dump, but the sentence in Part 3 assumed a provider floor that does not exist. Read NFR-03 as satisfied by D-32, not by the provider.

**F-2 — Netlify Free's failure mode exceeds NFR-01's ceiling. `[contradiction]`** NFR-01 accepts "hours of downtime". The Netlify Free plan is a hard 300-credit monthly cap, and their own pricing page states that when a project reaches its limit it "enters a paused state until the start of the next billing cycle", and that if one project exceeds its limits **all projects on the account are paused**. That is not hours; it is up to a month, and the only remedy is a credit card. The €0 posture does not remove a cost — it converts it into an availability risk with a worse distribution. See R-03; the decision to accept it is yours, and it is cheap to reverse at €9.

**F-3 — D-10 was missing in Parts 1–3. `[defect in Part 1]`** Principle P4 in Part 1 §2 ends with "See D-10" and the identifier was not written in Parts 1–3. The decision it points at was already stated inline in P4 — append-only event history for Possession and condition, ordinary mutable state elsewhere, explicitly *not* event sourcing across the system — so reasoning was present while the ADR reference was broken. **Resolved in this revision:** D-10 is now written in §16 and marked accepted in §15. The ADR is hosted in Part 4 because Parts 1–3 are frozen.

**F-4 — The §15 decision log stopped at D-32. `[defect in Part 4]`** The reconciliation pass added `D-10` and `D-33`…`D-37` in §16 but never gave them rows in §15's table, so the document's own map omitted six accepted decisions — including D-33, which governs the system's hardest invariant. A log that silently omits a decision is worse than no log, because it is consulted as if complete. **Resolved in this revision:** §15 now carries every decision through D-41.

---

## 13. Risks and Unknowns

Seventeen risks. Each is specific to *this* system given Parts 1–3; none is here to pad the list. Where the honest answer is "accepted", it says so.

### R-01 — Cancellation and refund policy is still unwritten
**Severity: Critical · Category: legal**

Part 1 marks this launch-blocking and undecided; Part 3 records that FR-47 onward cannot be written until it exists. The pilot takes money from EU consumers before goods change hands, and whether the distance-contract withdrawal right applies to short-term equipment hire needs a lawyer, not an architect. It is Critical because it is not a feature you bolt on: it reaches into D-08 (a cancelled Reservation must release its RentalDays or the availability invariant rots silently), into D-13 (partial cancellation of a ReservationGroup is the seam the grouping exists to hold), and into D-16 (a refund is the first operation that moves money outward without a physical counterpart, which is D-16's own named trigger for roles). It also has a build-order consequence nobody has stated: **`ReservationCancelled` and `PaymentRefunded` are already in Part 2's event catalogue**, so the model has a hole with a name in it.
**Mitigation:** get the answer before the build reaches Payments, not before launch week. If the answer is late, build W1–W10 and leave the cancel path unimplemented rather than guessing — a wrong refund rule is worse than an absent one.

### R-02 — The IdentityEvidence retention window has no legal basis and no value
**Severity: Critical · Category: legal**

D-11 permits the fixed multi-year option only once "a specific statute or a lawyer names the period and the basis, in writing, and that reference is recorded in this document". Nobody has provided one. Part 3 makes it a launch gate. Until it exists, the pilot would be storing photographs of identity documents — the highest-severity data in the system — with an unnamed retention period and an unrecorded basis, which is precisely the posture D-11 was written to refuse. The failure is silent and only surfaces when someone asks.
**Mitigation:** name the number and the basis before the first real ID is uploaded. D-32 and D-27 both depend on it: the effective promise is the retention window *plus* the backup horizon (NFR-07), and neither the dump retention nor the R2 lifecycle rule can be configured until the window has a value.

### R-03 — Netlify Free's credit cap pauses the whole account
**Severity: High · Category: vendor**

Verified 18 July 2026: Free is 300 credits/month, hard-capped. Production deploys cost **15 credits each — about 20 per month if you spend credits on nothing else.** Bandwidth is 20 credits/GB, compute 10 credits/GB-hour, web requests 2 credits/10k, all from the same pool. A solo developer driving Claude Code against a production-only environment deploys far more than twenty times a month; the credits run out mid-month, the site pauses until the next billing cycle, and the Operator cannot hand over a drill. Netlify has also changed this pricing four times, most recently in April 2026 when bandwidth doubled from 10 to 20 credits/GB — so the €0 posture rests on a table that moved twice in the last year.
**Mitigation, and it is largely free:** production deploys include **unlimited deploy previews and branch deploys**, which do not cost credits. Test on branch deploys; batch production deploys. Serve every photograph from R2 (D-27) so image bandwidth never touches Netlify's meter. Accept that the remedy for exhaustion is €9/month, and treat that as a decision already half-made rather than an emergency.

### R-04 — No backups exist on the free stack
**Severity: High · Category: operational**

See F-1. Supabase Free has no automatic backups and no PITR. Firestore's free tier is no better: backup, restore, PITR and TTL deletes are all explicitly outside it. A dropped table or a bad migration on a production-only setup (R-05) is unrecoverable, and the data includes the rental and accounting history that D-11 says must survive.
**Mitigation:** D-32 — nightly `pg_dump` to R2 via GitHub Actions. This is not a workaround to be embarrassed about; it gives a *better* NFR-07 answer than Supabase Pro would, because you control the horizon exactly instead of inheriting a 7-day PITR window you cannot purge.

### R-05 — Production-only environments, and migrations are where it bites
**Severity: High · Category: operational**

Your no-staging decision is right for the application and wrong for nothing else — except the database, which is the one component where a mistake is not a redeploy away from fixed. A destructive migration against production with no backup (R-04) and no rehearsal is the single most plausible way this pilot loses data.
**Mitigation, free:** the Supabase Free plan allows **exactly 2 active projects** — so production plus a throwaway rehearsal target costs nothing, and that is the shape your "throwaway Supabase project" answer already described. Point Netlify branch deploys at it. Add the discipline that actually does the work: **expand/contract migrations only** — add, backfill, switch reads, drop in a later deploy. Never destructive in one step. This is not a staging environment and it is not pretending to be one; it is a rehearsal, and rehearsal is what migrations need.

### R-06 — The Tenant's personal data lives in the developer's account
**Severity: High · Category: legal, operational**

This falls directly out of "tenant owns payments, developer owns the rest", and it is not primarily a bus-factor point. The rental business is the **data controller** for its customers' identity documents; the developer, holding the Supabase and R2 accounts, is a **processor**. GDPR requires a controller–processor agreement between them, and requires that the controller can actually exercise control — including getting the data back and having it deleted. Right now the pilot owner's customers' passports would sit in a personal account belonging to someone who is not their counterparty, with nothing on paper.
**Mitigation:** a short written processor agreement between the developer and the Tenant, before the first ID upload. Name where data lives, the sub-processors (Supabase, Cloudflare, Resend, Sentry, Netlify), and the exit. This is cheap now and unpleasant later, which is D-01's own test applied to paperwork.

### R-07 — Solo developer bus factor
**Severity: High · Category: operational**

One person builds and operates this. If they stop, the Tenant has a business running on software nobody else can deploy, in accounts nobody else can open. The Stripe account being the Tenant's own (your answer) is genuinely load-bearing here — the money rail survives independently — but the data and the application do not.
**Mitigation, partial and honest:** D-32's nightly dump lands in R2 as plain SQL, which is restorable by any competent Postgres person without any Supabase knowledge. Keep the repository somewhere the Tenant can be granted access to. Beyond that: **accepted.** A two-person rental business cannot fund redundancy in its supplier, and pretending otherwise would be the same over-engineering P8 refuses, applied to people.

### R-08 — Cold starts versus the only latency requirement that matters
**Severity: Medium · Category: technical**

NFR-02 names exactly one performance requirement: scan-to-resolution at the counter must feel instant, because P3's thirty seconds are the reason the product exists. Nuxt server routes on Netlify run as serverless functions with cold starts, and the free plan caps synchronous execution at 10 seconds. The first scan of the morning will be the slow one, and the morning is when pickups happen.
**Mitigation:** keep the scan-resolution endpoint small and free of heavy imports so its cold start is short; the counter device is in continuous use during business hours, so functions stay warm after the first request. Measure it before launch rather than assuming. If it fails, the fix is not architecture — it is a warmed endpoint or a paid tier.

### R-09 — Vendor lock-in to Supabase
**Severity: Medium · Category: vendor**

Real but shallower than it looks, and shallow *by construction* rather than by luck. Postgres is portable and `pg_dump` is the exit. What is not portable is Supabase Auth (D-22's Operator identities), RLS policies, and Storage semantics. The reason this is Medium and not High is D-25: **domain logic lives in Nitro, not in the database.** No business rule lives in an RLS policy or an Edge Function, so migrating to any other Postgres means re-implementing authentication and re-pointing a connection string, not rewriting the domain.
**Mitigation:** D-25 is the mitigation. Keep it. The day someone puts the availability invariant in a Postgres trigger or an RLS policy, this risk becomes High and nobody will notice for a year.

### R-10 — Photograph volume breaks the free storage tier, not the database
**Severity: Medium · Category: technical**

Everyone watches the 500 MB database limit. The database is not the problem: 200 Assets, a few hundred rentals a year, and the rows are tiny. **The photographs are the problem.** FR-19 requires a ConditionReport with photographs at *both* ends of every rental. At a few hundred rentals a year, several photos per handover, a couple of megabytes each, the pilot generates multiple gigabytes a year against Supabase Free's **1 GB** of file storage and 5 GB of egress. The free tier fails within months, and it fails at the exact feature that makes deposit deductions defensible.
**Mitigation:** D-27 — photographs go to R2 (10 GB free, permanently, zero egress). Compress on upload; a ConditionReport photograph is evidence of a scratch, not a print.

### R-11 — The error tracker becomes an unmanaged copy of identity documents
**Severity: Medium · Category: legal**

NFR-08 named this trap; here is the concrete version. Sentry's **Advanced Data Scrubbing is a Business-plan feature at $80/month**. On the free Developer plan you get basic filters and the SDK's own hooks, which means server-side scrubbing is not something you can buy your way into at €0.
**Mitigation, and it is the better design anyway:** do not send it. Scrub in the SDK before transmission — no request bodies, and the ID-upload route excluded from instrumentation entirely. Vendor-side scrubbing is a promise that the data arrived and was then cleaned; SDK-side scrubbing means it never left. D-29.

### R-12 — Supabase Free pauses projects after 7 days of inactivity
**Severity: Low · Category: vendor**

A paused project is offline until manually resumed. A live rental business generates traffic, so production will not pause in normal operation — but a quiet week in January in a seasonal business is not impossible, and the rehearsal project (R-05) will pause constantly.
**Mitigation:** free and already present — D-32's nightly dump touches the database every day, which keeps it active. One mechanism, two jobs. For the rehearsal project, pausing is fine; resume it when you need it.

### R-13 — Third-country processing of EU personal data
**Severity: Medium · Category: legal, vendor**

Netlify, Sentry, Resend and Supabase are US-headquartered. The pilot processes EU consumers' identity documents. Region selection is not the whole answer — the corporate location matters for transfer mechanics — but it is most of the practical answer.
**Mitigation:** select EU regions everywhere they are offered (Supabase has EU regions; Sentry offers EU data residency; R2 supports jurisdictional restriction). Have DPAs on file — Supabase publishes one. Keep identity documents out of every system except R2, which is what D-27 and D-29 are for. This overlaps R-06's paperwork; do them together.

### R-14 — "Free tier" is a moving target
**Severity: Medium · Category: vendor**

Every number in Section 14 was verified on 18 July 2026 and several are recent: Netlify's credit rates doubled in April 2026, Resend's pricing doubled at one tier in 2024, Supabase's plan structure has moved. The architecture is not free; it is free *at today's prices*, and the whole stack is one pricing announcement away from a bill.
**Mitigation:** none available, and none warranted. **Accepted.** The exposure is bounded: the total cost of being wrong about all of it is roughly €35/month, which is smaller than one hour of the developer's time. Recording the verification date is the mitigation.

### R-15 — Chargeback horizon can outlive the current retention framing
**Severity: High · Category: legal, fraud**

Card-scheme dispute windows commonly run around 120 days and may be measured from service delivery context rather than only payment date. If retention policy is set shorter than this horizon, evidence needed for dispute defence can be erased while the cardholder can still charge back. In the worst case (stolen card used for a real pickup), the Tenant can lose both fee and asset while the strongest identity evidence has already rolled off. This risk is separate from cancellation policy and cannot be deferred behind R-01.
**Mitigation:** set the D-11 retention window with card-scheme dispute timelines in scope, not in isolation. Keep identity verification, contract acceptance record, and handover evidence available for the full dispute horizon plus documented backup horizon.

### R-16 — Per-request connection and authentication round trips on the scan path
**Severity: Medium · Category: technical**

Raised by IR-09. R-08 covers cold starts and stops there. Separately from cold start, the implemented request shape opens a fresh Postgres connection per dependency and makes a remote Supabase Auth call before any domain work begins, so a scan pays two TLS handshakes and one auth round trip against the one endpoint NFR-02 gives a latency budget. It also doubles the connections held per request against the pooler, which is the free-tier exhaustion cliff Part 5 Finding 4 named and R-08 does not cover.
**Mitigation:** D-39. The measurement task at OQ #22 is the go/no-go, and it should measure the request path as built rather than a cold start in isolation.

### R-17 — Photographic evidence is recorded without proof that it was stored
**Severity: High · Category: technical, legal**

Raised by IR-10. ConditionReport and IdentityEvidence rows name R2 object keys that nothing confirms exist, so FR-20's paired-evidence guard — the mechanism that makes a deposit deduction defensible rather than an assertion — can pass against two rows pointing at nothing. The failure is silent at capture time and surfaces only in the dispute the evidence existed for. R-10's storage-volume framing assumed the bytes arrive; this is the case where they do not.
**Mitigation:** D-40. Unconfirmed rows never count as evidence, and presigned uploads carry a content-length range so a leaked D-23 link cannot be used to fill the bucket either.

---

## 14. Initial Technology Evaluation

### 14.0 Already decided — feasibility and caveats only

Not re-recommended. Verified for feasibility, with the caveats that matter.

**Nuxt 4 on Netlify — feasible, zero-config, and genuinely well supported.** Netlify rewrote its Nuxt support for Nuxt 4 against the current Functions API; Nitro auto-detects the Netlify environment and the `netlify` preset is the default, so SSR, hybrid rendering via `routeRules`, and streaming work without configuration. **Caveats:** the `netlify-edge` preset is a different target with a history of Nitro incompatibilities and it is not needed here — do not opt into it. Server routes are serverless functions: 10-second synchronous timeout on Free, cold starts (R-08), no WebSockets. None of these bite the pilot, because NFR-12 already forbids the client-side state that WebSockets would serve and NFR-01 already accepts serverless behaviour.

**Netlify hosting — feasible, with R-03 as the price.** The credit model is the caveat and it is a large one; see R-03 and F-2. One thing worth checking before you plan around it: **if the Netlify account predates 4 September 2025 it is on legacy pricing** (100 GB bandwidth, 300 build minutes) and none of R-03 applies. Confirm which you have; it changes the risk from High to nothing.

**Websupport, DNS only — feasible and uninteresting**, which is the correct outcome for a registrar. Point the apex and `www` at Netlify, let Netlify issue and renew the certificate, and never think about it again. The only caveat is the boring one: registrar credentials are a recovery path for the whole domain, so they belong in the same care as production secrets (D-31), and the registrar account should not be the same identity as the DNS-editing automation, because there is no DNS-editing automation.

**Production-only environments — feasible for the app, sharp for the database.** See R-05. I am not adding a staging environment; I am naming the two free things that make its absence survivable — a second Supabase project as a rehearsal target, and expand/contract migrations — and recording that the risk lives entirely in schema changes, not in application deploys, because an application deploy is one click from rolled back and a dropped column is not.

### 14.1 Database, authentication → D-24

The question is not "which is more popular". It is: Part 1's domain is relational — Tenant, AssetType, Asset, Reservation, ReservationGroup, RentalAgreement, ConditionReport — with enforced foreign keys, a per-AssetType-per-day counting invariant (D-08), a paired-evidence invariant (FR-20), and a tenant invariant that must hold on every query (P2, FR-33).

| Candidate | Strengths | Weaknesses | Cost at pilot | 10-year risk |
|---|---|---|---|---|
| **Supabase** (Postgres) | Real foreign keys, constraints and transactions — the invariants of Part 1 are expressible *as* schema. RLS gives a second line for P2. Auth covers D-22 with revocable sessions. Postgres is the least exotic dependency in software. | Free tier: 500 MB DB, no backups, no PITR, pauses after 7 days idle, 2 projects. Auth and RLS are not portable. | **$0** (500 MB is ~1000× the pilot's row volume) | Supabase the company could fail; Postgres cannot. The dump restores anywhere. |
| **Firebase / Firestore** | Excellent client SDKs, generous ops quotas, mature. | Document store: **no foreign keys, no joins, no cross-collection constraints.** D-08's count, FR-20's pairing and P2's scoping would all move from the schema into application code and Security Rules — the invariants become conventions. Free tier excludes backup, restore, PITR **and TTL deletes** — the natural mechanism for D-11 erasure is behind billing. | $0, but the model fights the domain daily | Proprietary query semantics; no `pg_dump` equivalent. Exit is a rewrite. |
| **Firebase SQL Connect** (ex-Data Connect, Postgres on Cloud SQL) | Genuinely relational; Google's answer to exactly this critique. | **Not free.** The Cloud SQL trial is 90 days, after which the instance is archived and then deleted; permanent cost starts ~$9.37/month. On the free Spark plan it is capped near 8,300 operations/day. | **Fails the €0 constraint outright** | Fine technically; irrelevant here. |

**Trade-off.** Firestore is free forever and wrong for this domain; SQL Connect is right for this domain and not free; Supabase is both. That is unusually clean, and it is worth being explicit that the preference stated in the brief did not decide it — the domain did. A document store would force every invariant Part 1 spent six sections establishing to be re-implemented as application-layer convention, and P1's entire posture is that the record will be wrong often enough already without the database declining to help.

**Recommendation: Supabase.** → **D-24**

**Migration difficulty away: low for data, medium for auth.** The data is Postgres and leaves via `pg_dump` to any host. What does not travel is Supabase Auth and any RLS policy — which is why D-25 keeps the domain out of both.

### 14.2 Backend runtime and where the domain lives → D-25

| Candidate | Strengths | Weaknesses | Cost at pilot | 10-year risk |
|---|---|---|---|---|
| **Nitro server routes only** | One deployable, one language, one deploy — exactly D-02. Domain logic sits in ordinary TypeScript that is testable locally without a database. | Cold starts (R-08); 10s timeout on Free. | $0 (compute is a rounding error against 300 credits) | Nitro is portable across presets; moving off Netlify is a preset change. |
| **Supabase Edge Functions** | Close to the data; independent of Netlify's credit meter. | Deno, not Node — a second runtime, a second deploy, a second place to look. Splits the domain across two deployables, which is what D-02 refused. | $0 (500k invocations) | Deno-on-Supabase is a narrower ecosystem to be stranded in. |
| **A mix** | Each job in its "natural" home. | The worst option, and the tempting one. Two runtimes for one domain means the availability invariant can be enforced in two places and agreed in neither. | $0 | The mud ball D-02 exists to prevent, arrived by convenience. |
| **Direct client → Supabase (RLS as the boundary)** | Least code. The Supabase house style. | **Structurally violates FR-17 and P3.** If the browser writes to the database, the caller is declaring the transition, and the scan stops being an intent the domain resolves. D-08's invariant would live in RLS; D-25's whole point is that it must not. | $0 | Domain logic dissolved into policies. Unrecoverable without a rewrite. |

**Trade-off.** The only real contest is Nitro-only versus a mix, and the mix loses on D-02 rather than on anything technical. The client-direct option deserves naming because it is the default way people use Supabase and it is the one that would quietly destroy Part 1: FR-17 says no caller declares the transition, and a browser holding a service client *is* a caller declaring transitions. Scheduled work is the one genuine wrinkle — and it mostly evaporates on inspection. Pending expiry is still an explicit lifecycle transition in the domain and emits `ReservationExpired`; scheduler mechanics are an implementation concern, not a second domain semantics. What remains — W10's erasure, W6's reminders — is not latency-sensitive.

**Recommendation: Nitro server routes only. Supabase is a database with an auth service attached, not an application platform. Scheduling by GitHub Actions calling authenticated Nitro endpoints.** → **D-25**

**Migration difficulty away: low.** Nitro's preset system means another host is a build-target change.

### 14.3 Payment provider → D-26

The Tenant owns the merchant account (your answer), which removes the hardest question — no Connect, no platform account, no money touching the developer, no payment-facilitator posture. What remains is a straight gateway comparison.

| Candidate | Strengths | Weaknesses | Cost at pilot | 10-year risk |
|---|---|---|---|---|
| **Stripe** | ~1.5% + €0.25 for standard EEA consumer cards; **no monthly fee**. Hosted checkout keeps NFR-05's boundary clean. Clean refund API — W11 will need it. Documentation is exhaustive, and it is the integration Claude Code has seen a hundred thousand times. | US company (R-13). Premium/commercial EEA cards ~1.9%, non-EEA ~3.25%. | ~€1.15 on a €60 rental; **€0 fixed** | Pricing power; periodic repricing. Low switching cost though, because D-07 kept the domain free of provider vocabulary. |
| **ComGate** | Often the lowest headline card rate among SK/CZ gateways with public pricing. Local, SK/CZ methods. | **Monthly management fee** scaled to turnover — a fixed cost against near-zero volume is the wrong shape. Support in Czech. Thin SDK/docs ecosystem. | Monthly fee ≫ transaction savings at pilot volume | Small vendor; acquisition risk. |
| **GoPay** | 50+ methods, detailed public pricing, inline gateway. | Price scales *down* with turnover — i.e. worst at pilot volume. Support primarily Czech. | Poor at low volume | As above. |
| **TrustPay** | Slovak, NBS-licensed — the only candidate whose regulator is the Tenant's own. | Aimed at larger clients; integration requires building against their API; transaction fees among the higher on the market. | Poor | As above. |

**Trade-off.** The local gateways compete on percentage and lose on shape: a monthly management fee is a fixed cost, and the pilot's volume is the one thing guaranteed to be small. But the decisive argument is not price at all, and it is worth stating plainly because it is unusual and specific to this project. **The developer is one person using AI coding agents.** A Stripe integration is a thing those agents can write correctly from memory; a ComGate or TrustPay integration is a thing they will hallucinate, because the training data barely contains one. For this team, documentation ubiquity is a functional requirement, not a nicety. Against that, the honest cost of Stripe is that it is a US processor and the local ones are not.

**Recommendation: Stripe, on the Tenant's own account, with the provider-hosted payment page (NFR-05).** → **D-26**

**Migration difficulty away: low, and this is D-07's dividend.** Part 1 put an anti-corruption layer around Payments and modelled the deposit as an obligation rather than a mechanism, so no context outside Payments knows what a payment intent is. Swapping to ComGate is a Payments-internal change.

### 14.4 Object storage for photographs → D-27

Not a cost question, per your framing. It turns out to be a cost question anyway, and then stops being one — because at €0 Supabase Storage does not fit the data (R-10), so the comparison is decided before NFR-06 and NFR-07 are reached. They then agree with the answer.

| Candidate | Strengths | Weaknesses | Cost at pilot | 10-year risk |
|---|---|---|---|---|
| **Supabase Storage** | Same ecosystem, one login, one secret. RLS-integrated access control. | **1 GB free, 5 GB egress free** — R-10 blows this within months on ConditionReports alone. Shares a blast radius with the database: one leaked service key exposes the rows *and* the passports. Not covered by database backups anyway. | $0 until it isn't — then $25/mo | Coupled to Supabase's fate. |
| **Cloudflare R2** | **10 GB free permanently, zero egress, forever.** Separate account = separate blast radius (NFR-06). Object lifecycle rules give a **second line of defence for W10's silent failure**. S3-compatible, so the exit is a well-trodden path. EU jurisdiction available (R-13). | One more service, one more secret. Access control is the app's job — presigned URLs from Nitro, not RLS. | **$0**, with ~10× the headroom | Cloudflare is not going away, and S3 compatibility means the exit exists regardless. |

**Trade-off.** Part 3 told me not to add a service where one would do. One does not do: Supabase Storage's free tier is ten times too small for the photographs this product exists to capture, so "one service" was never on the table at €0. Given that R2 has to exist, its other properties are gifts rather than justifications — and one of them is worth more than the storage. **NFR-07 said erasure is not complete while a backup holds the bytes, and asked for a short, named horizon.** Photographs in R2, with no backup of the evidence bucket at all, means erasure is erasure: the ID photograph exists in exactly one place, and when W10 deletes it, it is gone. That is a cleaner answer to NFR-07 than Supabase Pro's 7-day PITR, which you cannot selectively purge.

**Recommendation: R2, two buckets.** `evidence` — IdentityEvidence, no public access ever, presigned short-lived write URLs for the Customer's D-23 link, presigned read URLs only for authenticated Operators (NFR-06), a lifecycle rule as a backstop, and **no backup**. `conditions` — ConditionReport photographs, low severity, retained with the rental record and **included in the backup**. Deliberately different rules for deliberately different data, which is the whole of D-06 expressed in buckets. → **D-27**

**Migration difficulty away: low.** S3-compatible API; the objects move with `rclone`.

### 14.5 Transactional email → D-28

| Candidate | Strengths | Weaknesses | Cost at pilot | 10-year risk |
|---|---|---|---|---|
| **Resend** | **3,000/month free** — the pilot's ~250/month sits at 8% of it. Sending pauses at the limit instead of billing you, which suits a €0 posture. Excellent docs and SDK. | Younger vendor; VC-backed and has repriced (one tier doubled in 2024); bounce handling weaker at bulk, which the pilot does not do. | **$0** | Repricing pressure; but email providers are commodities and the exit is a day's work. |
| **Postmark** | Best-in-class deliverability, and Part 1 says the return reminder is the highest-leverage lever the business has. Message streams; stable pricing for years. | **Free tier is 100/month** — unusable for production. $15/month to go live. | **Fails €0** | Owned by ActiveCampaign; stable. |
| **Supabase built-in** | Already there; no new service. | **Auth flows only** — magic links and password resets. Not for business notifications, rate-limited, and Supabase's own docs push you to custom SMTP. Using it for confirmations would put a return reminder in the same bucket as an auth email and cost you both. | $0 | Not a real candidate. |

**Trade-off.** Postmark is the better product for the one message that matters and it costs €15/month for a pilot sending 8% of a free tier. Resend's weaknesses — bulk bounce handling, youth — are aimed at a use case the pilot does not have; Part 1's Notification context is deliberately stupid, with no campaigns and no lists, which is exactly the shape Resend handles well.

**Recommendation: Resend.** → **D-28**. Revisit if return reminders land in spam, because at that point deliverability *is* the product and €15 is nothing.

**Migration difficulty away: trivial.** Notification is a generic context sending four named message kinds. It is an afternoon.

### 14.6 Error tracking → D-29

| Candidate | Strengths | Weaknesses | Cost at pilot | 10-year risk |
|---|---|---|---|---|
| **Sentry (Developer)** | 5,000 errors/month, 30-day retention, 1 user — enough for a two-Operator pilot. EU data residency available (R-13). SDK-level scrubbing hooks. **Sentry Crons** detects a scheduled job that did not run, which is exactly W10's silent failure. | **Advanced Data Scrubbing is Business, $80/month** (R-11). 1 user. Events are silently dropped once the quota is spent — a bad deploy can blind you for the rest of the month. | **$0** | Repricing; the free tier has held for years. |
| **Netlify built-in logs** | Already there, no new service, no PII leaving to a third party. | **24-hour function log retention on Free**, no grouping, no alerting, no stack-trace aggregation. It is a log tail, not error tracking. Does not satisfy NFR-14. | $0 | n/a |
| **Self-hosted Sentry / GlitchTip** | No third-country transfer; no quota. | Self-hosted Sentry needs Postgres, Redis, Kafka and ClickHouse — an operational estate several times larger than the product it watches, run by one person. Directly contradicts P8 and NFR-13. | Server cost + all the developer's time | You now maintain two systems. |

**Trade-off.** Netlify's logs are free and are not the capability NFR-14 asked for. Self-hosting solves R-13 and creates a bigger problem than the one it solves. Sentry's free tier is sufficient and its one relevant gap — server-side advanced scrubbing behind a $80 wall — is a gap you should not want to close by paying, because vendor-side scrubbing means the passport arrived and was then cleaned.

**Recommendation: Sentry Developer, with NFR-08 enforced in the SDK, not in the vendor.** → **D-29**. Concretely: `sendDefaultPii: false`, no request bodies, a `beforeSend` that drops events from the evidence-upload route entirely, and per-key rate limiting so one bad deploy cannot spend the month's quota in an hour. Use Sentry Crons on the W10 job as a second signal alongside FR-40 — belt and braces on the one failure that is silent by construction.

### 14.7 Schema migrations → D-30

**Candidates:** (a) Supabase CLI migration files applied from GitHub Actions on merge to `main`; (b) Supabase CLI applied manually from the developer's laptop; (c) SQL typed into the Supabase dashboard.

(c) is how most Supabase projects actually start and it is disqualified by NFR-13 before it is disqualified by anything else: a schema that exists only in a production database is not greppable, not reviewable, and not something a coding agent can reason about. (b) works and fails at exactly the wrong moment — the laptop is the only thing that knows what shipped, and there is no record of when. (a) costs a workflow file.

**Recommendation: (a).** Migrations are files in the repository, reviewed in the diff, applied by GitHub Actions on merge, rehearsed first against the second free Supabase project (R-05), and written expand/contract so that no single deploy is destructive. → **D-30**

**Migration difficulty away: none.** They are SQL files. That is the point.

### 14.8 Secrets → D-31

Not a comparison; a split, stated once so it is not improvised.

**Never in the repository, ever:** the Supabase service-role key, the R2 access key, the Stripe secret key and webhook signing secret, the Resend API key, the Sentry auth token, the Websupport registrar credentials. **Local:** `.env`, git-ignored, developer's machine only. **Production:** Netlify environment variables, scoped to the deploy context, with `NUXT_`-prefixed variables mapping into `runtimeConfig`. **Database-side:** Supabase project secrets, used by nothing in this design, because D-25 puts no logic in the database — an empty box is the correct state and worth noting so nobody fills it.

Two things that are not obvious. **The Stripe key is the Tenant's, not the developer's** (your ownership answer), which makes it the one secret whose compromise costs someone else money — treat its rotation as a two-party event. And **the service-role key bypasses RLS entirely**, so it is the single credential that renders D-24's second line of defence irrelevant; it exists only in Netlify's environment and never reaches a browser. Netlify's Smart secret detection, which would catch a leak of exactly this kind, is a **Personal-plan ($9) feature** — noted because it is the second time that €9 has bought something worth having (R-03 is the first).

**Recommendation: as split above.** → **D-31**

### 14.9 Backups at €0 → D-32

Forced by F-1. Not in your list of open topics, which is why it needs to be.

**Candidates:** (a) Supabase Pro at $25/month for daily backups with 7-day retention; (b) nightly `pg_dump` from a GitHub Actions scheduled workflow into R2; (c) accept no backups.

(c) is not available — the database holds the rental and accounting history that D-11 explicitly requires be retained when the evidence is erased, and R-05 makes loss plausible rather than theoretical. (a) satisfies NFR-03 exactly as written and costs €25/month against a hard €0 constraint, and it brings NFR-07 baggage: a 7-day PITR window containing data you have promised to erase, which you cannot selectively purge. (b) costs a workflow file and runs inside GitHub Actions' free minutes.

**Recommendation: (b).** Nightly `pg_dump` to R2, retained for a **named horizon** — the number NFR-07 asked for and which must be written down next to D-11's window, because their sum is the promise. → **D-32**

Three properties of (b) that make it better than a workaround. It gives a **more honest NFR-07 answer than the paid tier**, because you set the horizon and you can prove the rollover. It **keeps the Supabase project alive**, retiring R-12 for free. And it produces a plain SQL file in an account that can be handed to the Tenant, which is the only concrete mitigation R-06 and R-07 have. The `conditions` bucket is backed up on the same schedule; the `evidence` bucket is not, deliberately (D-27).

**Migration difficulty away: none.** It is `pg_dump`.

---

## 15. Architecture Decision Log

The map. Every decision from D-01, with its owning part and status. Reasoning is not repeated — the Part and Section column is where it lives.

| ID | Decision | Owning part | Status |
|---|---|---|---|
| D-01 | Multi-tenant *model*, single-tenant *operations*. Tenant identity on every aggregate from day one; no tenant management surface. | P1 §1 | accepted |
| D-02 | Contexts are modules in one deployable, not services. | P1 §2 | accepted |
| D-03 | Catalog is a separate context from Asset Registry. | P1 §4 | accepted |
| D-04 | Reservations bind to AssetType; the Asset instance is chosen at the counter. | P1 §4 | accepted |
| D-05 | Condition & Settlement merged into Handover & Possession for MVP. | P1 §4 | accepted — revisit when settlement stops being simultaneous with return |
| D-06 | Customer Identity & Compliance is its own context, not fields on Customer. | P1 §4 | accepted |
| D-07 | Deposit is a DepositObligation the platform records, not a Payment it processes. Verified against card holds. | P1 §6 | accepted |
| D-08 | Strict no-overbooking. No buffer. | P1 §6 | accepted |
| D-09 | The final RentalDay is consumed; the Asset rejoins the pool the next day. | P1 §6 | accepted |
| **D-10** | **Append-only event history for Possession and condition; ordinary mutable state elsewhere; not system-wide event sourcing.** Written in §16 reconciliation due to frozen Parts 1–3. | P4 §16 (supersedes missing pointer from P1 §2) | accepted |
| D-11 | IdentityEvidence retained for Possession plus a dispute window, auto-erased; longer only with a named statute and basis in writing. | P1 §6 | accepted — **value launch-blocking (R-02)** |
| D-12 | No `rentalGranularity` property on AssetType. RentalPeriod owns its own arithmetic instead. | P1 §6 | accepted |
| D-13 | *n* Reservations plus a ReservationGroup. Never an Order. | P1 §4 | accepted |
| D-14 | Guest checkout; a Customer record belongs to exactly one ReservationGroup and is never deduplicated. | P2 §7 | accepted |
| D-15 | IdentityEvidence submitted after payment, required before HandoverOut; verification at the counter. | P2 §8 | accepted |
| D-16 | No Operator roles. Mandatory attribution instead. | P2 §7 | accepted — trigger is the third Operator |
| D-17 | Overdue notifies the Customer and surfaces to an Operator ranked by the Reservation it threatens. No automatic escalation, no automatic LostAsset. | P2 §8 | accepted |
| D-18 | Reservation states are Pending, Confirmed, Cancelled, Expired. No Fulfilled, ever. | P2 | accepted — expiry evaluated lazily per D-25 |
| D-19 | In-process domain events only. Integration events deferred until a second consumer exists. | P2 §9 | accepted |
| D-20 | UI strings externalised from day one; Catalog content single-valued Slovak. Never `name_sk`. | P3 §12 | accepted |
| D-21 | Currency lives on every monetary amount. EUR only in the pilot. | P3 §12 | accepted |
| D-22 | Operators authenticate individually. Authentication is not authorisation; no roles. | P3 | accepted |
| D-23 | Tokenised, expiring, single-purpose Customer link. View booking, submit ID. Never read evidence back. | P3 | accepted |
| **D-24** | **Supabase (Postgres) for database and auth. Not Firebase.** Cross-row aggregate invariants (D-08) are not assumed to be enforced by schema alone; see D-33 for enforcement mechanism. | P4 §14.1 | accepted |
| **D-25** | **Domain logic lives in Nitro server routes only. No client→database access, no logic in RLS or Edge Functions.** | P4 §14.2 | accepted |
| **D-26** | **Stripe, on the Tenant's own merchant account, provider-hosted payment page.** | P4 §14.3 | accepted |
| **D-27** | **Cloudflare R2, two buckets: `evidence` (unbacked, lifecycle backstop) and `conditions` (backed up).** | P4 §14.4 | accepted |
| **D-28** | **Resend for transactional email.** | P4 §14.5 | accepted |
| **D-29** | **Sentry Developer, with PII scrubbed in the SDK rather than by the vendor.** | P4 §14.6 | accepted |
| **D-30** | **Migrations are files in the repo, applied by GitHub Actions, rehearsed on a second free project, expand/contract only.** | P4 §14.7 | accepted |
| **D-31** | **Secrets: `.env` local, Netlify env vars in production, nothing in the repo, service-role key never client-side.** | P4 §14.8 | accepted |
| **D-32** | **Nightly `pg_dump` to R2 via GitHub Actions, with a named retention horizon. Satisfies NFR-03's intent at €0.** | P4 §14.9 | accepted — **horizon value open** |
| **D-33** | **Per-(AssetType, day) hold counter maintained in the same transaction as Reservation creation, enforcing D-08 under concurrency.** | P4 §16 | accepted — implemented; verified by OQ #23 |
| **D-34** | **Banned terms and dependency direction enforced in CI; the build fails on violation.** | P4 §16 | accepted — **not implemented (IR-03)** |
| **D-35** | **Terms acceptance recorded on ReservationGroup before payment, with version and timestamp.** | P4 §16 | accepted — mechanics implemented; terms content and pre-contractual catalogue open (OQ #1) |
| **D-36** | **Provisional RetentionDeadline at creation, re-anchored at Settlement; no evidence without an active deadline.** | P4 §16 | accepted — implemented; blocked on the window value (OQ #2) |
| **D-37** | **Payment after Pending expiry re-acquires atomically; on failure, auto-refund and notify.** | P4 §16 | accepted — implemented |
| **D-38** | **Availability capacity is the size of the rentable pool, not the count of Assets currently in Rentable status.** | P4 §16.2 | accepted — supersedes the literal reading of D-08's "Rentable Assets" |
| **D-39** | **Reused database client and locally verified Operator sessions on the request path; remote verification retained for evidence access.** | P4 §16.2 | accepted — **token lifetime open (OQ #25)** |
| **D-40** | **A photograph counts as evidence only once its object is confirmed stored; presigned uploads are size-bounded.** | P4 §16.2 | accepted — **size value open (OQ #26)** |
| **D-41** | **Every internal scheduled endpoint records a job run; one ledger serves FR-40 and FR-44.** | P4 §16.2 | accepted |
| **D-42** | **FR-38's cookie banner is superseded: every cookie this platform sets is strictly necessary, so no consent banner is obligatory.** | P4 §16.2 | accepted — supersedes FR-38; resolves OQ #28 |

### Long-term implications and migration difficulty — D-24 to D-32

Section 14 carries the candidates, the costs and the reasoning; repeating them here is how documents rot. What that section does not say is what each decision does to the *ten-year* shape of the system, and what it costs to reverse. That is this table's job.

| ID | Long-term implication | Migration difficulty if wrong |
|---|---|---|
| D-24 | The invariants of Part 1 live in the schema rather than in convention, which is what makes P1's "the record will be wrong" survivable — the database refuses the impossible even when the code forgets. Multi-tenancy (D-01) becomes an RLS policy plus a query predicate rather than a rewrite. | **Low for data** (`pg_dump` to any Postgres), **medium for auth** (Supabase Auth is not portable; D-22's two seats are re-created by hand, which at two rows is an afternoon). |
| D-25 | This is the decision that keeps D-02 true in practice and keeps R-09 at Medium. Contexts stay modules because there is one place they can live. The day a business rule enters an RLS policy, extraction becomes archaeology and nobody notices for a year. | **Low.** Nitro presets make the host a build target. Moving the domain later is not a migration; it is a deployment change. |
| D-26 | D-07 already made the deposit a domain obligation rather than a provider mechanism, so the card-hold extension (A-06) is a Payments-internal change whichever provider is in place. The Tenant owning the account means the money rail outlives the developer (R-07). | **Low**, and this is D-07's dividend — the anti-corruption layer means no context outside Payments knows what a payment intent is. |
| D-27 | The separation of `evidence` from `conditions` is D-06's boundary made physical: the highest-severity data has its own account, its own lifecycle, its own blast radius, and no backup. P7's promise becomes checkable rather than aspirational — you can point at one bucket and one rule. | **Low.** S3-compatible; `rclone` moves it. |
| D-28 | Notification stays commodity, which is what Part 1 wanted when it called the context deliberately stupid. No preference centre, no templates, nothing to migrate. | **Trivial.** Four named message kinds. |
| D-29 | Scrubbing in the SDK rather than at the vendor means NFR-08 holds regardless of which error tracker exists in five years, and regardless of what that vendor's free tier includes. The constraint travels with the code, not with the contract. | **Low.** The scrubbing hooks are the asset; the vendor is not. |
| D-30 | The schema becomes reviewable history rather than the current state of a production database — which is the single thing NFR-13 needs most, because an agent can read a migration and cannot read your memory of last Tuesday. | **None.** They are SQL files. |
| D-31 | The service-role key being the one credential that bypasses RLS makes it the system's real boundary; naming that now is what stops it appearing in a browser bundle in month eight. | **None.** |
| D-32 | The backup horizon becomes a privacy value, not an operations value — NFR-07's sum. Owning the mechanism rather than inheriting a PITR window is what makes D-11's promise provable. | **None.** It is `pg_dump`. |

---

## 16. Reconciliation with Part 5 (Independent Review)

Parts 1–3 are frozen, so findings from Part 5 are reconciled here through additive decisions and clarifications.

### D-10 — Event-history scope (written now)

Part 1 P4 referenced D-10 without text. The missing decision is now explicit: append-only event history is required for Possession, ConditionReport, and attestation facts where historical sequence is evidence; it is not required system-wide. Other contexts use ordinary mutable state.

Correction semantics are explicit: attestation facts carry both occurred-at and recorded-at timestamps, corrections append superseding facts, and derived conditions use occurred-at.

### D-33 — Enforcement mechanism for D-08 aggregate invariant

The D-08 invariant (active reservations per AssetType per day never exceed rentable count) is not enforced by simple schema constraints alone. MVP enforcement is a transactional per-type-per-day hold counter updated in the same transaction as Pending creation and release, with database checks against rentable capacity.

### D-34 — Terminology and boundary discipline enforced in CI

Banned terms and boundary direction are linted in CI. Build fails on banned identifiers and on dependency direction violations against the context map.

### D-35 — Contract acceptance and durable-medium record

Terms acceptance is mandatory before payment. ReservationGroup stores terms version and acceptance timestamp, and confirmation message includes durable-medium reference to accepted terms.

### D-36 — Retention edge rules for non-settled flows

IdentityEvidence gets a provisional deadline at creation. SettlementCompleted re-anchors the deadline. Non-settled paths keep finite retention; no evidence item exists without an active deadline.

### D-37 — Payment-received-after-expiry handling

When payment arrives after Pending expiry, the platform atomically attempts to re-acquire the same RentalDays. On success, confirm. On failure, auto-refund and notify.

### 16.1 AI implementation contract (Claude Code / Copilot / similar)

This section is normative for AI-generated implementation work.

**Precedence order when instructions appear to conflict**
1. Part 4 §16 reconciliation decisions (`D-10`, `D-33`…`D-37`).
2. Part 3 FR/NFR requirements.
3. Part 2 workflows and event catalogue.
4. Part 1 Ubiquitous Language and boundary definitions.

**Blocked work rule**
If an item is marked launch-blocking and unresolved in the Open Questions appendix, agents must not invent policy defaults. They may implement scaffolding, but must leave behaviour behind explicit feature flags or "not implemented" guards tied to the open-question ID.

**Database and boundary rule**
Client code must not write domain state directly to Supabase. Business invariants are enforced in server-side domain logic with explicit tests, and cross-row invariants (D-08) must use the D-33 mechanism.

**Traceability rule for generated changes**
Every non-trivial code change must cite at least one governing identifier in commit message or PR notes (for example `FR-29`, `D-33`, `NFR-08`). If no identifier can be cited, the change is out of scope.

## 16.2 Reconciliation with the implementation review (04 August 2026)

The codebase was reviewed against Parts 1–5 after milestone M4. The findings are in `docs/reviews/implementation-review-2026-08-04.md` as `IR-01`…`IR-13`; four of them require a decision rather than a task, and those four are written here. The rest are implementation work against decisions and requirements that already exist — IR-03 is D-34, IR-04 is D-32, IR-05 is D-29, IR-08 is FR-02, IR-11 is FR-10 mechanics — and are tracked as issues rather than as new ADRs, because a decision that already says what to do does not need restating in order to be done.

Parts 1–3 remain frozen. D-38 and D-42 are the only two of these that touch a frozen part's language, and both do so as a stated supersession — of a reading, for D-38; of the requirement itself, for D-42 — rather than as an edit to Parts 1–3.

### D-38 — Availability capacity is the rentable pool, not the current Rentable status count

**Raised by:** IR-01 (Critical).

**Considered:** (a) capacity is the number of Assets whose status is Rentable, which is the literal reading of D-08 and what is implemented; (b) capacity is the number of Assets *in the pool* — Rentable, InPossession and UnderInspection — excluding Unavailable and Retired; (c) capacity is projected per day from a forward model of each Asset's expected status.

**Trade-offs:** (a) conflates the two clocks Part 1 §3 calls the most important distinction in the domain. An Asset handed out today is InPossession for the duration of its Possession, while the Reservation that authorised the handover has *already* consumed a day in `asset_type_day_holds`. The same unit is subtracted twice, and it is subtracted from every future day rather than only from the days it is actually out. The direction of the error is quiet: availability is under-reported, and the pilot refuses bookings for days that are free. (c) is a projection engine — speculative structure of exactly the kind P8 refuses, and it would additionally require the system to predict a return date it has already declined to trust (P1). (b) costs one changed query and one changed sentence.

**Recommended: (b).** Capacity for an AssetType is the count of its Assets in Rentable, InPossession or UnderInspection status. Unavailable and Retired are excluded.

**Why:** `asset_type_day_holds` is already the per-day commercial ledger, and D-33 already makes it authoritative under concurrency. Capacity is the *physical* quantity that ledger is measured against, and pool membership is a durable fact about a unit rather than a statement about where it is standing this afternoon. Unavailable and Retired are excluded precisely because they *are* statements that the unit has left the pool. The consequence is one the specification already committed to elsewhere: an Overdue Asset does not reduce future capacity — the shortfall it threatens is surfaced by FR-29's ranking, exactly as Part 5 Finding 12 framed it and as `server/utils/overdue-noshow-views.ts` already computes. The current query silently contradicts that view.

**What this supersedes, precisely.** Not D-08, whose invariant is unchanged and whose strictness is unchanged. What is superseded is the literal reading of the phrase "Rentable Assets of that type" in D-08 and FR-03/FR-04, which Part 1 wrote before Handover & Possession existed to move Assets out of Rentable status; at that time the two readings were indistinguishable. Every occurrence of that phrase in Parts 1–3 is to be read as "Assets of that type in the rentable pool", as defined here.

**Obligation:** the D-08 test set that CLAUDE.md already makes mandatory gains one case — a HandoverOut does not change availability for any day outside the Reservation's own RentalPeriod.

**Left open:** an Asset marked Unavailable leaves the pool immediately and for all future days. Whether a damaged unit with a known return-to-service date should instead leave the pool only until that date is a real question and is deferred as OQ #24; the answer affects only Unavailable, never the handover path.

### D-39 — Connection reuse and session verification on the request path

**Raised by:** IR-09 (Medium), R-16.

**Considered:** (a) a Postgres client created and ended per dependency per request, with the Operator session verified by a remote Supabase Auth call on every request — what is implemented; (b) a module-scope client reused across invocations, one client per request shared by every dependency, and local verification of the access token's signature and expiry, with the remote call reserved for the refresh path; (c) an external connection pooler or proxy in front of Supavisor.

**Trade-offs:** (a) is simple and honest and its comments justify it by NFR-04's refusal of scaling apparatus, which is a fair reading of the wrong thing: postgres.js already owns a pool, so creating one per request does not avoid apparatus, it discards apparatus that already exists. The cost lands on the one endpoint the whole product is organised around — a scan pays an auth round trip plus two connection setups before any domain work starts (NFR-02, P3) — and it holds two pooler connections per request where one would do, which is Part 5 Finding 4's exhaustion cliff. (c) is apparatus NFR-04 genuinely does refuse, at a load that is a rounding error.

**Recommended: (b).**

**Why:** the latency requirement is not general; there is exactly one, and this is the path it names. Reuse costs nothing structural and removes both fixed costs from that path.

**The honest cost, stated so nobody discovers it later.** Local verification means a revoked session stays usable until its access token expires, so NFR-09's revocability becomes revocability *within a bounded lag* rather than immediately. That lag is the access token's lifetime and it must be a named value (OQ #25). Two carve-outs keep the trade acceptable: the refresh path always goes to Supabase Auth, so revocation is real at every refresh; and any route that hands out a presigned read URL for IdentityEvidence keeps the remote check, because NFR-06 is the requirement that bought individual authentication in the first place (D-22) and it is the one place where a lag is not affordable.

**What must not change:** `prepare: false` stays. It is required by Supavisor's transaction pooling (D-24, D-25 §14.2) and is unaffected by this decision; a reused client makes it *more* important, not less.

### D-40 — A photograph is evidence only once its object is confirmed stored

**Raised by:** IR-10 (High), R-17.

**Considered:** (a) record the ConditionReport or IdentityEvidence row when presigned URLs are issued and treat it as complete — what is implemented; (b) record the row unconfirmed, confirm the object's presence in a second step, and count only confirmed rows as evidence; (c) proxy uploads through Nitro so the server sees the bytes.

**Trade-offs:** (a) allows FR-20's paired-evidence check — "no deduction without both reports", the mechanism that makes a deduction defensible rather than a shouting match (P1 corollary, W8) — to pass against two rows naming objects that do not exist. That is worse than an absent check, because it manufactures confidence at the exact moment a dispute requires the opposite. (c) puts multi-megabyte bodies through a serverless function with a 10-second synchronous cap (R-08) and pays egress twice; it also breaks the reason R2 was chosen for photographs at all (D-27, R-10). (b) costs one column, one confirmation call and one sweep.

**Recommended: (b).** A photograph row is created unconfirmed. A confirmation step verifies the object exists before the row counts as evidence. FR-20 counts confirmed reports only. Unconfirmed rows older than the presigned URL's own lifetime are swept, and the sweep records its run under D-41.

**Why:** P1 says the system is a ledger of claims about the physical world. An object key is a claim that a photograph exists, and this is the one place where the claim is cheap to check against the world it describes — a single HEAD against a bucket the platform controls. Everywhere else in this system the physical world is genuinely unobservable and correction is the answer (P1, FR-24); here it is observable, and declining to look is the failure.

**Second, smaller obligation in the same place.** Presigned uploads currently constrain content type and not content length. The D-23 link is by design a bearer token that lands in an inbox (its risks are accepted there), and it grants an upload URL against a 10 GB free tier (R-10). Presigned uploads carry a content-length range; the value is OQ #26.

### D-41 — Scheduled jobs record their runs

**Raised by:** IR-06 (High).

**Considered:** (a) a bespoke last-run marker for the erasure job, which is the only job FR-40 names; (b) a job-run ledger written by every internal scheduled endpoint; (c) rely on GitHub Actions run history and Sentry Crons.

**Trade-offs:** (c) is not availability to the owner, which is what FR-40 asks for — it is availability to the developer, in two third-party consoles, one of which retains logs for a bounded period. It also fails R-07's test: the Tenant cannot see it. (a) satisfies the Must and leaves the sweep, the three reminder dispatchers and the D-32 backup with the same silent-failure shape and no answer. (b) costs one table.

**Recommended: (b).** Each internal scheduled endpoint writes a row: job name, started-at, finished-at, outcome, and a count of whatever it processed.

**Why:** NFR-14's argument for FR-40 was that W10's erasure is the only failure in the system that is silent by construction. That was true of the system as specified; as built there are now six scheduled jobs and the argument applies to all of them — a reminder dispatcher that stops running is silent in exactly the same way, and its consequence is the return reminder that Part 1 §4 calls the highest-leverage operational lever the business has. One ledger serves FR-40 (Must) and most of FR-44 (Should), and Sentry Crons (D-29) stays as the independent second signal rather than the only one.

**Boundary:** this is an operations record, not a domain event. It is not in Part 2's catalogue, nothing reacts to it, and it carries no Tenant-scoped domain meaning — it is platform housekeeping, in the same category as a log.

### D-42 — FR-38's cookie banner is superseded by an accurate cookie inventory

**Raised by:** IR-13 (Low), OQ #28.

**Considered:** (a) implement FR-38 as written — a banner declining non-essential cookies by default; (b) run the cookie inventory FR-38's own issue asked for once IR-05 (Sentry) and IR-12 (frontend) landed, and let the inventory's result decide whether a banner is the accurate obligation.

**Trade-offs:** (a) builds a UI surface, a consent-state cookie of its own, and a piece of user friction against cookies that, on inspection, need no consent in the first place — training Visitors to click through a banner that protects nothing is worse than not asking, because it teaches the same reflex for the day a banner *does* matter. (b) costs one audit.

**The inventory.** Every cookie this platform sets, found by grepping every `setCookie` call in `server/`: `ht_operator_at` / `ht_operator_rt` (`server/utils/operator-session.ts` — the Operator's own session, D-22) and `ht_checkout_group` (`server/utils/checkout-session.ts` — scopes the checkout → accept-terms → pay sequence to the browser that started it, D-14). All three are httpOnly, first-party, and set only in service of an action the person in front of the browser explicitly took (logging in as an Operator; starting a checkout) — the ePrivacy Directive Article 5(3) "strictly necessary for the service explicitly requested" exemption, which is what FR-38 exists to satisfy compliance with in the first place. No analytics, no advertising, no third-party embed sets anything. Client-side code sets no cookie of its own (`app/` has no `document.cookie` or `useCookie` call).

**A second thing the inventory found, and where it does *not* belong.** `sentry.client.config.ts` (D-29/IR-05) shipped with Sentry's default client integrations, which include automatic browser-session tracking — a network beacon to Sentry on every page load and route change, for every Visitor, not only ones who error. Read directly against the installed SDK: this touches no cookie and no `localStorage`/`sessionStorage`, so it does not implicate FR-38 at all. It is real, though — it is a per-Visitor request to a third-party processor — and it belongs in OQ #4's controller-processor conversation, not this one. Disabled pending that conversation (issue #81), since NFR-04 already scoped Sentry to "error tracking only" and nobody had opted into session tracking specifically.

**Recommended: (b), with the answer now known.** No cookie this platform sets requires consent. FR-38 is superseded: no banner is built.

**Why:** a banner is the mechanism FR-38 named to satisfy the underlying legal obligation (consent for non-essential storage) — it was never the obligation itself. Where the underlying obligation doesn't bind, building its named mechanism anyway is cargo-culting a compliance UI onto a system that doesn't need one, at the direct cost Part 1 §4 warns against elsewhere in this spec: a control that exists for its own sake trains the person subject to it to stop reading it.

**What this supersedes, precisely.** FR-38 itself ("A cookie banner, declining non-essential by default"), not NFR-10 (the ePrivacy compliance obligation NFR-10 points at) — NFR-10 is satisfied *by* this inventory, not superseded by it. If a future cookie is ever added that is not strictly necessary (a real analytics tool, a marketing pixel), this decision no longer covers it and FR-38's obligation re-attaches to that specific addition.

**Obligation, replacing the banner:** the privacy notice (OQ #4's own paperwork) carries a maintained statement of exactly what is set and why — the three cookies named above, kept current as this inventory would need to be redone if a fourth is ever added.

**Left open:** OQ #4 (controller–processor agreement) is untouched by this decision — Sentry's per-Visitor session beacon, disabled here, is exactly the kind of processor relationship that conversation needs to cover once (if) it is re-enabled.

## Appendix — Open Questions

The pre-build checklist. Everything still open across Parts 1–4, flattest form, with where the context lives.

### Launch-blocking — the pilot cannot go live with these unanswered

| # | Question | Context |
|---|---|---|
| 1 | Cancellation and refund policy: does the distance-contract withdrawal right apply to short-term equipment hire, and on what terms? A lawyer, not an architect. | P1 launch-blocking · P3 §10 · R-01 |
| 2 | The IdentityEvidence retention window: the number **and** the lawful basis, in writing, recorded in the spec, set with card-scheme dispute timelines in scope. | D-11 · P3 §12(e) · R-02 · R-15 |
| 3 | The backup retention horizon value. Sum with #2 is the actual promise made to customers. | NFR-07 · D-32 |
| 4 | Is there a written controller–processor agreement between the Tenant and the developer, naming sub-processors? | R-06 · R-13 |
| 27 | The Customer-record retention period **and** its basis (accounting/limitation statute), recorded the way D-11 requires. Same lawyer, same conversation as #2 — the records exist in production today with no clock (IR-07). | P7 · Part 5 Finding 6 · IR-07 |

### Decisions with values still unset

| # | Question | Context |
|---|---|---|
| 5 | LostAsset threshold value. Gates a prompt, never a transition. | D-17 · P3 §12(e) |
| 6 | Pending expiry window value. Platform-scoped; couple it to Stripe's session timeout. | D-18 · P3 §12(e) |
| 7 | Reminder schedule values. | A-08 · P3 §12(e) |
| 8 | Verify D-33 implementation under concurrency on the chosen pooler/transaction mode and document retry semantics. | D-33 · D-24 · D-25 |
| 9 | Is the Netlify account pre- or post-4 September 2025? Legacy pricing retires R-03 entirely. | §14.0 · R-03 |
| 10 | Confirmation of A-10 — does the EAA micro-enterprise exemption actually apply? | NFR-11 · A-10 |
| 24 | Does an Asset marked Unavailable leave the pool for all future days, or only until a recorded return-to-service date? Affects Unavailable only, never the handover path. | D-38 · IR-01 |
| 25 | The Operator access-token lifetime — i.e. the revocation lag D-39 accepts in exchange for removing a remote auth call from the scan path. | D-39 · NFR-09 · IR-09 |
| 26 | Maximum accepted photograph size for presigned uploads, for both buckets. | D-40 · R-10 · IR-10 |

### Deferred design work — decided in principle, not designed

| # | Item | Trigger / context |
|---|---|---|
| 11 | W11 cancellation and refund workflow. | Unblocked by #1 |
| 12 | Dispute management. | D-05's split: settlement stops being simultaneous with return |
| 13 | Hourly rental granularity. | D-12 · A-04 · a Tenant needing intra-day turnover |
| 14 | Card pre-authorisation deposits, and hold expiry against an Overdue Possession. | D-07 · A-06 — the one genuinely new policy question |
| 15 | Automated identity verification. | D-15 — would move IdentityVerified online |
| 16 | Integration events, schemas, versioning. | D-19 — the API consumer exists |
| 17 | Restricted Operator roles. | D-16 — the third Operator, or the first outward money movement |
| 18 | Quantity-tracked AssetTypes. A model change, not a feature. | A-07 |
| 19 | Claims exceeding the deposit; late fees; VAT. | P1 deferred |

### Future extension points — named with triggers, no design

All from P3 §12(d), reproduced flat so the checklist is complete: per-tenant branding (2nd Tenant) · per-tenant pricing rules (2nd Tenant with a different pricing *model*, not a weekend discount) · weekend and tiered rates (same) · deposit rules beyond a flat amount (a Tenant whose deposit varies) · notification templates per tenant (2nd Tenant) · external API (the API consumer; also D-19's trigger) · custom domains (2nd Tenant selling under their own brand) · translated Catalog content (D-20; first second-locale market) · multi-currency pricing and FX (D-21; a Tenant in a second currency) · hourly rental (D-12) · card holds (A-06).

The pattern P3 named holds: almost every trigger is "the second Tenant", and none is "the pilot owner asks nicely".

### Raised by Part 4 and needing a human answer before build

| # | Question | Context |
|---|---|---|
| 20 | Do you accept F-2 — that at €0 the availability failure mode is "the rest of the month", not "hours"? €9/month retires it. | F-2 · R-03 |
| 21 | Does the Tenant get access to the R2 backup bucket, or does the bus factor stay fully with you? | R-07 · D-32 |
| 22 | Measure cold-start scan-to-resolution against NFR-02 before launch. Not a question — a task with a go/no-go attached. | R-08 · NFR-02 |
| 23 | Run a concurrent-booking test: two simultaneous holds on the last available unit, prove one succeeds and one fails without oversell. | D-33 · D-08 |