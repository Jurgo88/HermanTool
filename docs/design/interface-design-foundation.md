# Interface Design Foundation — HermanTool

| | |
|---|---|
| **Status** | Approved 12 August 2026. §3's eleven decisions are promoted to Part 4 §16.3 as `D-43`…`D-53` — see that section for the ADR-log record; this document remains the governing reference for how they are carried out. **Amended 1 October 2026** for the Rent Star catalog (Part 4 §16.4, `D-54`…`D-60`): `§4.3` public tokens, `S-01`, `S-02`, `S-19`, `C-21`…`C-23`, `WP-7`, `UI-OQ-3` resolved, `UI-OQ-7`. |
| **Suggested location** | `docs/design/interface-design-foundation.md` |
| **Scope** | The visual and interaction layer of all three surfaces: public (Visitor/Customer), counter (Operator), admin (Operator). Screen inventory, design tokens, component vocabulary, interaction conventions, build sequence. |
| **Depends on** | Parts 1–5 and `docs/reviews/implementation-review-2026-08-04.md`, all **normative and unamended**. Where this document appears to disagree with them, they win and this document has a defect. |
| **Adds** | Design decisions `UI-D-01`…`UI-D-11`, promoted to `D-43`…`D-53` in Part 4's ADR log (§16.3). Screens `S-01`…`S-24`. Components `C-01`…`C-23` (`C-21`…`C-23` in the 1 October amendment). UI findings `UIF-01`…`UIF-09`. Work packages `WP-1`…`WP-7`. Open questions `UI-OQ-1`…`UI-OQ-7`. |
| **Deliberately adds no** | FR, NFR, W, P, F or IR identifiers. This document specifies *how* existing requirements are presented, never *what* the product does. A screen that needs a requirement that does not exist is a scope change and goes back to Part 3, not into this file. |
| **Namespace note** | The `UI-` prefix exists because of `F-4`: Part 4 flags `F-1…F-3` and Part 5 findings `F1…F12` already collide once. Every identifier introduced here is prefixed and unambiguous under `grep`. |

---

## 1. Is it time? — assessment of the current code

**Yes, and this is close to the last comfortable moment.** The argument, from the code as it stands on 12 August 2026:

**What makes it the right time.** Every surface the MVP needs now has a server route behind it, and eleven of them have a working page in front. The domain is settled enough that a design cannot invent anything by accident: the vocabulary is fixed (Part 1), the states are closed sets (`FR-07`, `FR-27`), the derived facts are named (`FR-28`), and the counter sequence is written down step by step (`W3`–`W5`). Designing against a moving domain produces decoration; designing against this one produces a layer that mostly disappears into the requirements. Nine of eleven pages are already the right *shape* — they hold the correct fields, call the correct routes in the correct order, and fail in the correct places. What they lack is presentation, not behaviour, and that is the cheapest possible starting position.

**What makes it urgent rather than merely possible.** There are currently zero shared UI primitives: no layout, no component directory, no stylesheet, no formatting module. Eleven pages have therefore each solved money formatting, error display, pending states and page structure privately — `toEuros` is copy-pasted in at least three files (`UIF-02`). Every screen built after this point makes that divergence one screen worse, and the remaining screens (`§6`, seven of them missing entirely) are the *dense* ones. Retrofitting a component layer under twenty screens costs several times what installing it under eleven does. This is `P8`'s test with both limbs satisfied, which is exactly the shape of decision Part 3 says to take now.

**What this cannot unblock, and must not pretend to.** The pilot is still gated on `IR-02` — `RETENTION_WINDOW_DAYS` is `null` (`server/contexts/customer-identity-compliance/identity-evidence.ts:30`), so no end-to-end rental can be exercised, and no amount of UI changes that. Nor does UI work touch `OQ #1` (cancellation), `OQ #27` (Customer-record retention) or the terms content. **UI work is genuinely parallel to the lawyer conversation** — that is its main scheduling virtue — but it must be built so that the legally blocked copy occupies a marked, obvious slot rather than a plausible-looking placeholder that survives to production (`UI-D-10`).

Note also, in passing, that `IR-01` reads as fixed in this snapshot: `getRentablePoolCount` exists alongside `getRentableCount`, with the `D-38` distinction documented at the interface. This document assumes that fix holds.

### 1.1 Current surface inventory

| Route | File | State | Verdict |
|---|---|---|---|
| `/` | `app/pages/index.vue` | Correct behaviour, unstyled, availability fan-out | Restyle (`S-01`) |
| `/checkout` | `app/pages/checkout.vue` | One page, one pay button (owner decision 2026-10-11), terms placeholder marked | Restyled (`S-03`) |
| `/reservations/:groupId/success` · `/cancel` | 2 files | Correct, minimal | Restyle (`S-04`, `S-05`) |
| `/reservations/access/:token` | `[token].vue` | Correct `D-40` upload sequence, never reads evidence back | Restyle (`S-06`) |
| `/login` | `login.vue` | Correct | Restyle (`S-18`) |
| `/admin/counter` | `counter.vue`, 542 lines | All five panels present and sequenced correctly; typed tag code; English error text leaks | Rebuild against `§3` (`S-08`–`S-12`) |
| `/admin/catalog` | `catalog.vue` | Create + publish/unpublish only; `PATCH` route has no UI | Restyle + extend (`S-19`) |
| `/admin/asset-registry` | `asset-registry.vue` | Bulk register, QR sheet, pending activation; only `<style>` block in the app | Restyle (`S-20`) |
| `/admin/job-runs` | `job-runs.vue` | Correct | Restyle (`S-21`) |

### 1.2 Server routes with no surface in front of them

These are built, tested and unreachable. Each is a screen in `§6`.

| Route | Requirement | Screen |
|---|---|---|
| `GET /api/handover/overdue` | `FR-29` — ranked by shortfall date, not days late | `S-14` |
| `GET /api/handover/no-shows` | `FR-30` | `S-15` |
| `GET /api/handover/assets/:assetId/attestation-history` | `FR-43`, `P4` | `S-13` |
| `POST /api/handover/rental-agreements/:id/declare-lost` | `FR-31` | `S-16` |
| `POST /api/handover/rental-agreements/:id/return-to-pool` | `FR-27` | `S-12` |
| `POST /api/operators/pin` | `FR-36` | `S-22` |
| `PATCH /api/catalog/asset-types/:id` | `FR-37` | `S-19` |
| `POST /api/auth/logout` | `NFR-09` (revocable sessions) | `S-23` |

Backdated attestation (`FR-24`) has a migration (`20260730120000_attestation_backdating.sql`) and no entry point at all — `S-17`.

### 1.3 UI findings in the current code

