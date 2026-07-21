# Architecture Foundation Specification
## Part 3 — Requirements & Extensibility

| | |
|---|---|
| **Status** | Draft — authoritative for scope and posture |
| **Scope** | Sections 10–12 only. Technology selection, ADRs and review remain out of scope. |
| **Depends on** | Parts 1 and 2, both **frozen**. Their Ubiquitous Language, decisions and tags are normative and are referenced, never restated or renumbered. |
| **Adds** | Decisions `D-20`…`D-23`. Assumption `A-10`. Requirements `FR-01`…`FR-46` and `NFR-01`…`NFR-14`, all greppable. One glossary addition. |

### Contradictions with Parts 1 and 2

**None.** Three places look like one and are not, and they are named here so that nobody — human or agent — resolves them the wrong way.

**Operator seats are not the Tenant & Access surface.** D-22 requires each Operator to authenticate individually, and Part 1 tags "staff accounts, roles, per-tenant configuration" as `[Future]`. This is D-01's pattern, not a violation of it: the Operator *seat* exists in the model from day one, exactly as the Tenant identifier does, while the *management surface* — inviting, assigning, deactivating — does not exist at all. Two rows are created by hand. **Authentication is not authorisation**; D-16 stands unamended, there are no roles, and every Operator may still do anything the product can do.

**Automatic retention erasure is not a GDPR request surface.** W10's scheduled erasure is `[MVP]` and non-negotiable (P7, D-11). Handling a *data subject's* access, erasure or portability request by email to the owner is a separate thing and is deferred per your posture. The first is a clock the platform runs; the second is a person answering mail. Deferring the second does not soften the first.

**"No compliance regime beyond GDPR basics" is a conclusion, not a premise.** It is true only while card data never touches the platform. That is why NFR-05 is written as a floor rather than a preference: the posture you asked for depends on it.

---

## 10. Functional Requirements

This section invents nothing. With the four exceptions marked `[new]` — the ones you allowed, plus the two decisions you delegated — every requirement below is a projection of an `[MVP]` tag from Parts 1 or 2 into testable form, and the **Source** column is the proof. If a requirement has no source, it should not be here.

MoSCoW is used strictly. **Must** means the pilot cannot operate. **Should** means the pilot operates worse. **Could** means it would be nice and nobody is blocked. **Future** means not this year, and carries Part 1's `[Future]` tag with the same force: it must not appear in code.

### Must

