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
- Part 4 — risks, technology decisions, ADR log (D-01…D-53)
- Part 5 — independent review findings (F1–F12)
- `docs/reviews/implementation-review-2026-08-04.md` — implementation
  review findings (IR-01…IR-13), reconciled in Part 4 §16.2
- `docs/design/interface-design-foundation.md` — presentation and
  interaction layer, decisions promoted to Part 4 §16.3 (D-43…D-53)

## Precedence when instructions conflict
1. Part 4 §16.2 implementation-review decisions (D-38…D-42)
2. Part 4 §16.3 interface-design decisions (D-43…D-53) — for
   presentation/interaction questions only; never overrides an FR/NFR
3. Part 4 §16 reconciliation decisions (D-10, D-33…D-37)
4. Part 3 FR/NFR requirements
5. Part 2 workflows and event catalogue
5. Part 1 Ubiquitous Language and boundaries

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
- Availability capacity is the POOL — Assets that are Rentable, 
  InPossession or UnderInspection — never the count of Assets currently 
  in Rentable status (D-38). An Asset being out today must not reduce 
  capacity for any other day; its own Reservation's holds already did.
- A photograph counts as evidence only once its object is confirmed 
  stored. FR-20 counts confirmed ConditionReports only (D-40).
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

- **F1 — Terms acceptance. RESOLVED (D-35).** Mechanics are built: 
  ReservationGroup carries terms version + timestamp, and HandoverOut 
  refuses a group with no recorded acceptance. Still open is the terms 
  CONTENT and the pre-contractual information catalogue — legal, OQ #1.
- **F6 — Customer-record retention. NOW A LIVE GAP (IR-07).** Customer 
  name/email/phone are persisted with no RetentionDeadline, violating 
  P7 in production. Needs a period and a recorded basis — OQ #27, same 
  lawyer conversation as OQ #2.
- **F8 — Shared counter phone. RESOLVED.** Per-Operator PIN 
  re-confirmation is built (server/utils/operator-pin.ts) and evidence 
  reads carry no-store. The PIN prompt still needs a UI (IR-12).
- **F10 — QR tag generation. RESOLVED.** Opaque tag codes from a 
  dedicated sequence, bulk registration, client-side QR rendering.
- **D-33 — concurrency mechanism. RESOLVED.** Atomic conditional UPSERT 
  with reap-on-contention, plus a concurrency proof test (OQ #23). Do 
  not replace it with SERIALIZABLE or advisory locks without an ADR.

## OPEN WORK from the 04 August 2026 implementation review
Full reasoning in docs/reviews/implementation-review-2026-08-04.md. 
Each has a GitHub issue; cite the IR number alongside the governing 
identifier in commits.

- **IR-01 (Critical) — capacity double-counts a handed-out Asset.** 
  getRentableCount reads status='rentable'. Fix per D-38.
- **IR-02 (Critical) — RETENTION_WINDOW_DAYS is null**, so no end-to-end 
  rental can be exercised. Not a code fix; OQ #2 must be answered.
- **IR-03 (High) — D-34 unimplemented, no CI exists at all.**
- **IR-04 (High) — D-32 nightly pg_dump missing; R-04 unmitigated.**
- **IR-05 (High) — Sentry absent.** Add SDK and NFR-08 scrubbing in the 
  SAME change, never SDK first.
- **IR-06 (High) — FR-40 unimplemented.** Job-run ledger per D-41.
- **IR-07 (High) — F6 above.**
- **IR-08 (Medium) — availability has no HTTP surface; FR-02 half-met.**
- **IR-09 (Medium) — per-request connection churn on the scan path.** 
  Fix per D-39. Keep prepare:false.
- **IR-10 (High) — photo rows created without proof of upload.** D-40.
- **IR-11 (Medium) — Stripe webhook idempotency is check-then-act.**
- **IR-12 (Medium) — counter/checkout/Customer-link UI absent.**
- **IR-13 (Low) — FR-38 cookie banner may be the wrong requirement.**

## Launch-blocking open questions (do NOT invent defaults)
- Cancellation/refund policy (OQ #1) — leave cancel path unimplemented
- IdentityEvidence retention window value + legal basis (OQ #2)
- Backup retention horizon value (OQ #3)
- Controller–processor agreement (OQ #4)
- Customer-record retention period + basis (OQ #27, IR-07)

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

## Interface work
`docs/design/interface-design-foundation.md` governs presentation and
interaction (Part 4 §16.3, D-43…D-53). It is subordinate to Parts 1–5:
where it conflicts, they win.

- Never a raw colour, size, radius or font value in a component — tokens only.
- Never a user-facing string outside app/i18n/sk.ts (D-20), including
  error text. Server error TEXT is never displayed; map its code.
- Never format money, a day or a period in a component — app/utils/format.ts.
- Never compute a date in the UI. Availability & Reservation owns date
  arithmetic.
- Banned terms apply to component names, props, CSS classes and i18n keys.
- The browser never shows a state transition the server has not confirmed.
- Stored states and derived facts get different visual treatments and are
  never interchanged (FR-28).
- Cite a screen (S-xx) and a requirement in every UI commit.

Review checklist for any UI pull request: tokens only · no string
literals · formatting module used · error codes not text · four states
on every mutating control · attesting actions PIN-gated · irreversible
actions confirmed · keyboard and focus verified · contrast checked on
the surface it ships to · no new domain vocabulary.

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