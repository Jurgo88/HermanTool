# Architecture Foundation Specification
## Section 17 — Independent Architecture Review

| | |
|---|---|
| **Status** | Independent review — written without the original architect's involvement |
| **Scope** | Findings against Parts 1–4, all frozen. Identifiers are referenced, never restated. |
| **Reviewed** | 18 July 2026 |

### Overall assessment

This is a disciplined document, and its discipline is genuine rather than performed: the banned-terms list, the trigger-per-extension table, and the willingness to flag its own contradictions (F-1 through F-3) are all above the standard for a solo-authored foundation spec. The two-clocks separation, the refusal of a `Reserved` asset status, and the D-07 obligation-not-mechanism move are correct and I will not spend review capacity on them.

The weaknesses cluster in three places, and all three are places a single author working outward from the domain model would be too close to see. **First, the document models the rental but not the contract.** It spends enormous care on making a deposit deduction *evidentially* defensible and no care at all on making it *contractually* authorised — there is no terms acceptance anywhere in the checkout, which in an EU consumer context is not an omission but a liability. **Second, the retention story (P7, D-11) is watertight in the middle and leaks at both edges**: evidence that never reaches Settlement has no clock, and the dispute window has never been checked against the card-network chargeback window, which is the one dispute timeline the business does not control. **Third, the document's proudest claim about its data layer — that Part 1's invariants are "expressible as schema" (§14.1) — is false for the single invariant that matters most.** D-08's per-type-per-day count is a cross-row aggregate that no foreign key or unique constraint can express, and the concurrency mechanism that actually enforces it is never named. The system's hardest correctness problem is currently solved by an adjective.

A fourth, softer theme runs underneath: the undecided cancellation policy (R-01) is treated as one deferred workflow, when it is in fact the termination point of at least five distinct failure paths, two of which are the *Tenant* refusing performance rather than the Customer withdrawing — a different legal question that the lawyer engaged for Open Question #1, as currently framed, will never be asked.

Twelve findings follow. One is Critical and should be resolved before money is taken from a consumer; five are High and should be resolved before the build reaches the context they touch.

---

### Finding 1 — There is no contract in the system that models a contract
**Severity: Critical**
**Category: D (missing risk) / J (missing section)**
**Location: Part 1 §5 (RentalAgreement), Part 2 W1–W2, Part 3 FR-01…FR-40, R-01**

The RentalAgreement "comes into being at HandoverOut" (Part 1 §5) — but nowhere in four parts does the Customer ever see, let alone accept, any terms. The FR list contains a cookie banner as a Must (FR-38) and no requirement that the Customer accepts rental conditions, deposit rules, or damage-liability terms before paying. This has two consequences, one legal and one that undermines the product's own core claim. Legally: the pilot takes money from EU consumers at a distance, which triggers pre-contractual information duties (trader identity, total price, duration, withdrawal information) that apply *regardless of how Open Question #1 about the withdrawal right is answered* — the information duty is not contingent on the policy. Commercially: the entire W8 story is that paired ConditionReports make a deduction "defensible rather than a shouting match", but a deduction is only defensible against terms the Customer agreed to. Evidence that a scratch is new is worthless without an agreed rule that new scratches cost money. The Customer also never countersigns or acknowledges anything at HandoverOut — every attestation in the system is one-party — so in a dispute the Tenant holds excellent evidence of facts and no evidence of agreement.

**Proposed improvement:** Add a Must requirement this afternoon: rental terms and the deposit/deduction rules are presented before payment, acceptance is recorded on the ReservationGroup with a timestamp and the terms version, and the confirmation email includes the terms (a durable-medium obligation). Extend the lawyer question in Open Questions #1 to cover the pre-contractual information catalogue, not only the withdrawal right. Optionally, capture a Customer acknowledgment of the outbound ConditionReport at HandoverOut — a tap on the counter device — which converts the outbound report from an Operator assertion into a shared baseline. None of this requires a new context; it is fields on ReservationGroup and one screen.

---

### Finding 2 — FR-12 and D-11 contradict each other, and the never-settled case falls through the gap
**Severity: High**
**Category: A (internal contradiction)**
**Location: Part 3 FR-12, Part 1 D-11, Part 2 W10, FR-16, FR-23**