| ID | Requirement | Source |
|---|---|---|
| FR-01 | Catalog publishes AssetTypes carrying description, day rate, deposit amount and publication state. | P1 §4 |
| FR-02 | A Visitor browses published AssetTypes and sees availability and DepositObligation without identifying themselves and without leaving a record. | W1, P2 §7 |
| FR-03 | Availability is computed per AssetType per RentalDay from Rentable Assets minus active Reservations, on demand, and is never written onto an Asset. | D-08, P1 §6 |
| FR-04 | Active Reservations never exceed the Rentable count for an AssetType on any day. Strict; no buffer. | D-08 |
| FR-05 | The final RentalDay of a RentalPeriod is consumed; the Asset rejoins the pool the following day. | D-09 |
| FR-06 | A checkout covering *n* AssetTypes produces one ReservationGroup and *n* Reservations, each holding its own RentalPeriod. | D-13 |
| FR-07 | A Reservation is created Pending and holds its RentalDays immediately. States are Pending, Confirmed, Cancelled, Expired — and nothing else. There is no Fulfilled. | D-18 |
| FR-08 | A Pending Reservation that is not paid within the expiry window becomes Expired and releases its RentalDays. If payment arrives after expiry, the system atomically re-acquires the RentalDays; if re-acquire fails, payment is refunded automatically. | D-18 |
| FR-09 | One card payment covers exactly one ReservationGroup. Partial payment is not representable. Payment may start only after terms acceptance is recorded on the ReservationGroup with timestamp and terms version. | W2, D-13 |
| FR-10 | PaymentReceived confirms every Reservation in the group; the reservation converges on the payment rather than on a human. Confirmation email includes the accepted terms as durable-medium reference. | W2 |
| FR-11 | IdentityEvidence cannot be created before its ReservationGroup is Confirmed. | D-15 |
| FR-12 | IdentityEvidence carries a RetentionDeadline assigned at creation. The deadline is provisional until Settlement and re-anchored on SettlementCompleted. Evidence without a deadline is unrepresentable, not merely disallowed. | P7, D-11 |
| FR-13 | An Operator can capture IdentityEvidence at the counter as a fallback channel for the same concept. | W3 |
| FR-14 | HandoverOut is refused without a successful IdentityVerification. | W3, W4 |
| FR-15 | A rejected IdentityVerification records a reason and the Asset does not leave. | W3 |
| FR-16 | IdentityEvidence is erased when its RetentionDeadline arrives, without a human triggering it, and the erasure is recorded. Rental history survives the erasure. | W10, P7, D-11 |
| FR-17 | A ScanEvent is recorded as an intent. The domain resolves it to HandoverOut or HandoverIn from the Asset's current state. No caller declares the transition. | P3, P2 §9 |
| FR-18 | The Asset instance is chosen at the counter, never at reservation. | D-04 |
| FR-19 | A ConditionReport with photographs is captured at each end of every rental. | P1 §3, §6 |
| FR-20 | A DepositReturned carrying a deduction is rejected unless both ConditionReports exist for that Asset and RentalAgreement. | P1 corollary |
| FR-21 | DepositTaken and DepositReturned record attestations. The platform moves no deposit money and must not represent that it did. | D-07, P6 |
| FR-22 | HandoverOut produces one RentalAgreement per Asset. A ReservationGroup never becomes a RentalAgreement. | D-13, W4 |
| FR-23 | SettlementCompleted starts the retention clock in Customer Identity & Compliance by event, never by a direct call into the identity model. | D-06, P2 §9 |
| FR-24 | Every attestation is correctable by an Operator through the product, with a reason and attribution, by appending a new fact. No database console, no edit in place. | P1, P4 |
| FR-25 | An Operator registers an Asset against an existing AssetType. No purchase, supplier, intake, cost basis or depreciation is recorded. The system supports pilot bootstrap explicitly: either bulk registration import, or an explicit manual-only mode with documented effort. | W9, P1 §4 |
| FR-26 | An AssetTag can be bound and rebound routinely. The tag is not the Asset. The admin surface can generate printable QR tags encoding opaque tag identity (not Asset ID and not a domain URL). | W9, P1 §5 |
| FR-27 | An Asset is in exactly one of Rentable, InPossession, UnderInspection, Unavailable, Retired. There is no Reserved status. | P1 §6 |
| FR-28 | Overdue and NoShow are derived by comparing the commercial and physical clocks. Neither is stored; neither emits an event. | D-17, P2 §9 |
| FR-29 | An Overdue produces a Customer notification on a schedule and an Operator view ranked by the earliest day its continued absence causes demand to exceed supply for the AssetType, not by days late. | D-17 |
| FR-30 | A NoShow notifies an Operator and does not release the RentalDays. | W7 |
| FR-31 | The transition to LostAsset is always an Operator declaration with a reason. Never automatic, never a timer. | D-17 |
| FR-32 | Notification sends reservation confirmation and return reminder by email, and records every dispatch. | A-08, P2 §9 |
| FR-33 | Every aggregate root carries a Tenant identity and every query is scoped by Tenant, without exception. | P2, D-01 |
| FR-34 | Every Operator action records which Operator performed it. Attribution is mandatory and has no fallback to "an Operator". | D-16 |
| FR-35 | Every monetary amount records the currency it is denominated in. | D-21 `[new]` |
| FR-36 | Operators authenticate individually. There is no role, no permission check, and no Operator management surface. Critical attesting actions (DepositTaken, DepositReturned, ConditionReport, LostAsset declaration) require per-Operator PIN reconfirmation. | D-22 `[new]` |
| FR-37 | An Operator maintains AssetTypes, day rates, deposit amounts and publication state through an admin surface. | `[new scope]` |
| FR-38 | A cookie banner, declining non-essential by default. | `[new scope]` |
| FR-39 | A Customer reaches their ReservationGroup through a tokenised, expiring, single-purpose link. Scope: view the booking and submit IdentityEvidence. Nothing else. | D-23 `[new]` |
| FR-40 | The owner can see when the retention erasure job last ran successfully. | NFR-14 |