| ID | Finding | Severity | Governs |
|---|---|---|---|
| `UIF-01` | `index.vue` derives the default `startDay` via `toISOString()`, which is UTC. Between 00:00 and 02:00 Bratislava time the catalog defaults to **yesterday**, and the availability query is then asked about a day in the past. | Medium | `FR-02`, `D-09` |
| `UIF-02` | `toEuros` is reimplemented per page; output is `12.50 EUR`, which is neither Slovak convention nor `D-21`'s "amount carries its currency" expressed once. | Medium | `D-20`, `D-21` |
| `UIF-03` | Admin pages surface `err.data.statusMessage` directly — English domain-error text (`RetentionWindowNotConfiguredError`) shown to a Slovak Operator. `checkout.vue` already refuses to do this and explains why; the counter does it anyway. | Medium | `D-20` |
| `UIF-04` | Availability is fetched with one request per AssetType per date change. Correct at ~30 AssetTypes, wrong in shape. | Low | `NFR-02` |
| `UIF-05` | No app shell: no navigation between admin surfaces, no visible signed-in Operator, no logout. A revoked or expired session is discoverable only by attempting a write and being redirected. | Medium | `NFR-09`, `FR-34` |
| `UIF-06` | The counter's core interaction — the thirty seconds the product exists to protect — is **typing an opaque tag code into a text field**. | **High** | `P3`, `NFR-02`, `FR-17` |
| `UIF-07` | Eight routes have no surface (§1.2); `FR-24` has none at all. | High | see §1.2 |
| `UIF-08` | Photo capture has no per-file state: an unconfirmed ConditionReport is indistinguishable from a confirmed one in the interface, though `D-40`/`FR-20` make the difference decisive. | High | `D-40`, `FR-20` |
| `UIF-09` | No `prefers-reduced-motion`, focus-visible, contrast or landmark discipline anywhere — not because it was rejected, but because there is no stylesheet to hold it. | Low | `NFR-11` |

---

## 2. Three surfaces, three design centres

The most common way to get this wrong is to design one product. There are three, they share a domain and nothing else, and their success conditions are mutually contradictory.

**The counter (Operator, phone, in the shop).** The design centre is `P3` and `NFR-02`: scan to resolution must feel instant, and `W4`'s thirty seconds are the whole business case. One hand, often dirty; a phone held at chest height; a customer watching; fluorescent or daylight glare. This surface is **dark, large-target, single-task**. It shows one thing at a time and never asks the Operator to read. It is not a dashboard and must never grow into one.

**The public catalog (Visitor → Customer, own phone, anywhere).** The design centre is `FR-02`: a Visitor gets availability and the deposit obligation without identifying themselves and without leaving a record. The job is to make "can I have this drill on Friday, and what will it cost me including the deposit" answerable in one screen, and to make the deposit obligation impossible to miss before payment — an unpleasant surprise at the counter is the pilot's most likely trust failure. This surface is **light, calm, honest about money**.

**Admin (Operator, desktop or tablet, low frequency).** The design centre is `NFR-13`: the owner uses this weekly, not hourly. Density and legibility beat delight. Nothing here needs to be fast; several things here need to be hard to do by accident.

**They must be visibly different from each other.** That is not a stylistic preference: the counter device is a phone that also has the admin surface on it, and `FR-36` requires the Operator to know when an action is an attestation. A surface that looks the same everywhere invites the wrong mode.

---

## 3. Design decisions

Same format as Part 4. **Proposed** — nothing here is settled until you say so, and each carries the alternative I would accept if you disagree.

> ### UI-D-01 — Styling: design tokens and an owned component layer. No CSS framework, no UI kit.
> **Considered:** (a) CSS custom properties in one global stylesheet plus a small owned component layer; (b) Tailwind; (c) a component kit — Nuxt UI, PrimeVue, Vuetify.
> **Trade-offs:** (c) is the fastest route to something that looks finished and the worst fit here. It imports a vocabulary the project has spent five documents constraining — kits ship `Card`, `Item`, `Menu`, and their prop names and slots will put `item` in your templates the same week `CLAUDE.md` bans it — and it makes `D-34`'s mechanical enforcement fight the dependency instead of the developer. It is also a large dependency with its own release cadence for a two-person shop, and its accessibility is inherited rather than owned. (b) is genuinely defensible: agents write it fluently, there is no runtime, and it is easy to delete. Its cost is that consistency lives in habit rather than in one file — twenty screens written across three months by an agent produce twenty spacing scales unless a component layer exists anyway, at which point (b) is (a) with an extra build step. (a) costs about 300 lines of CSS and roughly twenty small components, which is the same amount of work either way, and it puts every colour, size and radius in one greppable file where a change is one edit.
> **Recommended:** **(a).** Tokens as CSS custom properties in `app/assets/css/tokens.css`, a base layer in `base.css`, and components in `app/components/`. Scoped styles per component, tokens only — a raw hex or px value in a component is a review failure, exactly as a Slovak literal is under `D-20`.
> **Why:** it is the option whose enforcement is mechanical and whose vocabulary is ours. The alternative I would accept without argument is (b), and only (b).
> **Obliges:** a `tokens.css` that is the single source of colour, spacing, type and radius; no third-party CSS or font CDN at runtime (see `UI-D-11`); components named from Part 1's Ubiquitous Language (`UI-D-02`).

> ### UI-D-02 — The banned-terms list extends to component names, props, CSS classes and i18n keys.
> **Considered:** (a) domain vocabulary applies to server code only; (b) it applies to everything the repository contains.
> **Trade-offs:** (a) is where most projects land by default and it is how `Item`, `Order` and `Cart` re-enter through the back door — a `CartSummary.vue` teaches the next agent that a cart exists, and `D-34`'s CI check will not have been pointed at `app/`. `useReservationDraft.ts` already got this right, deliberately, and its comment explains exactly why.
> **Recommended:** **(b).** Extend `D-34`'s CI grep to `app/**` including component filenames, prop names, CSS class names and i18n keys.
> **Why:** the vocabulary is `NFR-13`'s main instrument. A vocabulary that stops at the server boundary is a vocabulary with a hole in it, and the hole is where the UI lives.

> ### UI-D-03 — Camera-first scanning at the counter, manual tag entry as the named fallback.
> **Considered:** (a) keep the typed tag-code field; (b) `BarcodeDetector` (native, no dependency) with the typed field retained as fallback; (c) a JS decoder library (`zxing`/`jsQR`) with the typed field as fallback.
> **Trade-offs:** (a) is the current state and it quietly forfeits the product's reason to exist: `P3` and `NFR-02` name scan-to-resolution as the one latency requirement worth having, and the interface currently makes the Operator read an opaque code off a sticker and type it while holding a drill. (b) costs one API call and no dependency, resolves in tens of milliseconds, and is unavailable on some browsers — notably Safari, where support has been inconsistent. (c) works everywhere and costs a decoding library plus a camera pipeline the project otherwise does not need.
> **Recommended:** **(b), with (c) held in reserve and the choice decided by the actual counter device** (`UI-OQ-1`). The typed field never goes away — it is the fallback for a damaged tag, a dead camera and a denied permission, all of which happen — but it stops being the primary path.
> **Why:** `NFR-01` already accepts that the counter cannot work without connectivity; it does not follow that it should also not work without typing. This is the single highest-value UI change in the document.
> **Obliges:** `C-10 ScanTarget` owns camera permission, the no-camera state, the decode-failed state and the manual fallback in one component; a decoded tag code follows exactly the same path as a typed one — `POST /api/handover/scan` — so that `FR-17`'s "the domain resolves the intent" is untouched.