FR-12 requires a RetentionDeadline "assigned at creation — evidence without a deadline is unrepresentable." D-11's supporting rule says the retention clock "starts at Settlement, not at upload," and FR-23 wires SettlementCompleted to start it. Both cannot be literally true. Presumably the intent is a provisional deadline at creation, rewritten at Settlement — but the provisional value is never specified, and its choice is not a detail. If it is generous, then evidence attached to a rental that *never settles* — a paid NoShow, a rejected IdentityVerification where the Customer walks away, an abandoned pickup — is held effectively indefinitely with no lawful basis, which is precisely the posture D-11 was written to refuse. If it is tight, the evidence can be erased mid-Overdue, at the exact moment a LostAsset claim needs it. W10 names this edge case explicitly ("the edge case to design against rather than discover") and then no decision or requirement resolves it. It is currently designed against by a sentence hoping someone reads it.

**Proposed improvement:** Write the missing rule as a decision: at creation the RetentionDeadline is set to (end of RentalPeriod + the D-11 dispute window); SettlementCompleted *re-anchors* it to (Settlement + window); an Operator declaring LostAsset extends it to the claim's limitation horizon with the reason recorded. That gives every piece of evidence a finite deadline from birth, satisfies FR-12 as written, and gives the never-settled case a defensible bound instead of no bound.

---

### Finding 3 — The payment-completes-after-expiry race has no answer, and lazy expiry makes it structural
**Severity: High**
**Category: A (contradiction) / F (event model)**
**Location: Part 2 W2, D-18, FR-08, FR-10, Part 4 §14.2 (D-25), Open Question #6**

FR-08 releases a Pending Reservation's RentalDays when the expiry window lapses. FR-10 says PaymentReceived confirms every Reservation in the group and "the reservation converges on the payment rather than on a human." The gap between them is a Stripe webhook that arrives after expiry — a Customer who completes checkout near the timeout boundary, or a webhook delivered on retry minutes later. In that window the released days may already be held by another Customer's Pending Reservation, so confirming per FR-10 would violate FR-04, and not confirming produces the exact failure D-18 called "the worst available": a charged card and no reservation. D-25's decision to evaluate expiry lazily at read time widens this from an edge case to a structural feature — an expired-but-unswept Pending is simultaneously "released" for availability purposes and "Pending" in the record, and Part 2's `ReservationExpired` event ("emitted by the Platform") now has no defined emission moment at all, which quietly turns a catalogued domain event into a derived condition, the very move Part 2 forbids for Overdue. Open Question #6's "couple the window to Stripe's session timeout" narrows the race; webhook retry semantics mean it cannot close it.

**Proposed improvement:** Define the rule now, because it is mechanics rather than the blocked W11 policy: on PaymentReceived for an Expired group, atomically attempt to re-acquire the days; on success, confirm as normal; on failure, refund automatically and notify. A refund for a reservation that never confirmed is a payment error, not a cancellation, so it does not need to wait for R-01's lawyer. And amend the event model: `ReservationExpired` is emitted by the sweeper when it records the expiry, and availability's lazy evaluation is documented as a read-side optimisation over the same rule, not a second source of truth.

---

### Finding 4 — The core invariant is not "expressible as schema", and nobody has said what enforces it
**Severity: High**
**Category: G (technology under stress)**
**Location: Part 4 §14.1 (D-24), Part 1 D-08, Part 2 D-18, Part 3 FR-04, R-08**

Section 14.1 justifies Supabase on the grounds that "the invariants of Part 1 are expressible *as* schema" and the long-term table repeats it: "the database refuses the impossible even when the code forgets." For FR-20's pairing and FR-33's tenant scoping this is true. For D-08 — the invariant the document itself calls the domain's hardest — it is false. "Active Reservations per AssetType per day ≤ Rentable count" is a cross-row, cross-table aggregate over a date range; no foreign key, unique index, or check constraint expresses it. It must be enforced by serialising concurrent Pending-hold creation: serializable isolation with retry, an advisory lock per (AssetType, day), or a materialised per-day hold counter with a check constraint. Each has different behaviour under the actual runtime — Netlify serverless functions opening connections against Supabase's pooler, where serializable-isolation retry loops and transaction-mode pooling interact badly and connection exhaustion is the classic free-tier cliff (unmentioned by R-08, which covers only cold starts). D-18 closed the race at payment time and reopened it, unexamined, at hold-creation time. This is the one place in the system where a concurrency bug produces exactly the counter conversation D-08 exists to prevent, and the mechanism is currently an unwritten decision.