### Should

| ID | Requirement | Source |
|---|---|---|
| FR-41 | Pickup reminder by email. | P1 §4 |
| FR-42 | An Operator view of today's pickups and returns. | W4 |
| FR-43 | An Operator view of one Asset's full attestation history — the artefact P4 exists to produce. | P4 |
| FR-44 | A status page for the owner beyond FR-40: recent errors, whether the platform is up. | `[new scope]` |

### Could

| ID | Requirement | Source |
|---|---|---|
| FR-45 | Scanning an AssetTag outside a handover resolves to "show me this Asset". | P3 |
| FR-46 | Export of the paired ConditionReports and attestations for one RentalAgreement, for use in a dispute. | W8 |

### Blocking, and not yet writable

**Cancellation and refund (W11).** This is not Must, Should or Could — those are scope words, and this is a launch gate. Part 1 marks the policy launch-blocking and undecided, which means the requirement **cannot be written**: you cannot specify a cancel action without knowing whether the Customer gets money back, and a `ReservationCancelled` that fails to release its RentalDays rots D-08 silently. The one thing that is already fixed: cancelling part of a ReservationGroup is the seam D-13 exists to hold. Decide the policy, then write FR-47 onward.

### Future

Not this year, and not in code. From Part 1: Tenant Management and its surface, Pricing & Promotions in any form, Maintenance & Servicing, Utilisation & Reporting, Logistics & Delivery, Billing & Subscription, Access Automation. From Part 2: restricted Operator roles (D-16's trigger is the third Operator), the machine attestor, the API consumer, automated identity verification (D-15), integration events (D-19), dispute management (D-05's trigger). From this part: translated Catalog content (D-20), multi-currency pricing and FX (D-21).

Also Future, and worth stating because their absence will feel like a gap during build: **GDPR access, erasure and portability request surfaces** — handled by the owner reading email until volume says otherwise, per your posture, and not to be confused with FR-16. **Native applications and offline mode** — the product is a PWA and it does not work without connectivity.

---

## 11. Non-Functional Requirements

Most of these are one paragraph because most of them deserve one paragraph. Security is not.

### Availability — NFR-01

Best-effort. Hours of downtime are acceptable, there is no SLA, and there is no failover. **Architectural implication:** one region, one provider's default plan, no health-check orchestration, no redundancy machinery. The counter cannot run without connectivity and that is accepted — which is safe *only because P1 already requires it*: the physical world is the source of truth, the employee hands over the drill anyway, and the record is written late and corrected through the product (FR-24). An outage produces a reconciliation task, not a lost rental. Offline sync is a distributed-systems problem bought for a two-person shop; refuse it.

### Performance — NFR-02

Pilot scale. There is exactly one latency requirement worth naming and it is the reason the product exists: **the scan-to-resolution at the counter must feel instant** (P3). If the Operator waits, the thirty seconds W4 exists to protect are gone and the owner goes back to paper. Everything else — catalog browse, availability query over ~200 Assets, admin — has no budget worth writing down. **Architectural implication:** none. No caching layer, no read models, no queues. Availability computation is a small query against a small table; if that ever stops being true it will be because a `[Future]` tag was ignored.

### Backup and recovery — NFR-03

24-hour granularity, whatever the provider's basic plan gives, manual recovery within a day. **Architectural implication:** none, except one that is not obvious and belongs to P7 rather than to operations — see NFR-07.

### Load — NFR-04

Two Operators, a few hundred consumers, ~200 Assets. No scaling apparatus of any kind. The honest statement is that this system's load is a rounding error and any architecture chosen for load reasons at this scale is architecture chosen for the wrong reasons.

### Security — NFR-05 … NFR-09