> ### UI-D-04 — The counter is a task stack, not a dashboard.
> **Considered:** (a) worklist and task panels on one scrolling screen (current shape); (b) a stack — worklist is home, a task takes the whole screen and returns.
> **Trade-offs:** (a) shows more and is worse: during a handover the Operator has photos in flight and a customer waiting, and the surrounding worklist is an invitation to lose the task. (b) costs an explicit back affordance and a guard against abandoning in-flight uploads.
> **Recommended:** **(b).** One task on screen. A visible step header naming the workflow and the Customer. Back is explicit and warns when uploads are incomplete or a PIN prompt is pending.
> **Why:** `W4` and `W5` are strictly sequenced workflows and the interface should look like the workflow, not like an inventory of what is available. This is roughly what `counter.vue`'s `panel` ref already does; the decision is to commit to it and give it a real shell.

> ### UI-D-05 — Two clocks are visible in the interface, and derived facts look derived.
> **Considered:** (a) show a single status per row; (b) show the commercial expectation and the physical reality as two distinct rails, with derived facts rendered differently from stored states.
> **Trade-offs:** (a) is what every rental UI does and it is the exact failure `P1` names: a row that says "Overdue" as if that were a status trains everyone, including the next agent, to believe it is one. It is not — `FR-28` derives it, stores it and emits nothing.
> **Recommended:** **(b).** Stored states (`Pending`, `Confirmed`, `Cancelled`, `Expired`; Asset statuses) render as solid chips. Derived facts (`Overdue`, `NoShow`, shortfall risk) render in a visually distinct hazard treatment that is never used for a stored state. Where both clocks are relevant — worklist rows, attestation history, the Asset view — expected and actual are two labelled lines, never merged into one.
> **Why:** this is the project's central architectural insight made visible, and the interface is where it will otherwise be silently reversed. It also encodes something true rather than decorating: the visual difference *is* the difference between a fact the system stores and a fact it computes.

> ### UI-D-06 — PIN re-confirmation is per attestation, at the moment of attestation.
> **Considered:** (a) PIN once on entering the counter surface; (b) PIN at the moment each attesting action is submitted; (c) PIN once per Customer interaction.
> **Trade-offs:** (a) and (c) are what the current form does implicitly — a PIN field sitting in the HandoverOut form — and they turn `F8`'s answer back into a session, which is the thing `NFR-06` is worried about when the phone is left on the counter. (b) costs one modal and one extra tap per attestation, on a workflow that has at most three.
> **Recommended:** **(b).** A modal invoked by the submit action for `DepositTaken`, `DepositReturned`, ConditionReport and LostAsset declaration (`FR-36`). Never prefilled, never remembered, cleared on close, `autocomplete="off"`, `inputmode="numeric"`.
> **Why:** the PIN's whole purpose is to bind *this attestation* to *this human* (`D-16`, `FR-34`). A PIN entered ten minutes ago attests to nothing, and a PIN field the browser might remember attests to less than nothing.

> ### UI-D-07 — A photograph shows its confirmation state, and a deduction is unreachable without one.
> **Considered:** (a) show the photo when the upload completes; (b) show each photo's own state through the `D-40` sequence — requested → uploading → **confirmed** — with retry, and gate the settlement deduction path on confirmed pairs.
> **Trade-offs:** (a) is the current behaviour and it produces the exact failure `D-40` was written for: the Operator believes evidence exists, the row exists, the object does not, and the discovery happens during a dispute. (b) costs a per-file state machine in one component.
> **Recommended:** **(b).** `C-12 PhotoCapture` owns the three-step sequence per file and displays confirmation explicitly. The Settlement screen shows the paired-evidence status for the RentalAgreement and disables the deduction path when `FR-20` would reject it — with the reason stated, never a silently dead control.
> **Why:** `FR-20` is a domain rule that the Operator experiences as a refusal at the worst possible moment. The interface should make the refusal predictable ten seconds earlier, which is the only thing it can usefully contribute to a domain invariant.

> ### UI-D-08 — Two error audiences, one translation table, no raw domain text.
> **Considered:** (a) show `statusMessage` to Operators, friendly copy to Customers (current); (b) never show server-authored text to anyone; map error codes to Slovak strings in the catalogue.
> **Trade-offs:** (a) is why an Operator can be shown `RetentionWindowNotConfiguredError` (`UIF-03`). It also drifts: the domain's error text is written for a log, and changing a log message becomes a UI change nobody noticed. (b) requires server routes to return a stable `code`, which is a small server change and the only one this document asks for.
> **Recommended:** **(b).** Domain errors carry a stable code; `app/i18n/sk.ts` holds `errors.<code>` in two registers where they differ — Operator-facing (specific, actionable) and Customer-facing (plain, never technical). Unknown code → `common.somethingWentWrong`, and the code goes to Sentry, not to the screen.
> **Why:** `D-20` says no user-facing string outside the catalogue. English domain-error text on a Slovak counter is a user-facing string outside the catalogue.

> ### UI-D-09 — One formatting module. Money, dates and periods are never formatted in a component.
> **Considered:** (a) per-page helpers (current); (b) `app/utils/format.ts` with `formatMoney`, `formatDay`, `formatDayRange`, `formatDateTime`, all Slovak-locale, all currency-aware.
> **Recommended:** **(b).** `formatMoney({amount, currency})` → `12,50 €` via `Intl.NumberFormat('sk-SK')`; days as `12. 8. 2026`; ranges as `12. – 14. 8. 2026`; timestamps in `Europe/Bratislava`, never raw ISO. **Date arithmetic stays where Part 4 puts it** — the UI formats, it does not compute; the `UIF-01` bug is what happens when it does.
> **Why:** `D-21` says every amount carries its currency. Three private `toEuros` implementations mean three places to forget it. It also fixes the "12.50 EUR" register, which reads as an export file rather than a price to a Slovak customer.

> ### UI-D-10 — Legally blocked copy occupies a marked slot that cannot ship silently.
> **Considered:** (a) plausible placeholder text; (b) a visibly marked draft slot, plus a build-time guard.
> **Trade-offs:** (a) is how a draft terms text reaches a real Customer. `checkout.vue` currently does this honestly — the notice says the wording is provisional — but honesty in a comment is not a mechanism.
> **Recommended:** **(b).** Blocked copy (`OQ #1` terms and pre-contractual information, cancellation, `FR-38`/`IR-13` privacy text) lives in `sk.ts` under a `draft.` prefix with a visible in-page marker, and a CI check fails a production build while any `draft.` key is referenced. Removing the marker is then a deliberate act with a lawyer's answer behind it.
> **Why:** it is the cheapest possible closure of the one failure mode that is silent (the same argument `NFR-14` makes for `FR-40`).

