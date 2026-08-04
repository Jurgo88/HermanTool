# Documentation change set — 04 August 2026

Every change below is traced to a finding number. Parts 1, 2, 3 and 5 are **unmodified**; Parts 1–3 are frozen and Part 5 is a closed review artefact. All corrections are expressed in Part 4, which is the document that hosts reconciliation.

Review before applying. Nothing here changes code.

---

## New files

| File | Contents |
|---|---|
| `docs/reviews/implementation-review-2026-08-04.md` | The review itself. Findings `IR-01`…`IR-13` against the M4 codebase, with verified test/lint/typecheck results. |
| `docs/CHANGELOG-2026-08-04.md` | This file. |
| `scripts/create-review-issues.sh` | `gh` CLI script creating 4 milestones, 9 labels and 13 issues. Supports `--dry-run`; skips titles that already exist. |

## Modified files

### `docs/architecture/architecture-foundation-part-4-risks-technology-adr-log.md`

| Change | Trace |
|---|---|
| Header: **Scope** now names §16.2; **Adds** now reads `D-38`…`D-41` and `R-01`…`R-17`. | housekeeping |
| Flags heading changed from "two contradictions and one defect" to "**two defects**". | F-4 |
| **New flag F-4** — the §15 decision log stopped at D-32, omitting D-10 and D-33…D-37 from the document's own map. Marked resolved in this revision. | F-4 |
| §13 count changed from fifteen to seventeen risks. | R-16, R-17 |
| **New risk R-16** — per-request connection and authentication round trips on the scan path. Medium. Explicitly distinguished from R-08, which covers cold starts only. | IR-09 |
| **New risk R-17** — photographic evidence recorded without proof of storage. High. | IR-10 |
| §15 ADR log: **nine new rows** — D-33, D-34, D-35, D-36, D-37 (previously missing) plus D-38, D-39, D-40, D-41. Statuses reflect implementation reality, e.g. D-34 `accepted — not implemented (IR-03)`. | F-4, IR-01, IR-06, IR-09, IR-10 |
| **New §16.2** — reconciliation with the implementation review, carrying D-38…D-41 in full decision form. | IR-01, IR-06, IR-09, IR-10 |
| Open Questions: **#27** added to the launch-blocking table (Customer-record retention period and basis). | IR-07 |
| Open Questions: **#24, #25, #26** added to values-unset (Unavailable and the pool; Operator token lifetime; presigned upload size cap). | IR-01, IR-09, IR-10 |
| Open Questions: **#28** added to the human-answer table (does FR-38's banner survive a cookie inventory). | IR-13 |

### `CLAUDE.md`

| Change | Trace |
|---|---|
| Source-of-truth list: ADR range `D-01…D-41`; the review document added. | housekeeping |
| Precedence order: §16.2 decisions inserted at rank 1, everything below shifted. | §16.2 |
| Non-negotiable rules: **capacity is the pool, not the Rentable status count**. | D-38 / IR-01 |
| Non-negotiable rules: **a photograph counts as evidence only once confirmed stored**. | D-40 / IR-10 |
| KNOWN GAPS rewritten to reflect what shipped: F1, F8, F10 and D-33 marked resolved with what remains; **F6 re-marked as a live gap** rather than a deferred one. | IR-07 and M1–M4 delivery |
| **New section: OPEN WORK from the implementation review** — IR-01…IR-13 in one list with severities. | all |
| Launch-blocking open questions: OQ #27 added. | IR-07 |

---

## Decisions added

| ID | Decision | Raised by | Supersedes |
|---|---|---|---|
| **D-38** | Availability capacity is the rentable pool (Rentable + InPossession + UnderInspection), not the count of Assets in Rentable status. | IR-01 | The literal reading of "Rentable Assets of that type" in D-08, FR-03, FR-04. **Not** D-08's invariant, which is unchanged. |
| **D-39** | Reused database client and locally verified Operator sessions on the request path; remote verification retained for evidence access. | IR-09, R-16 | Nothing. Extends R-08's coverage. |
| **D-40** | A photograph counts as evidence only once its object is confirmed stored; presigned uploads are size-bounded. | IR-10, R-17 | Nothing. Tightens FR-19/FR-20. |
| **D-41** | Every internal scheduled endpoint records a job run; one ledger serves FR-40 and FR-44. | IR-06 | Nothing. Implements FR-40. |

**Only D-38 touches a frozen part's language**, and it does so as a supersession of a *reading* rather than of a decision. The supersession is stated explicitly inside D-38 with the phrase and the parts it applies to named, per the rule in Part 1's preamble.

---

## Findings requiring no new decision

Tracked as issues against decisions and requirements that already exist. A decision that already says what to do does not need restating in order to be done.

| Finding | Governed by | Status of the governing item |
|---|---|---|
| IR-02 | OQ #2, D-11, D-36 | Correct behaviour; blocked on a legal value |
| IR-03 | D-34 | accepted, not implemented |
| IR-04 | D-32 | accepted, not implemented |
| IR-05 | D-29 | accepted, not implemented |
| IR-07 | P7, D-11 | principle stated; value and basis missing (OQ #27) |
| IR-08 | FR-02, FR-03 | Must, half met |
| IR-11 | FR-10, D-37 | implemented with a concurrency hole |
| IR-12 | W1–W5, D-23, D-35 | server side complete, surfaces absent |
| IR-13 | FR-38 | Must, possibly the wrong requirement |

---

## Issue plan

| Milestone | Issues | Theme |
|---|---|---|
| 9. Operational foundations | IR-03, IR-04, IR-05, IR-06 | CI, backups, error tracking, job ledger |
| 10. Domain corrections | IR-01, IR-08, IR-10, IR-11 | Capacity, availability surface, evidence proof, idempotency |
| 11. Counter and checkout UI | IR-12 | The surfaces W1–W5 need |
| 12. Pre-launch | IR-02, IR-07, IR-09, IR-13 | Legal answers, measurement, cookie inventory |

Numbered `9`–`12` rather than `M5`–`M8`: the repository already had milestones `1`–`8` for its bounded contexts (Scaffold through Notification), so these continue that sequence instead of colliding with it.

Ordering constraints that are real rather than preference:

- **IR-01 before IR-08.** Publishing availability computed from the current capacity query would publish wrong numbers to customers.
- **IR-05 in one change, never two.** The SDK without scrubbing is the R-11 failure, briefly and for real.
- **IR-02 before anything end-to-end.** No complete rental can be exercised until the retention window has a value.
- **IR-03 early.** It goes green today and gets more expensive to introduce once IR-12 multiplies the surface area.

---

## To apply

```
# 1. Review the diff
git diff CLAUDE.md docs/architecture/

# 2. Commit the documentation
git add docs/ CLAUDE.md scripts/create-review-issues.sh
git commit -m "docs: reconcile implementation review IR-01..IR-13; add D-38..D-41, R-16, R-17, F-4"

# 3. Create the issues
gh auth status
./scripts/create-review-issues.sh --dry-run
./scripts/create-review-issues.sh
```
