# Cancel Up To The Start, Move Any Booking - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A parent or an athlete login cancels any portal booking with a reason right up to the session's start (token back), or moves it to another open session of the same kind in one server step; coaches see those cancels and moves greyed under the attendance list; nobody at the academy gets an email for it.

**Architecture:** Cancel stays the client transaction it is (`hooks/live.js` `cancelBooking`), gaining three optional fields and a to-the-minute start check, with a rules arm that admits the fields and refuses a cancel after the start. Move is a new callable, `moveBooking` (`functions/portal/move.js`), one Admin SDK transaction whose decision is a pure module (`move-decide.js`) built on the existing charge and gate code (`lib.js`, `booking-gates.js`) plus a new server time parser (`session-time.js`). The family UI gets small new modules (row actions, reason picker, move sheet and hook, a pure bookability module extracted from `BookSession.js`); the staff side gets its own query hook and a greyed-rows component mounted under the roster. Grandfathered files gain only the lines that mount or call these, or change copy and formula lines.

**Tech Stack:** React 18 (CRA 5, plain JS), firebase 9 modular SDK, date-fns, jest via react-scripts (`screens/testRender.js` `renderScreen`, no Testing Library); Cloud Functions v1 (`firebase-functions/v1`, firebase-admin, `portal/tiny.js` runner, `portal/fake-firestore.js`, eslint-config-google: JSDoc on every function, 80 columns); Firestore rules v2 with emulator REST probes (`scripts/verify-rules.mjs`, Node 22 ESM).

**Spec:** `docs/portal/plans/2026-11-11-booking-changes/00-spec.md` (owner-approved 2026-11-11, "go with your recommendations"). Section numbers below (§4, §5 ...) are the spec's. Recon evidence: the five readers' notes (file:line) the spec cites; every path and line below was re-checked against `a1c2b85`.

## Global Constraints

- Base `a1c2b85` on `feat/booking-changes` (develop `94d7e4d` + the spec). Lanes run in the worktrees Task 0 creates and merge back into `feat/booking-changes` in `C:\Users\Mac\Desktop\rypacadapp\wt-bookchange`. Never touch `C:\Users\Mac\Desktop\rypacadapp\rypacad` (develop), localhost:3000, production or staging; never push, never deploy, never pass `--prod`, never use bare `git stash`.
- Never print `functions/.secret.local`, `functions/.env.local`, `frontend/.env` or any env value. `functions/.secret.local` keeps placeholders and no `SMTP_HOST` (PREFLIGHT, Task 0 Step 7).
- Repo files are CRLF (`core.autocrlf=true`). Never use the Edit tool or `sed -i` on an existing repo file: edit with the helper below (normalize to LF, anchored replacements that must each match exactly once, restore CRLF). New files may be written with the Write tool, then converted: `node -e "const f=process.argv[1],fs=require('fs');fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/\r?\n/g,'\r\n'))" <file>`. Check with `file <path>` ("with CRLF line terminators"). The site repo's `public/faq.html` is LF and stays LF (the helper keeps whatever the file had).
- CRLF helper, saved once per lane as `<your scratchpad>/crlf-edit.mjs` and run as `node <scratchpad>/crlf-edit.mjs <file> <edits.json>` (`edits.json` = `[{"find": "...", "replace": "..."}]`, LF text):
```js
import { readFileSync, writeFileSync } from 'node:fs';
const [file, editsPath] = process.argv.slice(2);
const raw = readFileSync(file, 'utf8');
const crlf = raw.includes('\r\n');
let text = raw.replace(/\r\n/g, '\n');
for (const { find, replace } of JSON.parse(readFileSync(editsPath, 'utf8'))) {
  const n = text.split(find).length - 1;
  if (n !== 1) { console.error(`anchor matched ${n} times: ${find.slice(0, 80)}`); process.exit(1); }
  text = text.replace(find, () => replace);
}
writeFileSync(file, crlf ? text.replace(/\n/g, '\r\n') : text);
console.log(`edited ${file} (${crlf ? 'CRLF' : 'LF'})`);
```
- Files stay under 500 lines. Grandfathered files take only the edits named in their task: `screens/BookSession.js` (1114; it shrinks), `hooks/index.js` (4290), `hooks/live.js` (2026), `screens/Roster.js` (955), `data/seed.js` (484), `screens/AthleteDashboard.js` (508, one copy line), `functions/portal/lib.js` (496, untouched), `firestore.rules`, `scripts/verify-rules.mjs` (one import, one call). `PortalRoutes.js` is untouched. `functions/index.js` (458) and `functions/portal/notices.js` (448) stay under 500.
- Backward compatible on the shared production backend: every new booking field is optional in the rules; the only tightening is the family cancel arm's before-start check (§4, §8); no export leaves `functions/index.js`; `cancelReason: 'member'` stays the value a family cancel writes. Deploy order: functions, then rules, then the app (Release section).
- Copy is exact as given here (spec §7 plus the strings in §4-§6). "Tour event", never "tournament", in anything a person reads. Elite and comp copy never mentions a token. No user-facing string says "until the day before" or "Same-day" after this branch.
- No real family names or phone numbers anywhere (code, tests, fixtures, commit messages). Tests use the seed cast (Jordan, Nico, Reese, Sam, Teddy, Ava) and QA fixtures use `... QA` names.
- Commands: `cd frontend && CI=true npx react-scripts test --watchAll=false <pattern>`; `cd frontend && npx eslint <files> --max-warnings=0`; `cd frontend && CI=true npm run build`; `cd functions && node portal/<file>.test.js` (each file prints `N passing`, exit 1 on the first failure); `cd functions && node test/check-exports.js`; `cd functions && npx eslint .`; rules: Task R1 Step 4.
- Commits name their files (`git add <paths>`, never `-A`), and every message ends with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Shared contract

Every lane builds against this section; a task's Interfaces block points back here.

### C1. Booking fields (`bookings/{athleteId}_{sessionId}`)

