# Architecture Foundation Specification
## Part 2 — Users, Workflows & Events

| | |
|---|---|
| **Status** | Draft — authoritative for workflows and event names |
| **Scope** | Sections 7–9 only. Requirements, technology selection and ADRs remain out of scope. |
| **Depends on** | Part 1 — Domain & Boundaries. Part 1's Ubiquitous Language is normative here. Terms are used exactly as defined there and are not redefined. |
| **Decisions** | `D-14`…`D-19`. Assumptions `A-08`…`A-09`. Numbering continues Part 1's series; both remain greppable. |

Two answers were given for this part and two were delegated. Guest checkout with the ID uploaded online is settled and drives D-14 and D-15. Operator permissions and Overdue handling were delegated, and are answered as D-16 and D-17 with the alternatives named. D-18 and D-19 are decisions this part could not avoid making.

Two assumptions carried in without being asked, stated so they can be attacked. **A-08** — Notification is email for confirmations; whether the return reminder is worth paying for as SMS is a cost decision, not a domain one, and nothing in Sections 8–9 changes shape either way. **A-09** — catalog and price administration is a low-frequency surface distinct from the high-frequency counter interaction; whether they share an application is a question for a later part and changes nothing here.

---

## 7. User Types

The instruction to be honest about hats is the whole of this section, so it goes first. **This system has two human user types in the MVP, and one of them is two people.** Everything else that looks like a user type is either the same person doing a different thing, or a person who does not exist yet.

### [MVP] Visitor

A person browsing the Catalog who has not committed to anything. Their goals are to find out whether the thing they need exists, whether it is free on the days they need it, and what it costs — including the DepositObligation, which is the number that most often ends the conversation and should therefore not be discovered at the counter.

**A Visitor has no domain existence and is deliberately not modelled.** They own no aggregate, emit no domain event, and leave no record. They are named here only so that the absence is a decision rather than an oversight: the reflex to track them belongs to Utilisation & Reporting, which is `[Future]` (Part 1, Section 3), and the reflex to convert them into an identity belongs to a CRM, which Part 1 declares a non-goal.

### [MVP] Customer

The consumer who reserves, pays, takes possession and returns. Per D-14 they have **no account and no password**, which means the Customer is not an authenticated identity, and every design instinct that assumes otherwise must be resisted.

Their responsibilities in the domain are small and physical: commit to a Reservation, pay the rental fee online, submit IdentityEvidence, appear at the counter with the ID they photographed, take the Asset, hand over cash, bring the Asset back on the agreed day in the agreed condition, and take the deposit back. Their permissions, in plain language: they may see and cancel their own ReservationGroup, and they may see nothing belonging to anyone else. They cannot see Assets, availability beyond what the Catalog publishes, or any other Customer.

> **D-14 — Customer identity without accounts**
> **Considered:** (a) Customer is a persistent identity deduplicated across ReservationGroups by email or phone; (b) a Customer record is created per ReservationGroup and never deduplicated; (c) require accounts and sidestep the question.
> **Trade-offs:** (c) is ruled out — accounts are friction at the exact moment a consumer decides whether to bother, for a business whose customers may rent twice a year. (a) is the reflex, and it is the reflex of a system that has authentication. Here there is none, so "the same Customer" would mean "somebody typed the same email string", and treating a heuristic match as an identity is precisely the fiction P1 forbids. It also breaks D-11: if IdentityEvidence attaches to a person-forever, its RetentionDeadline is extended by every new rental, so a monthly customer's ID is held indefinitely — which is the monotonically-growing liability D-11 exists to refuse. (b) costs the ability to recognise a repeat customer in the system.
> **Recommended:** **(b).** A Customer record belongs to exactly one ReservationGroup.
> **Why:** guest checkout means there is no authenticated Customer, so there is no persistent Customer identity to model — only a rental occasion with a name and a phone number attached; and scoping the record to the occasion is what makes D-11's retention clock unambiguous and D-06's boundary do the work it was drawn for. The cost is real but small: repeat customers re-upload their ID, and at two staff in one room the owner recognises regulars with his eyes, which is a capability the software does not need to reproduce. When accounts arrive, a persistent Customer becomes a `[Future]` identity that *references* rental occasions rather than absorbing them.

### [MVP] Operator

A person acting on behalf of the Tenant. In the pilot this is exactly two humans — the owner and the handover employee — and per D-16 the system knows them apart but does not treat them differently.