**Proposed improvement:** Write D-33 naming the mechanism. My recommendation given the stack: a materialised holds-per-(AssetType, day) table maintained in the same transaction as Reservation creation, with a check constraint against the Rentable count — it makes the invariant genuinely schema-enforced, survives the pooler, and is boring. Whichever is chosen, add to Open Question #22's pre-launch measurement task a concurrent-booking test (two simultaneous holds on the last unit), and record that connections must use Supabase's transaction pooler with the pool size named.

---

### Finding 5 — The chargeback window was never compared to the retention window
**Severity: High**
**Category: D (missing risk) / C (deferral forcing another decision)**
**Location: Part 1 D-11, Part 3 §12(e), Part 4 §14.3 (D-26), R-01…R-14, Open Question #2**

Card networks allow the cardholder to dispute a transaction for roughly 120 days, in some scenarios measured from expected delivery of the service rather than from payment. This intersects the design in two ways the risk list misses. First, the fraud vector: a stolen card pays the rental fee online, a matching-enough ID passes a counter glance, a €900 breaker leaves against a €50 cash deposit, and the chargeback arrives in month three — the Tenant is out the fee *and* the asset, and the flagged "claim exceeding the deposit" (Part 1) is against a person who does not exist. Second, and more corrosive: the evidence the Tenant would use to contest any chargeback — the IdentityVerification, the RentalAgreement, ideally the ID photograph — is on D-11's clock. If the lawyer engaged for Open Question #2 names a short dispute window (30 days after Settlement would be a perfectly natural answer to the question as posed), W10 will dutifully erase the passport photo while the cardholder's dispute rights are still live. The retention question and the chargeback question are the same question, and they are currently being answered by two different people who have not met.

**Proposed improvement:** Add the risk to §13 (fraud via chargeback-after-possession; severity High, mitigated partly by Stripe's dispute evidence flow, which D-26's clean refund API already touches). Amend Open Question #2 so the lawyer is asked to set the retention window *with the card-scheme dispute timeline in front of them*, and record in D-11's eventual answer that the window is a function of both the civil limitation period and the chargeback horizon. Cost today: one sentence in a brief to a lawyer.

---

### Finding 6 — P7 is only implemented for the photograph; the Customer record has no clock at all
**Severity: Medium**
**Category: A (internal contradiction)**
**Location: Part 1 P7, D-11, Part 2 D-14, W10, Part 3 NFR-10**

P7 is absolute: "*Every* piece of personal data is created with a retention deadline attached... set at creation, never absent." The Customer record — name, email, phone, per D-14 one record per ReservationGroup — is personal data, and no deadline is ever attached to it anywhere in four parts. W10 asserts that "rental history survives the erasure" because it has "an independent basis for being retained," but that basis is never named, and D-11 explicitly demands that retention bases be recorded in writing — a rigour applied to the photograph and silently waived for everything around it. The likely honest answer is the accounting-records retention period under Slovak law, which is fine, but "likely" and "recorded" are different states, and an indefinitely-retained pile of name/email/phone records is a smaller liability than the passports but the same *kind* of unbounded liability P7 exists to refuse. NFR-10 compounds it: five rentals means five records found by email-string search, so nothing even enumerates what would need erasing.

**Proposed improvement:** One row in §12(e): a Customer-record retention period, tenant-scoped conceptually, one constant, with its basis (accounting/limitation statute) recorded the way D-11 requires. If the basis genuinely mandates long retention, P7 is satisfied by a long deadline — the principle demands a clock, not a short one. Alternatively amend P7 to scope itself, but amending a frozen principle is worse than spending one constant.

---

### Finding 7 — R-01 understates its own blast radius: the refund policy is a sink for five paths, two of them Tenant-initiated
**Severity: Medium**
**Category: C (deferral with hidden coupling)**
**Location: Part 2 W3, W4, W7, W11, Part 4 R-01, Open Question #1**