This is the section where your defaults are not enough, and you invited the push. A pilot that stores photographs of identity documents and takes card payments from EU consumers has a floor that does not scale down with the customer's size. The floor is short, and it is not negotiable.

**NFR-05 — Card data never enters the platform.** The payment page is hosted by the provider; the platform sees a result, never a card number, never a CVV, never a PAN in a log or a form field. **This is the requirement that makes your entire compliance posture true.** The moment card data touches the platform, PCI-DSS is in scope, and "no compliance regime beyond GDPR basics" stops being a posture and becomes a false statement. This is also why Part 1 put an anti-corruption layer around Payments: the provider's vocabulary staying out is a design preference; the card number staying out is a legal boundary.

**NFR-06 — IdentityEvidence is the highest-severity asset in the system and is treated as such.** Encrypted at rest. Never publicly addressable, never behind a guessable URL, never served without an authenticated Operator whose access is attributed. The Customer's own link (D-23) can *submit* evidence and can never *read it back* — a leaked link must not be a leaked passport. Access to evidence is itself an attributed act, because "who looked at the ID photos" is a question you want answerable before someone asks it, not after.

**NFR-07 — Erasure is not complete while a backup holds the bytes.** This is the interaction between your 24-hour backup posture and P7, and it is the one nobody notices until an auditor does. FR-16 erases the photograph from the live store; the backups taken before that moment still contain it. Selective purge of backups is absurd at this scale and nobody should build it. The correct answer is the boring one: **the backup retention horizon must be short and named, and the effective retention period is RetentionDeadline plus that horizon.** Write that number down next to D-11's window and treat the sum as the promise. A bounded, documented backup rollover is a defensible position; an unbounded one silently converts D-11 into a lie.

**NFR-08 — Personal data must not leak into the error tracker or the logs.** This is the concrete trap in your observability answer. A Sentry-class tool captures request bodies, breadcrumbs and context by default, which means that on the day an upload throws, your error tracker becomes a second copy of an identity document — living outside the retention clock, in a third-party system, with no RetentionDeadline and no erasure job pointed at it. D-11's entire design is defeated by a breadcrumb. Scrubbing is not a nice-to-have here; it is the condition on which the error tracker is permitted to exist.

**NFR-09 — The ordinary floor, stated once so it is not skipped.** Transport encryption everywhere. Secrets out of the repository. Operator sessions revocable, because the counter device is a phone and phones are left on counters. Dependencies patched. None of this is interesting and all of it is required.

### Privacy — NFR-10

GDPR basics, cookie banner at MVP, subject requests by email. **One consequence of D-14 worth naming before it surprises you:** a Customer record belongs to exactly one ReservationGroup and is never deduplicated, so a person who rented five times is five records. Answering their erasure request by hand means finding all five by email string. At pilot volume that is a search and five deletions, which is fine and is exactly the trade D-14 made knowingly. It stops being fine at a volume that also justifies building the surface — which is a convenient alignment, but note that it is luck rather than design.

### Accessibility — NFR-11

The pilot Tenant is two people, which very likely places it inside the European Accessibility Act's micro-enterprise exemption for services (A-10). **That is a design position and not legal advice**, and it is worth confirming rather than assuming, in the same spirit as D-11. What is worth doing regardless costs nothing and is not a work item: semantic markup, labelled controls, adequate contrast, keyboard operability. This is "do not be sloppy", not a programme. **The trigger:** the exemption is a property of the Tenant, not of the platform, so it evaporates on the first Tenant large enough to lose it — and retrofitting accessibility into a built product is expensive in a way that doing it plainly from the start is not.

### Mobile — NFR-12

PWA on both sides, no native applications, no offline mode. **Architectural implication:** one codebase per side, no app-store release cycle, and — the part that matters — no client-side authority. The device is a view onto the domain, never a holder of state that has not reached the server. This falls out of "no offline" and it is worth stating explicitly because the alternative arrives by accident.

### Maintainability — NFR-13