The owner wears three hats and the system should notice only one of them. As **business owner** he decides prices and deposits; as **catalog administrator** he registers Assets, binds AssetTags, publishes AssetTypes and sets rates; as **Operator** he stands at the counter and hands over drills. The third hat is the only one with an interesting workflow. Manufacturing an "Administrator" user type to hold the second hat would produce role machinery for a population of one, and the population of one is standing next to the population of one.

Operator responsibilities: register and tag Assets; maintain the Catalog; verify a Customer's identity against the human in front of them; assess condition and capture evidence at both ends; take and return cash; declare an Asset lost, damaged or unavailable; and correct any of the above when it turns out to be wrong. Permissions, in plain language: **an Operator may do anything the product can do.** That sentence is a decision, not laziness.

> **D-16 — Operator permissions**
> **Considered:** (a) one Operator type with no permission distinction; (b) two roles, Owner and Employee, with the Employee restricted to the counter; (c) a general permission model.
> **Trade-offs:** (c) is over-engineering by any reading and is not seriously considered. (b) is the instinctive answer and it costs more than it looks: a role concept, an assignment surface, a check at every entry point, and a product that behaves differently for different people — all of which lives in **Tenant & Access, which Part 1 tags `[Future]` and which does not exist**. Recommending (b) would silently contradict D-01's discipline in the first paragraph that gets the chance. (a) accepts that the employee could change a price or delete a Reservation.
> **Recommended:** **(a), with a hard qualification — no authorisation, but mandatory attribution.** There are no roles. Every Operator action records *which* Operator performed it, always, without exception.
> **Why:** attribution is already load-bearing and therefore free — Part 1 requires an Operator identity on ScanEvent, on DepositTaken and on every ConditionReport, because an attestation with no attestor is worthless in a dispute — whereas a permission boundary at two people in one room prevents nothing that the owner cannot prevent by looking up. Attribution delivers the accountability the permission was reaching for, at no cost, without importing a `[Future]` context.
> **The trigger to revisit, named now so it is not missed:** the third Operator. Roles become real when staff exist whom the owner does not personally watch, or when the product acquires an operation that moves money outward without a physical counterpart. Refunds are that operation, which is one more reason the cancellation policy is launch-blocking (Part 1). Until then, roles are `[Future]`.

### [MVP] The Platform, acting on a policy

Not a user, but an actor, and it needs naming because three domain events in Section 9 have no human behind them: IdentityEvidence is erased when its RetentionDeadline arrives, a Pending Reservation expires when payment does not complete, and reminders dispatch on a schedule. Part 1 already obliges the model to permit a non-human attestor — Access Automation requires that an Operator *or a machine* can attest to a Handover, and the D-07 revision requires the same of DepositTaken — so an actor that is the platform itself is not a new idea, and events it emits are attributed to it rather than to a fictional Operator.

### [Future] user types

**Tenant Administrator** — onboards Tenants, configures them, sees across them. Belongs to Tenant & Access. Does not exist while there is one Tenant and no way to create a second (D-01).

**Restricted Operator** — the role model deferred by D-16, triggered by the third employee.

**Machine attestor** — a smart locker or RFID gate attesting to a Handover. Belongs to Access Automation. Costs a channel implementation and nothing structural, which is the entire point of Part 1's Section 3 note.

**API consumer** — a second system reading this one. Named here because it is the trigger condition for D-19: integration events exist when this user type does, and not before.

---

## 8. High-Level Business Workflows

Each workflow below names the contexts it crosses and the domain events it produces. The events are only *named* here; Section 9 defines them.

### [MVP] W1 — Visitor discovers and reserves

**Purpose:** convert a phone call into a transaction the owner does not have to answer. **Contexts:** Catalog (what is bookable, at what rate, at what deposit), Availability & Reservation (whether it is free), Asset Registry (upstream — the Rentable count that availability is computed from).

A Visitor browses published AssetTypes, picks a RentalPeriod, and sees Availability computed per D-08's strict rule from Rentable Assets minus active Reservations. They may assemble several AssetTypes with different RentalPeriods; at commitment this produces one ReservationGroup and *n* Reservations, one per AssetType (D-13). Each Reservation holds its RentalDays in a **Pending** condition (D-18) and the Visitor becomes a Customer.

Before payment begins, the Customer is shown rental terms, deposit and deduction rules, and pre-contractual information, then accepts them. The acceptance (timestamp and terms version) is recorded on the ReservationGroup.