> ### UI-D-11 — No third-party runtime assets in the browser. Fonts self-hosted.
> **Considered:** (a) Google Fonts / CDN; (b) self-hosted subset fonts, no third-party requests at all from our own pages.
> **Trade-offs:** (a) is one line and puts a third-party request — carrying an IP address and a referrer — on every page a Visitor loads, which is precisely the category of thing `FR-38`'s banner exists to ask about. (b) costs two `woff2` files in `public/fonts` and a `@font-face` block.
> **Recommended:** **(b).** Typography per `§4.2`, subset to Latin Extended-A (Slovak needs `ď ĺ ľ ň ŕ š ť ž ô`). Stripe is a redirect to a hosted page (`NFR-05`), not an embed, so it adds no third-party request to our own pages.
> **Why:** this is the fact that makes `IR-13` answerable rather than arguable: **if the browser makes no third-party request and sets nothing but a strictly necessary session cookie, there is no non-essential consent to collect**, and `FR-38`'s banner may be a requirement written for a different architecture. That conclusion is a legal call, not mine (`UI-OQ-5`) — but the architecture should be the one that makes the cheap answer available.

---

## 4. Visual language

### 4.1 Direction

The subject's own world supplies this and nothing else needs to: powder-coated steel, machine plates, engraved asset numbers, hazard tape, the yellow of a plate compactor. The direction is **machine plate** — flat surfaces, hairline rules, near-square corners, stamped monospaced identifiers, and one signal colour used sparingly enough that it always means *act here* or *look here*.

**Boldness is spent in exactly two places**, and nowhere else:

1. **The scan plate.** The counter's home screen is dominated by a full-width camera target with a signal-yellow frame. It is the largest element on the largest-value screen, and it is the visual answer to "what is this thing for".
2. **The hazard rail.** Derived facts (`Overdue`, `NoShow`, shortfall risk) carry a diagonal hazard-striped left rail. Stored states never do. `UI-D-05` made this a rule; the stripe is what makes it legible at a glance across a worklist.

Everything else is quiet: greys, one weight of rule, no shadows beyond a single hairline elevation, no gradients, no decorative motion.

**Public surface exception (`D-59`).** The public surface carries the Tenant's own identity, Rent Star: blue tokens (`§4.3`) and one gradient, in the public page header only. Nothing else on any surface gets a gradient, and the counter and admin surfaces keep this section's direction unchanged.

### 4.2 Typography

**IBM Plex**, self-hosted, three roles — chosen because it is an engineering documentation face with genuine industrial provenance, its Latin Extended coverage handles Slovak diacritics properly at small sizes, and its monospace is the right instrument for the thing this product stamps on two hundred physical objects.

| Role | Face | Used for |
|---|---|---|
| UI / body | IBM Plex Sans | everything by default |
| Display / label | IBM Plex Sans Condensed, 600 | screen titles, section eyebrows, table headers, worklist labels |
| Data | IBM Plex Mono | tag codes, Asset IDs, RentalAgreement numbers, monetary amounts, timestamps |

Mono is not a decoration: it marks *values that identify a physical object or an amount of money*, which is the class of value the Operator reads aloud, compares against a sticker, or defends in a dispute.

**Scale** (rem, base 16): `12 · 14 · 16 · 20 · 26 · 34`. Counter surface shifts one step up: `14 · 16 · 18 · 22 · 28 · 36`, minimum body 16 (never smaller — glare and gloves).

### 4.3 Tokens

Full set lives in `app/assets/css/tokens.css`. Names are semantic; a component never references a raw value.

```css
:root {
  /* Ink & surface — light surfaces (public, admin) */
  --ht-paper:        #F4F6F5;   /* page */
  --ht-surface:      #FFFFFF;   /* card */
  --ht-surface-sunk: #EAEDEC;   /* inset, table stripe */
  --ht-ink:          #14181B;   /* primary text, primary button */
  --ht-ink-muted:    #58636B;   /* secondary text */
  --ht-line:         #D3D9D8;   /* hairline */
  --ht-line-strong:  #A9B3B2;

  /* Signal — the one accent. Action at the counter, attention elsewhere. */
  --ht-signal:       #FFC400;
  --ht-signal-deep:  #C99A00;   /* text on light, focus ring */
  --ht-on-signal:    #14181B;

  /* Semantic */
  --ht-ok:           #1F7A4C;
  --ht-warn:         #B85C00;
  --ht-danger:       #B3261E;
  --ht-info:         #1B5E8F;

  /* Reservation states (FR-07) — solid chips, stored facts */
  --ht-state-pending:   #B85C00;
  --ht-state-confirmed: #1F7A4C;
  --ht-state-cancelled: #58636B;
  --ht-state-expired:   #8A6A00;

  /* Derived facts (FR-28) — hazard treatment, never a chip */
  --ht-derived-overdue: #B3261E;
  --ht-derived-noshow:  #B85C00;

  /* Geometry */
  --ht-radius-plate: 2px;   /* identifiers, chips, inputs */
  --ht-radius-card:  8px;
  --ht-space-1: 4px;  --ht-space-2: 8px;  --ht-space-3: 12px;
  --ht-space-4: 16px; --ht-space-5: 24px; --ht-space-6: 32px; --ht-space-7: 48px;
  --ht-hit-min: 44px;       /* admin, public */
  --ht-hit-counter: 56px;   /* counter primary controls */
  --ht-motion: 120ms;
}

/* Counter surface — dark, applied by the counter layout only */
[data-surface='counter'] {
  --ht-paper:        #0F1418;
  --ht-surface:      #192026;
  --ht-surface-sunk: #131A1F;
  --ht-ink:          #ECF1F3;
  --ht-ink-muted:    #9AA8B2;
  --ht-line:         #2A343C;
  --ht-line-strong:  #3C4952;
  --ht-ok:           #3FB27F;
  --ht-warn:         #FF9633;
  --ht-danger:       #FF6257;
  --ht-info:         #5AA9E6;
}
```

**Public surface (`D-59`), applied by the public layout only.** It is the same mechanism as the counter override: `[data-surface='public']` redefines tokens, and components never branch on surface. The roles are fixed here. The values below are the starting point read off the mockups and are **measured, not assumed**, at implementation against the floor below:

```css
[data-surface='public'] {
  --ht-brand-deep:  #2B2F8F;   /* header gradient start; text allowed on it */
  --ht-brand:       #1F5FA8;   /* primary action background, links */
  --ht-brand-light: #62B2E2;   /* header gradient end; decorative only, NEVER under text */
  --ht-on-brand:    #FFFFFF;
  --ht-header-gradient: linear-gradient(100deg, var(--ht-brand-deep), var(--ht-brand-light));
}
```