The maintainer is one person using coding agents, which makes this the section that quietly matters most. The posture: contexts are modules with honest boundaries (D-02), terminology is normative and greppable (P1 §5, P2 glossary), and every decision carries a number so an agent can be pointed at the reasoning rather than the conclusion. **The implication for this document is the requirement:** the banned-terms list and the `[Future]` tags are not commentary. An agent that generates a `Role`, an `Order`, an `Account` or a `granularity === 'hour'` branch has not made a style mistake — it has silently reversed a decision that was argued for, and the argument is the only thing standing between the pilot and the mud ball D-02 refused.

This discipline is enforced mechanically in CI: banned identifiers fail the build, dependency direction between contexts is checked against the context map, and date arithmetic outside Availability & Reservation is flagged.

### Observability — NFR-14

Error tracking and log access. No dashboards, no alerting rules, no uptime probes. This is right for everything the product does **except one thing**, and the exception is not an argument for an alerting system. Every other failure in this system is loud: the Operator sees the scan fail, the Customer sees the payment fail, the owner sees the drill in the wrong place. **W10's erasure job is the only failure that is silent by construction** — nothing breaks, nobody complains, and a GDPR liability accrues invisibly for months. It does not need an alerting stack. It needs FR-40: the last successful run visible on the status page you were already going to build, where the owner will see a stale date and ask why. That is the cheapest possible closure of the only hole in this posture, and it is why FR-40 is a Must while the rest of the status page is a Should.

---

## 12. Extensibility Strategy

### (a) Configuration versus code

**The principle: prefer code until there is a second Tenant.** A value that lives in code changes by redeploy, which costs one person ten minutes. A value that lives in configuration costs a surface to edit it, validation, an audit of who changed it, a migration path for its history, and a product that behaves differently in two places for reasons nobody can reconstruct in six months. At one Tenant and one developer, redeploy is *cheaper than configuration*, and the configuration surface is a `[Future]` product feature belonging to Tenant & Access — which Part 1 says does not exist.

This is not an argument for magic numbers. **Named and single is not the same as editable at runtime**, and D-11's "a named, single, configurable policy value" asked for the first. The obligation is that each policy value has exactly one home, one name, and one place a reader can find it — not that the owner can change it in a browser. See (e).

The exception, and it is the whole of the exception: **Catalog data is not configuration.** Day rate, deposit amount, AssetType description and publication state are the owner's business changing daily, and they belong in the admin surface (FR-37). If a price ever ends up in a config file, the boundary between "the business decides this" and "the developer decides this" has been drawn in the wrong place.

### (b) Multi-language

> **D-20 — Translation infrastructure**
> **Considered:** (a) full translation from day one — UI strings externalised *and* AssetType names and descriptions modelled as per-locale content; (b) Slovak everywhere, hardcoded, refactor when a second locale arrives; (c) split the two halves — UI strings externalised from day one, Catalog content single-valued and deferred.
> **Trade-offs:** the two halves have opposite economics and treating them as one question is the mistake. **UI strings:** externalising them is a discipline, not a structure — you write a lookup instead of a literal — and retrofitting means grepping an entire codebase for Slovak literals, a job that gets monotonically worse as the product grows and that an agent will do imperfectly. Nearly free now, disproportionately expensive later: both limbs of P8's test. **Catalog content:** modelling per-locale content costs a content model, a locale-resolution rule on every read, a fallback rule for missing translations, and an authoring surface — and then it costs the owner, who must personally write Czech descriptions for two hundred AssetTypes while running a rental business. Retrofitting it later is a mechanical migration of one scalar into a collection with existing rows becoming the Slovak entry, and it is **the same size then as now**, because the number of AssetTypes does not explode. Second limb fails. (a) buys the expensive half early for no discount; (b) refuses the cheap half and pays for it every month.
> **Recommended:** **(c).**
> **Why:** this is D-12's test producing a split answer because the question contains two things. Externalise strings from day one; leave Catalog content single-valued. **And do not name the field `name_sk`** — a language-suffixed column is the worst available option, because it advertises multi-language while providing none, and later costs the same migration plus a rename.
> **What (c) obliges:** no user-facing string literal outside the string catalogue, including in emails. The one question deliberately left open is whether a locale is a property of the reader or of the Tenant; it does not need answering until the trigger, and answering it now would be guessing on behalf of a Tenant who does not exist.
> **The trigger:** the first Tenant or market requiring a second locale. Owned by Catalog.