**Outcome:** a ReservationGroup of Pending Reservations, holding calendar days, awaiting payment. **Failure modes:** the days go while the customer deliberates — resolved by D-18's hold rather than by a race at payment time; the Customer abandons checkout — the hold expires and the days return; two Customers reach for the last unit — one is refused before any money moves, which is the entire purpose of the Pending state.

**Events:** `ReservationPlaced`, `TermsAccepted`.

### [MVP] W2 — Customer completes online payment

**Purpose:** take the rental fee before the Asset leaves. **Contexts:** Payments (upstream), Availability & Reservation.

One Payment covers the whole ReservationGroup — this is the fact D-13 exists to hold. On success every Reservation in the group becomes **Confirmed** and the calendar days are firm. On failure or abandonment the Pending holds expire and the days return.

When `PaymentReceived` arrives after the Pending window has expired, the system does not "confirm anyway". It atomically attempts to re-acquire the same RentalDays; if successful, confirmation proceeds. If not, payment is refunded automatically and the Customer is notified.

**Outcome:** a Confirmed ReservationGroup and a Customer who owes an ID photograph. **Failure modes:** payment succeeds but confirmation is lost — the Payment is upstream and its success is the trigger, so the reservation converges rather than needing a human; partial payment is not a concept and must not become one, because a ReservationGroup is paid whole or not at all.

**Events:** `PaymentReceived`, `ReservationConfirmed`, `ReservationExpired`, `PaymentRefunded`.

### [MVP] W3 — Identity evidence and verification

**Purpose:** make the deposit and the claim mean something by knowing who took the Asset. **Contexts:** Customer Identity & Compliance, Handover & Possession (as the consumer of the verification).

This workflow is two acts separated by days, and conflating them is the mistake to avoid. **The evidence is submitted online, after payment.** The Customer photographs their ID and it is stored with a RetentionDeadline attached at creation (P7). **The verification happens at the counter**, at HandoverOut, when an Operator compares the photograph to the human in front of them and records the outcome. Part 1 already gives these two acts separate names — IdentityEvidence and IdentityVerification — and this workflow is why.

**Outcome:** IdentityEvidence exists with a clock on it, and a successful IdentityVerification exists as a precondition of HandoverOut. **Failure modes:** the Customer paid and never uploaded — the Operator captures the evidence at the counter as a fallback channel for the same concept, not a different one; the photograph is unreadable or the name does not match the human — the verification is rejected, the Asset does not leave, and the Customer has paid for something they cannot collect, which lands squarely on the cancellation and refund policy Part 1 marks launch-blocking.

**Events:** `IdentityEvidenceSubmitted`, `IdentityVerified`, `IdentityVerificationRejected`.

> **D-15 — When IdentityEvidence is captured**
> **Considered:** (a) ID upload required before payment; (b) upload after payment, required before HandoverOut; (c) capture at pickup only, as the business does today.
> **Trade-offs:** (a) puts the highest-severity data in the system at the worst point in the funnel, and — decisively — it creates IdentityEvidence for checkouts that are abandoned. D-11's lawful basis for holding an ID photograph is the open rental; there is no rental until there is a payment; therefore evidence captured before payment is personal data of the highest severity held with **no basis at all**, and a pile of it accumulates from people who never became customers. (c) loads the whole check onto the counter, which is the interaction P3 wants to be a scan. (b) means evidence exists only for rentals that are real.
> **Recommended:** **(b).**
> **Why:** verification cannot happen online in the MVP anyway — it requires a human looking at a human — so the only thing the online step buys is not doing the *upload* at the counter, and that benefit is fully available after payment while the liability of (a) is not. `[Future]`: automated document checking would move IdentityVerified online and make this decision worth revisiting; it is not MVP.

### [MVP] W4 — HandoverOut at the counter

**Purpose:** the thirty seconds the whole product exists to make fast. **Contexts:** Handover & Possession (owner), Customer Identity & Compliance and Availability & Reservation (upstream), Asset Registry.

The Customer appears. The Operator verifies identity (W3), takes the cash deposit, picks whichever Rentable Asset of the reserved AssetType is on the shelf — instance choice is deferred to this moment by D-04, and this is where that decision pays — records its condition with photographs, and scans the AssetTag. The ScanEvent is an intent; the domain resolves it against the Asset's current state and finds that this means HandoverOut (P3). A RentalAgreement comes into being binding one Customer, one Asset and one Reservation. Possession opens. The Asset becomes InPossession.

