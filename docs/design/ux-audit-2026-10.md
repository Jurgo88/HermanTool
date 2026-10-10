# UX audit and native-feel pass: October 2026

Scope decided with the owner on 10 October 2026: the app stays a **PWA** (Part 4: "PWA both sides, no native, no offline"), and it should *feel* native. All three surfaces are covered in turn: Visitor/Customer first, then the counter, then admin.

## How this was assessed

The public pages were run locally and photographed at a true **390 × 844** viewport (an iframe, because headless Chrome will not render a window narrower than about 500 px and crops the page instead, which first looked like horizontal overflow and was not). The PWA basics were checked in the code. **Nothing here was tested on a real phone, on iOS, or in an installed app**, and the counter and admin surfaces are behind a login and have **not been looked at yet**.

## Batch 1: Visitor surface and the native shell (built)

| # | Finding | Why it matters | Change |
|---|---|---|---|
| 1 | No `viewport-fit=cover`, no `safe-area-inset` anywhere | An installed app draws under the notch and the home indicator without it | Viewport set; `--ht-safe-*` tokens; the public header and footer respect them |
| 2 | `100vh` in six places | On iOS the browser bar makes it taller than the screen | `100dvh` added after each, as a progressive enhancement |
| 3 | No `overscroll-behavior` | Pulling down in the installed app reloads the page; on the counter that drops a handover with photos still uploading | `overscroll-behavior-y: contain` on `body` |
| 4 | No tap handling | Grey tap flash and a double-tap delay feel like a web page | `-webkit-tap-highlight-color: transparent`, `touch-action: manipulation` on controls |
| 5 | Filter took four wrapped rows before the first tool | The catalog starts below the fold on a phone | One swipeable line per group with a visible group label, `scroll-padding` so the first chip is not glued to the edge |
| 6 | Cards in a row had different heights | The price floated at a different height in every card | Cards fill their cell; the price sits on the bottom edge |
| 7 | The reserve action was at the end of a long page, grey, with the reason far above it | A disabled button with no nearby explanation reads as broken | A bar that stays at the bottom of the screen on a phone: says what is missing, then the button |
| 8 | "obsadené" and "posledný kus" inside 48 px calendar cells | The words ran together at phone width | The cell is only its number plus the hatch or dotted edge; the meaning is a legend under the grid, and the full word stays in each cell's accessible name |

## Workflow: signing in and the Customer journey (built, then filed)

The owner pointed out that there was no sign-in button. That was true and was the visible part of a wider problem: the Operator's route into the app was an address you had to know.

| # | Finding | Change |
|---|---|---|
| 9 | No link to `/login` anywhere on the public surface | A "Prihlásenie pre personál" link in the footer, on its own row. **Not in the header**: Customers have no account (D-14), and a sign-in there reads as something they need to do |
| 10 | Login always landed on the catalog admin, even for the employee who works at the counter | Lands on the counter (S-08), the high-frequency destination; the owner reaches the catalog from the bar |
| 11 | An expired session lost where the Operator was | Every "session gone" redirect carries the current page as `?redirect=`, and login returns there. The target is untrusted and only a path inside `/admin` is honoured (tested against other-site, `//host`, backslash, control-character and `..` forms) |
| 12 | An already signed-in Operator opening `/login` was asked for the password again | Goes straight to the target |
| 13 | The payment-received page said only "thank you" | "Čo bude ďalej": confirmation by email, an ID document at pickup, the deposit in cash. It states no amount and does not promise an ID *upload*, which is blocked until OQ #2 gives the retention window a value |

**Found, not built (issues filed):**

- **#189: Customer emails are in English** and name the tool as "AssetType 13". They are the first thing a Customer reads after paying, and the only route back to the reservation. They also lack the terms reference FR-10 asks for.
- **#190: an abandoned payment is a dead end.** The draft is cleared when the reservation is created, so the Customer must rebuild it, and their own Pending hold makes the tool look taken.

## Open for a decision, not built

