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

## Open for a decision, not built

- **No page transitions.** A native app animates between screens. Design foundation §4.1 decided "no page transitions, no entrance animation" deliberately. Reversing that is a design decision, not a polish item.
- **Every day reads "obsadené" while no Asset is in the pool.** With all Assets still pending activation the pool is 0, and "obsadené" (booked) is the wrong word for "there is nothing to book". It needs a fourth derived level (for example "nedostupné"), which amends D-58's three levels.
- **Status-bar colour.** `theme-color` is the light paper because the admin surface borrows the public chrome (`usePwaHead('operator', 'public')`). The Visitor header is dark blue, so the Android status bar and the header do not match. Fixing it means giving admin its own chrome colour.
- **Left and right safe areas** are applied to the public header only. They matter in landscape on a phone with a notch, which this app barely uses.
- **No bottom navigation.** The Visitor surface has one task (find, pick, reserve), so a tab bar would add chrome without adding a destination. The counter is a different question; see batch 2.

## Batch 2: counter, batch 3: admin (not started)

To be audited with the surfaces open. Likely candidates, **unverified**: hit targets and one-handed reach on the HandoverOut/HandoverIn forms, the position of the primary action while the keyboard is open, the camera-first scan flow on the real counter phone, and the density of the admin tables on a tablet.