### (c) Multi-currency

> **D-21 — Currency on monetary amounts**
> **Considered:** (a) every monetary amount carries an explicit currency from day one, with EUR the only value, no conversion and no FX; (b) amounts are implicitly EUR, currency added when a second currency arrives; (c) full multi-currency — rate tables, conversion, per-currency pricing.
> **Trade-offs:** (c) is P8's textbook refusal and is not seriously considered. (b) is where the interesting argument is. The amounts in this system are not only prices: `DepositTaken`, `DepositReturned` and `PaymentReceived` are permanent attestations about money that changed hands, and they are the artefacts D-07 exists to make defensible in a dispute. Retrofitting a currency onto them means backfilling a value that was never recorded — an inference dressed as data, written onto financial records. **And Slovakia is the specific place where this argument is not hypothetical: the country replaced SKK with EUR in 2009.** A Tenant's currency is not immutable, so a currency stored only on the Tenant would retro-denominate every historical attestation the day it changed. (a) costs a field beside every amount and a discipline that no amount travels without it.
> **Recommended:** **(a).** Currency lives on the amount, not only on the Tenant. One value, EUR, throughout the pilot. No rate table, no conversion, no per-currency pricing. Amounts are summed and compared only within a currency, and that is an invariant rather than a convention.
> **Why, and this is the distinction that keeps D-12, D-20 and D-21 from looking arbitrary: **a currency code is not optionality, it is correctness.** D-12 refused an enum because it advertised a capability the calendar did not have — the model was complete without it. Here the model is *incomplete* without it: "50" is not a monetary amount, it is an ambiguity, and it is ambiguous today, in a single-currency pilot, with no second currency anywhere in view. The field earns its place by making today's record true. That it also happens to make a Czech Tenant cheap is a dividend, not the argument.
> **The Payments interaction, since a domain currency does not conjure one.** Card providers charge and settle in specific currencies. A Czech Tenant means either an account that settles CZK or FX performed at the provider — a Payments concern, behind the anti-corruption layer Part 1 already requires, and not a domain capability. The deposit case makes the point physically: a cash deposit is banknotes, and euro banknotes and koruna banknotes are different objects. `DepositTaken` carrying a currency is simply the honest record of which ones were handed over.
> **The trigger:** a Tenant operating in a second currency. Everything beyond the field — pricing, conversion, settlement — arrives then and not before.

### (d) Named extension points and their triggers

No design for any of these. The trigger and the owner, so that the conversation starts in the right place.

| Extension point | Trigger that makes it real | Owning context |
|---|---|---|
| Per-tenant branding | The second Tenant. Not the pilot owner wanting his logo bigger. | Tenant & Access `[Future]` |
| Per-tenant pricing rules | The second Tenant with a *fundamentally different pricing model* — hourly, tiered, per-kilometre. **Not** the pilot Tenant wanting a weekend discount, which is a Catalog value, not an engine. | Pricing & Promotions `[Future]` |
| Weekend rates, tiered duration discounts | Same as above. A discount is not a pricing engine, and the first one that arrives should be resisted, then the second, then reconsidered at the third. | Pricing & Promotions `[Future]` |
| Deposit rules beyond a flat amount | A Tenant whose deposit varies by Customer or duration. The DepositObligation survives; only its derivation changes (D-07). | Catalog `[Future]` |
| Notification templates per tenant | The second Tenant. Notification stays deliberately stupid until then (P1 §4). | Notification `[Future]` |
| External integrations, API | The API consumer of P2 §7. This is also D-19's trigger: integration events exist when this does. | — `[Future]` |
| Custom domains | The second Tenant, and specifically one who sells to consumers under their own brand. | Tenant & Access `[Future]` |
| Translated Catalog content | The first Tenant or market needing a second locale (D-20). | Catalog `[Future]` |
| Multi-currency pricing and FX | A Tenant operating in a second currency (D-21). | Payments / Catalog `[Future]` |
| Operator roles | The third Operator, or the first operation moving money outward without a physical counterpart (D-16). | Tenant & Access `[Future]` |
| Hourly rental | A Tenant whose economics require intra-day turnover (D-12, A-04). | Availability & Reservation `[Future]` |
| Card pre-authorisation deposits | Pilot decision; planned, verified against D-07, structurally free. | Payments / Handover & Possession `[Future]` |

