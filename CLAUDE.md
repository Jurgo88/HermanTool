# Rental Platform — Agent Instructions

## What this project is
Asset Lifecycle Management platform for a tool rental business in 
Slovakia. Pilot: ~200 assets, 1 owner + 1 employee, B2C, Slovak 
market. Architecture is designed multi-tenant in the model, 
single-tenant in operations.

## Source of truth
The architecture specification in `/docs/architecture/` is 
NORMATIVE. Read it before implementing anything non-trivial.

- Part 1 — domain, boundaries, Ubiquitous Language, principles P1–P8
- Part 2 — user types, workflows W1–W11, event catalogue
- Part 3 — functional (FR-XX) and non-functional (NFR-XX) requirements
- Part 4 — risks, technology decisions, ADR log (D-01…D-37)
- Part 5 — independent review findings (F1–F12)

## Precedence when instructions conflict
1. Part 4 §16 reconciliation decisions (D-10, D-33…D-37)
2. Part 3 FR/NFR requirements
3. Part 2 workflows and event catalogue
4. Part 1 Ubiquitous Language and boundaries

## Banned terms — NEVER use in code, tables, config, or naming
Booking, Order, Item, Product, Inventory, User, Check-out/Check-in, 
Role, Permission, Account, Cart, Session (as domain term), Fulfilled, 
Escalation, Case, Ticket. Also never: `name_sk`, `rentalGranularity`.

Use instead: Reservation, AssetType, Asset, Operator, Customer, 
HandoverOut/HandoverIn, RentalAgreement, Possession, ReservationGroup.

## Non-negotiable architecture rules
- No client → database writes. Domain logic lives in Nitro server 
  routes only (D-25). The browser never declares a state transition.
- A ScanEvent is an intent; the domain resolves it to HandoverOut or 
  HandoverIn from the Asset's current state (P3, FR-17). No caller 
  declares the transition.
- Every aggregate root carries a Tenant identity; every query is 
  scoped by Tenant (P2, FR-33).
- Every Operator action records which Operator performed it (D-16, 
  FR-34).
- Reservation and Possession are separate clocks. Overdue and NoShow 
  are DERIVED, never stored (P1, FR-28).
- No deduction without paired ConditionReports (P1 corollary, FR-20).
- Every monetary amount carries its currency (D-21).
- IdentityEvidence always carries a RetentionDeadline (P7, FR-12).

## Tech stack (Part 4)
- Frontend: Nuxt 4 (PWA both sides, no native, no offline)
- Backend: Nitro server routes only
- DB + auth: Supabase (Postgres)
- Storage: Cloudflare R2, two buckets (evidence unbacked, conditions backed)
- Payments: Stripe, Tenant's own account, hosted checkout
- Email: Resend
- Error tracking: Sentry Developer, PII scrubbed in SDK
- Hosting: Netlify. Domain: Websupport (DNS only)
- Migrations: files in repo, GitHub Actions, expand/contract only (D-30)

## KNOWN GAPS — resolve when the relevant work is reached
These are deliberately deferred per the "resolve at build time" 
decision. When implementation touches one of these, STOP and flag it 
rather than inventing a default.

- **F1 (Critical) — Terms acceptance missing.** No FR yet for 
  presenting rental terms + deposit rules before payment and 
  recording acceptance on ReservationGroup with timestamp + terms 
  version. When building the checkout/payment flow (W2), this must 
  be designed. D-35 sketches it; it needs a proper FR.
- **F6 — Customer-record retention.** Customer name/email/phone has 
  no RetentionDeadline, violating P7. When building the Customer 
  model, decide the retention basis (accounting/limitation statute) 
  and apply a deadline.
- **F8 — Shared counter phone.** D-22 assumes one device per 
  Operator; reality is one shared counter phone. When building 
  attesting actions (DepositTaken, DepositReturned, ConditionReport, 
  LostAsset), add per-Operator PIN re-confirmation.
- **F10 — QR tag generation.** Nothing generates or prints the QR 
  tags the whole operational loop depends on. When building Asset 
  registration (W9), design tag generation (opaque tag identity, not 
  a URL) and the 200-asset bootstrap.
- **D-33 detail — concurrency mechanism for D-08.** The overbooking 
  invariant needs a materialised holds-per-(AssetType,day) counter in 
  the same transaction as Reservation creation. Isolation level, 
  retry semantics, and constraint placement are not yet specified. 
  Design carefully when building the reservation hold logic; write a 
  concurrent-booking test (OQ #23).

## Launch-blocking open questions (do NOT invent defaults)
- Cancellation/refund policy (OQ #1) — leave cancel path unimplemented
- IdentityEvidence retention window value + legal basis (OQ #2)
- Backup retention horizon value (OQ #3)
- Controller–processor agreement (OQ #4)

## Working style
- Cite a governing identifier (FR-XX, D-XX, W-XX) in every commit 
  and PR. If you can't cite one, the change may be out of scope — ask.
- Expand/contract migrations only. Never destructive in one step.
- Never put business logic in RLS policies or Edge Functions.