The document treats the undecided cancellation policy as one deferred workflow. Tracing every failure path that terminates in "the Customer has paid and will not receive the service" finds at least five: voluntary cancellation (W11 proper), NoShow (W7), rejected IdentityVerification (W3 — "the Customer has paid for something they cannot collect"), inability to pay the cash deposit (W4), and payment-after-expiry (Finding 3). The last three are not the Customer withdrawing — they are the *Tenant declining or unable to perform*, which is legally a non-performance/restitution question, not a distance-selling withdrawal question. Open Question #1 as framed ("does the withdrawal right apply to short-term equipment hire") will produce an answer that covers path one and possibly two, and the lawyer will never hear about paths three through five. Meanwhile W3 and W4 are day-one counter scenarios, not month-six edge cases: the first Customer whose ID photo is unreadable arrives during launch week.

**Proposed improvement:** Rewrite the lawyer's brief in Open Question #1 to enumerate all five paths and ask for the refund consequence of each. Separately, note in R-01 that the mechanical refund capability (a `PaymentRefunded` against Stripe) is needed for Tenant-initiated non-performance even if voluntary cancellation ships later — which also moves up D-16's named roles trigger ("the first operation that moves money outward without a physical counterpart") to launch, a consequence D-16 should acknowledge rather than discover.

---

### Finding 8 — One counter phone quietly degrades D-22 into the option it rejected
**Severity: Medium**
**Category: B (unstated assumption)**
**Location: Part 3 D-22, FR-34, NFR-06, NFR-09, Part 2 D-16**

D-22 chooses individual authentication with sessions "long-lived enough that the counter interaction stays a scan," and its argument against the shared-login option was NFR-06: the counter device is a key to the evidence bucket. The unstated assumption is one device per Operator. The realistic pilot is one counter phone: the owner signs in Monday morning, the employee uses it all week, and every attestation FR-34 records is attributed to whoever performed the morning login — which is D-22's rejected option (c), attribution to "someone," arrived at through the exact mechanism the decision describes ("a phone left on a counter") and never guarded against. The same device, holding a long-lived session, renders NFR-06's presigned evidence URLs to whichever human is holding it, and mobile browsers cache images.

**Proposed improvement:** Either state the assumption ("each Operator authenticates on their own device") as A-11 so it becomes an operational instruction to the Tenant, or add a cheap guard: attesting actions (DepositTaken, DepositReturned, ConditionReport, LostAsset declaration) require a per-Operator PIN re-confirmation, which costs two seconds, not P3's thirty. Add cache-control headers on evidence reads to NFR-06's list either way.

---

### Finding 9 — The hard corrections are unspecified, and they are the common ones
**Severity: Medium**
**Category: F (event model weakness)**
**Location: Part 1 P1, P4, Part 2 W5, `AttestationCorrected`, Part 3 FR-24, FR-27**