- **No page transitions.** A native app animates between screens. Design foundation §4.1 decided "no page transitions, no entrance animation" deliberately. Reversing that is a design decision, not a polish item.
- **Every day reads "obsadené" while no Asset is in the pool.** With all Assets still pending activation the pool is 0, and "obsadené" (booked) is the wrong word for "there is nothing to book". It needs a fourth derived level (for example "nedostupné"), which amends D-58's three levels.
- **Status-bar colour.** `theme-color` is the light paper because the admin surface borrows the public chrome (`usePwaHead('operator', 'public')`). The Visitor header is dark blue, so the Android status bar and the header do not match. Fixing it means giving admin its own chrome colour.
- **Left and right safe areas** are applied to the public header only. They matter in landscape on a phone with a notch, which this app barely uses.
- **No bottom navigation.** The Visitor surface has one task (find, pick, reserve), so a tab bar would add chrome without adding a destination. The counter is a different question; see batch 2.

## Batch 2: the counter (built)

The counter is behind a login, so it was photographed with a temporary stand-in server (canned worklist data, never committed) and a real browser at 390 × 844 with touch emulation, before and after. **Not tried on a real phone, with a real session, or with the camera.**

What the "before" photographs showed, and it was worse than expected:

| # | Finding | Why it matters | Change |
|---|---|---|---|
| 14 | **The identity check's three buttons were blank.** A bare `<button>` on the dark counter inherited light text but kept the browser's light-grey background | The Operator could not read "Zhoduje sa — overiť" or "Nezhoduje sa — zamietnuť" on the step that gates every handover (FR-14) | A floor of styles for every native button, input, select and textarea in `base.css`, so no control shows the browser's own colours; the check uses `AppButton` at counter size, the rejection as `danger` and disabled until a reason is typed |
| 15 | None of the four counter pages had any style at all | Text touched the edges of the screen, blocks ran together, two links read as one word ("OmeškanéNedostavili sa") | The counter layout supplies the shell: edge padding including the home indicator, one column up to 720 px, a rhythm between blocks; the step bar stays edge to edge |
| 16 | Bare `<label><input>` pairs | Inconsistent with the rest of the app, no hint or description wiring | `AppField` for every counter field; tag-code and amount fields get the right mobile keyboard and no autocorrect |
| 17 | Main actions were 44 px, auto-width | The primary action at a counter should be a thumb-sized target | "Vydať", "Potvrdiť vydanie / vrátenie" and the settlement action at counter size, full width; "Vydať" is the yellow action |
| 18 | A disabled "Potvrdiť vydanie" gave no reason | The design says a disabled control states why | A line under it: "Pridajte aspoň jednu fotografiu stavu…" |
| 19 | In the overdue list a small link sat against the red "Nahlásiť ako stratené" button | A tired tap on the wrong one | Stacked with a gap; both full size |
| 20 | The deposit, a cash instruction, was ordinary text | S-10 asks for it large | Large, first on the handover form |
| 21 | The evidence timestamp was formatted in the component (`toLocaleString`) | D-51 | `formatDateTime` |

The control floor is checked by a contrast test (`tests/shared/contrast.test.ts`): edges reach 3:1 on the light surface and on the counter.

**A correction to my own earlier work:** the contrast test I added for the Rent Star palette lived in `tests/app/`, which the UI-005 harness does not collect, so it had stopped running while CI stayed green. It is now in `tests/shared/` and runs.

**Not done, found:**

- An evidence marked "(ešte nepotvrdené)" (not yet confirmed stored, D-40) can still be marked as verified from this screen. Whether the server refuses it, I have not checked.
- The Returns list has no action on its rows: a return starts from a scan. That is by design (P3) but a Customer standing at the counter with a tool in hand is not helped by it.
- `ScanTarget`'s own manual field keeps its small label, and the camera states could not be seen (a headless browser has no camera).
- The no-shows page and the Asset view (S-13) got the shared shell and the control floor but were not photographed individually.

## Batch 3: admin (not started)

To be audited with the surfaces open. Likely candidates, **unverified**: the density of the admin tables on a tablet, and whether the admin pages need the same shell the counter just got.