Header text sits over the `--ht-brand-deep` end. The mockup's white text over the pale end fails 4.5:1 and is not built. The primary action is `--ht-brand` with `--ht-on-brand` (solid, not the mockup's gradient button). The Rent Star name is a `sk.ts` string, typeset in IBM Plex Sans Condensed 600 until a vector logo exists.

**Contrast floor:** 4.5:1 for body text, 3:1 for large text and control borders, on all surfaces (`NFR-11`). Signal yellow is a background for dark ink only, never a text colour on light.

**Motion:** state transitions only, `120ms`, ease-out. No page transitions, no entrance animation, no skeleton shimmer. `prefers-reduced-motion: reduce` removes all of it. A counter interface that animates is a counter interface that is slower than paper.

---

## 5. Component inventory

Twenty components. Filenames use domain vocabulary (`UI-D-02`); none is generic enough to need a `Base` prefix except the four primitives.

| ID | Component | Notes |
|---|---|---|
| `C-01` | `AppButton` | variants `primary` `secondary` `danger` `quiet`; sizes `default` `counter`; owns pending state and `disabled` reasoning |
| `C-02` | `AppField` | label + control + hint + error, always `<label>`-bound, `aria-describedby` wired |
| `C-03` | `AppAlert` | `role="alert"`; variants error/warn/info/ok; takes an error **code**, never text (`UI-D-08`) |
| `C-04` | `AppDialog` | focus trap, `Esc`, restore focus; the base for `C-11` and `C-19` |
| `C-05` | `AppTable` | admin density, sticky header, zebra via `--ht-surface-sunk` |
| `C-06` | `EmptyState` | one sentence + one action; never a bare "no data" |
| `C-07` | `StateChip` | Reservation state, Asset status — **stored facts only** |
| `C-08` | `DerivedBadge` | Overdue / NoShow / shortfall — hazard rail treatment (`UI-D-05`) |
| `C-09` | `TagCodePlate` | mono, stamped; used for tag codes, Asset IDs, RentalAgreement numbers |
| `C-10` | `ScanTarget` | camera + decode + permission states + manual fallback (`UI-D-03`) |
| `C-11` | `PinPrompt` | per-attestation modal (`UI-D-06`) |
| `C-12` | `PhotoCapture` | multi-file, per-file `D-40` state machine, retry (`UI-D-07`) |
| `C-13` | `EvidenceViewer` | opens a short-lived read URL, `no-store`; shows that the view is attributed (`NFR-06`) |
| `C-14` | `MoneyAmount` | mono, via `formatMoney`; currency always rendered (`D-21`) |
| `C-15` | `DayRange` | `formatDayRange`; marks the final consumed day per `D-09` |
| `C-16` | `TwoClockRow` | expected vs actual, the worklist and history primitive (`UI-D-05`) |
| `C-17` | `StepHeader` | counter task stack: workflow name, Customer, back with in-flight guard |
| `C-18` | `AttestationTimeline` | append-only history render for `S-13` (`D-10`, `FR-43`) |
| `C-19` | `ConfirmAction` | irreversible acts: declare lost, unpublish, mark rentable in bulk |
| `C-20` | `OperatorBar` | signed-in Operator, surface switcher, logout (`UIF-05`, `FR-34`) |
| `C-21` | `AvailabilityCalendar` | month grid from the server's month payload; free / last / none as **derived** treatment (`D-47`); first-then-last day selection of a RentalPeriod; no date arithmetic in the component (`D-58`, `D-51`) |
| `C-22` | `ClassificationFilter` | two groups, PowerSource and UseArea; toggle chips, OR within a group, AND across (`D-54`); state is visible as text, not colour alone |
| `C-23` | `AssetTypeCard` | `S-01` grid cell: image (placeholder when absent, `D-56`), name, day rate via `C-14`; the whole card links to `S-02` |

---

## 6. Screen specifications

Each screen: route · surface · governing identifiers · what it must show · states · notes. Where a screen exists, "restyle" means behaviour is already correct and only presentation changes — that constraint is deliberate and keeps `WP-4`/`WP-5` low-risk.

### Public surface

**`S-01` Catalog browse** — `/` · `FR-01`, `FR-02`, `D-54`, `D-58`, `W1`
*Revised 1 October 2026 (`D-58`); the date-range version below is superseded.*
- **Layout:** Rent Star header (`D-59`) with a link to the terms (`/podmienky`). Then `C-22` filters, then a grid of `C-23` cards: 4 columns on desktop, 2 on a phone.
- **What is listed:** published AssetTypes only, and never an Accessory (`D-57`). There is no date range and no availability on this screen.
- **Filtering:** client-side over the one catalog response, since the whole catalog is about 44 AssetTypes. There is no pagination and no infinite scroll.
- **Draft:** the Reservation draft is summarised in the header ("Rezervácia (n)"), linking to `S-03`.
- **States:** loading, empty catalog, no match for the selected filters (offers "clear filters"), error.

*Superseded:* ~~Date range first, above the list… Consider a batched availability request (`UIF-04`).~~ `UIF-04` is closed by `D-58`.

**`S-02` AssetType detail** — `/naradie/:assetTypeId` · `FR-01`, `FR-02`, `FR-03`, `D-38`, `D-55`–`D-58`, `W1`
*Un-deferred by `D-58`.*
- **Left column:** image, then includedContents as "V cene je …", then handlingNotice in a danger-bordered box, then description, then specifications as a two-column definition list.
- **Right column:**
  - `C-21` calendar.
  - Accessory checkboxes, each with its own day rate and deposit. A checkbox is disabled with the reason when the Accessory is not free for the selected RentalPeriod.
  - Quantity.
  - Day rate and **deposit with equal weight** (`FR-02`).
  - The **Rezervovať** action. It adds the AssetType, and any checked Accessory at the same quantity, as draft lines for the selected RentalPeriod.
- **Terms:** a link only. Acceptance stays in `S-03` (`D-35`, `D-58`).
- **States:** loading, not found or unpublished (`S-24`), calendar error, range not selectable, Accessory unavailable.

The calendar is advisory. A hold lost at checkout surfaces in `S-03`'s existing error path (`D-33`).

**`S-03` Checkout** — `/checkout` · `FR-06`, `FR-09`, `D-14`, `D-35`
One page, three numbered parts: the tools, the Customer's details, the payment with the terms. One button, "Zaplatiť {suma} kartou", creates the ReservationGroup, records the terms acceptance and starts the payment, in that order — W1's "terms before payment" holds, and a Visitor who only looks holds nothing (owner decision 2026-10-11, replacing the earlier two stages). Errors appear at the field and next to the button, which stays at the bottom of a phone screen. The draft is kept in the browser's localStorage, never any Customer data. **The deposit total is shown beside the card sum, as prominent as it** — it is not part of the card payment (`D-07`, `FR-21`: the platform moves no deposit money) and the Customer must understand they will hand over cash at the counter. Terms occupy the `draft.` slot (`UI-D-10`). Errors in Customer register only (`UI-D-08`).