The pattern in that table is worth stating once, because it is the whole of P8: **almost every trigger is "the second Tenant", and none of them is "the pilot owner asks nicely".** A single Tenant wanting something different is a value change or a feature. Two Tenants wanting different things is a configuration surface. Confusing the two is how the pilot acquires a settings page before it acquires a second customer.

### (e) Policy values

Per your answer, **these are named platform constants and change by redeploy.** There is no admin surface for any of them, and building one would contradict (a). What follows is the complete list; a policy value not on it does not exist, and a magic number in code that should be here is a defect.

| Policy value | Scope in the model | MVP posture | Source |
|---|---|---|---|
| IdentityEvidence retention window | **Tenant-scoped conceptually** — it follows legal advice, and legal advice differs by Tenant and jurisdiction. | One constant. **Must not launch unnamed**: D-11 requires a statute or a lawyer to name the period *and* the basis in writing, and requires that reference recorded. The effective promise is this value plus the backup horizon (NFR-07). | D-11 |
| LostAsset threshold | **Tenant-scoped conceptually** — a camera house and a tool shop have nothing in common here. | One constant. It gates a *prompt to an Operator*, never an automatic transition (FR-31). | D-17 |
| Pending expiry window | **Platform-scoped.** This is checkout mechanics, not business policy. No Tenant will ever want a different one, and it is coupled to the payment provider's own timeouts rather than to anything the owner thinks about. | One constant. | D-18 |
| Reminder schedule | **Tenant-scoped conceptually** — operational preference, and the return reminder is the highest-leverage lever the business has (P1 §4). | One constant. This does not contradict Notification having no preference centre: that ban is about *Customer* preferences, and this is the *Tenant's* schedule. | A-08, W6 |
| Backup retention horizon | **Platform-scoped**, but it is a privacy value and not only an operations value. | One constant, named next to the retention window, because their sum is the promise (NFR-07). | NFR-03, NFR-07 |

Tenant-scoped conceptually means exactly what D-01 means by it: the value hangs off the Tenant in the model because a second Tenant would plausibly differ, while there is precisely one Tenant, one value, and no surface. The distinction costs nothing today and is the difference between a config change and a schema change on the day a second Tenant arrives.

---

## Decisions delegated to this part

> **D-22 — How the system knows which Operator acted**
> **Considered:** (a) individual authentication per Operator, with a session long-lived enough that the counter interaction stays a scan; (b) a shared device and shared login, with the Operator picking their name from a list at each attesting action; (c) a shared login with no distinction — attribution to "an Operator".
> **Trade-offs:** (c) is ruled out immediately and it is the option that looks cheapest. D-16's whole argument was that attribution delivers the accountability the permission was reaching for; attribution that says "someone" delivers neither, and the pilot would then have no authorisation *and* no accountability, which is strictly worse than either. (b) is genuinely defensible and nearly free, and its weakness is not the one people expect: self-asserted attribution is fine for the realistic dispute, which is not "the employee impersonated the owner" but "the customer says the scratch was already there", and for that the record only needs to say which of two known humans to telephone. **What kills (b) is not D-16, it is NFR-06.** The counter device holds a key to every Customer's identity document. Under (b), physical possession of a phone left on a counter is access to a pile of passports, and there is no session to revoke because there is no session. (a) costs two credential sets and a login screen.
> **Recommended:** **(a).**
> **Why:** the cost is a morning login on a device that stays signed in, which does not touch P3's thirty seconds; the benefit is that access to the highest-severity data in the system is authenticated, attributed and revocable, which the security floor requires regardless of what D-16 wanted. Attribution comes along for free as a by-product, which is the right order of causation and is worth recording, because a future reader who repeals the security requirement must not conclude that the login can go.
> **What this must not become.** Authentication answers *who are you*; it grants nothing. **There are no roles, no permissions, and no checks that branch on which Operator is signed in** — D-16 stands, both Operators may do anything the product can do, and *Role* and *Permission* remain on Part 2's banned list. There is no Operator management surface: two rows, created by hand, exactly as D-01 creates exactly one Tenant. An Operator seat is not an Account — that term is banned and belongs to the Customer question D-14 already answered.