| field | written by | value |
|---|---|---|
| `cancelReason` | family cancel / `moveBooking` | `'member'` (family cancel, unchanged) / `'moved'` (Admin SDK only; silent) |
| `cancelCategory` | family cancel (new app) | `'sick' \| 'injured' \| 'school' \| 'family' \| 'other'`; optional in the rules |
| `cancelNote` | family cancel | string 1..140, only with `'other'`; removed (`deleteField()`) on any other cancel |
| `cancelledAt` | family cancel / `moveBooking` | server time (`serverTimestamp()`; rules `== request.time`) |
| `movedTo` | `moveBooking`, old row | the NEW booking id `{athleteId}_{toSessionId}` (the convention the owner's earlier move script wrote) |
| `movedFrom` | `moveBooking`, new row | the OLD booking id |
| `createdVia` | `moveBooking`, new row | `'move'` (Admin SDK only; the rules still admit only `'repeat'` from a client) |
| `comp` (+ any `comp*`) | `scripts/comp-booking.mjs`; copied by `moveBooking` | `true`: a free session, never charged |

A re-book (client `createBooking` or `moveBooking`) leaves no `cancelCategory`, `cancelNote` or `cancelledAt` on the confirmed row. Every reader of these fields checks `status == 'cancelled'` first.

### C2. Callable `moveBooking`

- Request `{ bookingId: string, toSessionId: string }` (each 1..200 chars, no `/`).
- Caller: signed in; `users/{uid}.role == 'athlete'` with `athleteId == booking.athleteId`, or `role == 'parent'` with `householdId == booking.householdId`.
- Response `{ bookingId, movedFrom, sessionId, periodKey, chargedFrom, graceTokenId, comp, rebooked }` (`bookingId` the new booking's id; `rebooked` true when the target row existed cancelled and was re-confirmed).
- Refusals: `HttpsError(code, message, { reason })`; the client maps `reason` to copy (Task U5 `moveRefusalCopy`). First failing check wins, in this order:

| # | reason | code | server message |
|---|---|---|---|
| 1 | `signed-out` | unauthenticated | Sign in to continue. |
| 2 | `bad-request` | invalid-argument | Send a booking and a session. |
| 3 | `booking-missing` | not-found | This booking no longer exists. |
| 4 | `not-yours` | permission-denied | This booking isn't on your account. |
| 5 | `not-confirmed` | failed-precondition | This booking was already changed. |
| 6 | `calendly-managed` | failed-precondition | Cancel or reschedule from Calendly's email |
| 7 | `mental-no-move` | failed-precondition | A 1:1 can't be moved in the app. |
| 8 | `same-session` | failed-precondition | Pick a different session. |
| 9 | `session-missing` | failed-precondition | That session isn't on the schedule any more. |
| 10 | `already-started` | failed-precondition | This session has already started. |
| 11 | `different-type` | failed-precondition | Pick a session of the same kind. |
| 12 | `session-cancelled` | failed-precondition | The academy cancelled that session. |
| 13 | `session-hidden` | failed-precondition | That session isn't offered right now. Pick another time. |
| 14 | `display-only` | failed-precondition | That session isn't booked through the portal. |
| 15 | `session-past` | failed-precondition | That session has already started. |
| 16 | `outside-window` | failed-precondition | That date isn't open for booking yet. |
| 17 | `already-booked` | failed-precondition | This athlete already has this session booked. |
| 18 | `membership-inactive` | failed-precondition | This membership isn't active right now. |
| 19 | `booking-not-open` | failed-precondition | Booking isn't open yet. |
| 20 | `handicap-reserved` | failed-precondition | This session is reserved for lower handicaps. |
| 21 | `full` | failed-precondition | That session just filled. |
| 22 | `one-per-day` | failed-precondition | Elite includes one of each a day - there's already one that day. |
| 23 | `no-tokens-left` / `no-session-token` | failed-precondition | No tokens left for that period. / No session token left. |

Checks 5-7 and 10 are on the booking being moved (10: its own session has started); 11-21 on the target. `membership-inactive` = `lib.membershipAllowsBooking(household, athlete)` false, or no package (both skipped for a comp booking), or `athlete.test === true` (always). `booking-not-open` = `!lib.bookingOpen(now, pkg)` (skipped for comp). `full` = `max(live non-cancelled bookings on the target, target.booked) >= target.capacity`. `outside-window` = `target.date > gates.openThrough(now, gates.windowMonthsFor(pkg))`. `one-per-day` = `gates.eliteDailyCapHit(pkg, target.type, target.date, period bookings without the old one)`.

- Charge (non-comp): position = `lib.tokensPosition` for the TARGET's period with the old booking left out of `bookings` and `graceSpends`, the athlete's waitlist rows mapped to periods as `waitlist-order.js` does, and the athlete's own waitlist entry on the target (if any) in `ignoreWaitlistIds`. Then, in order: (a) Elite (`position.unlimited`): `elite`; (b) the old booking's `graceTokenId` is in `position.grace` and its `expiresAt` is absent or `>= target.date`: carry it (`grace`, same id); (c) the old booking spent the period (`!graceTokenId`, `chargedFrom` absent or `'period'`), its period key equals the target's, and `position.left > 0`: `period`; (d) otherwise `lib.chargeFor({ position, sessionDate: target.date })`; null → `no-session-token` when `position.perPurchase`, else `no-tokens-left`.
- Comp booking (`old.comp === true`): skips billing, freeze, package, `booking-not-open` and the charge; new row `chargedFrom: 'period'`, `graceTokenId: null`, every `comp*` field of the old row copied.
- Writes, one transaction (all reads first): old row `{ status: 'cancelled', cancelledBy: uid, cancelReason: 'moved', movedTo: newId, cancelledAt: serverTimestamp() }`; old session `booked: max(0, booked - 1)`; new row (create when absent, `set` over a cancelled row with `rebookedAt: serverTimestamp()` added) `{ athleteId, sessionId, householdId, date, type, status: 'confirmed', periodKey, chargedFrom, graceTokenId, createdBy: uid, createdVia: 'move', movedFrom: oldId, createdAt: serverTimestamp(), ...comp fields }`; target session `booked: taken + 1`; delete `waitlist/{toSessionId}_{athleteId}` when it exists.
- Notices: the old row's `'moved'` sends nothing (`onBookingCancelled` already ignores any reason but `'member'` and `'session-cancelled'`). A created row fires `onBookingCreated` (`createdBy` is the caller, never `'system'`). A re-confirmed row fires nothing, so the callable sends `booking-confirmed` itself after the commit with `subjectKey: \`${newId}_move_${now.getTime()}\`` (never blocked by the earlier `booking-confirmed_${newId}` ledger row); a send failure is logged, never thrown.

### C3. Notice copy (functions)

- `booking-confirmed` body gains `' You can cancel or move it in the app any time before it starts.'` for every type but `mental` (unchanged).
- `promoted` body: `' You can cancel in the app until the day before.'` becomes `' You can cancel or move it in the app any time before it starts.'`.
- `booking-cancelled` receipt: with `comp` or `elite` the body ends after `was cancelled.` (no token sentence); otherwise byte-identical.

### C4. Shared pure module `frontend/src/portal/data/bookingChanges.js` (Task 0)

`CANCEL_CATEGORIES` (`[{ id, label }]`: sick Sick, injured Injured, school School, family Family conflict, other Other), `CANCEL_NOTE_MAX = 140`, `CANCEL_NOTE_PLACEHOLDER = 'A few words'`, `categoryLabel(id) -> ?string`, `cancelQuestion(name) -> string`, `cancelReasonOf(input) -> ?{ category, note }`, `dayTimeLabel(dateISO, time) -> string`, `coachLine(booking, movedToSession) -> ?string`, `movedToSessionId(booking) -> ?string`, `staleMarkLine(name) -> string`.

### C5. Client modules (lanes U and S)

| module | export | shape |
|---|---|---|
| `data/sessionStart.js` | `rowSession(row)` | `{ date, time: '4:00 PM' }` from a row's split `time` + `meridiem` |
| | `cancelDayOpen(session, todayISO)` | mental: `date > today`; else `date >= today` |
| `hooks/live.js` | `cancelBooking({ bookingId, cancelledVia, silent, reason })` | `reason` = `cancelReasonOf` output or null |
| | `rebookPatch(chargedFrom, graceTokenId, stamp, clear)` | `clear` given: adds `cancelCategory/cancelNote/cancelledAt: clear` |
| `hooks/cancelSeries.js` | `cancelSeries(rows, cancel, reason)` | each week `cancel(id, { cancelledVia: 'series', silent: true, reason })` (`reason` key only when given) |
| `hooks/index.js` rows | `comp`, `graceTokenId` on every booking row; `cancellable` = confirmed && not Calendly && `cancelDayOpen` | |
| | `onHold` on `useSchedule().data` and on each `useHouseholdReservations().data.members[i]` | household past_due/lapsed, or `billingStatusOf(athlete) !== 'active'` |
| `components/CancelSheet.js` | new optional props `chooser` (node) and `ready` (bool, default true) | `ready` false disables both confirm buttons |
| `components/CancelReasonPicker.js` | default `({ name, value, onChange, disabled })` | `value` `{ category: ?string, note: string }` |
| `components/MemberCancelSheet.js` | default `({ summary, name, laterWeeks, onClose, onConfirm(reason), onConfirmSeries(reason), onCancelled })` | |
| `components/BookingRowActions.js` | `rowActionsFor(row, { now, onHold })` | `{ kind: 'none' \| 'calendly' \| 'started' \| 'mental-day-of' \| 'change', move?: bool }` |
| | default `({ row, onHold, onCancel, onMove })` | Move button only when `onMove` given and `move` |
| `data/bookability.js` | `formatCapacity(session)`, `cardFacts(session, opts)`, `positionWithFreed(tokens, from, dateISO, anchorDay)`, `moveTargetOpen(session, ctx)` | Task U4 |
| `hooks/callables.js` | `callMoveBooking` | `callable('moveBooking')` |
| `hooks/move.js` | `loadMoveOptions(row, now)`, `useMoveOptions(row)`, `moveBooking({ bookingId, toSessionId })` | `{ days: [{ iso, label, sessions: [MoveOption] }] }` |
| `components/MoveSheet.js` | default `({ row, name, onClose, onMoved })`; `moveRefusalCopy(err)`, `moveTitle(type)`, `moveQuestion({ name, from, to })` | |
| `hooks/cancelledBookings.js` | `fetchCancelledBySession(sessionId)`, `liveCancelledRows(sessionId)`, `useCancelledBookings(sessionId)`, `bookingIsCancelled(bookingId)`, `markOrRecheck(mark, bookingId, status)` | rows `{ bookingId, athleteId, name, line }` |
| `components/CancelledRows.js` | default `({ sessionId })` | greyed `AthleteRow`s, nothing when empty |

`MoveOption` = `{ id, date, time: '4:00', meridiem: 'PM', fullTime: '4:00 PM', type, name, capacityLabel }`.

### C6. Rules

Top-level helpers `sessionNotStarted(s)` and `sessionStartsAt(date, t)` beside `sessionDayNotOver`; the member cancel arm admits `cancelCategory`, `cancelNote`, `cancelledAt` (checked by `cancelDetailOk`) and adds `sessionNotStarted` on the booking's session; the re-book arm may remove (never set or change) the three. No client may write `cancelReason: 'moved'`, `movedTo`, `movedFrom`, `cancelledVia: 'move'` or `createdVia: 'move'`.

## Review Focus

1. **Session time text that is not `h:mm AM/PM`** ('TBA', '4 PM', blank). Expected: on its own day it counts as not started everywhere (client row, `cancelBooking`, the callable, the rules), and the day floor still closes it at midnight; nothing throws and nothing refuses all day. A lower-case '4:00 pm' parses in the app and the callable (case-insensitive, as today) while the rules' pattern is upper-case only, so the rules fall back to the day floor for it: lenient, never stricter. Pinned: Task U3 Step 1 (`rowActionsFor` on a 'TBA' row), Task F1 Step 1 ('TBA', lower-case, blank), Task F2 Step 1 (a 'TBA' target today), Task R1 Step 1 ('TBA' today 200, yesterday 403).
2. **A household anchored on a day other than the 1st.** "Same period" is the household's anchor period, not the calendar month: with anchor 15, Nov 14 to Nov 16 crosses periods and must take the new period's token. Pinned: Task F2 Step 1 (anchor-15 move), Task U4 Step 1 (`positionWithFreed` with anchor 15).
3. **Two taps or two devices on one booking.** Expected: the first Move wins, the second is refused with plain copy; never two bookings, never a lost seat. Pinned: Task F3 Step 1 (second call refused `not-confirmed`, counts unchanged), Task U5 Step 1 (Move button inert while the call runs: one call on a double tap).
4. **A list left open across the start time.** Cancel or Move tapped after the start: refused with "This session has already started.", booking unchanged, token not returned. Pinned: Task U1 Step 1 (`cancelBooking` refuses inside the transaction), Task F2 Step 1 (`already-started`), Task R1 Step 1 (cancel 90 minutes after the start is 403), Task I2 checklist item 2.
5. **A bonus or single token that expires between the old and the new date.** Expected: the move falls back to a fresh charge (a period token) or is refused with token copy, and the picker does not offer, in the common case, what the server would refuse. Pinned: Task F2 Step 1 (expired-before-target falls back; refusal when the period is spent), Task U4 Step 1 (`positionWithFreed` adds the freed token only up to its expiry).

## Decided here

Points the spec left open or got wrong against the code, and the resolution:

1. **"Booking-confirmed email" copy (§7).** Today `bookingConfirmed` carries no cancel sentence; the old "until the day before" sentence lives in the `promoted` notice (`notices.js:150`). Both get the new sentence (C3): the literal spec line and the "old wording goes everywhere" rule. A portal `mental` booking's confirmation stays as it is (Yannick's 24 hours); `mental` is never promoted (no waitlist).
2. **"Charged exactly like a fresh booking" vs "the token moves with it" (§5).** With the grace-first order a fresh booking would spend a spare bonus token before the period; the plan carries the old charge while it is still valid on the new date (C2 (b), (c)) and only otherwise charges like a fresh booking (d). Same net tokens either way; the family keeps the token they picked.
3. **Exclusion of the moved booking** needs no change to `lib.js` (496 lines): `move-decide.js` filters the old row out of the rows it hands `tokensPosition`.
4. **A portal mental 1:1 on its own day** shows no buttons; its row reads "A 1:1 can be cancelled in the app up to the day before." (new string; the spec removed the old day-of line without saying what a mental row shows).
5. **An athlete's own login** has no name on My Schedule: the picker asks "Why can't you make it?" and the move question reads "Move from ... to ...?".
6. **The family's own moved-away row** reads "Moved to another session." under its Cancelled badge (`cancelReasonCopy('moved')`; new string), instead of looking like a plain cancel.
7. **The waitlist entry on the target**, when the athlete has one, is deleted by the move and does not count against the charge.
8. **Elite cancel receipt** loses its token sentence with the comp change (spec §7 "Elite copy never mentions tokens"; the receipt said "The token is back in this period." to Elite families).
9. **Rules for Move:** none. The callable writes with the Admin SDK, so recon's `cancelledVia: 'move'` and `movedFrom`-on-create rules are not needed; probes pin that a client cannot write any move marker (C6).
10. **Coach list scope:** family cancels with a known `cancelCategory` and every `'moved'` row; an old-app cancel (no category), a series cancel without one, academy and billing cancels stay off the list.
11. **Website FAQ:** the spec's paragraph replaces the whole answer, which drops "Tokens refresh on the 1st of each month and unused tokens don't carry over." (recon flagged "the 1st" as wrong: periods run from each household's anchor day). Flagged to the owner in Task W1's commit message.

## File Structure

| Lane | Worktree / branch | Tasks | Files (no file is in two lanes) |
|---|---|---|---|
| lead | `wt-bookchange` / `feat/booking-changes` | 0, then I1, I2 | `frontend/src/portal/data/bookingChanges.js` (+test) |
| F functions | `wt-bookchange-fn` / `bookchange/fn` | F1-F4 | new `functions/portal/session-time.js`, `move-decide.js`, `move.js` (+tests); changed `functions/index.js`, `portal/notices.js`, `portal/notify-gates.js` (comment), `portal/promotion.js` (comment), `portal/notices.test.js`, `portal/promotion.test.js`, `portal/notify-gates.test.js`, `test/check-exports.js`, `test/verify-notifications.js` |
| R rules | `wt-bookchange` / `feat/booking-changes` | R1, R2 | `firestore.rules`, new `scripts/rules-probes/booking-changes.mjs`, `scripts/verify-rules.mjs`, `docs/portal/DATA-MODEL.md`, `docs/portal/ui-redesign-brief.md`, `docs/portal/tokens-and-billing-contract.md` |
| U family UI | `wt-bookchange-ui` / `bookchange/ui` | U1-U5 | `frontend/src/portal/`: `data/sessionStart.js`, new `data/bookability.js`, `hooks/live.js`, `hooks/cancelSeries.js`, `hooks/index.js`, new `hooks/move.js`, `hooks/callables.js`, `components/CancelSheet.js`, new `components/CancelReasonPicker.js`, `MemberCancelSheet.js`, `BookingRowActions.js`, `MoveSheet.js`, `components/WaitlistAction.js`, `components/BookingReasons.js`, `data/seed.js`, `screens/Reservations.js`, `MySchedule.js`, `BookSession.js`, `AthleteDashboard.js`, and their tests (incl. `SpecialistBooking.test.js`, `hooks/index.test.js`, new `hooks/index.bookchange.test.js`) |
| S staff | `wt-bookchange-staff` / `bookchange/staff` | S1, S2 | new `frontend/src/portal/hooks/cancelledBookings.js`, `components/CancelledRows.js` (+tests), `screens/Roster.js`, new `screens/Roster.bookchange.test.js`, mocks in `screens/Roster.readonly.test.js`, `Roster.clubhead.test.js`, `Roster.reserved.test.js` |
| W website | `C:\Users\Mac\Desktop\rypacadapp\ryp-academy-site` / `faq/cancel-move` | W1 | `public/faq.html` |

Order: Task 0 first (lead). Then F, R, U, S, W run in parallel; tasks inside a lane run in order. I1 after all lanes; I2 after I1.

---

### Task 0: Shared module and lane setup (lead)

LANE lead. Depends on: none.

**Files:**
- Create: `frontend/src/portal/data/bookingChanges.js`, `frontend/src/portal/data/bookingChanges.test.js`
- Local only, never committed: the three lane worktrees and their `node_modules` junctions, placeholder keys in `wt-bookchange/functions/.secret.local` / `.env.local` if PREFLIGHT reports any missing.

**Interfaces:**
- Produces: C4, exactly. `coachLine(booking, movedToSession)`: `booking` a `bookings` body; `movedToSession` `{ date, time }` or null.

- [ ] **Step 1: Write the failing test** `data/bookingChanges.test.js`:
```js
import { CANCEL_CATEGORIES, CANCEL_NOTE_MAX, CANCEL_NOTE_PLACEHOLDER, cancelQuestion, cancelReasonOf, categoryLabel,
  coachLine, dayTimeLabel, movedToSessionId, staleMarkLine } from './bookingChanges';

test('the five reasons in order, with their words', () => {
  expect(CANCEL_CATEGORIES.map((c) => [c.id, c.label])).toEqual([['sick', 'Sick'], ['injured', 'Injured'], ['school', 'School'], ['family', 'Family conflict'], ['other', 'Other']]);
  expect([CANCEL_NOTE_MAX, CANCEL_NOTE_PLACEHOLDER]).toEqual([140, 'A few words']);
  expect([categoryLabel('family'), categoryLabel('bored')]).toEqual(['Family conflict', null]);
});
test('the question names the first name, or asks you', () => {
  expect(cancelQuestion('Jordan Whitfield')).toBe("Why can't Jordan make it?");
  expect(cancelQuestion(null)).toBe("Why can't you make it?");
});
test('cancelReasonOf: a known category; a trimmed 1..140 note only with Other', () => {
  expect(cancelReasonOf({ category: 'sick' })).toEqual({ category: 'sick', note: null });
  expect(cancelReasonOf({ category: 'sick', note: 'fever' })).toEqual({ category: 'sick', note: null });
  expect(cancelReasonOf({ category: 'other', note: '  dentist ' })).toEqual({ category: 'other', note: 'dentist' });
  expect(cancelReasonOf({ category: 'other', note: 'x'.repeat(140) })).toEqual({ category: 'other', note: 'x'.repeat(140) });
  for (const bad of [{ category: 'other', note: '   ' }, { category: 'other' }, { category: 'other', note: 'x'.repeat(141) }, { category: 'bored' }, {}, null]) {
    expect(cancelReasonOf(bad)).toBeNull();
  }
});
test('dayTimeLabel', () => {
  expect(dayTimeLabel('2026-11-12', '4:00 PM')).toBe('Thu Nov 12, 4:00 PM');
  expect(dayTimeLabel('2026-11-12', '')).toBe('Thu Nov 12');
});
test('coachLine: a family cancel with its reason, a move with where to, nothing else', () => {
  const c = (over) => ({ status: 'cancelled', cancelReason: 'member', ...over });
  expect(coachLine(c({ cancelCategory: 'sick' }))).toBe('Cancelled · Sick');
  expect(coachLine(c({ cancelCategory: 'family' }))).toBe('Cancelled · Family conflict');
  expect(coachLine(c({ cancelCategory: 'other', cancelNote: 'dentist' }))).toBe('Cancelled · Other: dentist');
  expect(coachLine(c({ cancelCategory: 'other' }))).toBe('Cancelled · Other');
  expect(coachLine(c({}))).toBeNull();
  expect(coachLine(c({ cancelCategory: 'bored' }))).toBeNull();
  expect(coachLine(c({ cancelReason: 'session-cancelled', cancelCategory: 'sick' }))).toBeNull();
  expect(coachLine(c({ cancelReason: 'moved' }), { date: '2026-11-12', time: '4:00 PM' })).toBe('Moved to Thu Nov 12, 4:00 PM');
  expect(coachLine(c({ cancelReason: 'moved' }), null)).toBe('Moved');
  expect(coachLine({ status: 'confirmed', cancelReason: 'member', cancelCategory: 'sick' })).toBeNull();
});
test('movedToSessionId and the stale-tap line', () => {
  expect(movedToSessionId({ athleteId: 'jordan', movedTo: 'jordan_2026-11-12-0' })).toBe('2026-11-12-0');
  expect(movedToSessionId({ athleteId: 'jordan', movedTo: 'nico_2026-11-12-0' })).toBeNull();
  expect(movedToSessionId({ athleteId: 'jordan' })).toBeNull();
  expect(staleMarkLine('Jordan Whitfield')).toBe('Jordan Whitfield cancelled - list updated.');
  expect(staleMarkLine(null)).toBe('This athlete cancelled - list updated.');
});
```
- [ ] **Step 2: Run it** - `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/data/bookingChanges.test.js`. Expected: FAIL, "Cannot find module './bookingChanges'".
- [ ] **Step 3: Implement `data/bookingChanges.js`** (pure, no Firebase; `dayTimeLabel` uses date-fns `format(parseISO(date), 'EEE MMM d')`; the separator in the coach line is " · " (U+00B7); a header comment names spec §4-§6 and that the server never reads it).
- [ ] **Step 4: Run it** - same command. Expected: PASS (6 tests).
- [ ] **Step 5: CRLF and commit**
```bash
git add frontend/src/portal/data/bookingChanges.js frontend/src/portal/data/bookingChanges.test.js
git commit -m "feat(bookings): shared cancel-reason and move copy module" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
- [ ] **Step 6: Cut the lane worktrees** (PowerShell):
```powershell
$root = 'C:\Users\Mac\Desktop\rypacadapp'
foreach ($p in @(@('wt-bookchange-fn','bookchange/fn'), @('wt-bookchange-ui','bookchange/ui'), @('wt-bookchange-staff','bookchange/staff'))) {
  git -C "$root\wt-bookchange" worktree add "$root\$($p[0])" -b $p[1]
  foreach ($d in 'frontend','functions') { New-Item -ItemType Junction -Path "$root\$($p[0])\$d\node_modules" -Target "$root\rypacad\$d\node_modules" } }
```
Expected: three worktrees at the Task 0 commit. Teardown (after I1): `Remove-Item` each junction path (never a recursive delete through it), then `git -C ... worktree remove ...`.
- [ ] **Step 7: PREFLIGHT** (from `wt-bookchange`; prints key names only):
```bash
node -e "const fs=require('fs');const K=['SMTP_USER','SMTP_PASS','STRIPE_WEBHOOK_SECRET','STRIPE_SECRET_KEY','CALENDLY_WEBHOOK_SIGNING_KEY','SLACK_FEEDBACK_TOKEN'];for(const f of ['functions/.secret.local','functions/.env.local']){const t=fs.readFileSync(f,'utf8');for(const k of K){const m=t.match(new RegExp('^'+k+'=(.+)$','m'));if(!m||!m[1].trim())throw new Error(f+': '+k+' missing or empty');}if(/^SMTP_HOST=/m.test(t))throw new Error(f+': SMTP_HOST set');}if(fs.existsSync('functions/.env')&&/^SMTP_HOST=/m.test(fs.readFileSync('functions/.env','utf8')))throw new Error('functions/.env: SMTP_HOST set');console.log('preflight ok')"
```
Expected: `preflight ok`. On "missing or empty", append `KEY=placeholder` for that key only (never a real value, never `SMTP_HOST`) and re-run.

---

### Task F1: Server time parser

LANE F. Depends on: Task 0.

**Files:**
- Create: `functions/portal/session-time.js`, `functions/portal/session-time.test.js`

**Interfaces:**
- Consumes: `lib.chicagoDate(date)`, `lib.chicagoTime(date)` (`'4:05 PM'`).
- Produces: `parseTimeToMinutes(text) -> ?number` (regex `/(\d+):(\d+)\s*(AM|PM)/i`, `(h % 12 + (PM ? 12 : 0)) * 60 + m`); `sessionStarted(session, now) -> boolean` (no session or no date: false; another Chicago date: `date < today`; today: parsed start `<=` Chicago minutes now, unparseable false). Header: CHANGE ONE, CHANGE BOTH with `frontend/src/portal/data/calendar.js#parseTimeToMinutes` and `data/sessionStart.js#sessionStarted`.

- [ ] **Step 1: Write the failing test** (`tiny.js` style):
```js
test('parseTimeToMinutes: the client parser, case-insensitive; anything else null', () => {
  assert.deepEqual(['4:00 PM', '12:00 PM', '12:15 AM', '9:05 am', '4:00pm'].map(t.parseTimeToMinutes), [960, 720, 15, 545, 960]);
  assert.deepEqual(['TBA', '', undefined, '16:00', '4 PM'].map(t.parseTimeToMinutes), [null, null, null, null, null]);
});
// 2026-11-10T18:00:00Z is noon Tue Nov 10 in Chicago.
const NOON = new Date('2026-11-10T18:00:00Z');
test('sessionStarted on the academy clock', () => {
  const s = (date, time) => ({date, time});
  assert.equal(t.sessionStarted(s('2026-11-09', '4:00 PM'), NOON), true);
  assert.equal(t.sessionStarted(s('2026-11-11', '9:00 AM'), NOON), false);
  assert.equal(t.sessionStarted(s('2026-11-10', '11:59 AM'), NOON), true);
  assert.equal(t.sessionStarted(s('2026-11-10', '12:00 PM'), NOON), true);
  assert.equal(t.sessionStarted(s('2026-11-10', '12:01 PM'), NOON), false);
  assert.equal(t.sessionStarted(s('2026-11-10', 'TBA'), NOON), false);
  assert.equal(t.sessionStarted(null, NOON), false);
  // 03:00Z on Nov 11 is 9 PM Nov 10 in Chicago: the Chicago date decides.
  const night = new Date('2026-11-11T03:00:00Z');
  assert.equal(t.sessionStarted(s('2026-11-10', '8:00 PM'), night), true);
  assert.equal(t.sessionStarted(s('2026-11-11', '9:00 AM'), night), false);
});
```
- [ ] **Step 2: Run** `cd functions && node portal/session-time.test.js`. Expected: FAIL, "Cannot find module './session-time'".
- [ ] **Step 3: Implement** `session-time.js` per Interfaces (Google style JSDoc).
- [ ] **Step 4: Run** the same. Expected: `2 passing`. Then `npx eslint portal/session-time.js portal/session-time.test.js`: no output.
- [ ] **Step 5: CRLF and commit** - `git add functions/portal/session-time.js functions/portal/session-time.test.js`; message `feat(functions): server-side session start parser`, trailer.

### Task F2: The move decision (pure)

LANE F. Depends on: F1.

**Files:**
- Create: `functions/portal/move-decide.js`, `functions/portal/move-decide.test.js`

**Interfaces:**
- Consumes: `lib.tokensPosition`, `lib.chargeFor`, `lib.periodFor`, `lib.membershipAllowsBooking`, `lib.bookingOpen`, `lib.chicagoDate`; `gates.openThrough`, `gates.windowMonthsFor`, `gates.eliteDailyCapHit` (`booking-gates.js`); `sessionStarted` (F1).
- Produces:
  - `REFUSALS` - `{ [reason]: { code, message } }`, exactly C2's table.
  - `decideMove(ctx) -> { ok: true, comp: boolean, charge: { chargedFrom, graceTokenId }, period: { periodKey, periodEnd }, taken: number, waitlistEntryId: ?string } | { ok: false, reason: string }`, where `ctx = { uid, user, old, oldSession, target, targetBooking, targetLive, athlete, household, pkg, tokenPeriod, periodBookings, graceSpends, waitlist, graceTokens, now }`; `old`, `targetBooking` and every row carry their doc `id`; `target` and `oldSession` carry `id`; `targetLive` is the count of non-cancelled bookings on the target. Checks in C2's order 3..23 (`old` null is `booking-missing`); the charge as C2 (a)-(d); comp as C2. `waitlistEntryId` is `${target.id}_${athlete id}` when that row is in `ctx.waitlist`, else null.
  - `moveCharge({ old, target, position, period, oldPeriodKey }) -> { chargedFrom, graceTokenId } | { reason }` (C2 (a)-(d)), exported for its own tests.

- [ ] **Step 1: Write the failing tests.** A `world(over)` builder returns a full ctx: `NOW = 2026-11-10T18:00:00Z`; user `{ role: 'parent', householdId: 'hart' }` (uid `u-parent`); athlete `sam` `{ householdId: 'hart', packageId: 't-6', handicap: 4 }`; household `{ periodAnchorDay: 1 }`; pkg `{ kind: 'tokens', tokens: 6 }`; old `sam_s1` (Thu Nov 12 4:00 PM training, confirmed, `periodKey '2026-11-01'`, `chargedFrom 'period'`, `householdId 'hart'`); oldSession `s1`; target `s2` (Fri Nov 13 4:00 PM training, capacity 12, booked 3, status 'scheduled'); `targetLive 3`; no target booking, no waitlist, no grace. Cases (each asserts the whole result with `assert.deepEqual` or the `reason`):
  - `moves within the period carrying the period token` - ok, `charge { chargedFrom: 'period', graceTokenId: null }`, `period.periodKey '2026-11-01'`, `taken 3`, `comp false`.
  - `a full November still moves inside November (the old one counts as given back)` - six non-cancelled November period rows including `sam_s1`: ok, period.
  - `a move into December spends December's token` - target `2026-12-01`: ok, `periodKey '2026-12-01'`, period; with six December rows already: `no-tokens-left`.
  - `a bonus token carries while it is valid on the new date` - old `chargedFrom 'grace'`, `graceTokenId 'g1'`, grace row `g1 { expiresAt: '2026-11-20' }`: ok, `{ chargedFrom: 'grace', graceTokenId: 'g1' }`.
  - `a bonus token that ends before the new date falls back to a fresh charge` - same, target Dec 1: ok, `{ chargedFrom: 'period', graceTokenId: null }`; with December spent: `no-tokens-left`.
  - `a single token carries to any period` - pkg `{ kind: 'single', tokens: 1 }`, old `graceTokenId 'single_cs_1'`, grace `{ id: 'single_cs_1', expiresAt: '2027-02-27', reason: 'single-purchase' }`, target Dec 1: ok, grace `single_cs_1`; with no grace at all: `no-session-token`.
  - `Elite stays Elite; one-per-day counts other bookings only` - pkg `{ kind: 'elite', tokens: null }`: ok `elite`; another confirmed training on Nov 13: `one-per-day`; old on Nov 12 4 PM moved to Nov 12 6 PM: ok.
  - `comp stays comp and skips billing, freeze and tokens` - old `comp: true`, athlete `billing { status: 'pending' }`, household `membership { status: 'past_due' }`, December spent, target Dec 1: ok, `comp true`, `{ chargedFrom: 'period', graceTokenId: null }`.
  - `an unpaid or frozen ordinary booking is refused` - billing pending: `membership-inactive`; household past_due: `membership-inactive`; `athlete.test === true` even with comp: `membership-inactive`; no package: `membership-inactive`.
  - `the old booking's own refusals` - another household's parent: `not-yours`; an athlete login whose `athleteId` is a sibling: `not-yours`; old `status 'cancelled'`: `not-confirmed`; `source 'calendly'`: `calendly-managed`; `type 'mental'`: `mental-no-move`; target id equal to the old session: `same-session`; old session dated today at 11:00 AM: `already-started`; old session missing: `session-missing`.
  - `the target's refusals` - missing: `session-missing`; type 'tournament': `different-type`; `status 'cancelled'`: `session-cancelled`; `hidden: true`: `session-hidden`; `bookable: false`: `display-only`; today 11:00 AM: `session-past`; `2027-01-05`: `outside-window`; target booking confirmed: `already-booked`; `maxHandicap 3`: `handicap-reserved`; athlete with no handicap and `maxHandicap 5`: `handicap-reserved`; `capacity 3, booked 3`: `full`; `capacity 3, booked 1, targetLive 3`: `full`.
  - `a target today with an unreadable time is open on its day` - target today `time 'TBA'`: ok (Review Focus 1).
  - `anchor 15: Nov 14 to Nov 16 crosses into the next period` - household `periodAnchorDay 15`, old Nov 14 (`periodKey '2026-10-15'`), target Nov 16: ok, `periodKey '2026-11-15'`; with six rows in that period: `no-tokens-left` (Review Focus 2).
  - `a waitlist entry on the target is left out of the count and returned for deletion` - single pkg; the old booking's `single_cs_1` is the athlete's only token; a waitlist row `s2_sam` (`date` Nov 13): ok, grace `single_cs_1`, `waitlistEntryId 's2_sam'` (counted, the entry would hold that token and the move would be refused `no-session-token`).
  - `REFUSALS covers every reason with C2's code` - `assert.deepEqual(Object.keys(REFUSALS).sort(), [...C2 reasons].sort())` and the codes of `signed-out`, `bad-request`, `booking-missing`, `not-yours`, one failed-precondition.
- [ ] **Step 2: Run** `cd functions && node portal/move-decide.test.js`. Expected: FAIL, "Cannot find module './move-decide'".
- [ ] **Step 3: Implement** `move-decide.js` per Interfaces. Positions as `waitlist-order.js` `loadCandidate` builds them (`periodFor(w.date || target.date, anchorDay)` for waitlist rows; the period rows and grace spends deduplicated by id, both without `old.id`). Header: why it exists (spec §5), that it mirrors `waitlist-order.js`'s gates, and the charge order.
- [ ] **Step 4: Run** the same. Expected: `15 passing`; `npx eslint portal/move-decide.js portal/move-decide.test.js` clean.
- [ ] **Step 5: CRLF and commit** - message `feat(functions): the move decision - gates, carry-or-charge, comp`, trailer.

### Task F3: The `moveBooking` callable

LANE F. Depends on: F2.

**Files:**
- Create: `functions/portal/move.js`, `functions/portal/move.test.js`
- Modify: `functions/index.js` (header line, one require, one export), `functions/test/check-exports.js`

**Interfaces:**
- Consumes: `decideMove`, `REFUSALS` (F2); `lib.periodBookingsQuery`, `lib.graceSpendQueries`, `lib.readGraceSpends`, `lib.rows`, `lib.bookingId`, `lib.waitlistId`, `lib.periodFor`, `lib.tokenPeriodId`; `notices.bookingConfirmed`; `notify.sendNotice`; `MAIL_SECRETS`; `FieldValue` from `firebase-admin/firestore` (as `promotion.js`).
- Produces: `moveBookingHandler(data, context, deps?) -> Promise<C2 response>` (`deps { db, now }`); `moveBooking` = `functions.runWith({secrets: MAIL_SECRETS}).https.onCall((data, context) => moveBookingHandler(data, context))`; module-private `loadMove(tx, store, { uid, bookingId, toSessionId })` (every read C2 lists, in one transaction, before any write; returns nulls for missing docs) and `writeMove(tx, store, ctx, decision, uid)`.

- [ ] **Step 1: Write the failing tests** with `fakeDb` (`portal/fake-firestore.js`) and `notify.sendNotice` replaced by a recorder (the `promotion.test.js` pattern). World: `users/u-parent { role: 'parent', householdId: 'hart' }`, `users/u-other { role: 'parent', householdId: 'lopez' }`, `athletes/sam`, `households/hart { periodAnchorDay: 1 }`, `packages/t-6`, sessions `s1` (Nov 12, booked 2), `s2` (Nov 13, booked 1), bookings `sam_s1` (confirmed) and `ava_s1`. Cases:
  - `a move is four writes: old cancelled as moved, its seat back, the new row, the new seat` - `docs['bookings/sam_s1']` has `status 'cancelled'`, `cancelReason 'moved'`, `movedTo 'sam_s2'`, `cancelledBy 'u-parent'`, a `cancelledAt` value; `sessions/s1.booked 1`; `bookings/sam_s2` has `status 'confirmed'`, `movedFrom 'sam_s1'`, `createdVia 'move'`, `createdBy 'u-parent'`, `periodKey '2026-11-01'`, `chargedFrom 'period'`, `graceTokenId null`, `householdId 'hart'`, `date '2026-11-13'`, `type 'training'`; `sessions/s2.booked 2`; the result deep-equals `{ bookingId: 'sam_s2', movedFrom: 'sam_s1', sessionId: 's2', periodKey: '2026-11-01', chargedFrom: 'period', graceTokenId: null, comp: false, rebooked: false }`; `sent` is empty (the create trigger sends).
  - `onto a row cancelled earlier: re-confirmed in place, its old cancel fields gone, and the callable sends booking-confirmed under a move key` - seed `sam_s2 { status: 'cancelled', cancelReason: 'member', cancelCategory: 'school', cancelledAt: x, cancelledBy: 'u-parent' }`: the row has none of `cancelReason`, `cancelCategory`, `cancelNote`, `cancelledAt`, `cancelledBy`; has `rebookedAt`; `rebooked true`; `sent` is one notice `{ kind: 'booking-confirmed', category: 'schedule', bookingId: 'sam_s2', subjectKey: \`sam_s2_move_${NOW.getTime()}\` }` whose body is `notices.bookingConfirmed(...)`'s.
  - `the seat count is the larger of the counter and the roster` - `s2 { booked: 0, capacity: 3 }` with two confirmed rows on `s2`: `sessions/s2.booked 3`.
  - `a comp booking stays comp` - `sam_s1 { comp: true, compNote: 'x' }`, athlete billing pending: new row `comp true`, `compNote 'x'`, `chargedFrom 'period'`.
  - `the athlete's waitlist entry on the target is removed` - `waitlist/s2_sam` exists before, not after.
  - `a refusal changes nothing` - `s2 { capacity: 1, booked: 1 }`: rejects with `code 'failed-precondition'`, `details.reason 'full'`; `JSON.stringify(docs)` equals the snapshot taken before.
  - `signed out, bad input, not found, not yours` - no auth: `unauthenticated`/`signed-out`; `{ bookingId: 'a/b', toSessionId: 's2' }`, a 201-char id, missing ids: `invalid-argument`/`bad-request`; unknown booking: `not-found`/`booking-missing`; `u-other`: `permission-denied`/`not-yours`.
  - `a second call for the same booking is refused and moves nothing` - after a successful move, the same request rejects `not-confirmed`; `sessions/s1.booked` and `sessions/s2.booked` unchanged by it (Review Focus 3).
  - `a notice that fails never undoes the move` - recorder throws on the re-confirm path: the handler resolves with `rebooked true` and the docs show the move.
- [ ] **Step 2: Run** `cd functions && node portal/move.test.js`. Expected: FAIL, "Cannot find module './move'".
- [ ] **Step 3: Implement** `move.js` per Interfaces and C2 (input check before any read; `HttpsError(REFUSALS[r].code, REFUSALS[r].message, { reason: r })` thrown inside the transaction so nothing commits; the notice after `runTransaction` resolves).
- [ ] **Step 4: Wire it.** `functions/index.js`: add `const {moveBooking} = require('./portal/move');` after the `requestMentalConsent` require; add `exports.moveBooking = moveBooking;` after `exports.onSingleTokenSpent = onSingleTokenSpent;` with a one-line comment ("A family moves a booking in one transaction (2026-11-11, portal/move.js)"); add one header bullet under the waitlist-hardening paragraph naming the callable. `test/check-exports.js`: `moveBooking: MAIL` in `EXPECTED`, the count `21`, and the comment and assert message naming it.
- [ ] **Step 5: Run** `node portal/move.test.js` (Expected: `9 passing`), `node test/check-exports.js` (Expected: `ok  21 functions exported, secrets bound per contract 6.4`), `npx eslint .` (clean).
- [ ] **Step 6: CRLF and commit** - `git add functions/portal/move.js functions/portal/move.test.js functions/index.js functions/test/check-exports.js`; message `feat(functions): moveBooking callable - one transaction, typed refusals`, trailer.

### Task F4: Notice copy and gates

LANE F. Depends on: F3.

**Files:**
- Modify: `functions/portal/notices.js` (`bookingConfirmed` lines 124-131, `promoted` 142-152, `bookingCancelled` 164-176), `functions/index.js` (`onBookingCancelled`'s `notices.bookingCancelled({...})` call, lines 294-295), `functions/portal/notify-gates.js` (doc comment of `shouldNoticeMemberCancel`: `'moved'` is never a receipt), `functions/portal/promotion.js` (lines 21-22: "(the family could not cancel)" becomes "(owner ruling R3)")
- Test: `functions/portal/notices.test.js` (lines 39-40, 70-80, and new cases), `functions/portal/promotion.test.js` (lines 90-91, 133-134, 530-531), `functions/portal/notify-gates.test.js`, `functions/test/verify-notifications.js` (lines 290, 307)

**Interfaces:**
- Produces: C3. `bookingCancelled({ athlete, session, singleToken, comp, elite })`; `onBookingCancelled` passes `comp: after.comp === true, elite: Boolean(athlete && athlete.packageId === 'elite')`.

- [ ] **Step 1: Change the tests first.** `notices.test.js`: line 40 becomes `'Teddy is booked: Tour event, Sat, Nov 7 at 9:00 AM. You can cancel or move it in the app any time before it starts.'`; the `promoted` case's two bodies end `' You can cancel or move it in the app any time before it starts.'`; new cases: `bookingConfirmed` for `{type: 'mental', ...}` has no "cancel" sentence; `bookingCancelled({athlete: TEDDY, session: TRAINING, comp: true}).body === "Teddy's booking for Training, Wed, Nov 4 at 3:00 PM was cancelled."` and the same with `elite: true`; the existing "old body is byte-identical" case stays. `promotion.test.js`: the three `promoted` bodies end the same new sentence. `notify-gates.test.js`: `shouldNoticeMemberCancel({status: 'cancelled', cancelReason: 'moved'}) === false`; `shouldNoticeBookingCreated({status: 'confirmed', createdBy: 'u1', createdVia: 'move'}) === true`. `verify-notifications.js` line 290 appends the sentence; line 307 swaps it.
- [ ] **Step 2: Run** `node portal/notices.test.js`, `node portal/promotion.test.js`. Expected: FAIL on the new bodies (`notify-gates` passes already: the gates need no code change).
- [ ] **Step 3: Implement** C3 in `notices.js` (one module constant for the sentence; `bookingConfirmed` appends it unless `session.type === 'mental'`) and the `index.js` call.
- [ ] **Step 4: Run** every functions test: `cd functions && for f in portal/*.test.js; do node "$f" || exit 1; done`. Expected: every file `N passing`, exit 0. `node --check test/verify-notifications.js` and `npx eslint .`: clean. `grep -rn "until the day before" portal test`: no output.
- [ ] **Step 5: CRLF and commit** - message `feat(functions): cancel-or-move copy in confirmations; no token line on comp and Elite receipts`, trailer.

---

### Task R1: Rules - reasons, before-start, re-book cleanup, probes

LANE R. Depends on: Task 0 (branch only).

**Files:**
- Modify: `firestore.rules` (new helpers after `sessionDayNotOver`, lines 116-123; the comment at 1606-1611; `memberBookingUpdateOk` lines 1684-1715)
- Create: `scripts/rules-probes/booking-changes.mjs`
- Modify: `scripts/verify-rules.mjs` (import beside `taskTourBrackets`, line 32; `await taskBookingChanges();` after `await taskTourBrackets();` in `runPass`, line 1153)

**Interfaces:**
- Consumes from `../verify-rules.mjs`: `call, commitAs, createAs, del, expect, listAs, patchWrite, seatWrite, seed, t, uid, updateAs`.
- Produces: C6; `export async function taskBookingChanges()`.

- [ ] **Step 1: Write the failing probes** `scripts/rules-probes/booking-changes.mjs` in the `hidden.mjs` style (Elite rows `ath-elite` / household `hh`, so both passes answer alike; seed in `try`, delete everything in `finally`; read `uid` only inside functions). Helpers: `chicagoSlot(offsetMin)` -> `{ date, time }` of `Date.now() + offsetMin` minutes in America/Chicago (`Intl.DateTimeFormat` parts, `'h:mm AM'`); `row(sessionId, over)` = `{ athleteId: 'ath-elite', sessionId, date, type: 'training', periodKey, status: 'confirmed', householdId: 'hh', createdBy: uid.parent, chargedFrom: 'elite', createdAt: new Date() }`; `cancel(auth, sessionId, fields, mask, serverTime)` = one commit of `patchWrite('bookings', ...)` plus `await seatWrite(sessionId, -1)`; a family cancel base `{ status: 'cancelled', cancelledBy: <caller uid>, cancelReason: 'member' }` with `cancelledAt` set by `serverTime ['cancelledAt']` unless the case says otherwise. ±90 minutes keeps every answer right under CDT too (the rules assume UTC-6). Expectations:
```
before the start
  parent cancels a booking whose session started 90 min ago (chicagoSlot(-90)) ............ 403
  athlete login (t.eliteLogin) cancels one that started 90 min ago ....................... 403
  parent cancels one that starts in 90 min (chicagoSlot(+90)) ............................. 200
  athlete login cancels one that starts in 90 min ......................................... 200
  a session today with time 'TBA' (the day floor) ......................................... 200
  a session yesterday with time 'TBA' ..................................................... 403
  the old app's write on a future booking (status, cancelledBy, cancelReason; cancelledVia
    masked with no value) ................................................................. 200
reasons (future sessions)
  each of sick, injured, school, family; other with cancelNote 'dentist' .................. 200 x5
  cancelCategory 'bored' .................................................................. 403
  cancelNote with 'sick' .................................................................. 403
  'other' with a 141-char note / a 140-char note .......................................... 403 / 200
  'other' with note '' / with note 123 .................................................... 403 / 403
  cancelledAt sent by the client (2026-11-01T00:00:00Z, no transform) ..................... 403
  cancelledVia 'series' with 'school' ..................................................... 200
  cancelCategory alone on a confirmed booking (no status change, no seat write) ........... 403
  cancelCategory alone on a cancelled booking ............................................. 403
only the server moves
  a family cancel with cancelReason 'moved' ............................................... 403
  a family cancel carrying movedTo 'ath-elite_x' .......................................... 403
  cancelledVia 'move' ..................................................................... 403
  a family create (bookAs shape) with createdVia 'move' / with movedFrom .................. 403 / 403
re-book (a row cancelled with category 'sick', note none, cancelledAt set)
  re-book status, chargedFrom 'elite', graceTokenId null, rebookedAt (transform), and
    cancelCategory, cancelNote, cancelledAt masked with no value .......................... 200
  ... and the GET shows none of the three ................................................. (expect undefined)
  re-book with status alone (an old app) on a row still carrying cancelCategory ............ 200
  re-book that sets cancelCategory 'sick' on a row without one ............................ 403
  re-book that changes cancelNote to 'x' .................................................. 403
staff and reads
  ops session cancel (status, cancelledBy, cancelReason 'session-cancelled') + category ... 403
  coach marks a confirmed row attended with cancelCategory 'sick' ......................... 403
  coach marks a cancelled row noshow ...................................................... 403
  coach lists { sessionId: <s>, status: 'cancelled' } ..................................... 200
  parent of another household (t.other) gets one of those rows ............................ 403
```
- [ ] **Step 2: Register and run against the lane emulator** (current rules). Register the import and the call in `verify-rules.mjs`. Start the emulator in the background from `wt-bookchange`: `npx firebase-tools emulators:start --only firestore --config firebase.bookchange.json --project rypacad`. Then `FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 node scripts/verify-rules.mjs` (the env var points the script at 8085; `scripts/emulator.env` says 8080, so do not pass it, or pass it after the variable: Node's `--env-file` never overrides a variable already set). PowerShell: `$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8085'; node scripts/verify-rules.mjs`. Expected: FAIL on the before-start, reason, cleanup and `cancelledAt` lines; every pre-existing task still PASS.
- [ ] **Step 3: Implement the rules.** After `sessionDayNotOver`:
```
    // 2026-11-11 (owner: cancel up to the start; spec section 4): a family cancel is refused once the session has
    // started. sessions.time is display text ('4:00 PM'); parsed here with the season's CST offset (+360 min). A
    // time that is not 'h:mm AM|PM' passes this check, so sessionDayNotOver (midnight) stays the floor for it.
    function sessionNotStarted(s) {
      let t = s.get('time', '');
      return !(t is string && t.matches('(1[0-2]|[1-9]):[0-5][0-9] (AM|PM)'))
        || request.time < sessionStartsAt(s.date, t);
    }
    function sessionStartsAt(date, t) {
      let p = date.split('-');
      let hm = t.split(' ')[0].split(':');
      return timestamp.date(int(p[0]), int(p[1]), int(p[2]))
        + duration.value((int(hm[0]) % 12 + (t.split(' ')[1] == 'PM' ? 12 : 0)) * 60 + int(hm[1]) + 360, 'm');
    }
```
Inside the bookings block, beside `rebookChargeOk`: `cancelDetailOk(after, diffKeys)` (category in the five; a note only with `'other'`, a string of 1..140; `cancelledAt` in the diff only as `request.time`) and `removesOnly(after, diffKeys, k)` = `!diffKeys.hasAny([k]) || !after.keys().hasAny([k])`. Cancel arm: `hasOnly` gains `'cancelCategory', 'cancelNote', 'cancelledAt'`; add `&& cancelDetailOk(after, diffKeys)` after the `cancelledVia` line, and `&& sessionNotStarted(get(/databases/$(database)/documents/sessions/$(before.sessionId)).data)` between `sessionDayNotOver(before.date)` and `seatFreedInCommit` (the same session document `seatFreedInCommit` reads: no new document access). Re-book arm: `hasOnly` gains the same three keys, plus `&& removesOnly(after, diffKeys, 'cancelCategory') && removesOnly(after, diffKeys, 'cancelNote') && removesOnly(after, diffKeys, 'cancelledAt')`. Rewrite the comment at 1606-1611 (the "12-hour" and "day-of = contact the academy" sentences) to the 2026-11-11 rule, and add a dated paragraph to the arm's comment block naming the three fields and the check.
- [ ] **Step 4: Run** `FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 node scripts/verify-rules.mjs`. Expected: last line `ALL PASS (both passes)`. Additivity: `git diff a1c2b85 -- firestore.rules` shows only the helpers, the two `hasOnly` lines, the added clauses and comments. Stop the emulator (by its task, never a pattern kill).
- [ ] **Step 5: CRLF and commit** - `git add firestore.rules scripts/rules-probes/booking-changes.mjs scripts/verify-rules.mjs`; message `feat(rules): family cancel reasons and the before-start check; a re-book clears them`, trailer.

### Task R2: Docs

LANE R. Depends on: R1.

**Files:**
- Modify: `docs/portal/DATA-MODEL.md` (bookings table rows `status` 398, `cancelReason` 400, `createdVia` 410; new rows `cancelCategory`, `cancelNote`, `cancelledAt`, `movedTo`, `movedFrom`, booking `comp`; the cancellation section around 590-612), `docs/portal/ui-redesign-brief.md` (69-73, 496, 500, 543), `docs/portal/tokens-and-billing-contract.md` (67, 192)

- [ ] **Step 1: Write** the C1 fields and the C2 behaviour into DATA-MODEL (each row dated 2026-11-11, naming the writer, the rules clause and the reader that checks `status`); replace every "until the day before" / "day-of is not self-service" statement with "until the session starts; the token comes back; a portal 1:1 with Yannick until the day before" and the brief's copy table row 543 with the §7 confirmation note; mark the contract's 12-hour lines "superseded 2026-11-11 (plans/2026-11-11-booking-changes)".
- [ ] **Step 2: Check** `grep -n "until the day before\|12-hour\|day-of" docs/portal/DATA-MODEL.md docs/portal/ui-redesign-brief.md docs/portal/tokens-and-billing-contract.md`: only lines that say it is superseded or name the mental exception.
- [ ] **Step 3: CRLF and commit** - message `docs(bookings): cancel until the start, Move, the new booking fields`, trailer.

---

### Task U1: Cancel plumbing - start helpers, reasons in the write, row fields

LANE U. Depends on: Task 0.

**Files:**
- Modify: `frontend/src/portal/data/sessionStart.js`, `data/sessionStart.test.js`
- Modify: `hooks/live.js` (header comment 1054-1062; `cancelBooking` 1064-1123; `rebookPatch` 770-772; its call at 976), `hooks/live.cancel.test.js`, `hooks/live.test.js` (rebookPatch describe, 74-80)
- Modify: `hooks/cancelSeries.js` (`laterWeeks` comment 30-31; `cancelSeries` 89-115), `hooks/cancelSeries.test.js`
- Modify: `hooks/index.js` (imports 141 and 204; `liveSchedule` row 659-660 and return; seed row 913; `reservationRow` 2367-2368; bucket 2418; row input 2426)
- Create: `hooks/index.bookchange.test.js`

**Interfaces:**
- Consumes: C4 `cancelReasonOf`; `academyClock`, `academyDateISO`, `parseTimeToMinutes`; `householdOnHold` (`data/singleToken.js`); `billingStatusOf`.
- Produces: C5 rows for `sessionStart.js`, `live.js`, `cancelSeries.js`, `hooks/index.js`. `cancelBooking` with an unusable `reason` throws `LiveDataError(ERR.INVALID, 'Pick a reason.', null, 'bad-reason')` before any read; after reading the session it calls `assertSessionNotStarted(session)` (reason `'session-past'`, message `SESSION_STARTED_COPY`). With a reason it writes `cancelCategory`, `cancelNote` (the note for `'other'`, else `deleteField()`) and `cancelledAt: serverTimestamp()` beside the existing four fields; without one the write is byte-identical to today's.

- [ ] **Step 1: Write the failing tests.**
  - `sessionStart.test.js`: `rowSession({ date: '2026-11-12', time: '4:00', meridiem: 'PM' })` deep-equals `{ date: '2026-11-12', time: '4:00 PM' }`; a row with no meridiem keeps `time` as is; `cancelDayOpen({ date: '2026-11-12', type: 'training' }, '2026-11-12') === true`, `('2026-11-11' session, '2026-11-12') === false`, mental same day `false`, mental the next day `true`.
  - `live.cancel.test.js`: add `serverTimestamp: () => 'SERVER_TIME'` to the `firebase/firestore` mock; pin the clock for the file (`jest.useFakeTimers('modern'); jest.setSystemTime(new Date('2026-11-09T18:00:00Z'))` in `beforeEach`, `jest.useRealTimers()` in `afterEach`), since its session is Nov 10. New cases: `a reason writes its category, removes a stale note, and stamps the server time` (`reason: { category: 'sick', note: null }` -> booking update `{ status: 'cancelled', cancelledBy: 'p1', cancelReason: 'member', cancelledVia: 'DELETE_FIELD', cancelCategory: 'sick', cancelNote: 'DELETE_FIELD', cancelledAt: 'SERVER_TIME' }`); `Other carries its note` (`cancelNote: 'dentist'`); `a series week carries the same reason` (`cancelledVia: 'series'` plus the three); `an unusable reason is refused before any read` (`{ category: 'bored' }` rejects `{ code: ERR.INVALID, reason: 'bad-reason' }`, no updates); `a session that has started is refused inside the transaction` (clock `2026-11-10T22:30:00Z`, 4:30 PM Chicago: rejects `{ code: ERR.INVALID, reason: 'session-past', message: 'This session has already started.' }`, no updates) (Review Focus 4).
  - `live.test.js`: `rebookPatch('period', null, stamp, 'CLEAR')` deep-equals `{ status: 'confirmed', chargedFrom: 'period', graceTokenId: null, rebookedAt: stamp, cancelCategory: 'CLEAR', cancelNote: 'CLEAR', cancelledAt: 'CLEAR' }`; the three-argument cases stay as they are.
  - `cancelSeries.test.js`: `cancelSeries(rows, cancel, { category: 'school', note: null })` calls `cancel` with `{ cancelledVia: 'series', silent: true, reason: { category: 'school', note: null } }` for every week; without a reason the opts stay `{ cancelledVia: 'series', silent: true }`.
  - `hooks/index.bookchange.test.js` (copy the mock list and `mountHook` helper of `hooks/index.hidden.test.js`; `TODAY = '2026-11-12'`): `useSchedule({ today: TODAY })` live, household `membership { status: 'past_due' }`, bookings: training today confirmed with `comp: true`; mental today; mental tomorrow; a Calendly row; a grace row `graceTokenId 'g1'` -> rows' `[bookingId, cancellable, comp, graceTokenId]` are `[.., true, true, null]`, `[.., false, false, null]`, `[.., true, false, null]`, `[.., false, false, null]`, `[.., true, false, 'g1']`, and `data.onHold === true`; `useHouseholdReservations()` live with an athlete `billing { status: 'pending' }` and one active: `members.map((m) => m.onHold)` is `[true, false]` and a comp row reads `comp: true`.
- [ ] **Step 2: Run** `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/data/sessionStart src/portal/hooks/live src/portal/hooks/cancelSeries src/portal/hooks/index.bookchange`. Expected: the new cases FAIL.
- [ ] **Step 3: Implement.** `sessionStart.js`: `rowSession`, `cancelDayOpen` (pure, JSDoc naming spec §4 and the mental exception). `live.js`: `cancelBooking({ bookingId, cancelledVia = null, silent = false, reason = null })`, validation with `cancelReasonOf`, `assertSessionNotStarted(sessionSnap.data())` after the session read, the reason fields; `rebookPatch(chargedFrom, graceTokenId, stamp, clear)` adds the three keys only when `clear` is given; line 976 passes `deleteField()` as `clear`; rewrite the header comment's "client-side cancel-window gating ... no date check" paragraph to the new rule. `cancelSeries.js`: third parameter, comment 30-31 "(confirmed, before the session starts, not Calendly-managed)". `hooks/index.js`, exactly these line edits (helper anchors, each unique):
  - `import { isSingleTokenId } from '../data/singleToken';` -> `import { householdOnHold, isSingleTokenId } from '../data/singleToken';`
  - `import { sessionStarted } from '../data/sessionStart';` -> `import { cancelDayOpen, sessionStarted } from '../data/sessionStart';`
  - liveSchedule: `cancellable: b.status === 'confirmed' && b.date > today && source !== 'calendly',` -> `cancellable: b.status === 'confirmed' && source !== 'calendly' && cancelDayOpen(s, today),`, and after its `singleToken` line `comp: b.comp === true,` and `graceTokenId: b.graceTokenId ?? null,`
  - liveSchedule return: `onHold: householdOnHold(ctx.household) || billingStatusOf(ctx.athlete) !== 'active',` after the `tokens: withGraceReasons(...)` entry
  - seed: `cancellable: s.date > today,` -> `cancellable: cancelDayOpen(s, today),` plus `comp: false,` and `graceTokenId: null,`
  - reservationRow: `cancellable: b.status === 'confirmed' && s.date > today && source !== 'calendly',` -> the `cancelDayOpen(s, today)` form, plus `comp` and `graceTokenId` after its `singleToken` line
  - bucket (2418): `onHold: householdOnHold(household) || billingStatusOf(a) !== 'active',` inside the object
  - row input (2426): `comp: b.comp,` inside the literal
- [ ] **Step 4: Run** the Step 2 command, then the whole hooks folder: `CI=true npx react-scripts test --watchAll=false src/portal/hooks src/portal/data`. Expected: PASS. `npx eslint src/portal/hooks src/portal/data --max-warnings=0`: clean. `git diff --stat` on `hooks/index.js` is under 20 lines changed.
- [ ] **Step 5: CRLF and commit** - message `feat(bookings): cancel carries a reason and re-checks the start; rows carry comp and onHold`, trailer.

### Task U2: Reason picker and the family cancel sheet

LANE U. Depends on: U1.

**Files:**
- Modify: `components/CancelSheet.js` (props; the header comment's "confirmed && date > today"), `components/CancelSheet.test.js`
- Create: `components/CancelReasonPicker.js`, `components/CancelReasonPicker.test.js`, `components/MemberCancelSheet.js`, `components/MemberCancelSheet.test.js`

**Interfaces:**
- Consumes: C4 (`CANCEL_CATEGORIES`, `CANCEL_NOTE_MAX`, `CANCEL_NOTE_PLACEHOLDER`, `cancelQuestion`, `cancelReasonOf`).
- Produces: C5 rows for these three. `CancelSheet` renders `chooser` after the summary and the series note, before the error; `ready === false` passes `disabled` to both confirm buttons. `CancelReasonPicker`: the question as a 600-weight 13px line; a `role="group"` `aria-label="Reason"` row of chip buttons with `aria-pressed` (the `components/tour/TourFilters.js` `ChipRow` style); with `'other'` a `<textarea aria-label="A few words" placeholder="A few words" maxLength={140} rows={2}>` (the `FeedbackSheet.js` box style); `onChange({ category, note })`. `MemberCancelSheet` holds `{ category: null, note: '' }`, passes the picker as `chooser`, `ready = cancelReasonOf(value) != null`, and calls `onConfirm(cancelReasonOf(value))` / `onConfirmSeries(cancelReasonOf(value))`.

- [ ] **Step 1: Write the failing tests.** `CancelSheet.test.js`: with `chooser={<p>pick</p>}` the text shows "pick"; with `ready={false}` clicking "Cancel reservation" leaves `calls.one === 0`, and with later weeks neither "Cancel just this one" nor the series button calls anything. `CancelReasonPicker.test.js`: `name 'Jordan Whitfield'` shows "Why can't Jordan make it?"; five buttons labelled Sick, Injured, School, Family conflict, Other, all `aria-pressed="false"` for an empty value; clicking Sick calls `onChange({ category: 'sick', note: '' })`; with `value { category: 'other', note: '' }` the textarea has `maxLength` 140 and placeholder "A few words", and `r.fill('A few words', 'dentist')` calls `onChange({ category: 'other', note: 'dentist' })`; the text never matches `/token/i`. `MemberCancelSheet.test.js`: the confirm is inert until a reason; Sick then "Cancel reservation" calls `onConfirm({ category: 'sick', note: null })` once; Other with no note stays inert, Other + "dentist" confirms `{ category: 'other', note: 'dentist' }`; with `laterWeeks` of two, "Cancel this and 2 later weeks" calls `onConfirmSeries` with the reason; no name -> "Why can't you make it?".
- [ ] **Step 2: Run** `CI=true npx react-scripts test --watchAll=false src/portal/components/CancelSheet src/portal/components/CancelReasonPicker src/portal/components/MemberCancelSheet`. Expected: FAIL (missing modules; `ready` ignored).
- [ ] **Step 3: Implement** the three per Interfaces.
- [ ] **Step 4: Run** the same, plus `src/portal/screens/AdminScholarships src/portal/screens/Roster` (the other `CancelSheet` users). Expected: PASS. eslint on the five files: clean.
- [ ] **Step 5: CRLF and commit** - message `feat(bookings): the reason picker in the family cancel sheet`, trailer.

### Task U3: Row actions on Reservations and My Schedule, and the copy

LANE U. Depends on: U2.

**Files:**
- Create: `components/BookingRowActions.js`, `components/BookingRowActions.test.js`
- Modify: `screens/Reservations.js` (imports; header comment 30-33; `MemberList` action chain 220-245, its `dayOf` line 185; the sheet 133-142), `screens/Reservations.test.js`
- Modify: `screens/MySchedule.js` (header 36-40; `ScheduleBody` chain 313-339 and `dayOf` 282; the sheet 195-204), `screens/MySchedule.test.js`
- Modify (copy): `components/WaitlistAction.js` (28-30, comment 33-35), `components/WaitlistAction.test.js` (24-33, 96); `components/BookingReasons.js` (`cancelReasonCopy`); `data/seed.js` (203, 205); `screens/AthleteDashboard.js` (501), `screens/AthleteDashboard.test.js` (153); `hooks/index.test.js` (272-273); `screens/SpecialistBooking.test.js` (540, 695); `screens/BookSession.test.js` (240, 248, 764, 1008)

**Interfaces:**
- Consumes: C5 `rowSession`, `sessionStarted`, `academyDateISO`; `MemberCancelSheet` (U2); `CALENDLY_MANAGED_COPY`; `SESSION_STARTED_COPY`.
- Produces: C5 `rowActionsFor` / `BookingRowActions`. `rowActionsFor(row, { now = new Date(), onHold = false })`, first match wins: not `status 'confirmed'` or no `bookingId` -> `none`; `source 'calendly'` -> `calendly`; `sessionStarted(rowSession(row), now)` -> `started`; `type 'mental'` and `row.date <= academyDateISO(now)` -> `mental-day-of`; `!row.cancellable` -> `none`; else `change` with `move: row.type !== 'mental' && (row.comp === true || !onHold)`. The component: `calendly` / `started` / `mental-day-of` render a `<Body size={11} tone={color.textTertiary}>` line (`CALENDLY_MANAGED_COPY` / `SESSION_STARTED_COPY` / `MENTAL_DAY_OF_COPY = 'A 1:1 can be cancelled in the app up to the day before.'`); `change` renders a row of `Button variant="dangerOutline" height={44}` "Cancel reservation" and, when `move` and `onMove`, `Button variant="outline" height={44}` "Move", each `flex: 1`, `boxShadow: 'none'`.

- [ ] **Step 1: Write the failing tests.** `BookingRowActions.test.js`, `NOW = new Date('2026-11-12T20:00:00Z')` (2 PM Chicago, Thu Nov 12), base row `{ bookingId: 'b1', status: 'confirmed', cancellable: true, source: 'portal', type: 'training', date: '2026-11-12', time: '4:00', meridiem: 'PM' }`:
```js
const k = (over, opts = {}) => rowActionsFor({ ...base, ...over }, { now: NOW, ...opts });
expect(k({})).toEqual({ kind: 'change', move: true });
expect(k({ time: '1:00' })).toEqual({ kind: 'started' });
expect(k({ time: 'TBA', meridiem: undefined })).toEqual({ kind: 'change', move: true }); // Review Focus 1
expect(k({ type: 'mental', date: '2026-11-13' })).toEqual({ kind: 'change', move: false });
expect(k({ type: 'mental' })).toEqual({ kind: 'mental-day-of' });
expect(k({ source: 'calendly', cancellable: false })).toEqual({ kind: 'calendly' });
expect(k({}, { onHold: true })).toEqual({ kind: 'change', move: false });
expect(k({ comp: true }, { onHold: true })).toEqual({ kind: 'change', move: true });
expect(k({ status: 'cancelled' })).toEqual({ kind: 'none' });
expect(k({ bookingId: null })).toEqual({ kind: 'none' });
expect(k({ date: '2026-11-20', cancellable: false })).toEqual({ kind: 'none' });
```
  plus a render case: `change` shows "Cancel reservation" and, with `onMove`, "Move"; without `onMove`, no Move; `started` shows "This session has already started.". Screens: in `Reservations.test.js` and `MySchedule.test.js` pin the clock for every test that expects a Cancel button (a file-level `beforeEach` with `jest.useFakeTimers('modern'); jest.setSystemTime(new Date('2026-11-09T18:00:00Z'))`, `afterEach` `jest.useRealTimers()`; the describes that set their own time keep doing so), since the rows are dated Nov 10-24; a helper `sheetButton(r, label)` clicks a button inside `[data-portal-overlay]` (the row and the sheet both say "Cancel reservation"). Cases: `a same-day row before its start offers Cancel; one that has started says so` (training rows, Nov 9 at 4:00 PM and Nov 9 at 9:00 AM; the row factories default to `type 'mental'`: one "Cancel reservation", "This session has already started.", no "Same-day"); `the cancel asks why and sends the reason` (open, `r.click('Sick')`, `sheetButton(r, 'Cancel reservation')` -> `mockCancels` `[['b1', { reason: { category: 'sick', note: null } }]]`); the series cases pick Sick first and expect `[id, { cancelledVia: 'series', silent: true, reason: { category: 'sick', note: null } }]` per week and `[['a1_1', { reason: ... }]]` for "Cancel just this one"; MySchedule asks "Why can't you make it?", Reservations "Why can't Jordan make it?". Copy pins: every "You can cancel until the day before." becomes "You can cancel or move it any time before it starts."; the confirmation notes become `'Plans change? Cancel or move it in the app any time before it starts. The token comes back.'` and `'Plans change? Cancel or move it in the app any time before it starts.'`; AthleteDashboard reads `'Nothing is on your schedule right now - book any open block. Cancel any time before a session starts and the token comes back.'`; add `cancelReasonCopy('moved') === 'Moved to another session.'` to `components/BookingReasons.test.js`.
- [ ] **Step 2: Run** `CI=true npx react-scripts test --watchAll=false src/portal/components/BookingRowActions src/portal/screens/Reservations src/portal/screens/MySchedule src/portal/components/WaitlistAction src/portal/components/BookingReasons src/portal/screens/AthleteDashboard src/portal/hooks/index.test src/portal/screens/SpecialistBooking src/portal/screens/BookSession`. Expected: FAIL on the new cases and copy.
- [ ] **Step 3: Implement.** `BookingRowActions.js` per Interfaces. Both screens: the action becomes `past || rowCancelled ? null : waitlisted ? <OnWaitlist .../> : <BookingRowActions row={item} onHold={...} onCancel={() => onCancelRequest(item)} />` (Reservations: `member.onHold` through `MemberList`; MySchedule: `data?.onHold` through `ScheduleBody`); delete `dayOf` and the day-of `Body`; `CancelSheet` becomes `MemberCancelSheet` with `name` (Reservations `cancelTarget.athleteName`, MySchedule none), `onConfirm={(reason) => cancel(cancelTarget.bookingId, { reason })}`, `onConfirmSeries={(reason) => cancelSeries([cancelTarget, ...cancelTarget.later], cancel, reason)}`; fix both header comments. The copy edits exactly as Step 1 pins them (`WaitlistAction.js` keeps `${who}` and the Elite variant without the token clause; its R3 comment loses "they could not cancel"); `cancelReasonCopy` gets `if (reason === 'moved') return 'Moved to another session.';`.
- [ ] **Step 4: Run** the Step 2 command. Expected: PASS. `grep -rn "until the day before\|Same-day cancellations\|Cancelling with notice" src/portal`: no output. eslint on the changed files: clean.
- [ ] **Step 5: CRLF and commit** - message `feat(bookings): Cancel until the start on Reservations and My Schedule; new policy copy`, trailer.

### Task U4: One bookability rule for the Book tab and the move picker

LANE U. Depends on: U3.

**Files:**
- Create: `data/bookability.js`, `data/bookability.test.js`
- Modify: `screens/BookSession.js` (delete `formatCapacity` 55-58; `DaySessionList` 620-675 and the `held` footnote 722; `scheduleName` at 581), `screens/BookSession.test.js` (796, 803-811)

**Interfaces:**
- Consumes: `positionForDate`, `periodFor`, `eliteDailyCapHit` (`data/packages.js`); `capacityFor` (`data/season.js`); `sessionStarted`; `reservedEligible`; `isHiddenSession`.
- Produces (C5):
  - `formatCapacity(session)` - moved verbatim from `BookSession.js`.
  - `cardFacts(session, { tokens = null, athlete = null, handicapUnread = false, checkStarted = false, bookedSessionIds = [], justFilledId = null, now = new Date() }) -> { cap, isFull, rowTokens, hasGrace, tokensSpent, displayOnly, started, held, notTheirs }` - exactly the computations now inline at `BookSession.js` 640-665 (`started` passes `now` to `sessionStarted`).
  - `positionWithFreed(tokens, from, dateISO, anchorDay) -> tokens` - `positionForDate(tokens, dateISO)`, then: null, unlimited or no `from`: as is; `from.graceTokenId` and (`from.graceExpiresAt` absent or `>= dateISO`): `grace` plus `{ id: from.graceTokenId, expiresAt: from.graceExpiresAt ?? null }`; `from.graceTokenId` otherwise: as is; `from.periodKey === periodFor(dateISO, anchorDay).periodKey`: `left + 1`; else as is.
  - `moveTargetOpen(session, { from, tokens, athlete, bookedSessionIds, pkg, bookings, anchorDay, now }) -> boolean` - false when `session.id === from.id`, a different type, `status 'cancelled'`, hidden or `source 'calendly'`; else `cardFacts` with `checkStarted: true` and `tokens: from.comp ? null : positionWithFreed(tokens, from, session.date, anchorDay)` must show none of `displayOnly, started, isFull, held, notTheirs, tokensSpent`; and `!eliteDailyCapHit(pkg, session.type, session.date, bookings without from.bookingId)`.

- [ ] **Step 1: Write the failing tests** `data/bookability.test.js`: `cardFacts` - full by capacity and by `justFilledId`; a grace token valid on the date keeps `tokensSpent` false and one expiring the day before does not; `started` only with `checkStarted`; a held block that has started reads `started` not `held`; `handicapUnread` never sets `notTheirs`; display-only sets none of started/held/notTheirs. `positionWithFreed` (tokens `{ left: 0, grace: [], unlimited: false }`, anchor 1): same period `left 1`; other period unchanged; freed grace `expiresAt '2026-11-20'` on `'2026-11-19'` adds it and on `'2026-11-21'` does not (Review Focus 5); unlimited unchanged; null null; anchor 15: from `periodKey '2026-10-15'`, date `'2026-11-16'` unchanged (Review Focus 2). `moveTargetOpen`: a table of one open session and one case per exclusion (own session, other type, cancelled, hidden, Calendly, display-only, started, full, held, reserved over the handicap, tokens spent, Elite one-per-day); comp ignores spent tokens.
- [ ] **Step 2: Run** `CI=true npx react-scripts test --watchAll=false src/portal/data/bookability`. Expected: FAIL, missing module.
- [ ] **Step 3: Implement** `bookability.js`, then refactor `DaySessionList` to `const { cap, isFull, rowTokens, hasGrace, tokensSpent, displayOnly, started, held, notTheirs } = cardFacts(session, { tokens, athlete, handicapUnread, checkStarted, bookedSessionIds, justFilledId });` keeping `waiting`, `refusal`, `canWaitlist`, `tappable` and the JSX as they are; copy: `heldNote` -> `` `${heldName} is booked in. Cancel or move it from ${scheduleName} if plans change.` ``, delete `heldSameDayNote` and its comment and use `heldNote` in the footnote; line 581 `scheduleName={isParent ? 'Reservations' : 'My Schedule'}`; drop imports eslint reports unused. `BookSession.test.js`: 796 expects "Jordan is booked in. Cancel or move it from My Schedule if plans change."; the 803 test is renamed "today's held block that has already started reads Started, not Booked; one still to come can be cancelled or moved" and expects that same line and no "Same-day".
- [ ] **Step 4: Run** `CI=true npx react-scripts test --watchAll=false src/portal/data/bookability src/portal/screens/BookSession src/portal/screens/SpecialistBooking`. Expected: PASS with no other change to `BookSession.test.js` (the refactor's safety net). `wc -l src/portal/screens/BookSession.js` below 1114.
- [ ] **Step 5: CRLF and commit** - message `refactor(bookings): the per-card bookability rule moves to data/bookability.js`, trailer.

### Task U5: Move - hook, sheet, buttons

LANE U. Depends on: U4.

**Files:**
- Modify: `hooks/callables.js` (`callMoveBooking`, with a JSDoc line naming C2)
- Create: `hooks/move.js`, `hooks/move.test.js`, `components/MoveSheet.js`, `components/MoveSheet.test.js`
- Modify: `screens/Reservations.js`, `screens/MySchedule.js` (move state, `onMove`, the sheet), `screens/Reservations.test.js`, `screens/MySchedule.test.js` (add `jest.mock('../hooks/move', ...)`)

**Interfaces:**
- Consumes: C2; `moveTargetOpen` (U4); `liveTokens` (exported by `hooks/index.js`); from `./live`: `isLive`, `fetchCurrentUser`, `fetchAthlete`, `fetchBookings`, `fetchPackage`, `fetchHousehold`, `fetchGraceTokensByAthlete`, `fetchSessionsInRange`; `openThrough`, `academyDateISO`, `parseTimeToMinutes`; `windowMonthsFor`, `normalizeAnchorDay`; `handicapOf`; `dayLabel` (`data/season.js`); `bump`; `useSeedResource`; `reasonCopy`; C4 `dayTimeLabel`, `firstName` (`data/whatsNext.js`).
- Produces (C5):
  - `loadMoveOptions(row, now = new Date())` - the caller (`fetchCurrentUser`): a parent reads `row.athleteId` with `fetchBookings(id, { householdId })`, an athlete login its own `athleteId`; athlete, package, household, grace tokens; `today = academyDateISO(now)`; `tokens = row.comp ? null : await liveTokens(athlete, pkg, bookings, anchorDay, today)`; `from = { ...row, graceExpiresAt }` (the expiry of `row.graceTokenId` from the grace read); `bookedSessionIds` = the `sessionId`s of the athlete's non-cancelled bookings; sessions `fetchSessionsInRange(today, openThrough(now, windowMonthsFor(pkg)))` kept by `moveTargetOpen(s, { from, tokens, athlete: { name, handicap: handicapOf(athlete) }, bookedSessionIds, pkg, bookings, anchorDay, now })`; sorted by date then `parseTimeToMinutes`; grouped `{ days: [{ iso, label: dayLabel(iso, today), sessions: [MoveOption] }] }` (`name` = `s.label` or the type noun, `capacityLabel` = `capacityFor(s).label`).
  - `useMoveOptions(row)` - `useSeedResource(live ? null : { days: [] }, live ? { source: () => loadMoveOptions(row), deps: ['move-options', row.bookingId] } : undefined)`.
  - `moveBooking({ bookingId, toSessionId })` - seed: `{ bookingId, toSessionId, simulated: true }`; live: `callMoveBooking(...)`, then `bump('bookings')`, `bump('sessions')`, return the result.
  - `MoveSheet({ row, name, onClose, onMoved })`: title `moveTitle(row.type)` = "Move to another Training block" / "Tour event" / "Phil session"; loading "Finding open sessions..."; load error "Open sessions didn't load. Check your connection and try again."; empty `MOVE_EMPTY_COPY = 'No open sessions like this in your booking window.'`; options as `SessionCard`s under day labels; a tap shows `moveQuestion({ name: firstName(name), from: row, to: option })` = "Move Jordan from Tue Nov 10, 4:00 PM to Thu Nov 12, 4:00 PM?" (no name: "Move from ... to ...?") with `Button` "Move" (loading "Moving") and `Button variant="outline"` "Keep it" (calls `onClose`); while the call runs Move is `loading` and a second tap does nothing; success calls `onMoved(result)`; a refusal shows `` `${moveRefusalCopy(err)} Nothing was changed.` `` and keeps the question. `moveRefusalCopy(err)` = own map for `not-confirmed`, `mental-no-move`, `already-started` (`SESSION_STARTED_COPY`), `same-session`, `session-missing`, `different-type`, `session-cancelled`, `display-only`, `session-past` ("That session has already started."), `booking-missing`, `not-yours` (C2 messages), else `reasonCopy(err.reason)`, else `err.message`, else "The move didn't go through.".
  - Screens: `onMove={() => setMoveTarget({ ...item, athleteName: member.name })}` on `BookingRowActions`; `{moveTarget ? <MoveSheet row={moveTarget} name={moveTarget.athleteName} onClose={() => setMoveTarget(null)} onMoved={() => setMoveTarget(null)} /> : null}` (MySchedule without a name).

- [ ] **Step 1: Write the failing tests.** `hooks/move.test.js` (mock `./live`, `./index` with `liveTokens: jest.fn()`, `./callables`, `./invalidate`; plain functions, as `live.cancel.test.js`): a parent's load calls `fetchBookings('jordan', { householdId: 'h1' })` and `fetchSessionsInRange(today, openThrough(now, 1))`; of sessions [open training, other type, cancelled, hidden, full, started-today, the athlete's own other booking, reserved over the handicap, the moved booking's own session] only the open one is returned, grouped under its day; a December session is offered when `liveTokens` gives the next period a token and not when it reads `left 0`; a comp row never calls `liveTokens` and offers the December session anyway; an athlete login reads its own `athleteId`; `moveBooking` calls `callMoveBooking({ bookingId: 'b1', toSessionId: 's2' })` once and bumps `bookings` and `sessions`; with `isLive()` false it resolves `{ simulated: true, ... }` and calls nothing. `MoveSheet.test.js` (mock `../hooks/move`): the three titles; the empty line; options under their day; a tap shows the question; Move calls `moveBooking` once on a double click and then `onMoved` (Review Focus 3); a refusal `{ reason: 'full' }` shows "This session just filled. Nothing was changed." and does not call `onMoved`; Keep it calls `onClose`; nothing matches `/token/i`; `moveRefusalCopy({ reason: 'mental-no-move' }) === "A 1:1 can't be moved in the app."`. Screens: a confirmed future training row shows "Move"; a Calendly, mental, started, or on-hold non-comp row shows none; tapping Move opens the sheet with the title; choosing and moving calls the mocked `moveBooking` with `{ bookingId, toSessionId }` and closes the sheet.
- [ ] **Step 2: Run** `CI=true npx react-scripts test --watchAll=false src/portal/hooks/move src/portal/components/MoveSheet src/portal/screens/Reservations src/portal/screens/MySchedule`. Expected: FAIL, missing modules.
- [ ] **Step 3: Implement** per Interfaces.
- [ ] **Step 4: Run** the whole frontend suite: `CI=true npx react-scripts test --watchAll=false`. Expected: all suites pass. `npx eslint src/portal --max-warnings=0`: clean. `CI=true npm run build`: "Compiled successfully".
- [ ] **Step 5: CRLF and commit** - message `feat(bookings): Move a booking from Reservations and My Schedule`, trailer.

---

### Task S1: Cancelled and moved rows under the roster

LANE S. Depends on: Task 0.

**Files:**
- Create: `frontend/src/portal/hooks/cancelledBookings.js`, `hooks/cancelledBookings.test.js`, `components/CancelledRows.js`, `components/CancelledRows.test.js`, `screens/Roster.bookchange.test.js`
- Modify: `screens/Roster.js` (one import; the mount after the roster list's closing `</div>` at line 700, before `{cancelSheetOpen ? (`), and add `jest.mock('../hooks/cancelledBookings', ...)` to `screens/Roster.readonly.test.js`, `Roster.clubhead.test.js`, `Roster.reserved.test.js`

**Interfaces:**
- Consumes: C4 `coachLine`, `movedToSessionId`, `CANCEL_CATEGORIES`; from `./live`: `isLive`, `fetchAthlete`, `fetchSessionsByIds`, `wrap`, `ERR`, `LiveDataError`; `useInvalidation`, `useSeedResource`; `AthleteRow`.
- Produces (C5): `fetchCancelledBySession(sessionId)` - `getDocs(query(collection(db, 'bookings'), where('sessionId', '==', sessionId), where('status', '==', 'cancelled')))` (the existing `(sessionId, status)` index; coaches read any booking); `liveCancelledRows(sessionId)` - rows with `coachLine(...) != null` only, names by `fetchAthlete` (`Promise.allSettled`; a failed name is `null`), moved targets by one `fetchSessionsByIds`, sorted by name: `[{ bookingId, athleteId, name, line }]`; `useCancelledBookings(sessionId)` - live and a session id: that source with deps `['cancelled-rows', sessionId, bookingsGen]`, else `[]`; `CancelledRows({ sessionId })` - nothing when the list is empty or loading or failed; else a `div` `aria-label="Cancelled or moved"` of `AthleteRow name={row.name ?? 'Name unavailable'} meta={row.line} avatarSize={42} nameSize={16} style={{ opacity: 0.5 }}`, no `trailing`. Roster mount: `{live && !sessionCancelled ? <CancelledRows sessionId={sessionId} /> : null}`.

- [ ] **Step 1: Write the failing tests.** `cancelledBookings.test.js` (mock `firebase/firestore` with plain functions and `./live`): the query filters `sessionId` and `status 'cancelled'`; of rows [member+sick, member+other+'dentist', member with no category, series+school, session-cancelled, double-spend, `ava` moved to `ava_s9`] the result is the four with lines `Cancelled · Sick`, `Cancelled · Other: dentist`, `Cancelled · School`, `Moved to <s9 day, time>` and nothing for the rest; a moved row whose target session is gone reads `Moved`; a failed name keeps the row with `name: null`. `CancelledRows.test.js` (mock the hook): two rows render their names and lines, no IN or OUT button; an empty list renders nothing. `Roster.bookchange.test.js` (copy the mock block of `Roster.readonly.test.js`): live with a cancelled row in the mocked hook shows "Cancelled · Sick" below the roster and the counters count only the live rows; `sessionStatus 'cancelled'` hides it.
- [ ] **Step 2: Run** `CI=true npx react-scripts test --watchAll=false src/portal/hooks/cancelledBookings src/portal/components/CancelledRows src/portal/screens/Roster`. Expected: FAIL, missing modules.
- [ ] **Step 3: Implement** per Interfaces; add the three existing Roster tests' mock `jest.mock('../hooks/cancelledBookings', () => ({ useCancelledBookings: () => ({ data: [], loading: false, error: null }), markOrRecheck: async (mark, id, status) => { await mark(id, status); return false; } }))`.
- [ ] **Step 4: Run** the Step 2 command. Expected: PASS. eslint on the changed files: clean. `git diff --stat src/portal/screens/Roster.js`: 2 lines added.
- [ ] **Step 5: CRLF and commit** - message `feat(roster): family cancels with their reason, and moves, greyed under the attendance list`, trailer.

### Task S2: A tap on a row that was just cancelled

LANE S. Depends on: S1.

**Files:**
- Modify: `hooks/cancelledBookings.js` (+ `bookingIsCancelled`, `markOrRecheck`), `hooks/cancelledBookings.test.js`, `screens/Roster.js` (the `mark` lines 315-321, one state line, one status line above the roster), `screens/Roster.bookchange.test.js`

**Interfaces:**
- Consumes: C4 `staleMarkLine`; `bump`; `getDoc`, `doc`.
- Produces: `bookingIsCancelled(bookingId) -> Promise<boolean>` (a failed read is `false`); `markOrRecheck(mark, bookingId, status) -> Promise<boolean>` - `await mark(bookingId, status)`; resolves `false` on success; on a rejection: `bump('bookings')`, and `err.code === ERR.PERMISSION` resolves `await bookingIsCancelled(bookingId)`, any other `false`; never rejects. Roster: `const [staleLine, setStaleLine] = useState(null);`; live `mark` clears it, calls `markOrRecheck(liveAttendance.mark, bookingId, ...)` and on `true` sets `staleMarkLine(rows.find((r) => r.athleteId === athleteId)?.name ?? null)`; rendered above the roster rows as `<div role="status" style={{ marginBottom: 12 }}><Body size={12}>{staleLine}</Body></div>`.

- [ ] **Step 1: Write the failing tests.** `cancelledBookings.test.js`: `markOrRecheck` resolves false and does not bump when `mark` resolves; on `{ code: 'permission-denied' }` with the booking now `cancelled` resolves true and bumps `bookings`; with it `confirmed` resolves false; on `{ code: 'unavailable' }` resolves false without reading. `Roster.bookchange.test.js`: a mocked `mark` that rejects permission-denied for Jordan, with the recheck true, shows "Jordan Whitfield cancelled - list updated." after tapping IN (`role="status"`); a successful mark shows nothing.
- [ ] **Step 2: Run** the S1 command. Expected: FAIL on the new cases.
- [ ] **Step 3: Implement** per Interfaces.
- [ ] **Step 4: Run** `CI=true npx react-scripts test --watchAll=false src/portal/hooks/cancelledBookings src/portal/screens/Roster src/portal/components/CancelledRows`. Expected: PASS. eslint clean; `git diff --stat src/portal/screens/Roster.js` under 12 lines in all.
- [ ] **Step 5: CRLF and commit** - message `feat(roster): a stale IN/OUT on a just-cancelled athlete says so and refreshes`, trailer.

---

### Task W1: Website FAQ

LANE W. Depends on: none.

**Files:**
- Modify: `C:\Users\Mac\Desktop\rypacadapp\ryp-academy-site\public\faq.html` (line 113, the `<p data-ed="faq-40">` text)

- [ ] **Step 1: Branch** - `git -C C:/Users/Mac/Desktop/rypacadapp/ryp-academy-site switch -c faq/cancel-move` (from `main`, clean tree; stop if it is not clean).
- [ ] **Step 2: Edit** with the helper (the file is LF and stays LF): the paragraph text between `<p data-ed="faq-40">` and `</p>` becomes exactly `Cancel in the portal any time before the session starts and the token comes back, ready for any other open block. You can also move a booking to another open session. A session missed without cancelling uses its token.`
- [ ] **Step 3: Check** - `grep -c "any time before the session starts" public/faq.html` prints `1`; `grep -c "by the day before" public/faq.html` prints `0`; `git diff --stat` shows one line changed; `file public/faq.html` does not say CRLF.
- [ ] **Step 4: Commit (no push)** - `git add public/faq.html`; `git commit -m "FAQ: cancel any time before the session starts, and Move" -m "The new answer drops 'Tokens refresh on the 1st of each month and unused tokens don't carry over.' (periods run from each family's anchor day); restore the carry-over half if the owner wants it." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`. It ships with or after the app (Release).

---

### Task I1: Merge and gates

LANE lead. Depends on: F4, R2, U5, S2, W1.

- [ ] **Step 1: Merge** in `wt-bookchange`: `git merge --no-ff bookchange/fn -m "Merge bookchange/fn: moveBooking and notice copy"`, then `bookchange/staff`, then `bookchange/ui` (each with its own `-m` and the trailer as a second `-m`). Expected: no conflicts (no shared file). Then tear down the three worktrees (Task 0 Step 6 teardown).
- [ ] **Step 2: Frontend** - `cd frontend && CI=true npx react-scripts test --watchAll=false` (all suites pass), `npx eslint src/portal --max-warnings=0` (no output), `CI=true npm run build` ("Compiled successfully").
- [ ] **Step 3: Functions** - `cd functions && for f in portal/*.test.js; do node "$f" || exit 1; done` (every file `N passing`), `node test/check-exports.js` (`ok  21 functions exported, ...`), `npx eslint .` (clean).
- [ ] **Step 4: Rules** - emulator up as R1 Step 2, then `FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 node scripts/verify-rules.mjs`: `ALL PASS (both passes)`.
- [ ] **Step 5: House checks** - `wc -l` on every new file: each under 500; `git diff --stat a1c2b85 -- frontend/src/portal/hooks/index.js frontend/src/portal/hooks/live.js frontend/src/portal/screens/Roster.js frontend/src/portal/data/seed.js frontend/src/portal/screens/AthleteDashboard.js`: small, matching the tasks; `grep -rn "until the day before\|Same-day cancellations\|Cancelling with notice\|Cancel until the day before" frontend/src functions/portal functions/test`: no output; `git diff a1c2b85 | grep -nE "[0-9]{3}[-. ][0-9]{3}[-. ][0-9]{4}"`: no output; `file` on each changed file: CRLF (the site file excepted).

### Task I2: Browser QA on the lane emulator

LANE lead. Depends on: I1.

- [ ] **Step 1: Emulators** - PREFLIGHT (Task 0 Step 7), then in the background from `wt-bookchange`: `npx firebase-tools emulators:start --only firestore,auth,functions --config firebase.bookchange.json --project rypacad 2>&1 | tee <scratchpad>/bookchange-emulators.log`. When up: `grep -c "Trying to access secret" <scratchpad>/bookchange-emulators.log` prints `0` (else stop everything: the emulator is reading production secrets).
- [ ] **Step 2: Notification replay** - `cd functions && FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 VERIFY_FUNCTIONS_ORIGIN=http://127.0.0.1:5006 node test/verify-notifications.js` (it wipes this instance; run it before the fixture). Expected: its final all-pass line.
- [ ] **Step 3: Fixture** - write `<scratchpad>/bookchange-qa-fixture.mjs` (imports `resolveTarget`, `commit`, `docName`, `fsFields` from `file:///C:/Users/Mac/Desktop/rypacadapp/wt-bookchange/scripts/lib/firestore-rest.mjs`; refuses to run when Chicago time is before 07:00 or after 20:00 or when `D + 4` is in the next month) and run it with `FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 node <scratchpad>/bookchange-qa-fixture.mjs`. `D` = today in Chicago, `T(m)` = the Chicago clock `m` minutes from now as `'h:mm AM'`, `M1` = the 2nd of next month:
  - `packages/t-6 { name: '6 tokens', kind: 'tokens', tokens: 6 }`, `packages/elite { name: 'Elite', kind: 'elite', tokens: null }`
  - `households/qa-hh { name: 'QA family', periodAnchorDay: 1 }`, `households/qa-hold { name: 'QA hold family', periodAnchorDay: 1, membership: { status: 'past_due' } }`
  - `athletes/qa-tok { name: 'Avery QA', householdId: 'qa-hh', packageId: 't-6', billing: { status: 'active' }, handicap: 12 }`, `qa-elite { name: 'Blake QA', ..., packageId: 'elite', handicap: 3 }`, `qa-comp { name: 'Casey QA', ..., packageId: 't-6', billing: { status: 'pending' } }`, `qa-hold { name: 'Drew QA', householdId: 'qa-hold', packageId: 't-6', billing: { status: 'active' } }`
  - `users/qa-parent { role: 'parent', householdId: 'qa-hh', athleteId: null, displayName: 'QA Parent', email: 'qa-parent@example.test' }`, `qa-athlete { role: 'athlete', athleteId: 'qa-tok', householdId: 'qa-hh' }`, `qa-hold-parent { role: 'parent', householdId: 'qa-hold' }`, `qa-coach { role: 'coach', staff: true, displayName: 'QA Coach' }`
  - sessions (training, capacity 12, `status 'scheduled'` unless said): `qa-started` D `T(-60)` booked 1; `qa-soon` D `T(+4)` booked 1; `qa-later` D `T(+180)` booked 1; `qa-a` D+2 4:00 PM booked 3; `qa-b` D+3 4:00 PM booked 2; `qa-full` D+2 5:00 PM capacity 1 booked 1; `qa-res` D+4 3:00 PM `maxHandicap 5`; `qa-cxl` D+4 4:00 PM `status 'cancelled'`; `qa-hid` D+4 6:00 PM `hidden true`; `qa-tour` the first Saturday after D+1, 10:00 AM, `type 'tournament'`; `qa-dec` M1 4:00 PM; `qa-dec2` M1+1 4:00 PM
  - bookings (`periodKey` from the session date, anchor 1; `createdAt` now): `qa-tok_qa-started`, `qa-tok_qa-soon`, `qa-tok_qa-later`, `qa-tok_qa-a` (confirmed, `chargedFrom 'period'`, `householdId 'qa-hh'`, `createdBy 'qa-parent'`); `qa-tok_qa-b` (`status 'cancelled'`, `cancelReason 'member'`, `cancelCategory 'school'`, `cancelledBy 'qa-parent'`); `qa-elite_qa-a` and `qa-elite_qa-b` (`chargedFrom 'elite'`); `qa-comp_qa-a` (`comp: true`, `chargedFrom 'period'`, `createdBy 'staff'`); `qa-hold_qa-b` (`householdId 'qa-hold'`). So `qa-b` is booked 2 (Blake, Drew; Avery's row there is cancelled).
- [ ] **Step 4: App** - add to `C:\Users\Mac\Desktop\rypacadapp\.claude\launch.json` a configuration `bookchange-qa`: `runtimeExecutable "cmd"`, `runtimeArgs ["/c", "cd /d C:/Users/Mac/Desktop/rypacadapp/wt-bookchange/frontend && npx react-scripts start"]`, `env { PORT: "3009", BROWSER: "none", REACT_APP_USE_EMULATORS: "true", REACT_APP_PORTAL_LIVE_DATA: "true", REACT_APP_AUTH_EMULATOR_PORT: "9104", REACT_APP_FIRESTORE_EMULATOR_PORT: "8085", REACT_APP_FUNCTIONS_EMULATOR_PORT: "5006" }`, `port 3009`; `preview_start` it. Sign in with `await window.__rypTestAuth.signInAs('<uid>')` (javascript tool) and navigate by URL. If "One quick question about research" appears, press "Skip for now".
- [ ] **Step 5: Checklist** (one line each in the session report, with what was seen; Firestore state read with `GET http://127.0.0.1:8085/v1/projects/rypacad/databases/(default)/documents/<path>` and `Authorization: Bearer owner`):
  A REST commit "as `qa-parent`" below means one `documents:commit` on the emulator with an unsigned token built like `token()` in `scripts/verify-rules.mjs` (project `rypacad`, `sub`/`user_id` `qa-parent`), carrying the `live.js` cancel shape (the booking update plus the session's `booked - 1`).
  1. Within 4 minutes of the fixture, `qa-parent` at `/portal/reservations`: Avery's `qa-started` row reads "This session has already started." with no buttons; `qa-soon`, `qa-later`, `qa-a` show "Cancel reservation" and "Move"; Casey's comp row shows both; no "Same-day" line anywhere. Do not reload.
  2. After the start (Review Focus 4): once `qa-soon`'s start has passed, on the same unreloaded list tap its Cancel -> Sick -> confirm: the sheet says "This session has already started."; the booking is still confirmed. A REST commit as `qa-parent` cancelling `qa-tok_qa-started` answers 403.
  3. Same-day cancel: Avery's `qa-later` -> Cancel: "Why can't Avery make it?", the confirm inert until Sick; confirm. The row reads Cancelled; `bookings/qa-tok_qa-later` has `cancelReason 'member'`, `cancelCategory 'sick'`, `cancelledAt`; `notifications/booking-cancelled_qa-tok_qa-later` exists.
  4. Other with a note: Blake's `qa-a` -> Other, "dentist" -> confirm; `cancelNote 'dentist'`.
  5. Move across periods: Avery's `qa-a` -> Move: the list holds `qa-dec`, `qa-dec2`, `qa-b`, `qa-later`, and none of `qa-full`, `qa-res`, `qa-cxl`, `qa-hid`, `qa-tour`, `qa-started`, `qa-soon`; pick `qa-dec` -> "Move Avery from <D+2>, 4:00 PM to <M1>, 4:00 PM?" -> Move. Old row `cancelReason 'moved'`, `movedTo 'qa-tok_qa-dec'`, no `booking-cancelled_qa-tok_qa-a` ledger row; new row `movedFrom 'qa-tok_qa-a'`, `createdVia 'move'`, `periodKey` next month's, `chargedFrom 'period'`; `notifications/booking-confirmed_qa-tok_qa-dec` exists; `qa-a.booked` went down one and `qa-dec.booked` is 1. The old row reads "Moved to another session.".
  6. Move onto a row cancelled earlier: Avery's `qa-dec` row -> Move -> `qa-b`. `bookings/qa-tok_qa-b` is confirmed with `movedFrom 'qa-tok_qa-dec'`, a `rebookedAt`, and no `cancelCategory`, `cancelReason` or `cancelledAt`; a ledger row `booking-confirmed_qa-tok_qa-b_move_<ms>` exists.
  7. Comp: Casey's `qa-a` -> Move -> `qa-dec2`: the new row has `comp: true`, `chargedFrom 'period'`; nothing about a token appears in the sheet.
  8. Handicap: Blake's `qa-b` -> Move lists `qa-res`; press Keep it. (Avery's list in item 5 did not.)
  9. `qa-hold-parent`: Drew's `qa-b` row shows "Cancel reservation" and no "Move".
  10. `qa-athlete` at `/portal/schedule`: the `qa-b` row shows Cancel and Move; Cancel asks "Why can't you make it?" (Keep it); Move shows its list and a tap asks "Move from <D+3>, 4:00 PM to ...?" (Keep it). Nothing changes.
  11. Copy: `/portal/book` as `qa-parent` with Avery chosen, the `qa-b` block reads "Avery is booked in. Cancel or move it from Reservations if plans change."; book Avery into `qa-dec2`: the confirmation reads "Plans change? Cancel or move it in the app any time before it starts. The token comes back."
  12. Coach: `qa-coach` opens the D+2 4:00 PM block from the Sessions tab: the roster and its counters are empty; below, greyed, "Avery QA" "Moved to <M1>, 4:00 PM", "Blake QA" "Cancelled · Other: dentist", "Casey QA" "Moved to <M1+1>, 4:00 PM"; no IN/OUT on them.
  13. Stale tap: the coach opens the D+3 block (Avery, Blake, Drew); with that screen open, cancel `qa-tok_qa-b` by a REST commit as `qa-parent` with `cancelCategory 'family'` and the `cancelledAt` transform; tap IN on Avery: "Avery QA cancelled - list updated." and Avery appears greyed "Cancelled · Family conflict".
  14. Academy cancel hides the greyed list: set `sessions/qa-a.status 'cancelled'` (owner REST); the coach's D+2 roster shows the cancelled card and no greyed rows.
  15. `grep -c "Trying to access secret" <scratchpad>/bookchange-emulators.log` still prints `0`.
- [ ] **Step 6: Teardown** - `preview_stop`; stop the emulator task; confirm no orphan `java` emulator (by PID, never a pattern kill); remove the `bookchange-qa` launch entry.

## Release (the owner, after the lead's review; agents run none of this)

Staging and production share one backend, so: (1) merge `feat/booking-changes` into develop locally; (2) `cd functions && npx firebase-tools deploy --only functions --project rypacad`; (3) `npx firebase-tools deploy --only firestore:rules --project rypacad`; (4) `git push origin develop` (staging) and check one cancel and one move with the production test family; (5) `git push origin develop:main`; (6) the site branch `faq/cancel-move`, the same day or after. Do 2-5 in one sitting: from step 2 the confirmation emails say "cancel or move it in the app any time before it starts", which the app only offers from step 5.