**`S-04` Payment received** — `/reservations/:groupId/success` · `W2`
Acknowledges the payment step; must not claim confirmation, which the webhook owns. Says what happens next and that the link arrives by email.

**`S-05` Payment cancelled** — `/reservations/:groupId/cancel` · `W2`
No hold is released here (`FR-08` sweep owns that) and the copy must not imply otherwise. **Not** the cancellation surface — `W11` is blocked (`OQ #1`).

**`S-06` Customer link** — `/reservations/access/:token` · `FR-39`, `D-23`, `W3`
Reservation summary, state per Reservation, and evidence upload. **Never renders an uploaded photo back** (`NFR-06`) — it may only say whether one was received. `C-12` states apply. Add the "why we need this" sentence: an ID upload with no explanation is where a Customer abandons.

**`S-07` Privacy / terms static pages** — `/podmienky`, `/sukromie` · `FR-38`, `IR-13`, `OQ #1`
Structure now, content in the `draft.` slot. Referenced from `S-03` and the footer.

### Counter surface

**`S-08` Counter home** — `/admin/counter` · `FR-17`, `FR-42`, `FR-45`, `P3`
The scan plate (`C-10`) occupies the top half. Below it, today's pickups and returns as `C-16` rows. A resolved scan navigates straight into the task the domain resolved — the Operator never chooses "vydať" or "prevziať". Unresolvable tag: explicit, with the code shown so it can be read aloud. Rows carry `C-08` when derived facts apply.

**`S-09` Identity verification** — task within `S-08` · `FR-13`, `FR-14`, `FR-15`, `NFR-06`
Evidence list with upload times and confirmation state; view via `C-13`; verify / reject with reason. Counter-capture fallback via `C-12`. HandoverOut is unreachable until verification succeeds, and the screen says so before the Operator tries.

**`S-10` HandoverOut** — task · `W4`, `FR-14`, `FR-18`, `FR-19`, `FR-21`, `FR-22`, `D-35`
Deposit amount stated large (it is a cash instruction). Tag scan chooses the Asset instance (`FR-18`). Condition photos via `C-12`. Submit triggers `C-11`. Result names the RentalAgreement in `C-09`. If terms acceptance is missing the group is refused — surfaced as a specific message, not a generic failure.

**`S-11` HandoverIn** — task · `W5`, `FR-19`
Scan resolves the Asset and its RentalAgreement. Return-condition photos. Overdue is shown as derived context, never as a status.

**`S-12` Settlement** — task · `W5`, `FR-20`, `FR-21`, `FR-23`
Deposit held, amount returned, deduction reason. **Paired-evidence status is shown before the deduction is attempted** (`UI-D-07`); when `FR-20` would reject, the control is disabled with the reason. `C-11` on submit. Includes return-to-pool once inspection is done (`FR-27`).

**`S-13` Asset view & attestation history** — `/admin/counter/assets/:assetId` · `FR-43`, `FR-45`, `P4`, `D-10`
The artefact `P4` exists to produce: append-only timeline (`C-18`) of ScanEvents, HandoverOut/In, ConditionReports, deposits, corrections — each with Operator attribution and both clocks. This is what gets read out in a dispute; it should be printable.

**`S-14` Overdue worklist** — `/admin/counter/overdue` · `FR-29`, `D-17`
**Ranked by the earliest day the absence causes demand to exceed supply — not by days late.** The ranking is the requirement, so the screen must show the reason for the rank: which Reservation is threatened and on which day. Days late is secondary information.

**`S-15` NoShow list** — `/admin/counter/no-shows` · `FR-30`, `W7`
States plainly that the RentalDays are **not** released. No action beyond contacting the Customer; do not invent one.

**`S-16` Declare lost** — from `S-13`/`S-14` · `FR-31`, `D-17`
Always an explicit Operator declaration with a reason. `C-19` then `C-11`. Never suggested by a timer, never a bulk action.

**`S-17` Record a late or corrected attestation** — from `S-13` · `FR-24`, `P1`, `D-10`
The reconciliation path `NFR-01` assumes exists: the outage happened, the drill went out anyway, the record is written afterwards. Fields: what happened, when it actually happened, reason, attribution, PIN. Appends a new fact; nothing is edited. This screen is currently absent everywhere and the migration for it already exists.
*Built 9 October 2026 (`C-25 LateAttestationFields`):* not a separate screen but an off-by-default "Zaznamenávam dodatočne" block inside the HandoverOut and HandoverIn forms (S-10, S-11), because the repair happens at the moment of recording and both already end in the PIN prompt (D-48). The time is sent as typed and resolved by the server in the Tenant's timezone (D-51); the server also refuses a time later than the moment of recording. The attestation timeline (`S-13`) shows both clocks. Correcting a ConditionReport, DepositTaken or Settlement after the fact is not covered here and is still open.

### Admin surface

**`S-18` Operator login** — `/login` · `D-22`, `FR-36` — restyle only.

**`S-19` Catalog** — `/admin/catalog` · `FR-01`, `FR-37`
Add editing (`PATCH` exists, no UI). Publish/unpublish through `C-19` — unpublishing something a Visitor is looking at deserves a confirmation. Prices and deposits are business data, never configuration (Part 3 §12).
*Extended 1 October 2026:*
- **Per AssetType:**
  - PowerSource (select, may be empty) and UseAreas (multi-select) (`D-54`).
  - Specifications as an ordered list of label/value rows, plus includedContents and handlingNotice (`D-55`).
  - Image, chosen from the shipped files (`D-56`).
  - Principals this AssetType is an Accessory of (`D-57`). Setting one hides the AssetType from `S-01`, and the form says so.
- **Classification:** a separate section maintains the PowerSource and UseArea lists: add, rename, reorder, remove. Removing one that is in use is refused with the reason and the AssetTypes that use it.
- **Provisional prices:** while OQ #29 is open, an AssetType whose price is still the provisional import value is marked as such, so the owner can see which ones are left to confirm.

**`S-20` Asset registry & tags** — `/admin/asset-registry` · `FR-25`, `FR-26`, `W9`
Restyle; keep the print sheet and give it a real print stylesheet sized to a physical label sheet (`UI-OQ-4`). Pending-activation list stays prominent — a registered, untagged Asset is invisible to the pool.
*Built 9 October 2026 (`C-24 AssetTagSheet`, `print.css`):* A4, 3 × 7 = 21 labels of 63.5 × 38.1 mm — plain paper cut along dashed edges today, a common label stock size later. Each label carries the QR (error-correction Q, 30 mm), the tag code and the AssetType name. The sheet is printable from a fresh registration and from the pending-activation list, whose codes are all there is to reprint a lost sheet from. Page chrome (navigation, headings, alerts) never prints.