> **D-23 — The Customer's self-service surface**
> **Considered:** (a) email confirmation only, everything else by telephone to the owner; (b) a tokenised link permitting the Customer to view their ReservationGroup and submit IdentityEvidence; (c) the same link, plus cancellation.
> **Trade-offs:** (a) is not actually available, and noticing why is the point. D-15 requires IdentityEvidence to be submitted *after* payment, and the upload will frequently not happen in the payment session — the Customer pays at a desk and photographs their ID with a phone an hour later, or forgets and comes back tomorrow. **The Customer therefore needs a way back in whether or not anyone designs one**, and the choice is between designing it and letting it appear as an accident. (c) builds a cancel button for a policy that does not exist: Part 1 marks cancellation launch-blocking and *undecided*, and you cannot ship a control whose consequence is unknown. (b) is what is left, and it is also what is correct.
> **Recommended:** **(b).** A tokenised, expiring, single-purpose link, emailed at confirmation. Scope: see what you booked, submit your ID. Its purpose ends at HandoverOut and so does it.
> **Why:** it is the minimum that makes D-15's sequencing physically possible, and every capability beyond that minimum is either blocked (cancellation) or a liability (reading the evidence back).
> **The token is a credential and must be treated as one**, which is the part that will be forgotten: unguessable, short-lived, revocable, single-purpose. It is a bearer token in a URL, which means it will land in an inbox and possibly in a log — that is the accepted cost of guest checkout (D-14), and it is bounded by the link granting so little. **It must never grant read access to IdentityEvidence** (NFR-06): a forwarded confirmation email must not be a forwarded passport.
> **What this must not become.** Not an Account, not a Session, not a login, not a portal, not a place to put a rental history. All of those are D-14 arriving through the back door.

---

## Glossary addition

Part 1's Ubiquitous Language and Part 2's additions are normative. One term is added, with Part 2's "why it was missing" pattern.

| Term | Meaning | Owned by | Why it was missing |
|---|---|---|---|
| **MonetaryAmount** | A quantity of money together with the currency it is denominated in. Neither half exists without the other; there is no bare amount anywhere in the model (D-21). | shared value concept; no context owns it | Part 1 named the day rate, the DepositObligation and the rental fee as amounts without ever saying what an amount *is*, because there was one currency and it was therefore invisible. D-21 makes the pairing explicit rather than assumed, and the term exists so that "amount" alone reads as a defect. |

**Not added:** *PolicyValue*, *Locale* and *Session* are architectural vocabulary, not Ubiquitous Language — the owner does not say them — and follow the same rule Part 2 applied to *DomainEvent* and *IntegrationEvent*. Part 2's bans on *Escalation*, *Case*, *Ticket*, *Role*, *Permission*, *Account* and *Cart* remain in force and are load-bearing for D-22 and D-23 specifically. Part 1's bans are unchanged.

## Assumptions register (continued)

- **A-10** — The pilot Tenant, at two employees, falls inside the European Accessibility Act's micro-enterprise exemption for services. This is a design position and not legal advice, it is worth confirming rather than assuming, and it is a property of the Tenant rather than of the platform — so it lapses on the first Tenant large enough to lose it, not on any change the platform makes (NFR-11).

## Deferred to later parts

Cancellation and refund requirements (**launch-blocking**, policy undecided — FR-47 onward cannot be written until it exists) · the RetentionDeadline value and its recorded legal basis (D-11, must exist before launch) · the backup retention horizon value (NFR-07) · confirmation of A-10 · everything technological.