P1 promises every divergence is "correctable by a human through the product itself," and FR-24 makes it a Must. The event catalogue's `AttestationCorrected` row says its reaction "varies" — which is the only cell in the catalogue that dodges. The corrections actually tested by the document are the easy, self-contained ones (a wrong deposit amount). The corrections the workflows themselves predict are structural: W4 names "the Operator forgets to scan" — repairing that means *inserting a backdated HandoverOut* into an append-only history whose ordering P4 treats as the asset's story, while availability has meanwhile been computed from the wrong Rentable count; W5 names the mirrored return case, where the record says Overdue, reminders have fired at an innocent Customer (D-17's own scenario), and the correction must retroactively close a Possession and un-derive an Overdue that was never real. Whether a backdated attestation re-orders history or appends with an effective-time distinct from recorded-time is exactly the kind of decision that, left unwritten, a coding agent will resolve differently in each context.

**Proposed improvement:** Write the missing half of D-10 (F-3 already owes the document that ADR) to include the correction semantics: attestations carry both an occurred-at and a recorded-at time; derivations (Availability, Overdue, NoShow) are always computed over occurred-at; `AttestationCorrected` appends a superseding fact and never re-orders. Then specify the two named repairs — backdated HandoverOut and backdated HandoverIn — as explicit Operator actions with reasons, since they are the P1 cases the pilot will hit in week one.

---

### Finding 10 — Nothing in the system creates the physical tags it depends on, and 200 assets must enter by hand
**Severity: Medium**
**Category: J (missing topic)**
**Location: Part 2 W9, Part 3 FR-25, FR-26, P3**

Every operational workflow begins with scanning an AssetTag, FR-26 requires tags be bound and *rebound* routinely because they peel off — and no requirement anywhere generates, renders, or prints a QR code. W9 binds a tag that exists by unexplained means. This is not pedantry: tag provisioning determines the encoding (what does the QR contain — a tag identity resolved server-side, or a URL, and to which domain, which matters because the scan must resolve for the life of the tag), and it is on the critical path of the pilot's bootstrap, which is itself unaddressed: 200 assets registered one-by-one through W9's single-asset flow, each needing a printed, laminated, affixed tag, is multiple days of the owner's time before day one. Deferred sections were checked; this appears in none of them. It is not deferred — it is absent.

**Proposed improvement:** Add two requirements: tag generation (the admin surface renders printable QR sheets; the code encodes an opaque tag identity, never an Asset ID and never a URL bound to today's domain — the tag outlives both), and a decision on bootstrap (either a bulk-registration import or an explicit acceptance that registration is manual, with the owner's time cost named). Half a day of design; it unblocks the physical rollout.

---

### Finding 11 — The banned-terms list is load-bearing and nothing enforces it
**Severity: Medium**
**Category: H (extensibility discipline) **
**Location: Part 3 NFR-13, Part 1 §5, Part 2 glossary, D-12, D-20**

NFR-13 states the stakes precisely: an agent that generates a `Role`, an `Order`, or a `granularity === 'hour'` branch "has silently reversed a decision that was argued for." Three decisions (D-12, D-20, D-16) explicitly substitute a *discipline* for a structure — no inline date arithmetic, no string literals outside the catalogue, no roles — and the document's only enforcement mechanism for any of them is that the terms are "greppable." Greppable means detectable by someone who greps; the maintainer is one person reviewing agent output at volume, which is the population least likely to grep consistently. This is the rare finding where the fix is smaller than the finding: every one of these disciplines is mechanically checkable, and a discipline that is checked in CI is a structure.

**Proposed improvement:** One CI job, written this afternoon: a lint rule failing the build on the banned identifiers from Parts 1–3 (Booking, Order, Item, Product, Inventory, User, Role, Permission, Account, Cart, Session-as-domain-term, Fulfilled, `name_sk`, `rentalGranularity`), a dependency-direction check between context modules matching the Part 1 context map (any of the standard architecture-test tools does this in TypeScript), and a rule flagging date subtraction outside Availability & Reservation. Record it as D-34 so the enforcement is a decision, not a habit.

---

### Finding 12 — FR-29's ranking is not computable as written
**Severity: Low**
**Category: A (internal contradiction)**
**Location: Part 3 FR-29, Part 1 D-04, Part 2 D-17**

FR-29 requires the Overdue view ranked "by the Reservation it threatens." Under D-04 no Reservation binds an Asset, so an overdue Asset threatens no *particular* Reservation — it reduces the Rentable count for its AssetType, and the threat is a per-(AssetType, day) shortfall: the earliest day on which confirmed Reservations exceed Rentable units assuming the Asset stays out. Any implementer must silently reinterpret the requirement in those terms; a requirement that must be reinterpreted to be implemented should say what it means, especially in a document whose stated purpose is to be read literally by coding agents.

**Proposed improvement:** Reword FR-29: ranked by the earliest calendar day on which the Asset's continued absence makes confirmed demand exceed supply for its AssetType, with unaffected Overdues ranked last. Same intent, one sentence, now computable.

---

### Closing note

Findings 1, 5, and 7 share a root cause worth naming once: the document's adversary is the physical world (P1) and it has modelled that adversary superbly — but a consumer rental business has a second adversary, the commercial-legal world of contracts, chargebacks, and refund obligations, and the document consistently treats that world as "a lawyer question" to be answered later. Some of it is (the withdrawal right). Some of it is architecture wearing a lawyer's coat: terms acceptance is a workflow step, the chargeback horizon is a retention parameter, and non-performance refunds are an event path. The distinction between deferring a *policy* and deferring the *structure that will carry any policy* is one this document applies expertly everywhere else — D-07 is its best example — and simply forgot to apply to the contract itself.