**`S-21` Platform status** — `/admin/status` (rename from `job-runs`) · `FR-40`, `FR-44`, `NFR-14`
Erasure job's last successful run is the headline, per `NFR-14`'s argument, with a stale date visibly stale rather than merely old. Backup, sweeps and reminder dispatches below.

**`S-22` Operator PIN** — `/admin/pin` · `FR-36`, `F8`
Set / change own PIN. Route exists, surface does not, and `S-10`–`S-12` are unusable without it.

**`S-23` App shell** — layout · `UIF-05`, `NFR-09`, `FR-34`
`C-20`: signed-in Operator visible (attribution is only meaningful if the Operator can see who they are), navigation between admin surfaces, explicit counter entry, logout. Session expiry surfaces as a clear re-authentication prompt, not a redirect mid-task.

**`S-24` Not found / error boundary** — `NFR-11`, `D-20`
One screen, Slovak, no stack traces, a route home per surface.

---

## 7. Cross-cutting interaction rules

1. **No optimistic UI, anywhere.** The browser never shows a state transition that the server has not confirmed (`D-25`, `NFR-12`: the device is a view, never a holder of state). Pending, then the server's answer.
2. **Every mutating control has four states** — idle, pending, succeeded, failed — and the failed state says what to do next.
3. **Irreversible actions are confirmed** (`C-19`) and **attesting actions are PIN-confirmed** (`C-11`). These are different gates and both can apply.
4. **Connectivity failure is a first-class state, not an error.** `NFR-01` accepts the counter cannot run offline; the interface must therefore say "no connection — the handover still happens, record it afterwards" and point at `S-17`, rather than showing a generic failure that suggests the Operator did something wrong.
5. **Nothing on a public page identifies a Visitor** (`FR-02`): no analytics, no fingerprinting, no third-party request (`UI-D-11`), no server-side record on browse.
6. **Evidence is never rendered outside `C-13`**, never cached, never in a URL that outlives the request (`NFR-06`).
7. **Slovak copy register:** vykanie throughout; sentence case; verbs in controls that match the resulting message (`Vydať` → `Vydané`); errors state what happened and the next step; empty states invite an action. No exclamation marks in Operator surfaces.
8. **Formatting only via `app/utils/format.ts`** (`UI-D-09`); date *arithmetic* never in the UI.

---

## 8. Accessibility floor (`NFR-11`)

Not a programme — the "do not be sloppy" list, checkable in review:

- One `<h1>` per screen; landmarks (`<main>`, `<nav>`); headings in order.
- Every control has a programmatic label; placeholder is never the label.
- Visible focus ring (`--ht-signal-deep`), never `outline: none`.
- Keyboard-operable everywhere including `C-04`, `C-11`, `C-12`; focus trapped in dialogs and restored on close.
- Contrast per `§4.3`; state is never conveyed by colour alone — chips and badges carry text.
- `role="alert"` on error regions; `aria-busy` during pending.
- Hit targets ≥ 44px, ≥ 56px for counter primary controls.
- `prefers-reduced-motion` honoured.

---

## 9. PWA (`NFR-12`)

Manifest, icons, `theme-color` per surface, installable. **No service-worker caching of API responses and no offline mode** — `NFR-12` and `NFR-01` both forbid it, and a stale cached worklist at a counter is worse than an error. If a service worker is added at all, it caches static assets only. `UI-OQ-6` covers whether to add one at all in the pilot; the honest default is no.

---

## 10. What must not be built

Naming these because they will feel like gaps during the work: any Operator management, roles or permission surface (`D-16`, `D-22`); a cancellation or refund action (`W11`, `OQ #1` — `S-05` is a payment-abandoned page, not a cancel path); a Customer account, login or rental history (`D-14`); GDPR request surfaces (`FR-16` is the job, not a screen); pricing rules, discounts or promotions; maintenance, servicing or utilisation reporting; multi-language switching (`D-20`); any dashboard of numbers nobody has asked a question about; delivery, logistics, or an Asset map.

---

## 11. Build sequence

Six work packages. The ordering rule is: shared foundations first so nothing is built twice, then the highest-value surface, then the surfaces that do not exist, then the ones that merely look wrong. Each task is issue-sized and cites its governing identifiers, per `CLAUDE.md`.

### WP-1 — Foundation (no behaviour change)
1. `tokens.css`, `base.css`, self-hosted IBM Plex subsets, three layouts (`public`, `admin`, `counter` with `data-surface`) — `UI-D-01`, `UI-D-11`, `NFR-11`.
2. `app/utils/format.ts` + tests; replace all private `toEuros` — `UI-D-09`, `UIF-02`, `D-21`.
3. Error codes on domain errors + `errors.*` in `sk.ts` (both registers) + `C-03` — `UI-D-08`, `UIF-03`.
4. Primitives `C-01`–`C-09`, `C-14`, `C-15`.
5. Extend `D-34`'s CI grep to `app/**`, including component and class names — `UI-D-02`.
6. `draft.` prefix convention + CI guard on production builds — `UI-D-10`.
**Done when:** every existing page renders through the new layouts and primitives with no behavioural diff, and `pnpm lint`/`typecheck`/`test` pass.

### WP-2 — The counter (highest value)
7. `C-10 ScanTarget` — camera-first with manual fallback — `UI-D-03`, `UIF-06`, `P3`.
8. `C-17` + task-stack shell; rebuild `S-08` — `UI-D-04`, `FR-42`.
9. `C-11 PinPrompt`; wire into `S-10`, `S-12` — `UI-D-06`, `FR-36`.
10. `C-12 PhotoCapture` with per-file `D-40` states — `UI-D-07`, `UIF-08`.
11. Rebuild `S-09`–`S-12` on the above; paired-evidence gate on the deduction path — `FR-20`.
12. `C-16 TwoClockRow` + `C-08 DerivedBadge` — `UI-D-05`, `FR-28`.
**Done when:** a full `W3`→`W5` pass can be run on a phone, one-handed, without typing a tag code.

### WP-3 — The missing counter surfaces
13. `S-13` Asset view + `C-18` attestation timeline — `FR-43`, `FR-45`, `P4`.
14. `S-14` Overdue, ranked with the reason for the rank shown — `FR-29`, `D-17`.
15. `S-15` NoShow — `FR-30`.
16. `S-16` Declare lost — `FR-31`.
17. `S-17` Late/corrected attestation — `FR-24`, `NFR-01`.
**Done when:** no server route in §1.2 is unreachable from the interface.

### WP-4 — Public surface
18. `S-01` restyle + `UIF-01` fix (+ batched availability, or a written decision not to) — `FR-02`, `UIF-04`.
19. `S-03` restyle with the deposit restated before payment — `FR-09`, `FR-21`.
20. `S-04`, `S-05`, `S-06` restyle; `S-06` gets the explanation sentence — `FR-39`.
21. `S-07` legal pages as marked slots — `UI-D-10`.

