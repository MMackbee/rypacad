# Yannick's contract off, Outstanding card folds (owner 2026-11-13)

Short design for two small changes. The owner approved both in chat ("yes outstanding card ... go ahead").
The third request from the same message, staff add/move/cancel for athletes, has its own design in `01-spec-admin-booking.md`.

## Intent

1. **The contract is gone from Yannick's view.** The Commitment Contract now runs on a paper calendar, and there is no weekly tracking any more (owner 2026-11-12: "No need for the day to day and week to week tracking for him anymore"). His Contract tab and the Contract card on each athlete page are dead weight.
2. **The Outstanding card stops taking over the admin screen.** On /portal/admin, the card "Outstanding · N" ("Who needs a call") lists one "Baseline due" row for nearly every athlete early in the season, plus no-shows and enrollments. The owner wants it removed or made condensable.

## Goals

**Yannick (role `mental`):**
- No Contract tab.
- No Contract card on the athlete page.
- No "N min a day" in the athlete page header.

**Old links:** `/portal/mental/contract` sends anyone to their own home. It must never fall through to the athlete page as an athlete called "contract".

**Outstanding card:**
- Folds to one tappable line: `Outstanding · N` plus a short summary of what is in it by kind (e.g. "2 enrollments · 4 no-shows · 28 baseline due") and a chevron.
- Tapping opens the full list, exactly as today.
- The open or closed choice is remembered on that device.
- It starts closed the first time.
- Owner and ops see the same card, as today.

## Non-goals

- No change to the family side (the contract is already hidden by `REACT_APP_CONTRACT_ENABLED`).
- No change to the `contractCheckins` / `contractLogs` data or rules.
- No change to the `mentalCheckinReminders` function: it sends nothing while `config/contract` is unset.
- No change to the other admin cards or to what the Outstanding rows contain.

## Anti-goals

- Yannick loses his notes, intake, athletes list, Sessions or consent views.
- A stale link shows "This athlete was not found".
- A refused read blanks his athlete page.

## Approaches

**Yannick: delete the mental-side contract code (chosen).** Owner/ops reach the board by URL only, so it goes for them too. Hiding it behind a second flag was rejected: the owner ruled the tracking is over, so a flag would leave a dead screen and tests for two states. Git history is the way back.

**Outstanding card: fold it (chosen, owner: "yes outstanding card").** Two alternatives were rejected:
- Deleting it removes pending enrollments and no-shows, which the owner still calls about.
- Dropping only the "Baseline due" rows changes what staff see without being asked.

## Design

**Yannick:**
- Remove the `mental-contract` tab (`components/BottomTabBar.js`).
- Remove the `MentalContractRoute` route, loader and warm-up from `PortalRoutes.js`. In their place goes a static redirect `mental/contract` -> `/portal`, declared before `mental/:athleteId`.
- Remove the Contract card, the "min a day" header part and the `required`/`contract` fields from `screens/MentalAthlete.js`.
- In `hooks/mental.js` (live and seed), drop the contract reads and fields from the athlete payload.
- Delete `useContractBoard`, `screens/MentalContract.js`, `components/mental/BoardRow.js`, `CheckinToggle.js` and `WeekDots.js`, with their tests and the harness entry `MC`.
- Keep `data/contractBoard.js` and `data/contractRule.js`: other code and the functions test read them.
- Frontend only.

**Outstanding card:**
- A small `useRememberedOpen(key, defaultOpen)` hook in its own module. It is not re-exported from `hooks/index.js`, the same pattern as `hooks/calendarView.js`, because screen tests mock `../hooks`. It keeps the choice in localStorage under `ryp.admin.outstandingOpen`, with every read and write in try/catch, and falls back to closed.
- The heading row becomes a full-width button with `aria-expanded` and `aria-controls`, a 44px touch target, and the ▴/▾ chevron used by TokenMeter's toggle.
- The summary counts rows by their existing tag (Enrollment, Attendance, Assessment, Contract). Contract rows are already dropped while the contract is off.
- An empty card keeps today's behaviour.

**Release:** frontend only. Push develop (staging), the owner checks as owner and as Yannick, then `develop:main`.

## Left to the builder

- Exact summary wording per tag: plural/singular, and the order Enrollment, Attendance, Assessment.
- Test updates: tests that assert Outstanding rows open the card first or seed it open.
