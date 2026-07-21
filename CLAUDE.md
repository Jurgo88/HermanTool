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
- Database access is server-side and direct-to-Postgres only — no 
  Supabase Data API/PostgREST, no client-side supabase-js (D-25, D-31, R-09).
- RLS is a secure-by-default second line of defence, never where 
  domain logic lives; the service-role key bypasses RLS entirely and 
  never reaches the client (D-31, P2).
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
- Node 26, pinned via .nvmrc/.node-version; migrate to the Active LTS 
  line at or after Node 26's October 2026 LTS promotion.
- DB + auth: Supabase — direct Postgres connection plus Auth. NOT 
  used: Data API/PostgREST (disabled), client-side supabase-js, 
  RLS-as-logic, Edge Functions (D-25, D-31).
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

## Coding conventions

### Language & tooling
- TypeScript everywhere, strict mode on. No plain JS files.
- Formatting and linting: Prettier + ESLint. The config is the 
  source of truth; do not hand-format against it.
- Package manager: pnpm and never mix.
- Node 26, pinned via .nvmrc (see Tech stack). Local, CI, and Netlify 
  must match.
- pnpm managed via Corepack; version pinned in package.json 
  "packageManager" field.

### Naming
- Files: kebab-case (asset-registry.ts, not assetRegistry.ts).
- Types, interfaces, classes: PascalCase.
- Variables, functions: camelCase.
- Domain terms follow Part 1's Ubiquitous Language EXACTLY. An 
  AssetType is `AssetType`, never `assetKind` or `category`. The 
  banned-terms list in CLAUDE.md applies to every identifier.

### Structure
- One bounded context = one module directory (D-02). Contexts do 
  not import each other's internals — only their published 
  interfaces. Dependency direction follows Part 1's context map.
- Domain logic lives in Nitro server routes / server-side modules 
  only (D-25). Never in Vue components, never in client code.

### Errors & validation
- Validate all input at the server boundary. Zod for schema validation.
- Domain rule violations throw typed domain errors, not generic 
  Error. The HTTP layer translates them to responses.

### Testing
- Every domain invariant from Part 1/3 has a test. Specifically: 
  the D-08 overbooking invariant, the FR-20 paired-evidence rule, 
  and the FR-33 tenant scoping MUST have tests before their 
  feature is considered done.
- Use Vitest

### Commits & PRs
- Every commit cites a governing identifier (FR-XX, D-XX, W-XX) 
  and the issue number.
- Expand/contract migrations only (D-30). Never destructive in 
  one step.
- Conventional commit style: feat:, fix:, chore:, test:, docs:.
- Every PR description ends with a closing keyword linking its 
  issue: "Closes #N". This auto-closes the issue on merge to main 
  and links PR ↔ issue for traceability.

## Implementation workflow (per issue)

When given an issue to implement:

1. Read the issue and the identifiers it cites. Read the relevant 
   parts of /docs/architecture/ before writing code.
2. If the issue touches a KNOWN GAP (see the list above), STOP and 
   flag it. Do not invent a default for a deferred decision.
3. Create a feature branch: feat/<short-name> or fix/<short-name>.
4. Propose the file structure / approach BEFORE writing files. 
   Wait for confirmation on anything non-trivial.
5. Implement, following the coding conventions.
6. Write tests for any domain invariant the issue touches.
7. Run lint, typecheck, and tests locally. Fix what breaks.
8. Commit with a conventional message citing the issue and 
   governing identifiers.
9. Open a PR summarising what changed and which identifiers govern it.

Never merge to main directly. Never skip the tests for the three 
critical invariants (D-08, FR-20, FR-33).