### WP-5 — Admin
22. `S-23` shell + `C-20` + logout — `UIF-05`, `NFR-09`.
23. `S-22` PIN setup — `FR-36`.
24. `S-19` catalog editing + confirmations — `FR-37`.
25. `S-21` status page with erasure run as headline — `FR-40`, `FR-44`.
26. `S-20` registry restyle + real print stylesheet — `FR-26`.
27. `S-18`, `S-24`.

### WP-6 — Finish
28. PWA manifest and icons — `NFR-12`.
29. Accessibility pass against `§8`; contrast audit both surfaces.
30. Copy pass over the whole `sk.ts` for register consistency — `D-20`.
31. Counter run-through with the actual employee on the actual device; record what was slow.

### WP-7 — Rent Star catalog (Part 4 §16.4)
Model and import first, because every screen reads them; then the public surface; then admin.
32. Catalog model: PowerSource, UseArea, the AssetType↔UseArea link, the D-55 fields and the image reference. Expand-only migration (`D-30`), Tenant-scoped with tests (`FR-33`), attributed writes (`FR-34`). Governed by `D-54`, `D-55`, `D-56`.
33. Accessory link, plus the checkout rule "an Accessory needs its principal in the same group, RentalPeriod and quantity", with tests. The D-08 set is untouched and re-run. Governed by `D-57`.
34. Month availability endpoint returning free / last / none per day with a selectable flag; computed from the `D-38` pool, with tests including a pool of one (never "last"). Governed by `D-58`.
35. Image conversion into `public/catalog/` (one web format, bounded size) plus the shipped-file manifest the admin select reads. Governed by `D-56`.
36. Pilot import script from `docs/catalog-source/pilot-catalog.csv`: attributed, name-idempotent, AssetTypes plus bulk-registered Assets. Governed by `D-60`, `FR-25`.
37. Public tokens, Rent Star header and wordmark, contrast measured. Governed by `D-59`, `NFR-11`.
38. `S-01` rebuild on `C-22` and `C-23`. Governed by `D-58`.
39. `S-02` with `C-21`, Accessory checkboxes and the draft action. Governed by `D-57`, `D-58`, `FR-02`.
40. `S-19` extension, including the classification section. Governed by `D-54`–`D-57`, `FR-37`.
**Done when:** a Visitor can filter the imported catalog, open a tool, pick a RentalPeriod on the calendar, add it with an Accessory, and reach `S-03` with both lines and both deposits shown.

**Estimate shape, not commitment:** WP-1 and WP-2 are the substance — together roughly two thirds of the effort. WP-3 is five small screens against routes that already work. WP-4 and WP-5 are mostly mechanical once WP-1 lands.

---

## 12. Traceability

| Requirement | Screen(s) | Status after this plan |
|---|---|---|
| `FR-01`, `FR-37` | `S-19` | extended (+ `D-54`–`D-57`) |
| `FR-02`, `FR-03` | `S-01`, `S-02` | `S-01` browse without dates, `S-02` calendar (`D-58`); `UIF-01` fixed, `UIF-04` closed |
| `FR-25` | pilot import | **new** (`D-60`) |
| `FR-06`, `FR-09`, `FR-21` | `S-03` | restyled |
| `FR-11`–`FR-15` | `S-06`, `S-09` | restyled / rebuilt |
| `FR-17`, `FR-45` | `S-08`, `S-13` | camera-first |
| `FR-18`, `FR-19`, `FR-22` | `S-10`, `S-11` | rebuilt |
| `FR-20`, `FR-23` | `S-12` | gate made visible |
| `FR-24` | `S-17` | **new** |
| `FR-25`, `FR-26` | `S-20` | restyled |
| `FR-27` | `S-12`, `S-13` | **new** (return to pool) |
| `FR-28`, `FR-29`, `FR-30` | `S-14`, `S-15`, `C-08` | **new** |
| `FR-31` | `S-16` | **new** |
| `FR-34`, `FR-36` | `C-11`, `C-20`, `S-22` | **new** |
| `FR-38` | `S-07` | slot + `UI-OQ-5` |
| `FR-39` | `S-06` | restyled |
| `FR-40`, `FR-44` | `S-21` | restyled, reframed |
| `FR-42` | `S-08` | rebuilt |
| `FR-43` | `S-13` | **new** |
| `FR-46` | `S-13` print | partial (print, not export) |
| `W11` | — | blocked, deliberately absent |

---

## 13. Open questions

| ID | Question | Needed by | Who answers |
|---|---|---|---|
| `UI-OQ-1` | ~~Which physical device is the counter phone (make, OS, browser)? Decides `UI-D-03`'s (b) vs (c)~~ — **resolved 2026-08-12:** both built as tiers (native `BarcodeDetector`, `jsQR` fallback for WebKit/iOS), so no single device choice is needed for decoding. The contrast-floor-in-daylight half stays open. | WP-2 | you / the pilot Tenant |
| `UI-OQ-2` | Is the counter device shared or one per Operator? `F8` assumed shared; if it is one each, the PIN cadence in `UI-D-06` could relax — I would still not relax it. | WP-2 | you |
| `UI-OQ-3` | ~~Do you want a HermanTool wordmark and colour of your own, or is `§4` the identity?~~ — **resolved 2026-10-01 (`D-59`):** the public surface is Rent Star (blue tokens, header gradient, text wordmark until an SVG logo is supplied); counter and admin keep `§4`. | WP-7 | you |
| `UI-OQ-4` | ~~Which physical label stock for QR tags (size, sheet layout, laminated?)~~ — **resolved 2026-10-09:** plain A4 for now; the sheet is 3 × 7 labels of 63.5 × 38.1 mm. Lamination and a real label stock are open for later and would change only the `--ht-label-*` tokens and `print.css`. | WP-5 | pilot Tenant |
| `UI-OQ-5` | Given `UI-D-11` (no third-party requests, session cookie only), does `FR-38`'s banner remain required? This is `IR-13`, and it is a legal answer, not an architectural one — same conversation as `OQ #1`/`OQ #2`. | before launch | lawyer |
| `UI-OQ-6` | Service worker in the pilot at all? Default no (`§9`). | WP-6 | you |
| `UI-OQ-7` | The Rent Star mockups put a blue dot on some catalog cards. What does it mean? It is not built until answered: if it turns out to be derived (for example "free today"), it gets the derived treatment (`D-47`), never a decorative dot. | WP-7 | pilot Tenant |

---

## 14. How agents use this document

In `CLAUDE.md`, under "## Interface work":

```
## Interface work
docs/design/interface-design-foundation.md governs presentation and
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
```

**Review checklist for any UI pull request:** tokens only · no string literals · formatting module used · error codes not text · four states on every mutating control · attesting actions PIN-gated · irreversible actions confirmed · keyboard and focus verified · contrast checked on the surface it ships to · no new domain vocabulary.

---

*Approved 12 August 2026 (§3, in full — promoted as `D-43`…`D-53`, Part 4 §16.3). `§5`–`§11` govern implementation; see `WP-1`…`WP-6` for the build sequence and issue breakdown.*