A ReservationGroup of three AssetTypes produces **three HandoverOut events and three RentalAgreements** in one visit, because Possession is per-Asset (D-13). The group does not become an agreement.

**Outcome:** Possession open, cash in the drawer, condition on the record, physical clock running. **Failure modes:** no Rentable Asset of the type is on the shelf despite the calendar — the physical world has diverged (P1) and the Operator resolves it by hand, which strict overbooking (D-08) makes rare rather than impossible; the Operator forgets to scan — the record says the drill is on the shelf and it is in a van, correctable per P1 with a reason; the Customer cannot pay the deposit in cash — the Asset does not leave, and there is no partial deposit.

**Events:** `ConditionReportCaptured`, `DepositTaken`, `HandoverOut`.

### [MVP] W5 — HandoverIn and Settlement

**Purpose:** close the possession, resolve the money, return the Asset to the pool. **Contexts:** Handover & Possession, Asset Registry, Customer Identity & Compliance (as a reactor).

The Asset comes back. The Operator scans; the domain resolves the ScanEvent to HandoverIn and Possession closes. The Asset moves to UnderInspection. Condition is captured again, and the pairing of the two ConditionReports is what makes any deduction defensible (Part 1's corollary). The deposit is returned in full or in part with a reason. The RentalAgreement settles. The Asset returns to the pool — on the day after the RentalPeriod's final day, per D-09.

Settlement is the event that starts the D-11 retention clock, and this is the reaction that justifies D-06's boundary: Handover & Possession says a rental closed; Customer Identity & Compliance hears it and sets a deadline on a photograph.

**Outcome:** Possession closed, deposit resolved, Asset Rentable again, retention clock running. **Failure modes:** the Asset comes back damaged — the deduction path (W8); it comes back and nobody scans — the record says Overdue and the drill is on the shelf, which is exactly why P1 demands correction be a product feature; it does not come back at all (W6).

**Events:** `HandoverIn`, `ConditionReportCaptured`, `DepositReturned`, `SettlementCompleted`, `AssetReturnedToPool`, `AssetMarkedUnavailable`.

### [MVP] W6 — Overdue handling

**Purpose:** get the thing back, and protect the customer it was promised to next. **Contexts:** Availability & Reservation (the commercial clock), Handover & Possession (the physical clock), Notification.

Overdue is derived by comparing the two clocks and is never written down (Part 1). The system's entire job is to notice, tell the Customer, and put it in front of an Operator ranked by consequence.

**Outcome:** the Customer knows; the Operator knows, and knows which of tomorrow's Reservations is now at risk. **Failure modes:** the Asset is back and unscanned, so the reminder is wrong and the Customer is annoyed — the reason D-17 refuses automation; the Customer is unreachable — a human problem with a human solution.

**Events:** `NotificationDispatched`, and eventually `AssetDeclaredLost`.

> **D-17 — What the system does when a rental runs Overdue**
> **Considered:** (a) notify the Customer only; (b) notify the Customer and surface the Overdue to an Operator; (c) staged automatic escalation — reminders, then penalties, then an automatic LostAsset declaration or claim.
> **Trade-offs:** (c) is what the question was reaching for and it is wrong here for a reason that is worth stating precisely: **automatic escalation is automatic confidence in a database that P1 states will be wrong.** The most common cause of an Overdue in this business is not theft — it is an employee who did not scan. (c) sends a legal-sounding email, or levies a fee, against a Customer who returned the drill on time. It also cannot be built: late fees are deferred and undecided (Part 1), the deposit is cash in a drawer the platform cannot reach into (D-07), and a claim exceeding the deposit leaves the system entirely. (a) is honest but leaves the Operator to discover the problem by remembering.
> **Recommended:** **(b), implemented as nothing more than notifications on a schedule plus a derived Operator view. No escalation state machine, no automatic penalty, no automatic LostAsset.** The transition from Overdue to LostAsset is always an Operator declaration with a reason, gated by a single named policy value rather than a workflow.
> **Why:** the system's comparative advantage here is *noticing*, not *deciding* — it can compare two clocks continuously, which the owner cannot, and it cannot tell theft from a missed scan, which the owner can in one phone call. **And the operationally important point, which (a) misses entirely: an Overdue Asset is not primarily a late customer, it is a threat to a future Reservation.** Strict overbooking (D-08) means the drill that has not come back was probably promised to someone on Thursday. The Operator's view must therefore rank by what the Overdue threatens, not by how many days late it is, because a five-day Overdue on an Asset nobody wants is a phone call and a one-day Overdue on the only breaker is an emergency.
> **A note on state.** The reminders sent are real facts and are recorded — you will want them in a dispute — but they are an append-only history (P4), not an escalation level written onto the Reservation. Anything that mutates a Reservation to describe what physically happened has conflated the clocks.

### [MVP] W7 — NoShow handling

**Purpose:** decide what happens to days that were paid for and not used. **Contexts:** Availability & Reservation.

A NoShow is a Reservation whose RentalPeriod began without a HandoverOut — derived, never stored. The system notices and tells an Operator. It does nothing else, and in particular **it must not release the calendar days**: they were paid for, the Customer may yet appear on day two of three, and re-selling a day out from under a paying Customer is a failure D-08 exists to prevent. Whether the Customer is refunded is the cancellation policy, which is launch-blocking and deferred.

**Outcome:** the Operator knows a paid Reservation went uncollected. **Failure modes:** the Customer arrives late on day two and expects three days — a commercial conversation, not a code path.

**Events:** `NotificationDispatched`.

### [MVP] W8 — Deposit deduction and dispute

**Purpose:** turn a disagreement at a counter into a decision backed by evidence. **Contexts:** Handover & Possession only.

At Settlement the Operator assesses the inbound ConditionReport against the outbound one and returns the deposit in full or in part, recording the deduction and its reason. Part 1's corollary is the invariant: **no deduction without both reports.**

**There is deliberately no dispute workflow in the MVP.** A dispute is a conversation at a counter, and the product's contribution is the paired evidence and the attribution of who recorded it. There is no case, no escalation, no timeline, no status. D-05 already names the condition that changes this — Condition & Settlement splits out of Handover & Possession when settlement stops being simultaneous with return — and a dispute-management surface arriving before that split would be the tail wagging the dog.

**Outcome:** a deduction that is defensible, or a deposit returned whole. **Failure modes:** the damage exceeds the deposit — a €50 deposit against a €900 breaker — which Part 1 flags as a claim that leaves the system and is deferred; the Customer refuses and walks out with the cash — a human problem, and the ConditionReports are what the owner takes to whoever handles it next.

**Events:** `DepositReturned`, `AttestationCorrected`.

### [MVP] W9 — Operator registers a new Asset

**Purpose:** get a physical thing into the system with a QR code on it. **Contexts:** Asset Registry, Catalog (upstream — the Asset must be of an AssetType).

The Operator creates the Asset against an existing AssetType, binds an AssetTag, and marks it Rentable. **Asset acquisition is not modelled** — there is no purchase, no supplier, no intake, no cost basis (Part 1, Asset Registry). The Asset's history begins at registration.

Tag binding is a separate act from registration because tags are physical and fail: they peel off breakers and get sanded off scaffolding, and Part 1's glossary is explicit that the tag is not the Asset and tags can be replaced. Rebinding a tag must therefore be routine.

**Outcome:** a Rentable Asset, tagged, counting toward Availability for its AssetType. **Failure modes:** a tag is bound to the wrong Asset — correctable (P1); a tag is destroyed — rebind; an Asset is registered under the wrong AssetType and silently changes two availability counts.

**Events:** `AssetRegistered`, `AssetTagBound`, `AssetMadeRentable`.

### [MVP] W10 — Retention erasure

**Purpose:** make P7 true rather than aspirational. **Contexts:** Customer Identity & Compliance only.

This workflow has no human in it. When Settlement closes a RentalAgreement, the retention clock starts (D-11); when the RetentionDeadline arrives, the IdentityEvidence is erased and the erasure is recorded. The Customer's rental history survives — erasing the photograph must never erase the record that has an independent basis for being retained, which is the whole reason D-06 drew its boundary.

It is listed as a workflow, unasked, because it is the one obligation in this document that will otherwise be built last or never, and because P7's claim that deletion is "routine, cheap, scheduled and boring" is only true if something schedules it.

**Outcome:** no ID photograph outlives its purpose. **Failure modes:** the erasure job never runs and nobody notices — the failure is silent, which is what makes it dangerous; evidence attached to a Reservation that never settled has no clock start, which is the edge case to design against rather than discover.

**Events:** `IdentityEvidenceErased`.

### [Launch-blocking, design deferred] W11 — Cancellation and refund

Named here so that Section 9's `ReservationCancelled` and `PaymentRefunded` have a home, and so the gap is visible. The policy is a launch blocker per Part 1; the workflow is not designed in this part. Two constraints it must satisfy are already fixed and should not be rediscovered: a cancelled Reservation **must release its RentalDays** or the availability invariant silently rots, and cancelling part of a ReservationGroup is the seam where D-13's grouping earns its keep.

The legal brief for this workflow must explicitly cover five paid-but-not-performed paths: voluntary cancellation, NoShow, rejected IdentityVerification, inability to pay cash deposit at pickup, and payment-after-expiry where re-acquire fails and refund is automatic.

---

## 9. Business Events

### Domain events and integration events

A **domain event** is a business fact: something happened, it is in the past tense, and the owner of the business would recognise the sentence. An **integration event** is a domain event serialised, versioned and published for a consumer outside the emitting context's deployment. They are different artefacts with different obligations — an integration event is a public contract and acquires compatibility rules, a schema, and a consumer you cannot refactor.

Neither is Ubiquitous Language. These are architectural vocabulary, not words the owner says, and they do not go in Part 1's glossary.

> **D-19 — Integration events are deferred**
> **Considered:** (a) publish integration events from the start so contexts are decoupled and extraction is easy later; (b) in-process domain events only, integration events when a second consumer exists.
> **Trade-offs:** (a) buys a decoupling that D-02 already declined to want — contexts are modules in one deployable, so there is nothing to integrate *with* — and charges for it in serialisation, versioning, ordering, delivery semantics and a bus, all operated by one person. (b) risks that extraction later requires defining the contracts you skipped.
> **Recommended:** **(b).** In-process domain events only. No bus, no broker, no outbox, no published schema.
> **Why:** an integration event with one consumer inside the same process is a domain event wearing a costume, and every cost it carries is paid for a consumer that does not exist. The trigger is precise and worth writing down: **integration events exist when the API consumer of Section 7 exists, or when a context is extracted onto a different deployment.** Until then, honest module boundaries (D-02) give the same extractability at none of the cost. The events named below are already the right contracts; making them public is a later, additive act.

### Two things that are not events

**Overdue and NoShow are derived conditions, not domain events.** Nothing happened. A RentalPeriod ended and an Asset did not come back — an *absence*, discovered by comparing two clocks. Emitting `OverdueDetected` would mean the system asserts as a fact something it inferred from a gap in a record P1 guarantees will be wrong. The reminder that gets sent is a real event; the Overdue itself is a query. This is the same discipline as Part 1's refusal of a `Reserved` asset status, applied to time.

**Availability is not an event either**, for the same reason: it is computed from Rentable Assets minus active Reservations, per day, on demand.

### Event catalogue

Reactions listed are MVP reactions only. Where a cell reads "nothing", that is deliberate and worth preserving — an event with no consumer is a fact for the record and for P4's history, not a design failure.

#### Availability & Reservation

| Event | What it represents | Reacted to in MVP by | Tag |
|---|---|---|---|
| `ReservationPlaced` | A Customer committed to a claim on one AssetType for a RentalPeriod; its RentalDays are now held Pending (D-18). | nothing | [MVP] |
| `TermsAccepted` | The Customer accepted rental terms and pre-contractual information before payment; timestamp and terms version are recorded on the ReservationGroup. | nothing | [MVP] |
| `ReservationConfirmed` | Payment cleared for the ReservationGroup; the claim is firm. | Notification (confirmation) | [MVP] |
| `ReservationExpired` | A Pending Reservation lapsed unpaid; its RentalDays are released. Emitted when expiry is recorded by the Platform sweep process, not as an implicit read-time condition. | nothing | [MVP] |
| `ReservationCancelled` | A Confirmed Reservation was withdrawn; its RentalDays are released. | Payments (refund), Notification | [MVP] · W11 blocking |

#### Payments

| Event | What it represents | Reacted to in MVP by | Tag |
|---|---|---|---|
| `PaymentReceived` | The rental fee for one ReservationGroup cleared. | Availability & Reservation (confirm) | [MVP] |
| `PaymentRefunded` | A rental fee was returned, whole or in part (including automatic refund when payment arrives after expiry and re-acquire fails). | Notification | [MVP] · W11 blocking |

#### Customer Identity & Compliance

| Event | What it represents | Reacted to in MVP by | Tag |
|---|---|---|---|
| `IdentityEvidenceSubmitted` | A Customer's ID photograph exists, with a RetentionDeadline attached at creation (P7). | nothing | [MVP] |
| `IdentityVerified` | An Operator compared the evidence to the human and accepted it. | Handover & Possession (precondition of HandoverOut) | [MVP] |
| `IdentityVerificationRejected` | The comparison failed, with a reason. The Asset does not leave. | nothing | [MVP] |
| `IdentityEvidenceErased` | A RetentionDeadline arrived and the photograph is gone. Emitted by the Platform. Rental history survives. | nothing | [MVP] |

`IdentityEvidenceErased` has no reactor and must never be removed on that basis. It is the only evidence that P7 is real rather than intended, and it is the artefact you produce if anyone ever asks.

#### Asset Registry

| Event | What it represents | Reacted to in MVP by | Tag |
|---|---|---|---|
| `AssetRegistered` | An Operator brought a physical unit into the system. No purchase, no supplier (W9). | nothing | [MVP] |
| `AssetTagBound` | An AssetTag was bound to an Asset. Separate from registration because tags fail and are replaced. | nothing | [MVP] |
| `AssetMadeRentable` | An Asset entered the rentable pool; Availability for its AssetType rises. | nothing | [MVP] |
| `AssetMarkedUnavailable` | An Asset left the pool — damaged, in service — with a reason; Availability falls. | Notification `[Future]` | [MVP] |
| `AssetReturnedToPool` | An Asset passed inspection and is Rentable again (D-09: the day after the RentalPeriod ends). | nothing | [MVP] |
| `AssetRetired` | An Asset left permanently. | nothing | [MVP] |

#### Handover & Possession

| Event | What it represents | Reacted to in MVP by | Tag |
|---|---|---|---|
| `HandoverOut` | An Asset left the Tenant's control; a RentalAgreement came into being and Possession opened. | Asset Registry (InPossession) | [MVP] |
| `HandoverIn` | An Asset returned to the Tenant's control; Possession closed. | Asset Registry (UnderInspection) | [MVP] |
| `ConditionReportCaptured` | Observations and photographs of an Asset's state at one end of a rental. | nothing | [MVP] |
| `DepositTaken` | An Operator attests that cash changed hands at HandoverOut. Attestor generalises to the Platform under card holds (D-07). | nothing | [MVP] |
| `DepositReturned` | An Operator attests that the deposit was returned, in full or in part, with any deduction and its reason. Invalid without paired ConditionReports. | Notification `[Future]` | [MVP] |
| `SettlementCompleted` | A RentalAgreement closed: condition assessed, deposit resolved, Asset released. | **Customer Identity & Compliance (start the D-11 retention clock)** | [MVP] |
| `AssetDeclaredLost` | An Operator declared an Asset gone. Never automatic (D-17). | Asset Registry (Retired) | [MVP] |
| `AttestationCorrected` | An Operator corrected a previously recorded fact, with a reason and attribution. A new fact appended, never an edit (P1, P4). Attestations carry both occurred-at and recorded-at times; derivations use occurred-at. | varies | [MVP] |

`SettlementCompleted` is the most important row in this section. It is the only cross-context reaction in the MVP that does real work, and it is what makes D-06's boundary earn its cost: one context announces that a rental closed, another hears it and puts a clock on a photograph. If that reaction is ever implemented as a direct call from Settlement into the identity model, the boundary has been lost and D-11 becomes an archaeology project again.

`AttestationCorrected` implements P1's promise that the record can be repaired without a database console. Under card holds, correction of a `DepositReturned` becomes a compensating refund in Payments rather than an appended correction — the fact stays correctable, the mechanism differs (D-07).

Two high-frequency correction actions are first-class in MVP: backdated `HandoverOut` (when pickup happened but scan was missed) and backdated `HandoverIn` (when return happened but scan was missed). Both require a reason.

#### Notification

| Event | What it represents | Reacted to in MVP by | Tag |
|---|---|---|---|
| `NotificationDispatched` | A message was sent to a Customer, of a named kind (confirmation, pickup reminder, return reminder, Overdue reminder). | nothing | [MVP] |

Recorded because it is what you point at when a Customer says they were never told, and because it is the append-only history D-17 substitutes for an escalation state machine. Notification remains deliberately stupid: no preferences, no templates, no campaigns.

### ScanEvent is not in this catalogue

Deliberately. Part 1 defines a ScanEvent as an **intent, not a transition** — the Operator scans and the domain decides what it means from the Asset's current state (P3). The scan is recorded, because reconciliation needs it and because "the tag was scanned at 14:02" is exactly the fact you want when the record and the warehouse disagree. But no context reacts to a ScanEvent. Contexts react to the HandoverOut or HandoverIn the domain *resolved it into*. Anything subscribing to raw scans has moved the decision out of the domain and into the caller, which is the failure P3 describes.

---

## Decisions this part could not avoid

> **D-18 — Reservation lifecycle and the Pending hold**
> **Considered:** (a) a Reservation exists only once payment succeeds; (b) a Reservation is created Pending at commitment, holds its RentalDays, and becomes Confirmed on payment or expires if payment does not complete within a short window; (c) check availability at payment time and reject the payment if the days have gone.
> **Trade-offs:** (a) is the smallest model and it lets two Customers pay for the last breaker, since nothing holds the days while a card is processed — which violates D-08's strict invariant not through a policy choice but through a race. (c) narrows the window without closing it and produces the worst available failure: a Customer whose card was charged and who has no Asset. (b) costs one state and one expiry.
> **Recommended:** **(b).** Reservation states are **Pending, Confirmed, Cancelled, Expired**, and that is the complete list.
> **Why:** strict no-overbooking is the invariant the Availability & Reservation context exists to protect (D-08), and an invariant that concurrency can violate is not an invariant — a Pending hold is the cheapest thing that makes it true.
> **The boundary this must not cross:** a Reservation is **never** closed, completed or fulfilled by anything physical. There is no Fulfilled state and there must never be one. Part 1 is explicit that code which closes a Reservation because an Asset came back has conflated the clocks. Pending/Confirmed/Cancelled/Expired are all facts about the *commercial* claim; Overdue and NoShow stay derived.

---

## Glossary additions

Part 1's Ubiquitous Language is normative and these are the only additions. Each is listed with why it was missing.

| Term | Meaning | Owned by | Why it was missing from Part 1 |
|---|---|---|---|
| **Visitor** | A person browsing the Catalog who has not committed to a Reservation. Has no domain existence, owns no aggregate, emits no event, and is deliberately not modelled (Section 7). | nobody, by design | Part 1 enumerated domain concepts, and a Visitor is not one. The term exists to make the absence a decision rather than an omission, and to give the browse workflow an actor to name. |
| **Attestation** | A recorded claim by an Operator, or by the Platform, that something happened in the physical world — cash changed hands, an Asset was handed over, a condition was observed. Attestations can be wrong and are corrected by appending, never by editing (P1, P4). | Handover & Possession | Part 1 used the word descriptively — "Operator attestations that cash changed hands" — without defining it. Part 2 needs it as a noun, because `AttestationCorrected` applies uniformly across DepositTaken, HandoverOut and ConditionReport, and P1's correctability promise has no subject without it. |

**Not added, and not to be added:** *DomainEvent* and *IntegrationEvent* are architectural vocabulary, not Ubiquitous Language — the owner does not say them. *Escalation*, *Case*, *Ticket*, *Role*, *Permission*, *Account* and *Cart* appear nowhere in this part and must not appear in code; each names a `[Future]` concept or a rejected one (D-14, D-16, D-17, W8). Part 1's bans on **Booking**, **Order**, **Item**, **Product**, **Inventory**, **User** and **Check-out / Check-in** remain in force and apply to event names without exception.

## Assumptions register (continued)

- **A-08** — Notification is email for confirmations and reminders. Whether the return reminder is worth paying for as SMS is a cost decision, not a domain one; Notification stays dumb either way.
- **A-09** — Catalog and price administration is a low-frequency surface distinct from the high-frequency counter interaction. Whether they share an application is out of scope for this part and changes nothing in Sections 7–9.

## Deferred to later parts

Cancellation and refund workflow (W11 — **launch-blocking**, policy undecided, Part 1) · the LostAsset threshold policy value (D-17) · Operator roles, triggered by the third employee (D-16) · automated identity verification (D-15) · integration events and their trigger conditions (D-19) · dispute management, triggered by the D-05 split · everything technological.
