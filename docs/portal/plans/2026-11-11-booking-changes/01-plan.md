# Cancel Up To The Start, Move Any Booking - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A parent or an athlete login cancels any portal booking with a reason right up to the session's start (token back), or moves it to another open session of the same kind in one server step; coaches see those cancels and moves greyed under the attendance list; nobody at the academy gets an email for it.

**Architecture:** Cancel stays the client transaction it is (`hooks/live.js` `cancelBooking`), gaining three optional fields and a to-the-minute start check, with a rules arm that admits the fields and refuses a cancel after the start. Move is a new callable, `moveBooking` (`functions/portal/move.js`), one Admin SDK transaction whose decision is a pure module (`move-decide.js`) built on the existing charge and gate code (`lib.js`, `booking-gates.js`) plus a new server time parser (`session-time.js`). The family UI gets small new modules (row actions, reason picker, move sheet and hook, a pure bookability module extracted from `BookSession.js`); the staff side gets its own query hook and a greyed-rows component mounted under the roster. Grandfathered files gain only the lines that mount or call these, or change copy and formula lines.

**Tech Stack:** React 18 (CRA 5, plain JS), firebase 9 modular SDK, date-fns, jest via react-scripts (`screens/testRender.js` `renderScreen`, no Testing Library); Cloud Functions v1 (`firebase-functions/v1`, firebase-admin, `portal/tiny.js` runner, `portal/fake-firestore.js`, eslint-config-google: JSDoc on every function, 80 columns); Firestore rules v2 with emulator REST probes (`scripts/verify-rules.mjs`, Node 22 ESM).

**Spec:** `docs/portal/plans/2026-11-11-booking-changes/00-spec.md` (owner-approved 2026-11-11, "go with your recommendations"). Section numbers below (§4, §5 ...) are the spec's. Recon evidence: the five readers' notes (file:line) the spec cites; every path and line below was re-checked against `a1c2b85`, and the plan was revised the same day after three reviews (code truth, money and safety, spec and tests).

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
- Files stay under 500 lines. Grandfathered files take only the edits named in their task: `screens/BookSession.js` (1114; it shrinks), `hooks/index.js` (4290), `hooks/live.js` (2026), `screens/Roster.js` (955), `data/seed.js` (484), `screens/AthleteDashboard.js` (508, one copy line), `functions/portal/lib.js` (496; one formula line in `tokensPosition` and its comment, Task F2), `firestore.rules`, `scripts/verify-rules.mjs` (one import, one call). New logic a grandfathered file needs lives in a new module and is only called from there (for example `cancelFields` and `rebookClears` in `data/bookingChanges.js`, called from `live.js`). `PortalRoutes.js` is untouched. `functions/index.js` (458), `functions/portal/notices.js` (448) and `data/billingHub.js` (468) stay under 500.
- Backward compatible on the shared production backend: every new booking field is optional in the rules; the only tightening is the family cancel arm's before-start check (§4, §8); no export leaves `functions/index.js`; `cancelReason: 'member'` stays the value a family cancel writes. Deploy order: functions, then rules, then the app (Release section).
- Copy is exact as given here (spec §7 plus the strings in §4-§6). "Tour event", never "tournament", in anything a person reads. Elite and comp copy never mentions a token. No user-facing string says "until the day before" or "Same-day" after this branch (the portal 1:1 line says "up to the day before", Decided 4).
- No real family names or phone numbers anywhere (code, tests, fixtures, commit messages). Tests use the seed cast (Jordan, Nico, Reese, Sam, Teddy, Ava) and QA fixtures use `... QA` names.
- Commands: `cd frontend && CI=true npx react-scripts test --watchAll=false <pattern>`; `cd frontend && npx eslint <files> --max-warnings=0`; `cd frontend && CI=true npm run build`; `cd functions && node portal/<file>.test.js` (each file prints `N passing`, exit 1 on the first failure); `cd functions && node test/check-exports.js`; `cd functions && npx eslint .` (eslint-config-google: JSDoc on every function and 80 columns, and the 80 columns apply to `portal/*.test.js` too, so wrap every functions snippet in this plan to 80 columns as you type it); rules: Task R1 Step 4. Copy greps run on source only (`grep -rn --exclude=*.test.js ...`); a test keeps any negative assertion short (`not.toContain('Same-day')`), never the whole old sentence.
- Baseline: at `a1c2b85` the whole frontend suite has exactly three failures, all from the real clock passing Nov 10 (their rows are dated 2026-11-10, so `waitlistClosed` is now true): `screens/Reservations.test.js` "waitlisted rows > each child by name...", `screens/MySchedule.test.js` "a waitlisted row > On the waitlist with the place..." and "...Elite reads no token wording...". Task U3's file-level clock pin repairs them; a lane that runs the whole suite before U3 lands expects exactly those three and no other.
- Commits name their files (`git add <paths>`, never `-A`), and every message ends with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Shared contract

Every lane builds against this section; a task's Interfaces block points back here.

### C1. Booking fields (`bookings/{athleteId}_{sessionId}`)

| field | written by | value |
|---|---|---|
| `cancelReason` | family cancel / `moveBooking` | `'member'` (family cancel, unchanged) / `'moved'` (Admin SDK only; silent) |
| `cancelCategory` | family cancel (new app) | `'sick' \| 'injured' \| 'school' \| 'family' \| 'other'`; optional in the rules |
| `cancelNote` | family cancel | string 1..140, only with `'other'`; removed (`deleteField()`) on any other cancel |
| `cancelledAt` | family cancel / `moveBooking` (old row) | server time (`serverTimestamp()`; rules `== request.time`) |
| `movedTo` | `moveBooking`, old row | the NEW booking id `{athleteId}_{toSessionId}` (the convention the owner's earlier move script wrote) |
| `movedFrom` | `moveBooking`, new row | the OLD booking id |
| `createdVia` | `moveBooking`, new row | `'move'` (Admin SDK only; the rules still admit only `'repeat'` from a client) |
| `comp` (+ any `comp*`) | `scripts/comp-booking.mjs`; copied by `moveBooking`; removed by a client re-book | `true`: a free session, never charged and never counted as a period spend |

- A re-book leaves no `cancelCategory`, `cancelNote` or `cancelledAt` on the confirmed row: the client's `createBooking` removes the ones the cancelled row carries (and `comp`: the family is paying for it now), and `moveBooking` replaces a cancelled target row whole. Every reader of these fields checks `status == 'cancelled'` first.
- **A free comp** is `isFreeComp(b)` = `b.comp === true && (b.chargedFrom ?? 'period') === 'period' && !b.graceTokenId` (C4 on the client, `move-decide.js` on the server: CHANGE ONE, CHANGE BOTH). A row the family re-booked with a bonus or single token is an ordinary booking even if an older app left `comp` on it.
- **A comp never spends a period token** (spec §5 "stays free wherever it goes"): every period-spend counter skips `comp === true` rows - `functions/portal/lib.js` `tokensPosition`, `data/packages.js` `tokensFor`, `hooks/index.js` next-period `used`, `hooks/live.js` `assertPeriodTokensLeft`, and `data/billingHub.js` (its evidence rows, last and next period) - CHANGE ONE, CHANGE ALL (Decided 12).

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

Checks 5-7 and 10 are on the booking being moved (10: its own session has started); 11-21 on the target. `membership-inactive` = `lib.membershipAllowsBooking(household, athlete)` false, or no package (both skipped for a free comp), or `athlete.test === true` (always). `booking-not-open` = `!lib.bookingOpen(now, pkg)` (skipped for a free comp). `already-booked` = the target row exists and is not `cancelled` (confirmed, attended or noshow: a coach can mark IN before the start). `full` = `max(live non-cancelled bookings on the target, target.booked ?? 0) >= (target.capacity ?? 0)` (a session with no capacity field is full, as `createBooking` reads it). `outside-window` = `target.date > gates.openThrough(now, gates.windowMonthsFor(pkg))`. `one-per-day` = `gates.eliteDailyCapHit(pkg, target.type, target.date, period bookings without the old one)`.

- Charge (not a free comp): position = `lib.tokensPosition` for the TARGET's period with the old booking left out of `bookings` and `graceSpends`, the athlete's waitlist rows mapped to periods as `waitlist-order.js` does, and the athlete's own waitlist entry on the target (if any) in `ignoreWaitlistIds`. Then, in order: (a) Elite (`position.unlimited`): `elite`; (b) the old booking's `graceTokenId` is in `position.grace` and its `expiresAt` is absent or `>= target.date`: carry it (`grace`, same id); (c) the old booking spent the period (`!graceTokenId`, `chargedFrom` absent or `'period'`), its period key equals the target's, and `position.left > 0`: `period`; (d) otherwise `lib.chargeFor({ position, sessionDate: target.date })`; null -> `no-session-token` when `position.perPurchase`, else `no-tokens-left`.
- Free comp (`isFreeComp(old)`, C1): skips billing, freeze, package, `booking-not-open` and the charge, in any period (a comp never counts as a spend, C1); new row `chargedFrom: 'period'`, `graceTokenId: null`, every `comp*` field of the old row copied. An old row with `comp: true` that is not a free comp (re-booked with a bonus or single token) moves as an ordinary booking and keeps its token.
- Writes, one transaction (all reads first): old row update `{ status: 'cancelled', cancelledBy: uid, cancelReason: 'moved', movedTo: newId, cancelledAt: serverTimestamp() }` plus `FieldValue.delete()` for each of `cancelCategory`, `cancelNote`, `cancelledVia` the old row carries (an older app's re-book can leave them, and the coach list must not show a stale reason); old session `booked: max(0, booked - 1)`; new row `{ athleteId, sessionId, householdId, date, type, status: 'confirmed', periodKey, chargedFrom, graceTokenId, createdBy: uid, createdVia: 'move', movedFrom: oldId, createdAt: serverTimestamp(), ...comp fields }`, written with `tx.create` when the target row is absent, or with `tx.set` (a whole-document replace, so no old cancel or `comp` field survives) plus `rebookedAt: serverTimestamp()` when it exists cancelled (any other status was refused `already-booked`); target session `booked: taken + 1`; delete `waitlist/{toSessionId}_{athleteId}` when it exists (Decided 7).
- Notices: the old row's `'moved'` sends nothing (`onBookingCancelled` already ignores any reason but `'member'` and `'session-cancelled'`). A created row fires `onBookingCreated` (`createdBy` is the caller, never `'system'`). A re-confirmed row fires no create trigger, so `onBookingCancelled` (the bookings onUpdate trigger) gains a first branch (Task F4): `shouldNoticeMoveReconfirm(before, after)` - before `cancelled`, after `confirmed`, `after.createdVia === 'move'`, and `after.createdAt` a Timestamp that differs from `before.createdAt` (only `moveBooking` rewrites `createdAt`; a client re-book of a row that once came from a move never does) - sends `booking-confirmed` with `subjectKey: \`${id}_move_${after.createdAt.toMillis()}\`` (never blocked by the earlier `booking-confirmed_${id}` ledger row; a redelivered trigger carries the same `createdAt`, so it never sends twice). The callable itself sends nothing and binds no secret, so a slow mail server never holds the family's call open or turns a committed move into a timeout (Decided 13).

### C3. Notice copy and keys (functions)

- `booking-confirmed` body gains `' You can cancel or move it in the app any time before it starts.'` for every type but `mental` (unchanged).
- `promoted` body: `' You can cancel in the app until the day before.'` becomes `' You can cancel or move it in the app any time before it starts.'`.
- `booking-cancelled` receipt: with `comp` (`isFreeComp(after)`) or `elite` (`after.chargedFrom === 'elite'`, the booking's own charge, as `waitlist-notices.js` decides it for `promoted`) the body ends after `was cancelled.` (no token sentence); otherwise byte-identical.
- `booking-cancelled` key: `memberCancelKey(bookingId, before, after)` = `${bookingId}_${after.cancelledAt.toMillis()}` when `after.cancelledAt` is a Timestamp that differs from `before.cancelledAt` (the new app stamps every cancel), else `bookingId` (an older app; a redelivered trigger keeps the same value). Cancel, re-book, cancel again now sends the second receipt spec §2.4 promises (Decided 14).

### C4. Shared pure module `frontend/src/portal/data/bookingChanges.js` (Task 0)

`CANCEL_CATEGORIES` (`[{ id, label }]`: sick Sick, injured Injured, school School, family Family conflict, other Other), `CANCEL_NOTE_MAX = 140`, `CANCEL_NOTE_PLACEHOLDER = 'A few words'`, `MENTAL_DAY_OF_COPY = 'A 1:1 can be cancelled in the app up to the day before.'`, `ALREADY_CHANGED_COPY = 'This booking was already changed.'`, `categoryLabel(id) -> ?string`, `cancelQuestion(name) -> string`, `cancelReasonOf(input) -> ?{ category, note }`, `cancelFields(reason, { del, stamp }) -> object` (`{}` for no reason, else `{ cancelCategory, cancelNote: note ?? del(), cancelledAt: stamp() }`; `del` and `stamp` are zero-argument functions, `deleteField` and `serverTimestamp` in `live.js`), `rebookClears(row, del) -> object` (`{ [k]: del() }` for each of `cancelCategory`, `cancelNote`, `cancelledAt`, `comp` that `row` carries, else `{}`; `del` is never called for a row without them), `isFreeComp(booking) -> boolean` (C1), `dayTimeLabel(dateISO, time) -> string`, `coachLine(booking, movedToSession) -> ?string`, `movedToSessionId(booking) -> ?string`, `staleMarkLine(name) -> string`.

### C5. Client modules (lanes U and S)

| module | export | shape |
|---|---|---|
| `data/sessionStart.js` | `rowSession(row)` | `{ date, time: '4:00 PM' }` from a row's split `time` + `meridiem` |
| | `cancelDayOpen(session, todayISO)` | mental: `date > today`; else `date >= today` |
| `hooks/live.js` | `cancelBooking({ bookingId, cancelledVia, silent, reason })` | `reason` = `cancelReasonOf` output or null; refusals `bad-reason`, `not-confirmed` (`ALREADY_CHANGED_COPY`), `mental-day-of` (`MENTAL_DAY_OF_COPY`), `session-past` (`SESSION_STARTED_COPY`, also for a rules refusal on a session dated today) |
| | `rebookPatch(chargedFrom, graceTokenId, stamp, clears = {})` | `clears` (from `rebookClears`) spread last; `{}` keeps today's patch byte for byte |
| `hooks/cancelSeries.js` | `cancelSeries(rows, cancel, reason)` | each week `cancel(id, { cancelledVia: 'series', silent: true, reason })` (`reason` key only when given) |
| `hooks/index.js` rows | `comp` (`isFreeComp(b)`), `graceTokenId` on every booking row; `cancellable` = confirmed && not Calendly && `cancelDayOpen` | |
| | `onHold` on `useSchedule().data` and on each `useHouseholdReservations().data.members[i]` | household past_due/lapsed, or `billingStatusOf(athlete) !== 'active'` |
| `components/CancelSheet.js` | new optional props `chooser` (node) and `ready` (bool, default true) | `ready` false disables both confirm buttons |
| `components/CancelReasonPicker.js` | default `({ name, value, onChange, disabled })` | `value` `{ category: ?string, note: string }` |
| `components/MemberCancelSheet.js` | default `({ summary, name, laterWeeks, onClose, onConfirm(reason), onConfirmSeries(reason), onCancelled })` | |
| `components/BookingRowActions.js` | `rowActionsFor(row, { now, onHold })` | `{ kind: 'none' \| 'calendly' \| 'started' \| 'mental-day-of' \| 'change', move?: bool }` |
| | default `({ row, onHold, onCancel, onMove })` | Move button only when `onMove` given and `move` |
| `data/bookability.js` | `formatCapacity(session)`, `cardFacts(session, opts)`, `positionWithFreed(tokens, from, dateISO, anchorDay)`, `moveTargetOpen(session, ctx)` | Task U4 |
| `hooks/callables.js` | `callMoveBooking` | `callable('moveBooking')` |
| `hooks/move.js` | `loadMoveOptions(row, now)`, `useMoveOptions(row, reloadKey)`, `moveBooking({ bookingId, toSessionId })` | `{ days: [{ iso, label, sessions: [MoveOption] }] }` |
| `components/MoveSheet.js` | default `({ row, name, onClose, onMoved })`; `moveRefusalCopy(err)`, `moveTitle(type)`, `moveQuestion({ name, from, to })` | |
| `hooks/cancelledBookings.js` | `fetchCancelledBySession(sessionId)`, `liveCancelledRows(sessionId)`, `useCancelledBookings(sessionId)`, `bookingIsCancelled(bookingId)`, `markOrRecheck(mark, bookingId, status)` | rows `{ bookingId, athleteId, name, line }` |
| `components/CancelledRows.js` | default `({ sessionId })` | greyed `AthleteRow`s, nothing when empty |

`MoveOption` = `{ id, date, time: '4:00', meridiem: 'PM', fullTime: '4:00 PM', type, name, capacityLabel }`.

### C6. Rules

Top-level helpers `sessionNotStarted(s)` and `sessionStartsAt(date, t)` beside `sessionDayNotOver`; the member cancel arm admits `cancelCategory`, `cancelNote`, `cancelledAt` (checked by `cancelDetailOk`) and adds `sessionNotStarted` on the booking's session; the re-book arm may remove (never set or change) those three and `comp`. No client may write `cancelReason: 'moved'`, `movedTo`, `movedFrom`, `cancelledVia: 'move'` or `createdVia: 'move'`. The start check assumes Chicago standard time (+360 minutes): exact for the whole 2026-27 season (it ends Feb 27), lenient by one hour from 2027-03-14 (daylight time) and never stricter (Decided 16).

## Review Focus

1. **Session time text that is not `h:mm AM/PM`** ('TBA', '4 PM', blank). Expected: on its own day it counts as not started everywhere (client row, `cancelBooking`, the callable, the rules), and the day floor still closes it at midnight; nothing throws and nothing refuses all day. A lower-case '4:00 pm' parses in the app and the callable (case-insensitive, as today) while the rules' pattern is upper-case only, so the rules fall back to the day floor for it: lenient, never stricter. Pinned: Task U3 Step 1 (`rowActionsFor` on a 'TBA' row), Task F1 Step 1 ('TBA', lower-case, blank), Task F2 Step 1 (a 'TBA' target today), Task R1 Step 1 ('TBA' today 200, blank today 200, lower case started 90 minutes ago 200, 'TBA' yesterday 403).
2. **A household anchored on a day other than the 1st.** "Same period" is the household's anchor period, not the calendar month: with anchor 15, Nov 14 to Nov 16 crosses periods and must take the new period's token. Pinned: Task F2 Step 1 (anchor-15 move), Task U4 Step 1 (`positionWithFreed` with anchor 15).
3. **Two taps or two devices on one booking.** Expected: the first Move wins, the second is refused with plain copy; never two bookings, never a lost seat. A Cancel or Move on a booking another device already changed reads "This booking was already changed.". Pinned: Task F3 Step 1 (second call refused `not-confirmed`, counts unchanged), Task U5 Step 1 (Move button inert while the call runs: one call on a double tap; `not-confirmed` copy), Task U1 Step 1 (`cancelBooking` on a cancelled row: `not-confirmed`).
4. **A list left open across the start time.** Cancel or Move tapped after the start: refused with "This session has already started.", booking unchanged, token not returned. Pinned: Task U1 Step 1 (`cancelBooking` refuses inside the transaction), Task F2 Step 1 (`already-started`), Task R1 Step 1 (cancel 90 minutes after the start is 403), Task U5 Step 1 (`already-started` copy), Task I2 checklist item 2.
5. **A bonus or single token that expires between the old and the new date.** Expected: the move falls back to a fresh charge (a period token) or is refused with token copy, and the picker does not offer, in the common case, what the server would refuse. Pinned: Task F2 Step 1 (expired-before-target falls back; refusal when the period is spent), Task U4 Step 1 (`positionWithFreed` adds the freed token only up to its expiry).
6. **A phone clock that is wrong** (slow, fast, another time zone). Expected: the rules and the callable decide on server time; a slow phone whose cancel the rules refuse reads "This session has already started." (never the raw permission text), and a series run lists that week as failed and carries on; a fast phone hides Cancel and Move a little early (accepted: the server never refuses what a fast phone offers). Pinned: Task U1 Step 1 (`live.cancel.test.js`: permission-denied on a session today -> `session-past`, on a future session the code stays `permission-denied`; `cancelSeries.test.js`: a `session-past` week is listed and the run goes on).
7. **An athlete's own login and a parent.** Expected: both cancel and move their own bookings; neither reaches a sibling's or another household's. Pinned: Task F2 Step 1 (an athlete login moves its own; a sibling's login is `not-yours`), Task F3 Step 1 (`u-sam` is written as `cancelledBy` and `createdBy`), Task R1 Step 1 (both callers on the cancel arm), Task U3 Step 1 (My Schedule's sheet), Task I2 item 11 (an athlete login completes a move).
8. **Another family takes the last seat while the Move list is open.** Expected: the tap is refused "This session just filled. Nothing was changed.", the original booking and both counters are untouched, and the list reloads without that session. Pinned: Task F3 Step 1 (a refusal changes nothing), Task U5 Step 1 (a refusal reloads the options), Task I2 item 12.
9. **A series week.** Expected: one reason goes on every week; a week that fails is listed and the rest carry on; moving one week leaves the other weeks as they were. Pinned: Task U1 Step 1 (`cancelSeries` with a reason and with a failing week), Task U3 Step 1 (the series sheet), Task R1 Step 1 (`'series'` + `'school'`), Task I2 item 13.
10. **Seed mode (no live data).** Expected: rows carry the new fields, `cancel(id, { reason })` and `moveBooking` echo `{ simulated: true }` and call nothing live, and the Move sheet reads "No open sessions like this in your booking window.". Pinned: Task U1 Step 1 (seed cases in `hooks/index.bookchange.test.js`), Task U5 Step 1 (seed `moveBooking` and the empty sheet).
11. **A comp moved into a paid period.** Expected: it stays free there: the paid period's count does not move and nothing about a token is said. Pinned: Task F2 Step 1 (`tokensPosition` skips a comp row; a comp moves into a spent December), Task U1 Step 1 (`tokensFor`, the next-period count, `assertPeriodTokensLeft`, the billing hub), Task I2 item 7.

## Decided here

Points the spec left open or got wrong against the code, and the resolution:

1. **"Booking-confirmed email" copy (§7).** Today `bookingConfirmed` carries no cancel sentence; the old "until the day before" sentence lives in the `promoted` notice (`notices.js:150`). Both get the new sentence (C3): the literal spec line and the "old wording goes everywhere" rule. A portal `mental` booking's confirmation stays as it is (Yannick's 24 hours); `mental` is never promoted (no waitlist).
2. **"Charged exactly like a fresh booking" vs "the token moves with it" (§5).** With the grace-first order a fresh booking would spend a spare bonus token before the period; the plan carries the old charge while it is still valid on the new date (C2 (b), (c)) and only otherwise charges like a fresh booking (d). Same net tokens either way; the family keeps the token they picked.
3. **Exclusion of the moved booking** needs no new code in `lib.js` (496 lines; its only change is the comp formula line, Decided 12): `move-decide.js` filters the old row out of the rows it hands `tokensPosition`.
4. **A portal mental 1:1 on its own day** shows no buttons; its row reads "A 1:1 can be cancelled in the app up to the day before." (new string; the spec removed the old day-of line without saying what a mental row shows). `cancelBooking` refuses the same case inside its transaction (`mental-day-of`), so a list opened the evening before cannot cancel a 1:1 after midnight.
5. **An athlete's own login** has no name on My Schedule: the picker asks "Why can't you make it?" and the move question reads "Move from ... to ...?".
6. **The family's own moved-away row** reads "Moved to another session." under its Cancelled badge (`cancelReasonCopy('moved')`; new string), instead of looking like a plain cancel.
7. **A waitlist entry on the target.** The picker leaves out a session the athlete is waiting on, as the Book tab does (it offers "Leave waitlist" there), so the spec's "no change to waitlist rules" holds. If the athlete still holds an entry on the target at commit time (a race), the callable deletes it and leaves it out of the charge, as a promotion would.
8. **Elite cancel receipt** loses its token sentence with the comp change (spec §7 "Elite copy never mentions tokens"; the receipt said "The token is back in this period." to Elite families). Elite is read from the booking's own charge (`chargedFrom === 'elite'`), as the `promoted` notice already does.
9. **Rules for Move:** none. The callable writes with the Admin SDK, so recon's `cancelledVia: 'move'` and `movedFrom`-on-create rules are not needed; probes pin that a client cannot write any move marker (C6).
10. **Coach list scope:** family cancels with a known `cancelCategory` and every `'moved'` row; an old-app cancel (no category), a series cancel without one, academy and billing cancels stay off the list.
11. **Website FAQ:** the spec's paragraph replaces the whole answer, which drops "Tokens refresh on the 1st of each month and unused tokens don't carry over." (recon flagged "the 1st" as wrong: periods run from each household's anchor day). Flagged to the owner in Task W1's commit message.
12. **A comp in a paid period (spec §5 "any period").** A comp stamped with a paid period's `periodKey` spends one of that period's tokens under today's counters (they count every live row without a `graceTokenId`), so every counter skips `comp` rows (C1); this also fixes today's case of a comp dated inside a period the family later pays for. Hardening: the new app's re-book removes `comp`, the rules let a re-book remove it, and `isFreeComp` treats a row charged to a bonus or single token as ordinary. Accepted residual: a cancelled comp re-booked with a period token from an app bundle loaded before the release keeps `comp` and reads as free. That needs the comp's own seat still ahead after the athlete's billing turns active and a re-book of exactly that seat from a stale tab; every comp so far is for an unpaid athlete, whose re-book the rules refuse.
13. **The re-confirm notice comes from the trigger, not the callable** (C2 Notices): `sendNotice` waits for every email and push, and a mail timeout inside the callable would reach the family as a failed move that had in fact committed.
14. **One receipt per cancel** (C3 key): cancelling right up to the start makes cancel, re-book, cancel common, and the booking-id key let only the first receipt through.
15. **The 1:1 exception in the general copy.** The athlete-home line and the FAQ say "cancel any time before ... the token comes back" with no word about portal 1:1s with Yannick (day before, spec §3; the signed consent form forfeits the token, `data/mentalConsentTerms.js` 96-98). Both are the spec's exact copy, so they ship as given; W1's commit message and the lead's report offer the owner "(1:1s with Yannick: by the day before)" as an optional addition.
16. **The rules' start check is Chicago standard time only** (C6): lenient by one hour from 2027-03-14, never stricter; the rules comment and DATA-MODEL (Task R2) carry a dated note to revisit it before any spring session.
17. **A phone clock behind the server.** The rules refuse that cancel; `cancelBooking` turns the refusal on a session dated today into "This session has already started." (Review Focus 6) instead of "cancelBooking: Missing or insufficient permissions.".
18. **Release smoke check.** The production test family's athletes can never hold a booking (`firestore.rules` `athleteBillingOk` refuses `test: true`; `scripts/provision-test-family.mjs` writes none), so staging checks the copy and that the callable answers, and the cancel and move paths stay proven on the emulator (Task I2). Nobody tests on a real family's booking.

## File Structure

| Lane | Worktree / branch | Tasks | Files (no file is in two lanes) |
|---|---|---|---|
| lead | `wt-bookchange` / `feat/booking-changes` | 0, then I1, I2 | `frontend/src/portal/data/bookingChanges.js` (+test) |
| F functions | `wt-bookchange-fn` / `bookchange/fn` | F1-F4 | new `functions/portal/session-time.js`, `move-decide.js`, `move.js` (+tests); changed `functions/index.js`, `portal/lib.js` (one formula line), `portal/lib.test.js`, `portal/notices.js`, `portal/notify-gates.js` (two pure gates and a comment), `portal/promotion.js` (comments), `portal/notices.test.js`, `portal/promotion.test.js`, `portal/notify-gates.test.js`, `test/check-exports.js`, `test/verify-notifications.js` |
| R rules | `wt-bookchange` / `feat/booking-changes` | R1, R2 | `firestore.rules`, new `scripts/rules-probes/booking-changes.mjs`, `scripts/verify-rules.mjs`, `docs/portal/DATA-MODEL.md`, `docs/portal/ui-redesign-brief.md`, `docs/portal/tokens-and-billing-contract.md`, `docs/portal/TEAM.md`, `docs/portal/SPRINT-12-PINS.md` |
| U family UI | `wt-bookchange-ui` / `bookchange/ui` | U1-U5 | `frontend/src/portal/`: `data/sessionStart.js`, `data/packages.js`, `data/billingHub.js`, new `data/bookability.js`, `hooks/live.js`, `hooks/cancelSeries.js`, `hooks/index.js`, new `hooks/move.js`, `hooks/callables.js`, `components/CancelSheet.js`, new `components/CancelReasonPicker.js`, `MemberCancelSheet.js`, `BookingRowActions.js`, `MoveSheet.js`, `components/WaitlistAction.js`, `components/BookingReasons.js`, `data/seed.js`, `screens/Reservations.js`, `MySchedule.js`, `BookSession.js`, `AthleteDashboard.js`, and their tests (incl. `hooks/live.test.js`, `hooks/index.tokens.test.js`, `SpecialistBooking.test.js`, `hooks/index.test.js`, new `hooks/index.bookchange.test.js`) |
| S staff | `wt-bookchange-staff` / `bookchange/staff` | S1, S2 | new `frontend/src/portal/hooks/cancelledBookings.js`, `components/CancelledRows.js` (+tests), `screens/Roster.js`, new `screens/Roster.bookchange.test.js`, mocks in `screens/Roster.readonly.test.js`, `Roster.clubhead.test.js`, `Roster.reserved.test.js`, `TourScoreSheet.test.js` |
| W website | `C:\Users\Mac\Desktop\rypacadapp\ryp-academy-site` / `faq/cancel-move` | W1 | `public/faq.html` |

Order: Task 0 first (lead). Then F, R, U, S, W run in parallel; tasks inside a lane run in order. I1 after all lanes; I2 after I1.

---

### Task 0: Shared module and lane setup (lead)

LANE lead. Depends on: none.

**Files:**
- Create: `frontend/src/portal/data/bookingChanges.js`, `frontend/src/portal/data/bookingChanges.test.js`
- Local only, never committed: the three lane worktrees and their `node_modules` junctions, placeholder keys in `wt-bookchange/functions/.secret.local` / `.env.local` if PREFLIGHT reports any missing.

**Interfaces:**
- Produces: C4, exactly. `coachLine(booking, movedToSession)`: `booking` a `bookings` body; `movedToSession` `{ date, time }` or null. Neither the header comment nor any string in the module says "until the day before" (the copy greps in U3 and I1 would find it).

- [ ] **Step 1: Write the failing test** `data/bookingChanges.test.js`:
```js
import { ALREADY_CHANGED_COPY, CANCEL_CATEGORIES, CANCEL_NOTE_MAX, CANCEL_NOTE_PLACEHOLDER, MENTAL_DAY_OF_COPY, cancelFields,
  cancelQuestion, cancelReasonOf, categoryLabel, coachLine, dayTimeLabel, isFreeComp, movedToSessionId, rebookClears,
  staleMarkLine } from './bookingChanges';

test('the five reasons in order, with their words', () => {
  expect(CANCEL_CATEGORIES.map((c) => [c.id, c.label])).toEqual([['sick', 'Sick'], ['injured', 'Injured'], ['school', 'School'], ['family', 'Family conflict'], ['other', 'Other']]);
  expect([CANCEL_NOTE_MAX, CANCEL_NOTE_PLACEHOLDER]).toEqual([140, 'A few words']);
  expect([categoryLabel('family'), categoryLabel('bored')]).toEqual(['Family conflict', null]);
});
test('the fixed lines', () => {
  expect(MENTAL_DAY_OF_COPY).toBe('A 1:1 can be cancelled in the app up to the day before.');
  expect(ALREADY_CHANGED_COPY).toBe('This booking was already changed.');
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
test('cancelFields: the three fields for a reason, nothing without one', () => {
  const fx = { del: () => 'DEL', stamp: () => 'NOW' };
  const never = { del: () => { throw new Error('called'); }, stamp: () => { throw new Error('called'); } };
  expect(cancelFields({ category: 'sick', note: null }, fx)).toEqual({ cancelCategory: 'sick', cancelNote: 'DEL', cancelledAt: 'NOW' });
  expect(cancelFields({ category: 'other', note: 'dentist' }, fx)).toEqual({ cancelCategory: 'other', cancelNote: 'dentist', cancelledAt: 'NOW' });
  expect(cancelFields(null, never)).toEqual({});
});
test('rebookClears: only the keys the cancelled row carries', () => {
  expect(rebookClears({ status: 'cancelled', cancelCategory: 'sick', cancelledAt: 1, comp: true }, () => 'DEL'))
    .toEqual({ cancelCategory: 'DEL', cancelledAt: 'DEL', comp: 'DEL' });
  expect(rebookClears({ status: 'cancelled', cancelReason: 'member', cancelledBy: 'p1' }, () => { throw new Error('called'); })).toEqual({});
});
test('isFreeComp: a comp charged to the period with no token id', () => {
  expect([{ comp: true, chargedFrom: 'period' }, { comp: true }].map(isFreeComp)).toEqual([true, true]);
  expect([{ comp: true, chargedFrom: 'grace', graceTokenId: 'single_cs_1' }, { comp: true, chargedFrom: 'elite' }, { chargedFrom: 'period' }, null]
    .map(isFreeComp)).toEqual([false, false, false, false]);
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
- [ ] **Step 3: Implement `data/bookingChanges.js`** (pure, no Firebase import: `cancelFields` and `rebookClears` take the SDK's `deleteField` / `serverTimestamp` as arguments; `dayTimeLabel` uses date-fns `format(parseISO(date), 'EEE MMM d')`; the separator in the coach line is " · " (U+00B7); `isFreeComp` names `functions/portal/move-decide.js#isFreeComp` as CHANGE ONE, CHANGE BOTH; a header comment names spec §4-§6 and that the server never reads this module).
- [ ] **Step 4: Run it** - same command. Expected: PASS (10 tests).
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
Expected: `preflight ok`. On "missing or empty", append a placeholder for that key only and re-run: `KEY=placeholder` for every key except `STRIPE_WEBHOOK_SECRET`, whose placeholder must be exactly `whsec_functionslane_emulator_only_not_a_real_secret` (the value `functions/test/verify-notifications.js` signs its webhook replay with, line 40; at `a1c2b85` both files already carry it). Never a real value, never `SMTP_HOST`, and never print either file.

---

### Task F1: Server time parser

LANE F. Depends on: Task 0.

**Files:**
- Create: `functions/portal/session-time.js`, `functions/portal/session-time.test.js`

**Interfaces:**
- Consumes: `lib.chicagoDate(date)`, `lib.chicagoTime(date)` (`'4:05 PM'`).
- Produces: `parseTimeToMinutes(text) -> ?number` (regex `/(\d+):(\d+)\s*(AM|PM)/i`, `(h % 12 + (PM ? 12 : 0)) * 60 + m`); `sessionStarted(session, now) -> boolean` (no session or no date: false; another Chicago date: `date < today`; today: parsed start `<=` Chicago minutes now, unparseable false). Header: CHANGE ONE, CHANGE BOTH with `frontend/src/portal/data/calendar.js#parseTimeToMinutes` and `data/sessionStart.js#sessionStarted`.

- [ ] **Step 1: Write the failing test** (`tiny.js` style; already wrapped to 80 columns, as `npx eslint .` requires for tests too):
```js
test('parseTimeToMinutes: the client parser; anything else is null', () => {
  const times = ['4:00 PM', '12:00 PM', '12:15 AM', '9:05 am', '4:00pm'];
  assert.deepEqual(times.map(t.parseTimeToMinutes), [960, 720, 15, 545, 960]);
  const junk = ['TBA', '', undefined, '16:00', '4 PM'];
  assert.deepEqual(junk.map(t.parseTimeToMinutes),
      [null, null, null, null, null]);
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

### Task F2: The move decision (pure), and a comp never spends

LANE F. Depends on: F1.

**Files:**
- Create: `functions/portal/move-decide.js`, `functions/portal/move-decide.test.js`
- Modify: `functions/portal/lib.js` (`tokensPosition`: the `used` filter and the comment above it, lines 253-256; the file ends at 497 lines at most), `functions/portal/lib.test.js` (one case)

**Interfaces:**
- Consumes: `lib.tokensPosition`, `lib.chargeFor`, `lib.periodFor`, `lib.membershipAllowsBooking`, `lib.bookingOpen`, `lib.chicagoDate`; `gates.openThrough`, `gates.windowMonthsFor`, `gates.eliteDailyCapHit` (`booking-gates.js`); `sessionStarted` (F1).
- Produces:
  - `lib.tokensPosition`: `used` counts `b.periodKey === periodKey && !b.graceTokenId && b.comp !== true` (C1; CHANGE ONE, CHANGE BOTH with `data/packages.js#tokensFor`, already named in its header), wrapped to 80 columns over the same two lines; the comment above it gains "nor does a comp (2026-11-11: free wherever it moves)".
  - `isFreeComp(booking) -> boolean` - C1's predicate (header: CHANGE ONE, CHANGE BOTH with `frontend/src/portal/data/bookingChanges.js#isFreeComp`).
  - `REFUSALS` - `{ [reason]: { code, message } }`, exactly C2's table.
  - `decideMove(ctx) -> { ok: true, comp: boolean, charge: { chargedFrom, graceTokenId }, period: { periodKey, periodEnd }, taken: number, waitlistEntryId: ?string } | { ok: false, reason: string }`, where `ctx = { uid, user, old, oldSession, target, targetBooking, targetLive, athlete, household, pkg, tokenPeriod, periodBookings, graceSpends, waitlist, graceTokens, now }`; `old`, `targetBooking` and every row carry their doc `id`; `target` and `oldSession` carry `id`; `targetLive` is the count of non-cancelled bookings on the target. Checks in C2's order 3..23 (`old` null is `booking-missing`); `comp` is `isFreeComp(old)`; the charge as C2 (a)-(d); a free comp as C2. `waitlistEntryId` is `${target.id}_${athlete id}` when that row is in `ctx.waitlist`, else null.
  - `moveCharge({ old, target, position, period, oldPeriodKey }) -> { chargedFrom, graceTokenId } | { reason }` (C2 (a)-(d)), exported for its own tests.

- [ ] **Step 1: Write the failing tests** (80 columns). `lib.test.js`: `tokensPosition skips a comp row` - a 6-token package, one live period row and one `{ comp: true, chargedFrom: 'period' }` row in the same period: `used 1`, `left 5`. `move-decide.test.js`: a `world(over)` builder returns a full ctx: `NOW = 2026-11-10T18:00:00Z`; user `{ role: 'parent', householdId: 'hart' }` (uid `u-parent`); athlete `sam` `{ householdId: 'hart', packageId: 't-6', handicap: 4 }`; household `{ periodAnchorDay: 1 }`; pkg `{ kind: 'tokens', tokens: 6 }`; old `sam_s1` (Thu Nov 12 4:00 PM training, confirmed, `periodKey '2026-11-01'`, `chargedFrom 'period'`, `householdId 'hart'`); oldSession `s1`; target `s2` (Fri Nov 13 4:00 PM training, capacity 12, booked 3, status 'scheduled'); `targetLive 3`; no target booking, no waitlist, no grace. Cases (each asserts the whole result with `assert.deepEqual` or the `reason`):
  - `moves within the period carrying the period token` - ok, `charge { chargedFrom: 'period', graceTokenId: null }`, `period.periodKey '2026-11-01'`, `taken 3`, `comp false`.
  - `a full November still moves inside November (the old one counts as given back)` - six non-cancelled November period rows including `sam_s1`: ok, period.
  - `a move into December spends December's token` - target `2026-12-01`: ok, `periodKey '2026-12-01'`, period; with six December rows already: `no-tokens-left`.
  - `a bonus token carries while it is valid on the new date` - old `chargedFrom 'grace'`, `graceTokenId 'g1'`, grace row `g1 { expiresAt: '2026-11-20' }`: ok, `{ chargedFrom: 'grace', graceTokenId: 'g1' }`.
  - `a bonus token that ends before the new date falls back to a fresh charge` - same, target Dec 1: ok, `{ chargedFrom: 'period', graceTokenId: null }`; with December spent: `no-tokens-left`.
  - `a single token carries to any period` - pkg `{ kind: 'single', tokens: 1 }`, old `graceTokenId 'single_cs_1'`, grace `{ id: 'single_cs_1', expiresAt: '2027-02-27', reason: 'single-purchase' }`, target Dec 1: ok, grace `single_cs_1`; with no grace at all: `no-session-token`.
  - `Elite stays Elite; one-per-day counts other bookings only` - pkg `{ kind: 'elite', tokens: null }`: ok `elite`; another confirmed training on Nov 13: `one-per-day`; old on Nov 12 4 PM moved to Nov 12 6 PM: ok.
  - `a free comp stays comp and skips billing, freeze and tokens` - old `comp: true` (`chargedFrom 'period'`), athlete `billing { status: 'pending' }`, household `membership { status: 'past_due' }`, six December rows (spent), target Dec 1: ok, `comp true`, `{ chargedFrom: 'period', graceTokenId: null }` (the counters skip it there, so December stays at six of six).
  - `an ex-comp row re-booked with a token is an ordinary booking` - old `{ comp: true, chargedFrom: 'grace', graceTokenId: 'single_cs_1' }`, single pkg, grace `single_cs_1` valid: ok, `comp false`, `{ chargedFrom: 'grace', graceTokenId: 'single_cs_1' }`; the same with athlete billing pending: `membership-inactive`; `isFreeComp` of `{ comp: true }`, `{ comp: true, chargedFrom: 'period' }`, `{ comp: true, chargedFrom: 'elite' }`, `{ comp: true, chargedFrom: 'grace', graceTokenId: 'g' }` is `[true, true, false, false]`.
  - `an unpaid or frozen ordinary booking is refused` - billing pending: `membership-inactive`; household past_due: `membership-inactive`; `athlete.test === true` even with comp: `membership-inactive`; no package: `membership-inactive`.
  - `an athlete's own login moves its own booking` - user `{ role: 'athlete', athleteId: 'sam', householdId: 'hart' }`: ok, the same result as the first case.
  - `the old booking's own refusals` - another household's parent: `not-yours`; an athlete login whose `athleteId` is a sibling: `not-yours`; old `status 'cancelled'`: `not-confirmed`; `source 'calendly'`: `calendly-managed`; `type 'mental'`: `mental-no-move`; target id equal to the old session: `same-session`; old session dated today at 11:00 AM: `already-started`; old session missing: `session-missing`.
  - `the target's refusals` - missing: `session-missing`; type 'tournament': `different-type`; `status 'cancelled'`: `session-cancelled`; `hidden: true`: `session-hidden`; `bookable: false`: `display-only`; today 11:00 AM: `session-past`; `2027-01-05`: `outside-window`; target booking `confirmed`, `attended` and `noshow`: `already-booked` each; `maxHandicap 3`: `handicap-reserved`; athlete with no handicap and `maxHandicap 5`: `handicap-reserved`; `capacity 3, booked 3`: `full`; `capacity 3, booked 1, targetLive 3`: `full`; no `capacity` field: `full`.
  - `a target today with an unreadable time is open on its day` - target today `time 'TBA'`: ok (Review Focus 1).
  - `anchor 15: Nov 14 to Nov 16 crosses into the next period` - household `periodAnchorDay 15`, old Nov 14 (`periodKey '2026-10-15'`), target Nov 16: ok, `periodKey '2026-11-15'`; with six rows in that period: `no-tokens-left` (Review Focus 2).
  - `a waitlist entry on the target is left out of the count and returned for deletion` - single pkg; the old booking's `single_cs_1` is the athlete's only token; a waitlist row `s2_sam` (`date` Nov 13): ok, grace `single_cs_1`, `waitlistEntryId 's2_sam'` (counted, the entry would hold that token and the move would be refused `no-session-token`).
  - `REFUSALS covers every reason with C2's code` - `assert.deepEqual(Object.keys(REFUSALS).sort(), [...C2 reasons].sort())` and the codes of `signed-out`, `bad-request`, `booking-missing`, `not-yours`, one failed-precondition.
- [ ] **Step 2: Run** `cd functions && node portal/move-decide.test.js` and `node portal/lib.test.js`. Expected: FAIL, "Cannot find module './move-decide'", and the comp case in `lib.test.js`.
- [ ] **Step 3: Implement** the `lib.js` line, then `move-decide.js` per Interfaces. Positions as `waitlist-order.js` `loadCandidate` builds them (`periodFor(w.date || target.date, anchorDay)` for waitlist rows; the period rows and grace spends deduplicated by id, both without `old.id`). Header: why it exists (spec §5), that it mirrors `waitlist-order.js`'s gates, the charge order, and the free-comp predicate.
- [ ] **Step 4: Run** the same. Expected: `move-decide.test.js` `17 passing`, `lib.test.js` all passing; `npx eslint portal/lib.js portal/lib.test.js portal/move-decide.js portal/move-decide.test.js` clean; `wc -l portal/lib.js` 497 or less.
- [ ] **Step 5: CRLF and commit** - `git add functions/portal/lib.js functions/portal/lib.test.js functions/portal/move-decide.js functions/portal/move-decide.test.js`; message `feat(functions): the move decision - gates, carry-or-charge, comp; a comp never spends`, trailer.

### Task F3: The `moveBooking` callable

LANE F. Depends on: F2.

**Files:**
- Create: `functions/portal/move.js`, `functions/portal/move.test.js`
- Modify: `functions/index.js` (header line, one require, one export), `functions/test/check-exports.js`

**Interfaces:**
- Consumes: `decideMove`, `REFUSALS` (F2); `lib.periodBookingsQuery`, `lib.graceSpendQueries`, `lib.readGraceSpends`, `lib.rows`, `lib.bookingId`, `lib.waitlistId`, `lib.periodFor`, `lib.tokenPeriodId`; `FieldValue` from `firebase-admin/firestore` (as `promotion.js`).
- Produces: `moveBookingHandler(data, context, deps?) -> Promise<C2 response>` (`deps { db, now }`); `moveBooking` = `functions.runWith({secrets: []}).https.onCall((data, context) => moveBookingHandler(data, context))` (it sends no notice, so it binds no secret: C2 Notices); module-private `loadMove(tx, store, { uid, bookingId, toSessionId })` (every read C2 lists, in one transaction, before any write; returns nulls for missing docs) and `writeMove(tx, store, ctx, decision, uid)` (C2 Writes: `tx.create` for an absent target row, `tx.set` for a cancelled one, the old row's stale-field deletes only for the keys it carries).

- [ ] **Step 1: Write the failing tests** (80 columns) with `fakeDb` (`portal/fake-firestore.js`; its `update` merges, so a `FieldValue.delete()` shows as the sentinel: assert with `FieldValue.delete().isEqual(v)`). World: `users/u-parent { role: 'parent', householdId: 'hart' }`, `users/u-other { role: 'parent', householdId: 'lopez' }`, `users/u-sam { role: 'athlete', athleteId: 'sam', householdId: 'hart' }`, `athletes/sam`, `households/hart { periodAnchorDay: 1 }`, `packages/t-6`, sessions `s1` (Nov 12, booked 2), `s2` (Nov 13, booked 1), bookings `sam_s1` (confirmed) and `ava_s1`. Cases:
  - `a move is four writes: old cancelled as moved, its seat back, the new row, the new seat` - `docs['bookings/sam_s1']` has `status 'cancelled'`, `cancelReason 'moved'`, `movedTo 'sam_s2'`, `cancelledBy 'u-parent'`, a `cancelledAt` value, and no `cancelCategory`, `cancelNote` or `cancelledVia` key; `sessions/s1.booked 1`; `bookings/sam_s2` has `status 'confirmed'`, `movedFrom 'sam_s1'`, `createdVia 'move'`, `createdBy 'u-parent'`, `periodKey '2026-11-01'`, `chargedFrom 'period'`, `graceTokenId null`, `householdId 'hart'`, `date '2026-11-13'`, `type 'training'`; `sessions/s2.booked 2`; the result deep-equals `{ bookingId: 'sam_s2', movedFrom: 'sam_s1', sessionId: 's2', periodKey: '2026-11-01', chargedFrom: 'period', graceTokenId: null, comp: false, rebooked: false }`.
  - `a moved-away row loses a stale reason an older app's re-book left on it` - `sam_s1` confirmed with `cancelCategory: 'school'` and `cancelledVia: 'series'` left over: after the move both hold the delete sentinel (`FieldValue.delete().isEqual(...)`) and `cancelNote` is absent.
  - `onto a row cancelled earlier: replaced whole, so no old cancel or comp field survives` - seed `sam_s2 { status: 'cancelled', cancelReason: 'member', cancelCategory: 'school', cancelledAt: x, cancelledBy: 'u-parent', comp: true, createdAt: old }`: the row has none of `cancelReason`, `cancelCategory`, `cancelNote`, `cancelledAt`, `cancelledBy`, `comp`; has `rebookedAt` and a `createdAt` that is not `old`; `rebooked true`.
  - `the seat count is the larger of the counter and the roster` - `s2 { booked: 0, capacity: 3 }` with two confirmed rows on `s2`: `sessions/s2.booked 3`.
  - `a comp booking stays comp` - `sam_s1 { comp: true, compNote: 'x' }`, athlete billing pending: new row `comp true`, `compNote 'x'`, `chargedFrom 'period'`.
  - `the athlete's waitlist entry on the target is removed` - `waitlist/s2_sam` exists before, not after.
  - `an athlete's own login moves its own booking` - as `u-sam`: ok; `bookings/sam_s1.cancelledBy` and `bookings/sam_s2.createdBy` are `'u-sam'` (Review Focus 7).
  - `a refusal changes nothing` - `s2 { capacity: 1, booked: 1 }`: rejects with `code 'failed-precondition'`, `details.reason 'full'`; `JSON.stringify(docs)` equals the snapshot taken before.
  - `signed out, bad input, not found, not yours` - no auth: `unauthenticated`/`signed-out`; `{ bookingId: 'a/b', toSessionId: 's2' }`, a 201-char id, missing ids: `invalid-argument`/`bad-request`; unknown booking: `not-found`/`booking-missing`; `u-other`: `permission-denied`/`not-yours`.
  - `a second call for the same booking is refused and moves nothing` - after a successful move, the same request rejects `not-confirmed`; `sessions/s1.booked` and `sessions/s2.booked` unchanged by it (Review Focus 3).
- [ ] **Step 2: Run** `cd functions && node portal/move.test.js`. Expected: FAIL, "Cannot find module './move'".
- [ ] **Step 3: Implement** `move.js` per Interfaces and C2 (input check before any read; `HttpsError(REFUSALS[r].code, REFUSALS[r].message, { reason: r })` thrown inside the transaction so nothing commits; no notice is sent from here).
- [ ] **Step 4: Wire it.** `functions/index.js`: add `const {moveBooking} = require('./portal/move');` after the `requestMentalConsent` require (Task F4 widens it); add `exports.moveBooking = moveBooking;` after `exports.onSingleTokenSpent = onSingleTokenSpent;` with a one-line comment ("A family moves a booking in one transaction (2026-11-11, portal/move.js)"); add one header bullet under the waitlist-hardening paragraph naming the callable. `test/check-exports.js`: `moveBooking: []` in `EXPECTED`, the count `21`, and the header comment and assert message naming it.
- [ ] **Step 5: Run** `node portal/move.test.js` (Expected: `10 passing`), `node test/check-exports.js` (Expected: `ok  21 functions exported, secrets bound per contract 6.4`), `npx eslint .` (clean).
- [ ] **Step 6: CRLF and commit** - `git add functions/portal/move.js functions/portal/move.test.js functions/index.js functions/test/check-exports.js`; message `feat(functions): moveBooking callable - one transaction, typed refusals`, trailer.

### Task F4: Notice copy, gates and keys

LANE F. Depends on: F3.

**Files:**
- Modify: `functions/portal/notices.js` (`bookingConfirmed` 125-132, `promoted` 143-153, `bookingCancelled` 165-176; anchor on text), `functions/portal/notify-gates.js` (new pure `shouldNoticeMoveReconfirm` and `memberCancelKey`, exported; the doc comment of `shouldNoticeMemberCancel`: `'moved'` is never a receipt), `functions/portal/move.js` (`sendMoveReconfirm`), `functions/index.js` (the `notify-gates` require gains the two names, the `move` require gains `sendMoveReconfirm`, one `move-decide` require for `isFreeComp`; `onBookingCancelled`: a re-confirm branch before its `before.status !== 'confirmed'` return, the receipt's `notices.bookingCancelled({...})` call at 294-295 and its `subjectKey` at 303; one doc-comment line; the file stays under 500), `functions/portal/promotion.js` (comments: lines 21-22 "(the family could not cancel)" and 155-156 "from midnight the family could not cancel" both become "(owner ruling R3)")
- Test: `functions/portal/notices.test.js` (lines 39-40, 70-80, and new cases), `functions/portal/promotion.test.js` (lines 90-91, 133-134, 530-531), `functions/portal/notify-gates.test.js`, `functions/portal/move.test.js`, `functions/test/verify-notifications.js` (lines 290, 307)

**Interfaces:**
- Produces: C3. `bookingCancelled({ athlete, session, singleToken, comp, elite })`; `onBookingCancelled` passes `comp: isFreeComp(after)` and `elite: after.chargedFrom === 'elite'`, and keys the receipt `subjectKey: memberCancelKey(context.params.bookingId, before, after)`.
- `shouldNoticeMoveReconfirm(before, after) -> boolean` and `memberCancelKey(bookingId, before, after) -> string` (`notify-gates.js`, pure; a Timestamp is any value with `toMillis()`), as C2 Notices and C3 define them.
- `sendMoveReconfirm(bookingId, booking, deps?) -> Promise<void>` (`move.js`; `deps { db, sendNotice }`): reads the session and athlete, then sends `{ kind: 'booking-confirmed', category: 'schedule', householdId, athleteId, sessionId, bookingId, subjectKey: \`${bookingId}_move_${booking.createdAt.toMillis()}\`, title, body }` from `notices.bookingConfirmed({ athlete, session, booking })`; logs and swallows any failure. `onBookingCancelled` begins: `if (shouldNoticeMoveReconfirm(before, after)) { await sendMoveReconfirm(context.params.bookingId, after); return null; }`.

- [ ] **Step 1: Change the tests first** (80 columns). `notices.test.js`: line 40 becomes `'Teddy is booked: Tour event, Sat, Nov 7 at 9:00 AM. You can cancel or move it in the app any time before it starts.'`; the `promoted` case's two bodies end `' You can cancel or move it in the app any time before it starts.'`; new cases: `bookingConfirmed` for `{type: 'mental', ...}` has no "cancel" sentence; `bookingCancelled({athlete: TEDDY, session: TRAINING, comp: true}).body === "Teddy's booking for Training, Wed, Nov 4 at 3:00 PM was cancelled."` and the same with `elite: true`; the existing "old body is byte-identical" case stays. `promotion.test.js`: the three `promoted` bodies end the same new sentence. `notify-gates.test.js`: `shouldNoticeMemberCancel({status: 'cancelled', cancelReason: 'moved'}) === false`; `shouldNoticeBookingCreated({status: 'confirmed', createdBy: 'u1', createdVia: 'move'}) === true`; `shouldNoticeMoveReconfirm` is true for before `{status: 'cancelled', createdAt: ts(1)}` / after `{status: 'confirmed', createdVia: 'move', createdAt: ts(2)}`, and false when `createdAt` is the same instant (a client re-book of a row that came from a move), when `createdVia` is absent, and when before was `confirmed`; `memberCancelKey('b1', {}, {cancelledAt: ts(5)}) === 'b1_5'`, `memberCancelKey('b1', {}, {}) === 'b1'`, and with the same `cancelledAt` before and after (an older app's cancel of a row an older re-book left stamped) `'b1'` (`ts(n)` = `{toMillis: () => n}`). `move.test.js`: `sendMoveReconfirm` sends exactly one notice `{ kind: 'booking-confirmed', category: 'schedule', bookingId: 'sam_s2', subjectKey: 'sam_s2_move_<ms>' }` whose body is `notices.bookingConfirmed(...)`'s; with a `sendNotice` that throws it resolves without throwing. `verify-notifications.js` line 290 appends the sentence; line 307 swaps it.
- [ ] **Step 2: Run** `node portal/notices.test.js`, `node portal/promotion.test.js`, `node portal/notify-gates.test.js`, `node portal/move.test.js`. Expected: FAIL on the new bodies, the two new gates and `sendMoveReconfirm` (the `moved` and `createdVia 'move'` gate cases pass already).
- [ ] **Step 3: Implement** C3 in `notices.js` (one module constant for the sentence; `bookingConfirmed` appends it unless `session.type === 'mental'`), the two gates, `sendMoveReconfirm`, and the `index.js` lines.
- [ ] **Step 4: Run** every functions test: `cd functions && for f in portal/*.test.js; do node "$f" || exit 1; done`. Expected: every file `N passing` (`move.test.js` `12 passing`), exit 0. `node test/check-exports.js` (`ok  21 ...`), `node --check test/verify-notifications.js` and `npx eslint .`: clean. `wc -l index.js`: under 500. `grep -rn "until the day before\|could not cancel" portal test`: no output.
- [ ] **Step 5: CRLF and commit** - message `feat(functions): cancel-or-move copy; move re-confirm notice from the trigger; one receipt per cancel; no token line on comp and Elite receipts`, trailer.

---

### Task R1: Rules - reasons, before-start, re-book cleanup, probes

LANE R. Depends on: Task 0 (branch only).

**Files:**
- Modify: `firestore.rules` (new helpers after `sessionDayNotOver`, lines 116-123; the comment at 1606-1611; `memberBookingUpdateOk` lines 1684-1715)
- Create: `scripts/rules-probes/booking-changes.mjs`
- Modify: `scripts/verify-rules.mjs` (import beside `taskTourBrackets`, line 32; `await taskBookingChanges();` after `await taskTourBrackets();` in `runPass`, line 1153)

**Interfaces:**
- Consumes from `../verify-rules.mjs` (its export list, line 1157): `bookAs, call, commitAs, createAs, del, expect, listAs, patchWrite, seatWrite, seed, t, uid, updateAs`. There is no `getAs`: a read probe is `call('GET', 'bookings/<id>', null, <auth>)`.
- Produces: C6; `export async function taskBookingChanges()`.

- [ ] **Step 1: Write the failing probes** `scripts/rules-probes/booking-changes.mjs` in the `hidden.mjs` style (Elite rows `ath-elite` / household `hh`, so both passes answer alike; seed in `try`, delete everything in `finally`; read `uid` only inside functions). Helpers: `chicagoSlot(offsetMin)` -> `{ date, time }` of `Date.now() + offsetMin` minutes in America/Chicago (`Intl.DateTimeFormat` parts, `'h:mm AM'`). Before any case, `chicagoSlot(-90).date` and `chicagoSlot(90).date` must both equal today's Chicago date; when they do not, the task records `expect('booking-changes: run outside 22:30-01:30 Chicago (a 90-minute slot crosses midnight)', 'skipped', 'ran')` (a FAIL) and returns, because a slot on another day would pass the before-start cases on the day floor alone. `row(sessionId, over)` = `{ athleteId: 'ath-elite', sessionId, date, type: 'training', periodKey, status: 'confirmed', householdId: 'hh', createdBy: uid.parent, chargedFrom: 'elite', createdAt: new Date() }`; `cancel(auth, sessionId, fields, mask, serverTime)` = one commit of `patchWrite('bookings', ...)` plus `await seatWrite(sessionId, -1)`; `rebook(auth, sessionId, fields, mask, serverTime)` = one commit of the booking `patchWrite` plus `await seatWrite(sessionId, 1)` (every re-book probe takes its seat in the same commit, so a 403 is the field's and never a missing seat); a family cancel base `{ status: 'cancelled', cancelledBy: <caller uid>, cancelReason: 'member' }` with `cancelledAt` set by `serverTime ['cancelledAt']` unless the case says otherwise. Every 403 below has a 200 twin that differs only in the field or time under test. ±90 minutes keeps every answer right under CDT too (the rules assume UTC-6). Expectations:
```
before the start
  parent cancels a booking whose session started 90 min ago (chicagoSlot(-90)) ............ 403
  athlete login (t.eliteLogin) cancels one that started 90 min ago ....................... 403
  parent cancels one that starts in 90 min (chicagoSlot(+90)) ............................. 200
  athlete login cancels one that starts in 90 min ......................................... 200
  a session today with time 'TBA' (the day floor) ......................................... 200
  a session today with time '' (the day floor) ............................................ 200
  a session today whose lower-case time ('2:30 pm' style) started 90 min ago (the rules'
    pattern is upper-case only, so the day floor decides: lenient) ........................ 200
  a session yesterday with time 'TBA' ..................................................... 403
  the old app's write on a future booking (status, cancelledBy, cancelReason; cancelledVia
    masked with no value) ................................................................. 200
reasons (future sessions)
  each of sick, injured, school, family; other with cancelNote 'dentist' .................. 200 x5
  cancelCategory 'bored' .................................................................. 403
  cancelNote with 'sick' .................................................................. 403
  cancelNote 'x' with no cancelCategory ................................................... 403
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
re-book (a row cancelled with category 'sick', note none, cancelledAt set; each with seat + 1)
  re-book status, chargedFrom 'elite', graceTokenId null, rebookedAt (transform), and
    cancelCategory, cancelNote, cancelledAt masked with no value .......................... 200
  ... and the GET shows none of the three ................................................. (expect undefined)
  re-book with status alone (an old app) on a row still carrying cancelCategory ............ 200
  re-book that sets cancelCategory 'sick' on a row without one ............................ 403
  re-book that changes cancelNote to 'x' .................................................. 403
  re-book that sets cancelledAt by a REQUEST_TIME transform ............................... 403
  re-book of a row carrying comp: true, with comp masked with no value (removed) .......... 200
  re-book that sets comp: true on a row without it ........................................ 403
staff and reads
  ops session cancel (status, cancelledBy, cancelReason 'session-cancelled') + category ... 403
  coach marks a confirmed row attended with cancelCategory 'sick' ......................... 403
  coach marks a cancelled row noshow ...................................................... 403
  coach lists { sessionId: <s>, status: 'cancelled' } ..................................... 200
  parent of another household: call('GET', 'bookings/<id>', null, t.other) ................ 403
```
- [ ] **Step 2: Register and run against the lane emulator** (current rules). Register the import and the call in `verify-rules.mjs`. Start the emulator in the background from `wt-bookchange`: `npx firebase-tools emulators:start --only firestore --config firebase.bookchange.json --project rypacad`. Then `FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 node scripts/verify-rules.mjs` (the env var points the script at 8085; `scripts/emulator.env` says 8080, so do not pass it, or pass it after the variable: Node's `--env-file` never overrides a variable already set). PowerShell: `$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8085'; node scripts/verify-rules.mjs`. Expected: FAIL on the before-start, reason, cleanup, `cancelledAt` and `comp` lines; every pre-existing task still PASS.
- [ ] **Step 3: Implement the rules.** After `sessionDayNotOver`:
```
    // 2026-11-11 (owner: cancel up to the start; spec section 4): a family cancel is refused once the session has
    // started. sessions.time is display text ('4:00 PM'); parsed here with the season's CST offset (+360 min). A
    // time that is not 'h:mm AM|PM' passes this check, so sessionDayNotOver (midnight) stays the floor for it.
    // Lenient by one hour from 2027-03-14 (CDT), never stricter: revisit before any spring session.
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
Inside the bookings block, beside `rebookChargeOk`: `cancelDetailOk(after, diffKeys)` (category in the five; a note only with `'other'`, a string of 1..140; `cancelledAt` in the diff only as `request.time`) and `removesOnly(after, diffKeys, k)` = `!diffKeys.hasAny([k]) || !after.keys().hasAny([k])`. Cancel arm: `hasOnly` gains `'cancelCategory', 'cancelNote', 'cancelledAt'`; add `&& cancelDetailOk(after, diffKeys)` after the `cancelledVia` line, and `&& sessionNotStarted(get(/databases/$(database)/documents/sessions/$(before.sessionId)).data)` between `sessionDayNotOver(before.date)` and `seatFreedInCommit` (the same session document `seatFreedInCommit` reads: no new document access). Re-book arm: `hasOnly` gains `'cancelCategory', 'cancelNote', 'cancelledAt', 'comp'`, plus `&& removesOnly(after, diffKeys, 'cancelCategory') && removesOnly(after, diffKeys, 'cancelNote') && removesOnly(after, diffKeys, 'cancelledAt') && removesOnly(after, diffKeys, 'comp')`. Rewrite the comment at 1606-1611 (the "12-hour" and "day-of = contact the academy" sentences) to the 2026-11-11 rule, and add a dated paragraph to the arm's comment block naming the three fields, `comp` on the re-book and the check.
- [ ] **Step 4: Run** `FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 node scripts/verify-rules.mjs` (outside 22:30-01:30 Chicago). Expected: last line `ALL PASS (both passes)`. Additivity: `git diff a1c2b85 -- firestore.rules` shows only the helpers, the two `hasOnly` lines, the added clauses and comments. Stop the emulator (by its task, never a pattern kill).
- [ ] **Step 5: CRLF and commit** - `git add firestore.rules scripts/rules-probes/booking-changes.mjs scripts/verify-rules.mjs`; message `feat(rules): family cancel reasons and the before-start check; a re-book clears them and comp`, trailer.

### Task R2: Docs

LANE R. Depends on: R1.

**Files:**
- Modify: `docs/portal/DATA-MODEL.md` (bookings table rows `status` 398, `cancelReason` 400, `createdVia` 410; new rows `cancelCategory`, `cancelNote`, `cancelledAt`, `movedTo`, `movedFrom`, booking `comp`; the cancellation section around 590-612), `docs/portal/ui-redesign-brief.md` (69-73, 496, 500, 543), `docs/portal/tokens-and-billing-contract.md` (67, 83, 192), `docs/portal/TEAM.md` (68, 636, 684, 1550, 1967, 3058), `docs/portal/SPRINT-12-PINS.md` (201)

- [ ] **Step 1: Write** the C1 fields and the C2 behaviour into DATA-MODEL (each row dated 2026-11-11, naming the writer, the rules clause and the reader that checks `status`), including that a comp never counts as a period spend (C1) and a dated follow-up under the rules section: "the before-start check assumes CST (+360 min): lenient by one hour from 2027-03-14 - revisit before any spring session". Replace every "until the day before" / "day-of is not self-service" statement in DATA-MODEL and the brief with "until the session starts; the token comes back; a portal 1:1 with Yannick until the day before", and the brief's copy table row 543 with the §7 confirmation note. In the contract, mark the 12-hour lines (67, 192) "superseded 2026-11-11 (plans/2026-11-11-booking-changes)" and change line 83's "(it could not cancel)" to "(owner ruling R3)". `TEAM.md` and `SPRINT-12-PINS.md` are dated sprint records, so their stale lines are not rewritten: each gets a trailing "(superseded 2026-11-11: cancel until the session starts - plans/2026-11-11-booking-changes)".
- [ ] **Step 2: Check** `grep -n "until the day before\|12-hour\|day-of\|could not cancel" docs/portal/DATA-MODEL.md docs/portal/ui-redesign-brief.md docs/portal/tokens-and-billing-contract.md docs/portal/TEAM.md docs/portal/SPRINT-12-PINS.md`: every hit is a line carrying "superseded 2026-11-11", a line naming the 1:1 exception, a line saying the 12-hour rule was withdrawn or never built (`TEAM.md` 1552, 2965, 3057; `SPRINT-12-PINS.md` 203), or a "day-of-month" line (`TEAM.md` 1448, 1991; `SPRINT-12-PINS.md` 106).
- [ ] **Step 3: CRLF and commit** - message `docs(bookings): cancel until the start, Move, the new booking fields`, trailer.

---

### Task U1: Cancel plumbing - start helpers, reasons in the write, row fields, a comp never spends

LANE U. Depends on: Task 0.

**Files:**
- Modify: `frontend/src/portal/data/sessionStart.js`, `data/sessionStart.test.js`
- Modify: `hooks/live.js` (header comment 1054-1062; `cancelBooking` 1064-1123; `rebookPatch` 770-772; its call at 976; `assertPeriodTokensLeft`'s `used` filter at 719-721), `hooks/live.cancel.test.js`, `hooks/live.test.js` (its `firebase/firestore` mock, lines 10-24; the rebookPatch describe, 74-80; one new re-book case; one `assertPeriodTokensLeft` case). `hooks/live.reserved.test.js` stays as it is (its re-booked row carries none of the cleared keys).
- Modify: `hooks/cancelSeries.js` (`laterWeeks` comment 30-31; `cancelSeries` 89-115), `hooks/cancelSeries.test.js`
- Modify: `hooks/index.js` (imports 141 and 204 plus one new import line; the comments above the live row, 653-657, and above the seed row, 905-911; `liveSchedule` row 659-660 and return; seed row 913; the next-period `used` filter 439-441; `reservationRow` 2367-2368; bucket 2418; row input 2426), `hooks/index.tokens.test.js` (one case)
- Modify: `data/packages.js` (`tokensFor`'s `used`, line 340, and the comment above it), `data/packages.test.js`; `data/billingHub.js` (`periodRows` row shape 116-131, `nextPeriod.used` 261, `lastUsed` 205-207), `data/billingHub.test.js`
- Create: `hooks/index.bookchange.test.js`

**Interfaces:**
- Consumes: C4 `cancelReasonOf`, `cancelFields`, `rebookClears`, `isFreeComp`, `MENTAL_DAY_OF_COPY`, `ALREADY_CHANGED_COPY`; `academyClock`, `academyDateISO`, `parseTimeToMinutes`; `householdOnHold` (`data/singleToken.js`); `billingStatusOf`; `SESSION_STARTED_COPY`.
- Produces: C5 rows for `sessionStart.js`, `live.js`, `cancelSeries.js`, `hooks/index.js`, and C1's counters on the client.
  - `cancelBooking({ bookingId, cancelledVia = null, silent = false, reason = null })`: an unusable `reason` throws `LiveDataError(ERR.INVALID, 'Pick a reason.', null, 'bad-reason')` before any read. Inside the transaction, in order: booking missing (as today); not `confirmed` -> `LiveDataError(ERR.INVALID, ALREADY_CHANGED_COPY, null, 'not-confirmed')` (was "Only a confirmed booking can be cancelled (this one is ...)."; no test pins the old text); Calendly (as today); session read; `(booking.type ?? session.type) === 'mental'` and `session.date <= academyDateISO()` -> `LiveDataError(ERR.INVALID, MENTAL_DAY_OF_COPY, null, 'mental-day-of')`; `assertSessionNotStarted(session)` (reason `'session-past'`, message `SESSION_STARTED_COPY`); then the update `{ status, cancelledBy, cancelReason: 'member', cancelledVia, ...cancelFields(reason, { del: deleteField, stamp: serverTimestamp }) }`. Without a reason the write is byte-identical to today's. In the `catch`, a `permission-denied` from the commit on a session whose date (kept from the read) is `academyDateISO()` rethrows `LiveDataError(ERR.INVALID, SESSION_STARTED_COPY, err, 'session-past')` (a phone clock behind the server: the rules refused it as started, Review Focus 6); everything else goes through `wrap` as today.
  - `rebookPatch(chargedFrom, graceTokenId, stamp, clears = {})` returns today's four keys then `...clears`; line 976 passes `rebookClears(bookingSnap.data(), deleteField)`, so a cancelled row carrying none of `cancelCategory`, `cancelNote`, `cancelledAt`, `comp` gets today's patch byte for byte and `deleteField` is never called (`live.test.js:250-264` and `live.reserved.test.js:185-200` pass unchanged).
  - Counters (C1): `data/packages.js:340`, `hooks/index.js:440` and `hooks/live.js:720` gain `&& b.comp !== true`; `billingHub.js` `periodRows` rows gain `viaComp: b.comp === true`, `nextPeriod.used` counts `!r.viaGrace && !r.viaComp`, and `lastUsed` gains `&& b.comp !== true`; each comment that says what `used` counts says "nor a comp". Formula lines only in `live.js` and `hooks/index.js`.

- [ ] **Step 1: Write the failing tests.**
  - `sessionStart.test.js`: `rowSession({ date: '2026-11-12', time: '4:00', meridiem: 'PM' })` deep-equals `{ date: '2026-11-12', time: '4:00 PM' }`; a row with no meridiem keeps `time` as is; `cancelDayOpen({ date: '2026-11-12', type: 'training' }, '2026-11-12') === true`, `('2026-11-11' session, '2026-11-12') === false`, mental same day `false`, mental the next day `true`.
  - `live.cancel.test.js`: add `serverTimestamp: () => 'SERVER_TIME'` to the `firebase/firestore` mock, and let `runTransaction` reject with `mockCommitError` after running `fn` when that variable is set (reset in `beforeEach`); add `bookings/a1_today` (session `s0`: `2026-11-09`, `4:00 PM`, training) and `bookings/a1_m0` (`type 'mental'`, session `m0`: `2026-11-09`, `4:00 PM`, mental) and a cancelled `bookings/a1_gone`; pin the clock for the file (`jest.useFakeTimers('modern'); jest.setSystemTime(new Date('2026-11-09T18:00:00Z'))` in `beforeEach` - noon in Chicago - and `jest.useRealTimers()` in `afterEach`). New cases: `a reason writes its category, removes a stale note, and stamps the server time` (`reason: { category: 'sick', note: null }` -> booking update `{ status: 'cancelled', cancelledBy: 'p1', cancelReason: 'member', cancelledVia: 'DELETE_FIELD', cancelCategory: 'sick', cancelNote: 'DELETE_FIELD', cancelledAt: 'SERVER_TIME' }`); `Other carries its note` (`cancelNote: 'dentist'`); `a series week carries the same reason` (`cancelledVia: 'series'` plus the three); `an unusable reason is refused before any read` (`{ category: 'bored' }` rejects `{ code: ERR.INVALID, reason: 'bad-reason' }`, no updates); `a session that has started is refused inside the transaction` (clock `2026-11-10T22:30:00Z`, 4:30 PM Chicago: rejects `{ code: ERR.INVALID, reason: 'session-past', message: 'This session has already started.' }`, no updates) (Review Focus 4); `a 1:1 on its own day is refused` (`a1_m0`: `{ reason: 'mental-day-of', message: 'A 1:1 can be cancelled in the app up to the day before.' }`, no updates); `a booking another device already changed` (`a1_gone`: `{ code: ERR.INVALID, reason: 'not-confirmed', message: 'This booking was already changed.' }`); `the rules refusing a cancel today reads as started` (`mockCommitError = { code: 'permission-denied', message: 'Missing or insufficient permissions.' }` on `a1_today`: rejects `{ code: ERR.INVALID, reason: 'session-past', message: 'This session has already started.' }`; the same on `a1_s1`, dated tomorrow: `{ code: ERR.PERMISSION }`) (Review Focus 6).
  - `live.test.js`: add `deleteField: () => 'DELETE_FIELD'` to its `firebase/firestore` mock; `rebookPatch('period', null, stamp, { cancelCategory: 'X', comp: 'X' })` deep-equals `{ status: 'confirmed', chargedFrom: 'period', graceTokenId: null, rebookedAt: stamp, cancelCategory: 'X', comp: 'X' }`, and the three-argument cases stay exactly as they are; a new createBooking case: `a re-book removes an old reason and comp from the row it re-confirms` (the cancelled `a2_s1` also carries `cancelCategory: 'sick'`, `cancelledAt: 'T0'` and `comp: true`: its update is the existing case's object plus `cancelCategory: 'DELETE_FIELD'`, `cancelledAt: 'DELETE_FIELD'`, `comp: 'DELETE_FIELD'`, and has no `cancelNote` key); `assertPeriodTokensLeft` with a 6-token package, five live period rows and one `comp: true` row in the period does not throw (Review Focus 11).
  - `data/packages.test.js`: `tokensFor` with one period row and one `comp: true` row reads `used 1`. `hooks/index.tokens.test.js`: a `comp: true` row in the next period leaves `nextPeriod.used` and `left` where they were without it. `data/billingHub.test.js`: a hub with a comp row in the current, next and last period: `tokens.used`, `nextPeriod.used` and `lastPeriod.used` skip it, the row is listed with `viaComp: true`, and the evidence invariant reads `spent.filter((r) => !r.viaGrace && !r.viaComp)` has `tokens.used` rows.
  - `cancelSeries.test.js`: `cancelSeries(rows, cancel, { category: 'school', note: null })` calls `cancel` with `{ cancelledVia: 'series', silent: true, reason: { category: 'school', note: null } }` for every week; without a reason the opts stay `{ cancelledVia: 'series', silent: true }`; a first week rejecting `{ code: 'invalid-argument', reason: 'session-past', message: 'This session has already started.' }` is listed in `failed` with that message and the later weeks are still cancelled (Review Focus 6, 9).
  - `hooks/index.bookchange.test.js` (copy the mock list and `mountHook` helper of `hooks/index.hidden.test.js`, adding `fetchHouseholdBookings: jest.fn()` to the `./live` mock as `index.waitlist.test.js:27` does; `TODAY = '2026-11-12'`): `useSchedule({ today: TODAY })` live, household `membership { status: 'past_due' }`, bookings: training today confirmed with `comp: true`; mental today; mental tomorrow; a Calendly row; a grace row `graceTokenId 'g1'` -> rows' `[bookingId, cancellable, comp, graceTokenId]` are `[.., true, true, null]`, `[.., false, false, null]`, `[.., true, false, null]`, `[.., false, false, null]`, `[.., true, false, 'g1']`, and `data.onHold === true`; `useHouseholdReservations()` live with an athlete `billing { status: 'pending' }` and one active: `members.map((m) => m.onHold)` is `[true, false]`, a comp row reads `comp: true` and a `{ comp: true, chargedFrom: 'grace', graceTokenId: 'g2' }` row reads `comp: false`. Seed mode (Review Focus 10), `isLive` false: every `useSchedule` row carries `comp: false`, `graceTokenId: null` and `cancellable === cancelDayOpen(row, TODAY)`; `cancel('b1', { reason: { category: 'sick', note: null } })` resolves `{ id: 'b1', status: 'cancelled', simulated: true }`.
- [ ] **Step 2: Run** `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/data/sessionStart src/portal/data/packages src/portal/data/billingHub src/portal/hooks/live src/portal/hooks/cancelSeries src/portal/hooks/index.bookchange src/portal/hooks/index.tokens`. Expected: the new cases FAIL.
- [ ] **Step 3: Implement.** `sessionStart.js`: `rowSession`, `cancelDayOpen` (pure, JSDoc naming spec §4 and the mental exception). `live.js` per Interfaces, the new logic only as calls into C4 (`cancelFields`, `rebookClears`, the two copy constants); rewrite the header comment's "client-side cancel-window gating ... no date check" paragraph to the new rule. `cancelSeries.js`: third parameter, comment 30-31 "(confirmed, before the session starts, not Calendly-managed)". The counters and `billingHub.js` per Interfaces. `hooks/index.js`, exactly these line edits (helper anchors, each unique):
  - `import { isSingleTokenId } from '../data/singleToken';` -> `import { householdOnHold, isSingleTokenId } from '../data/singleToken';`
  - `import { sessionStarted } from '../data/sessionStart';` -> `import { cancelDayOpen, sessionStarted } from '../data/sessionStart';` plus, after it, `import { isFreeComp } from '../data/bookingChanges';`
  - liveSchedule comment (653-657): "`cancellable` is the exact pinned formula - status 'confirmed' AND still in the future" -> "status 'confirmed', not Calendly, and cancelDayOpen (the session's own day included; BookingRowActions hides Cancel once it starts)"; the seed comment (905-911) "reduces to the same date check" -> "reduces to the same cancelDayOpen check"
  - liveSchedule: `cancellable: b.status === 'confirmed' && b.date > today && source !== 'calendly',` -> `cancellable: b.status === 'confirmed' && source !== 'calendly' && cancelDayOpen(s, today),`, and after its `singleToken` line `comp: isFreeComp(b),` and `graceTokenId: b.graceTokenId ?? null,`
  - liveSchedule return: `onHold: householdOnHold(ctx.household) || billingStatusOf(ctx.athlete) !== 'active',` after the `tokens: withGraceReasons(...)` entry
  - next-period `used` (440): `... && b.periodKey === nextPeriodKey && !b.graceTokenId` -> `... && !b.graceTokenId && b.comp !== true`
  - seed: `cancellable: s.date > today,` -> `cancellable: cancelDayOpen(s, today),` plus `comp: false,` and `graceTokenId: null,`
  - reservationRow: `cancellable: b.status === 'confirmed' && s.date > today && source !== 'calendly',` -> the `cancelDayOpen(s, today)` form, plus `comp: isFreeComp(b),` and `graceTokenId: b.graceTokenId ?? null,` after its `singleToken` line
  - bucket (2418): `onHold: householdOnHold(household) || billingStatusOf(a) !== 'active',` inside the object
  - row input (2426): `comp: b.comp, chargedFrom: b.chargedFrom,` inside the literal (`isFreeComp` needs both)
- [ ] **Step 4: Run** the Step 2 command, then the whole hooks and data folders: `CI=true npx react-scripts test --watchAll=false src/portal/hooks src/portal/data`. Expected: PASS. `npx eslint src/portal/hooks src/portal/data --max-warnings=0`: clean. `git diff --stat` on `hooks/index.js` is under 30 lines changed, on `hooks/live.js` under 45.
- [ ] **Step 5: CRLF and commit** - message `feat(bookings): cancel carries a reason and re-checks the start; rows carry comp and onHold; a comp never spends`, trailer.

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
- Modify: `screens/Reservations.js` (imports 13-14; header comment 30-33; `MemberList` action chain 220-245, its `dayOf` line 185; the sheet 134-143), `screens/Reservations.test.js` (clock pin; copy 56-57; new cases)
- Modify: `screens/MySchedule.js` (imports 5-6; header 36-40; `ScheduleBody` chain 313-339 and `dayOf` 282; the sheet 196-205), `screens/MySchedule.test.js` (clock pin; copy 32 and 100; new cases)
- Modify (copy): `components/WaitlistAction.js` (28-30, comment 33-35), `components/WaitlistAction.test.js` (the test title at 24, which says "cancel until the day before", becomes "... cancel or move any time before it starts"; bodies 26-33 and 96); `components/BookingReasons.js` (`cancelReasonCopy`), `components/BookingReasons.test.js`; `data/seed.js` (203, 205); `screens/AthleteDashboard.js` (501), `screens/AthleteDashboard.test.js` (153); `hooks/index.test.js` (272-273); `screens/SpecialistBooking.test.js` (540, 695); `screens/BookSession.test.js` (240, 248, 764, 1008)

**Interfaces:**
- Consumes: C5 `rowSession`, `sessionStarted`, `academyDateISO`; C4 `MENTAL_DAY_OF_COPY`; `MemberCancelSheet` (U2); `CALENDLY_MANAGED_COPY`; `SESSION_STARTED_COPY`.
- Produces: C5 `rowActionsFor` / `BookingRowActions`. `rowActionsFor(row, { now = new Date(), onHold = false })`, first match wins: not `status 'confirmed'` or no `bookingId` -> `none`; `source 'calendly'` -> `calendly`; `sessionStarted(rowSession(row), now)` -> `started`; `type 'mental'` and `row.date <= academyDateISO(now)` -> `mental-day-of`; `!row.cancellable` -> `none`; else `change` with `move: row.type !== 'mental' && (row.comp === true || !onHold)`. The component: `calendly` / `started` / `mental-day-of` render a `<Body size={11} tone={color.textTertiary}>` line (`CALENDLY_MANAGED_COPY` / `SESSION_STARTED_COPY` / `MENTAL_DAY_OF_COPY`); `change` renders a row of `Button variant="dangerOutline" height={44}` "Cancel reservation" and, when `move` and `onMove`, `Button variant="outline" height={44}` "Move", each `flex: 1`, `boxShadow: 'none'`.

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
  plus a render case: `change` shows "Cancel reservation" and, with `onMove`, "Move"; without `onMove`, no Move; `started` shows "This session has already started."; `mental-day-of` shows "A 1:1 can be cancelled in the app up to the day before.". Screens: in `Reservations.test.js` and `MySchedule.test.js` pin the clock for EVERY test in the file (a file-level `beforeEach` with `jest.useFakeTimers('modern'); jest.setSystemTime(new Date('2026-11-09T18:00:00Z'))` and `afterEach` `jest.useRealTimers()`; the describes that set their own time keep doing so), since the rows are dated Nov 10-24: this also repairs the three tests that fail on develop today on the real clock (Global Constraints, Baseline). A helper `sheetButton(r, label)` clicks a button inside `[data-portal-overlay]` (the row and the sheet both say "Cancel reservation"). Cases: `a same-day row before its start offers Cancel; one that has started says so` (training rows, Nov 9 at 4:00 PM and Nov 9 at 9:00 AM; the row factories default to `type 'mental'`: one "Cancel reservation", "This session has already started.", no "Same-day"); `the cancel asks why and sends the reason` (open, `r.click('Sick')`, `sheetButton(r, 'Cancel reservation')` -> `mockCancels` `[['b1', { reason: { category: 'sick', note: null } }]]`); the series cases pick Sick first and expect `[id, { cancelledVia: 'series', silent: true, reason: { category: 'sick', note: null } }]` per week and `[['a1_1', { reason: ... }]]` for "Cancel just this one"; MySchedule asks "Why can't you make it?", Reservations "Why can't Jordan make it?" (Review Focus 7, 9). Copy pins: every "You can cancel until the day before." (WaitlistAction.test.js 26-33 and 96, MySchedule.test.js 32 and 100, Reservations.test.js 56-57) becomes "You can cancel or move it any time before it starts."; the confirmation notes become `'Plans change? Cancel or move it in the app any time before it starts. The token comes back.'` and `'Plans change? Cancel or move it in the app any time before it starts.'`; AthleteDashboard reads `'Nothing is on your schedule right now - book any open block. Cancel any time before a session starts and the token comes back.'`; add `cancelReasonCopy('moved') === 'Moved to another session.'` to `components/BookingReasons.test.js`.
- [ ] **Step 2: Run** `CI=true npx react-scripts test --watchAll=false src/portal/components/BookingRowActions src/portal/screens/Reservations src/portal/screens/MySchedule src/portal/components/WaitlistAction src/portal/components/BookingReasons src/portal/screens/AthleteDashboard src/portal/hooks/index.test src/portal/screens/SpecialistBooking src/portal/screens/BookSession`. Expected: FAIL on the new cases and copy.
- [ ] **Step 3: Implement.** `BookingRowActions.js` per Interfaces. Both screens: the action becomes `past || rowCancelled ? null : waitlisted ? <OnWaitlist .../> : <BookingRowActions row={item} onHold={...} onCancel={() => onCancelRequest(item)} />` (Reservations: `member.onHold` through `MemberList`; MySchedule: `data?.onHold` through `ScheduleBody`); delete `dayOf` and the day-of `Body`; `CancelSheet` becomes `MemberCancelSheet` with `name` (Reservations `cancelTarget.athleteName`, MySchedule none), `onConfirm={(reason) => cancel(cancelTarget.bookingId, { reason })}`, `onConfirmSeries={(reason) => cancelSeries([cancelTarget, ...cancelTarget.later], cancel, reason)}`; fix both header comments. Imports, both screens: `import CancelSheet from '../components/CancelSheet';` becomes `import MemberCancelSheet from '../components/MemberCancelSheet';`, `import { CALENDLY_MANAGED_COPY, cancelReasonCopy } from '../components/BookingReasons';` becomes `import { cancelReasonCopy } from '../components/BookingReasons';` (BookingRowActions owns the Calendly line now), add `import BookingRowActions from '../components/BookingRowActions';`, and drop any other import eslint then reports unused (`Button` if nothing else in the file uses it). The copy edits exactly as Step 1 pins them (`WaitlistAction.js` keeps `${who}` and the Elite variant without the token clause; its R3 comment loses "they could not cancel"); `cancelReasonCopy` gets `if (reason === 'moved') return 'Moved to another session.';`.
- [ ] **Step 4: Run** the Step 2 command. Expected: PASS. `grep -rn --exclude=*.test.js "until the day before\|Cancelling with notice" src/portal`: no output (the "Same-day cancellations" check waits for U4, which removes `BookSession.js`'s last one). eslint on the changed files: clean.
- [ ] **Step 5: CRLF and commit** - message `feat(bookings): Cancel until the start on Reservations and My Schedule; new policy copy`, trailer.

### Task U4: One bookability rule for the Book tab and the move picker

LANE U. Depends on: U3.

**Files:**
- Create: `data/bookability.js`, `data/bookability.test.js`
- Modify: `screens/BookSession.js` (delete `formatCapacity` 55-58; `DaySessionList` 620-675 and the `held` footnote 722; `scheduleName` at 581), `screens/BookSession.test.js` (796, 803-811, 821)

**Interfaces:**
- Consumes: `positionForDate`, `periodFor`, `eliteDailyCapHit` (`data/packages.js`); `capacityFor` (`data/season.js`); `sessionStarted`; `reservedEligible`; `isHiddenSession`.
- Produces (C5):
  - `formatCapacity(session)` - moved verbatim from `BookSession.js`.
  - `cardFacts(session, { tokens = null, athlete = null, handicapUnread = false, checkStarted = false, bookedSessionIds = [], justFilledId = null, now = new Date() }) -> { cap, isFull, rowTokens, hasGrace, tokensSpent, displayOnly, started, held, notTheirs }` - exactly the computations now inline at `BookSession.js` 640-669 (`started` passes `now` to `sessionStarted`).
  - `positionWithFreed(tokens, from, dateISO, anchorDay) -> tokens` - `positionForDate(tokens, dateISO)`, then: null, unlimited, no `from` or `from.comp` (a comp never spent the period, C1): as is; `from.graceTokenId` and (`from.graceExpiresAt` absent or `>= dateISO`): `grace` plus `{ id: from.graceTokenId, expiresAt: from.graceExpiresAt ?? null }`; `from.graceTokenId` otherwise: as is; `from.periodKey === periodFor(dateISO, anchorDay).periodKey`: `left + 1`; else as is.
  - `moveTargetOpen(session, { from, tokens, athlete, bookedSessionIds, waitingSessionIds = [], pkg, bookings, anchorDay, now }) -> boolean` - false when `session.id === from.id`, a different type, `status 'cancelled'`, hidden, `source 'calendly'`, or `waitingSessionIds.includes(session.id)` (the athlete is on its waitlist: the Book tab offers Leave there, Decided 7); else `cardFacts` with `checkStarted: true` and `tokens: from.comp ? null : positionWithFreed(tokens, from, session.date, anchorDay)` must show none of `displayOnly, started, isFull, held, notTheirs, tokensSpent`; and `!eliteDailyCapHit(pkg, session.type, session.date, bookings.filter((b) => b.id !== from.bookingId))` (the athlete's booking rows carry the doc `id`; `from` is a screen row, whose booking id is `bookingId`).

- [ ] **Step 1: Write the failing tests** `data/bookability.test.js`: `cardFacts` - full by capacity and by `justFilledId`; a grace token valid on the date keeps `tokensSpent` false and one expiring the day before does not; `started` only with `checkStarted`; a held block that has started reads `started` not `held`; `handicapUnread` never sets `notTheirs`; display-only sets none of started/held/notTheirs. `positionWithFreed` (tokens `{ left: 0, grace: [], unlimited: false }`, anchor 1): same period `left 1`; other period unchanged; a comp `from` in the same period unchanged; freed grace `expiresAt '2026-11-20'` on `'2026-11-19'` adds it and on `'2026-11-21'` does not (Review Focus 5); unlimited unchanged; null null; anchor 15: from `periodKey '2026-10-15'`, date `'2026-11-16'` unchanged (Review Focus 2). `moveTargetOpen`: a table of one open session and one case per exclusion (own session, other type, cancelled, hidden, Calendly, waiting on it, display-only, started, full, held, reserved over the handicap, tokens spent, Elite one-per-day with another booking that day); an Elite booking moved 4 PM to 6 PM on the same day is open (its own row, `id` equal to `from.bookingId`, is left out of the one-per-day count); comp ignores spent tokens.
- [ ] **Step 2: Run** `CI=true npx react-scripts test --watchAll=false src/portal/data/bookability`. Expected: FAIL, missing module.
- [ ] **Step 3: Implement** `bookability.js`, then refactor `DaySessionList` to `const { cap, isFull, rowTokens, hasGrace, tokensSpent, displayOnly, started, held, notTheirs } = cardFacts(session, { tokens, athlete, handicapUnread, checkStarted, bookedSessionIds, justFilledId });` keeping `waiting`, `refusal`, `canWaitlist`, `tappable` and the JSX as they are; copy: `heldNote` -> `` `${heldName} is booked in. Cancel or move it from ${scheduleName} if plans change.` ``, delete `heldSameDayNote` and its comment and use `heldNote` in the footnote; line 581 `scheduleName={isParent ? 'Reservations' : 'My Schedule'}`; drop imports eslint reports unused. `BookSession.test.js`: 796 expects "Jordan is booked in. Cancel or move it from My Schedule if plans change."; the 803 test is renamed "today's held block that has already started reads Started, not Booked; one still to come can be cancelled or moved" and expects that same line and `not.toContain('Same-day')`; 821 expects "Ava is booked in. Cancel or move it from Reservations if plans change.".
- [ ] **Step 4: Run** `CI=true npx react-scripts test --watchAll=false src/portal/data/bookability src/portal/screens/BookSession src/portal/screens/SpecialistBooking`. Expected: PASS with no change to `BookSession.test.js` beyond 796, 803-811 and 821 (the refactor's safety net). `wc -l src/portal/screens/BookSession.js` below 1114. `grep -rn --exclude=*.test.js "until the day before\|Same-day cancellations\|Cancelling with notice" src/portal`: no output.
- [ ] **Step 5: CRLF and commit** - message `refactor(bookings): the per-card bookability rule moves to data/bookability.js`, trailer.

### Task U5: Move - hook, sheet, buttons

LANE U. Depends on: U4.

**Files:**
- Modify: `hooks/callables.js` (`callMoveBooking`, with a JSDoc line naming C2)
- Create: `hooks/move.js`, `hooks/move.test.js`, `components/MoveSheet.js`, `components/MoveSheet.test.js`
- Modify: `screens/Reservations.js`, `screens/MySchedule.js` (move state, `onMove`, the sheet), `screens/Reservations.test.js`, `screens/MySchedule.test.js` (add `jest.mock('../hooks/move', ...)`)

**Interfaces:**
- Consumes: C2; `moveTargetOpen` (U4); `liveTokens` (exported by `hooks/index.js`); from `./live`: `isLive`, `fetchCurrentUser`, `fetchAthlete`, `fetchBookings`, `fetchPackage`, `fetchHousehold`, `fetchGraceTokensByAthlete`, `fetchSessionsInRange`; `fetchWaitlistByAthlete` (`hooks/waitlist.js`); `openThrough`, `academyDateISO`, `parseTimeToMinutes`; `windowMonthsFor`, `normalizeAnchorDay`; `handicapOf`; `dayLabel` (`data/season.js`); `bump`; `useSeedResource`; `reasonCopy`; `SESSION_STARTED_COPY`; C4 `dayTimeLabel`, `ALREADY_CHANGED_COPY`; `firstName` (`data/whatsNext.js`).
- Produces (C5):
  - `loadMoveOptions(row, now = new Date())` - the caller (`fetchCurrentUser`): a parent reads `row.athleteId` with `fetchBookings(id, { householdId })` and `fetchWaitlistByAthlete(id, { householdId })`, an athlete login its own `athleteId`; athlete, package, household, grace tokens; `today = academyDateISO(now)`; `tokens = row.comp ? null : await liveTokens(athlete, pkg, bookings, anchorDay, today)`; `from = { ...row, graceExpiresAt }` (the expiry of `row.graceTokenId` from the grace read); `bookedSessionIds` = the `sessionId`s of the athlete's non-cancelled bookings; `waitingSessionIds` = the `sessionId`s of its waitlist entries; sessions `fetchSessionsInRange(today, openThrough(now, windowMonthsFor(pkg)))` kept by `moveTargetOpen(s, { from, tokens, athlete: { name, handicap: handicapOf(athlete) }, bookedSessionIds, waitingSessionIds, pkg, bookings, anchorDay, now })`; sorted by date then `parseTimeToMinutes`; grouped `{ days: [{ iso, label: dayLabel(iso, today), sessions: [MoveOption] }] }` (`name` = `s.label` or the type noun, `capacityLabel` = `capacityFor(s).label`).
  - `useMoveOptions(row, reloadKey = 0)` - `useSeedResource(live ? null : { days: [] }, live ? { source: () => loadMoveOptions(row), deps: ['move-options', row.bookingId, reloadKey] } : undefined)`.
  - `moveBooking({ bookingId, toSessionId })` - seed: `{ bookingId, toSessionId, simulated: true }`; live: `callMoveBooking(...)`, then `bump('bookings')`, `bump('sessions')`, return the result.
  - `MoveSheet({ row, name, onClose, onMoved })`: title `moveTitle(row.type)` = "Move to another Training block" / "Tour event" / "Phil session"; loading "Finding open sessions..."; load error "Open sessions didn't load. Check your connection and try again."; empty `MOVE_EMPTY_COPY = 'No open sessions like this in your booking window.'`; options as `SessionCard`s under day labels; a tap shows `moveQuestion({ name: firstName(name), from: row, to: option })` = "Move Jordan from Tue Nov 10, 4:00 PM to Thu Nov 12, 4:00 PM?" (no name: "Move from ... to ...?") with `Button` "Move" (loading "Moving") and `Button variant="outline"` "Keep it" (back to the list); while the call runs Move is `loading` and a second tap does nothing; success calls `onMoved(result)`. A failure never claims more than it knows:
    - a refusal about the target (C2 #8, #9, #11-#23): back to the list, which reloads (`reloadKey + 1`), under the line `` `${moveRefusalCopy(err)} Nothing was changed.` `` (Review Focus 8);
    - a refusal about the booking itself (#3-#7, #10): that line and only a "Close" button (`onClose`), except `not-confirmed`, which reads `ALREADY_CHANGED_COPY` alone (another device changed it; nothing here did) and calls `bump('bookings')`; `booking-missing` also calls `bump('bookings')`;
    - an error with no `reason` (unavailable, deadline-exceeded, internal: the move may have committed): "We couldn't confirm the move. Check your list before trying again.", `bump('bookings')`, `bump('sessions')`, and only "Close".
  - `moveRefusalCopy(err)` = own map for `not-confirmed` (`ALREADY_CHANGED_COPY`), `mental-no-move`, `already-started` (`SESSION_STARTED_COPY`), `same-session`, `session-missing`, `different-type`, `session-cancelled`, `display-only`, `session-past` ("That session has already started."), `booking-missing`, `not-yours` (C2 messages), else `reasonCopy(err.reason)`, else `err.message`, else "The move didn't go through.".
  - Screens: `onMove={() => setMoveTarget({ ...item, athleteName: member.name })}` on `BookingRowActions`; `{moveTarget ? <MoveSheet row={moveTarget} name={moveTarget.athleteName} onClose={() => setMoveTarget(null)} onMoved={() => setMoveTarget(null)} /> : null}` (MySchedule without a name).

- [ ] **Step 1: Write the failing tests.** `hooks/move.test.js` (mock `./live`, `./waitlist`, `./index` with `liveTokens: jest.fn()`, `./callables`, `./invalidate`; plain functions, as `live.cancel.test.js`): a parent's load calls `fetchBookings('jordan', { householdId: 'h1' })`, `fetchWaitlistByAthlete('jordan', { householdId: 'h1' })` and `fetchSessionsInRange(today, openThrough(now, 1))`; of sessions [open training, other type, cancelled, hidden, full, started-today, the athlete's own other booking, one the athlete waits on, reserved over the handicap, the moved booking's own session] only the open one is returned, grouped under its day; an Elite athlete moving 4 PM to 6 PM on the same day is offered the 6 PM session; a December session is offered when `liveTokens` gives the next period a token and not when it reads `left 0`; a comp row never calls `liveTokens` and offers the December session anyway; an athlete login reads its own `athleteId`; `moveBooking` calls `callMoveBooking({ bookingId: 'b1', toSessionId: 's2' })` once and bumps `bookings` and `sessions`; with `isLive()` false it resolves `{ simulated: true, ... }` and calls nothing (Review Focus 10). `MoveSheet.test.js` (mock `../hooks/move`): the three titles; the empty line; options under their day; a tap shows the question; Move calls `moveBooking` once on a double click and then `onMoved` (Review Focus 3); a refusal `{ reason: 'full' }` shows "This session just filled. Nothing was changed." over the list, loads the options a second time, and does not call `onMoved` (Review Focus 8); `{ reason: 'already-started' }` shows "This session has already started. Nothing was changed." and a Close button (Review Focus 4); `{ reason: 'not-confirmed' }` shows "This booking was already changed." without "Nothing was changed." and bumps `bookings`; an error with no reason shows "We couldn't confirm the move. Check your list before trying again." and bumps both; Keep it returns to the list; nothing matches `/token/i`; `moveRefusalCopy({ reason: 'mental-no-move' }) === "A 1:1 can't be moved in the app."`. Screens: a confirmed future training row shows "Move"; a Calendly, mental, started, or on-hold non-comp row shows none; tapping Move opens the sheet with the title; choosing and moving calls the mocked `moveBooking` with `{ bookingId, toSessionId }` and closes the sheet.
- [ ] **Step 2: Run** `CI=true npx react-scripts test --watchAll=false src/portal/hooks/move src/portal/components/MoveSheet src/portal/screens/Reservations src/portal/screens/MySchedule`. Expected: FAIL, missing modules.
- [ ] **Step 3: Implement** per Interfaces.
- [ ] **Step 4: Run** the whole frontend suite: `CI=true npx react-scripts test --watchAll=false`. Expected: all suites pass (the three baseline failures are gone since U3). `npx eslint src/portal --max-warnings=0`: clean. `CI=true npm run build`: "Compiled successfully".
- [ ] **Step 5: CRLF and commit** - message `feat(bookings): Move a booking from Reservations and My Schedule`, trailer.

---

### Task S1: Cancelled and moved rows under the roster

LANE S. Depends on: Task 0.

**Files:**
- Create: `frontend/src/portal/hooks/cancelledBookings.js`, `hooks/cancelledBookings.test.js`, `components/CancelledRows.js`, `components/CancelledRows.test.js`, `screens/Roster.bookchange.test.js`
- Modify: `screens/Roster.js` (one import; the mount INSIDE the roster's `<div style={{ padding: '0 22px 20px' }}>` (opened at 544), after the athlete map's closing `})}` at line 699 and before that div's `</div>` at 700, so the greyed rows keep the 22px gutter; anchor: `        })}\n      </div>\n\n      {cancelSheetOpen ? (`), and add `jest.mock('../hooks/cancelledBookings', ...)` to `screens/Roster.readonly.test.js`, `Roster.clubhead.test.js`, `Roster.reserved.test.js` and `TourScoreSheet.test.js` (it renders `SessionAttendance` live: `isLive` mocked true, `sessionId="2026-11-07-1"`)

**Interfaces:**
- Consumes: C4 `coachLine`, `movedToSessionId`, `CANCEL_CATEGORIES`; from `./live`: `isLive`, `fetchAthlete`, `fetchSessionsByIds`, `wrap`, `ERR`, `LiveDataError`; `useInvalidation`, `useSeedResource`; `AthleteRow`.
- Produces (C5): `fetchCancelledBySession(sessionId)` - `getDocs(query(collection(db, 'bookings'), where('sessionId', '==', sessionId), where('status', '==', 'cancelled')))` (the existing `(sessionId, status)` index; coaches read any booking); `liveCancelledRows(sessionId)` - rows with `coachLine(...) != null` only, names by `fetchAthlete` (`Promise.allSettled`; a failed name is `null`), moved targets by one `fetchSessionsByIds`, sorted by name: `[{ bookingId, athleteId, name, line }]`; `useCancelledBookings(sessionId)` - live and a session id: that source with deps `['cancelled-rows', sessionId, bookingsGen]`, else `[]`; `CancelledRows({ sessionId })` - nothing when the list is empty or loading or failed; else a `div` `aria-label="Cancelled or moved"` of `AthleteRow name={row.name ?? 'Name unavailable'} meta={row.line} avatarSize={42} nameSize={16} style={{ opacity: 0.5 }}`, no `trailing`. Roster mount: `        {live && !sessionCancelled ? <CancelledRows sessionId={sessionId} /> : null}`.

- [ ] **Step 1: Write the failing tests.** `cancelledBookings.test.js` (mock `firebase/firestore` with plain functions and `./live`): the query filters `sessionId` and `status 'cancelled'`; of rows [member+sick, member+other+'dentist', member with no category, series+school, session-cancelled, double-spend, `ava` moved to `ava_s9`] the result is the four with lines `Cancelled · Sick`, `Cancelled · Other: dentist`, `Cancelled · School`, `Moved to <s9 day, time>` and nothing for the rest; a moved row whose target session is gone reads `Moved`; a failed name keeps the row with `name: null`. `CancelledRows.test.js` (mock the hook): two rows render their names and lines, no IN or OUT button; an empty list renders nothing. `Roster.bookchange.test.js` (copy the mock block of `Roster.readonly.test.js`): live with a cancelled row in the mocked hook shows "Cancelled · Sick" below the roster, inside the padded roster block, and the counters count only the live rows; `sessionStatus 'cancelled'` hides it.
- [ ] **Step 2: Run** `CI=true npx react-scripts test --watchAll=false src/portal/hooks/cancelledBookings src/portal/components/CancelledRows src/portal/screens/Roster src/portal/screens/TourScoreSheet`. Expected: FAIL, missing modules.
- [ ] **Step 3: Implement** per Interfaces; add the four existing tests' mock `jest.mock('../hooks/cancelledBookings', () => ({ useCancelledBookings: () => ({ data: [], loading: false, error: null }), markOrRecheck: async (mark, id, status) => { await mark(id, status); return false; } }))`.
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
- [ ] **Step 4: Run** `CI=true npx react-scripts test --watchAll=false src/portal/hooks/cancelledBookings src/portal/screens/Roster src/portal/screens/TourScoreSheet src/portal/components/CancelledRows`. Expected: PASS. eslint clean; `git diff --stat src/portal/screens/Roster.js` under 12 lines in all.
- [ ] **Step 5: CRLF and commit** - message `feat(roster): a stale IN/OUT on a just-cancelled athlete says so and refreshes`, trailer.

---

### Task W1: Website FAQ

LANE W. Depends on: none.

**Files:**
- Modify: `C:\Users\Mac\Desktop\rypacadapp\ryp-academy-site\public\faq.html` (line 113, the `<p data-ed="faq-40">` text)

- [ ] **Step 1: Branch** - `git -C C:/Users/Mac/Desktop/rypacadapp/ryp-academy-site switch -c faq/cancel-move` (from `main`, clean tree; stop if it is not clean).
- [ ] **Step 2: Edit** with the helper (the file is LF and stays LF): the paragraph text between `<p data-ed="faq-40">` and `</p>` becomes exactly `Cancel in the portal any time before the session starts and the token comes back, ready for any other open block. You can also move a booking to another open session. A session missed without cancelling uses its token.`
- [ ] **Step 3: Check** - `grep -c "any time before the session starts" public/faq.html` prints `1`; `grep -c "by the day before" public/faq.html` prints `0`; `git diff --stat` shows one line changed; `file public/faq.html` does not say CRLF.
- [ ] **Step 4: Commit (no push)** - `git add public/faq.html`; `git commit -m "FAQ: cancel any time before the session starts, and Move" -m "The new answer drops 'Tokens refresh on the 1st of each month and unused tokens don't carry over.' (periods run from each family's anchor day); restore the carry-over half if the owner wants it." -m "The answer is the spec's exact copy and says nothing about 1:1s with Yannick, which stay cancellable only up to the day before (his consent form); add '(1:1s with Yannick: by the day before)' if the owner wants it said here." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`. It ships with or after the app (Release).

---

### Task I1: Merge and gates

LANE lead. Depends on: F4, R2, U5, S2, W1.

- [ ] **Step 1: Merge** in `wt-bookchange`: `git merge --no-ff bookchange/fn -m "Merge bookchange/fn: moveBooking and notice copy"`, then `bookchange/staff`, then `bookchange/ui` (each with its own `-m` and the trailer as a second `-m`). Expected: no conflicts (no shared file). Then tear down the three worktrees (Task 0 Step 6 teardown).
- [ ] **Step 2: Frontend** - `cd frontend && CI=true npx react-scripts test --watchAll=false` (all suites pass; the three baseline clock failures are gone since U3), `npx eslint src/portal --max-warnings=0` (no output), `CI=true npm run build` ("Compiled successfully").
- [ ] **Step 3: Functions** - `cd functions && for f in portal/*.test.js; do node "$f" || exit 1; done` (every file `N passing`), `node test/check-exports.js` (`ok  21 functions exported, ...`), `npx eslint .` (clean).
- [ ] **Step 4: Rules** - emulator up as R1 Step 2, then, outside 22:30-01:30 Chicago, `FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 node scripts/verify-rules.mjs`: `ALL PASS (both passes)`.
- [ ] **Step 5: House checks** - `wc -l` on every new file: each under 500; `wc -l functions/index.js functions/portal/lib.js functions/portal/notices.js frontend/src/portal/data/billingHub.js`: each under 500; `git diff --stat a1c2b85 -- frontend/src/portal/hooks/index.js frontend/src/portal/hooks/live.js frontend/src/portal/screens/Roster.js frontend/src/portal/data/seed.js frontend/src/portal/screens/AthleteDashboard.js functions/portal/lib.js`: small, matching the tasks; `grep -rn --exclude=*.test.js "until the day before\|Same-day cancellations\|Cancelling with notice\|Cancel until the day before\|could not cancel" frontend/src functions/portal functions/test`: no output; `git diff a1c2b85 | grep -nE "[0-9]{3}[-. ][0-9]{3}[-. ][0-9]{4}"`: no output; `file` on each changed file: CRLF (the site file excepted).

### Task I2: Browser QA on the lane emulator

LANE lead. Depends on: I1.

- [ ] **Step 1: Emulators** - PREFLIGHT (Task 0 Step 7), then in the background from `wt-bookchange`: `npx firebase-tools emulators:start --only firestore,auth,functions --config firebase.bookchange.json --project rypacad 2>&1 | tee <scratchpad>/bookchange-emulators.log`. When up: `grep -c "Trying to access secret" <scratchpad>/bookchange-emulators.log` prints `0` (else stop everything: the emulator is reading production secrets).
- [ ] **Step 2: Notification replay** - `cd functions && FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 VERIFY_FUNCTIONS_ORIGIN=http://127.0.0.1:5006 node test/verify-notifications.js` (it wipes this instance; run it before the fixture). Expected: its final all-pass line.
- [ ] **Step 3: Fixture** - write `<scratchpad>/bookchange-qa-fixture.mjs` (imports `resolveTarget`, `commit`, `docName`, `fsFields` from `file:///C:/Users/Mac/Desktop/rypacadapp/wt-bookchange/scripts/lib/firestore-rest.mjs`; refuses to run when Chicago time is before 07:00 or after 20:00 or when `D + 5` is in the next month) and run it, once Step 4 has the app up and signed in (so item 1 starts as soon as the fixture lands), with `FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 node <scratchpad>/bookchange-qa-fixture.mjs`. `D` = today in Chicago, `T(m)` = the Chicago clock `m` minutes from now as `'h:mm AM'`, `M1` = the 2nd of next month, `SAT` = the first Saturday after `D+1`:
  - `packages/t-6 { name: '6 tokens', kind: 'tokens', tokens: 6 }`, `packages/elite { name: 'Elite', kind: 'elite', tokens: null }`
  - `households/qa-hh { name: 'QA family', periodAnchorDay: 1 }`, `households/qa-hold { name: 'QA hold family', periodAnchorDay: 1, membership: { status: 'past_due' } }`
  - `athletes/qa-tok { name: 'Avery QA', householdId: 'qa-hh', packageId: 't-6', billing: { status: 'active' }, handicap: 12 }`, `qa-elite { name: 'Blake QA', ..., packageId: 'elite', handicap: 3 }`, `qa-comp { name: 'Casey QA', ..., packageId: 't-6', billing: { status: 'pending' } }`, `qa-hold { name: 'Drew QA', householdId: 'qa-hold', packageId: 't-6', billing: { status: 'active' } }`
  - `users/qa-parent { role: 'parent', householdId: 'qa-hh', athleteId: null, displayName: 'QA Parent', email: 'qa-parent@example.test' }`, `qa-athlete { role: 'athlete', athleteId: 'qa-tok', householdId: 'qa-hh' }`, `qa-hold-parent { role: 'parent', householdId: 'qa-hold' }`, `qa-coach { role: 'coach', staff: true, displayName: 'QA Coach' }`
  - sessions (training, capacity 12, `status 'scheduled'` unless said; `booked` = the live rows below unless said): `qa-started` D `T(-60)`; `qa-soon` D `T(+15)`; `qa-later` D `T(+180)`; `qa-m0` D `T(+120)` `type 'mental'` capacity 1; `qa-w1` D+1 5:00 PM; `qa-m1` D+1 10:00 AM `type 'mental'` capacity 1; `qa-a` D+2 4:00 PM; `qa-full` D+2 5:00 PM capacity 1 booked 1; `qa-b` D+3 4:00 PM; `qa-res` D+4 3:00 PM `maxHandicap 5`; `qa-cxl` D+4 4:00 PM `status 'cancelled'`; `qa-race` D+4 5:00 PM capacity 2 booked 1; `qa-hid` D+4 6:00 PM `hidden true`; `qa-wl` D+5 6:00 PM capacity 1; `qa-wl2` D+5 7:00 PM; `qa-w2` D+8 5:00 PM; `qa-w3` D+15 5:00 PM; `qa-tour` SAT 10:00 AM `type 'tournament'`; `qa-tour2` SAT+7 10:00 AM `type 'tournament'`; `qa-dec` M1 4:00 PM; `qa-dec2` M1+1 4:00 PM
  - bookings (`periodKey` from the session date, anchor 1; `createdAt` now; `householdId` the athlete's; `createdBy 'qa-parent'` unless said): Avery `chargedFrom 'period'`, confirmed: `qa-tok_qa-started`, `qa-tok_qa-soon`, `qa-tok_qa-later`, `qa-tok_qa-a`, `qa-tok_qa-wl` (five this month, so Avery keeps a token in hand), and `qa-tok_qa-b` `status 'cancelled'`, `cancelReason 'member'`, `cancelCategory 'school'`, `cancelledBy 'qa-parent'`; Blake `chargedFrom 'elite'`, confirmed: `qa-elite_qa-a`, `qa-elite_qa-b`, `qa-elite_qa-tour`, `qa-elite_qa-w1`, `qa-elite_qa-w2`, `qa-elite_qa-w3`, `qa-elite_qa-m0` and `qa-elite_qa-m1` (`type 'mental'`); Casey `qa-comp_qa-a` (`comp: true`, `chargedFrom 'period'`, `createdBy 'staff'`); Drew `qa-hold_qa-b`. So `qa-b` is booked 2 (Blake, Drew; Avery's row there is cancelled) and `qa-wl` is booked 1 (Avery).
  - waitlist: `waitlist/qa-wl_qa-elite { sessionId: 'qa-wl', athleteId: 'qa-elite', householdId: 'qa-hh', date: D+5, periodKey, createdBy: 'qa-parent', joinedAt: now }` (Blake waits on Avery's full block).
- [ ] **Step 4: App** - add to `C:\Users\Mac\Desktop\rypacadapp\.claude\launch.json` a configuration `bookchange-qa`: `runtimeExecutable "cmd"`, `runtimeArgs ["/c", "cd /d C:/Users/Mac/Desktop/rypacadapp/wt-bookchange/frontend && npx react-scripts start"]`, `env { PORT: "3009", BROWSER: "none", REACT_APP_USE_EMULATORS: "true", REACT_APP_PORTAL_LIVE_DATA: "true", REACT_APP_AUTH_EMULATOR_PORT: "9104", REACT_APP_FIRESTORE_EMULATOR_PORT: "8085", REACT_APP_FUNCTIONS_EMULATOR_PORT: "5006" }`, `port 3009`; `preview_start` it (before Step 3's fixture runs). Sign in with `await window.__rypTestAuth.signInAs('<uid>')` (javascript tool) and navigate by URL. If "One quick question about research" appears, press "Skip for now".
- [ ] **Step 5: Checklist** (one line each in the session report, with what was seen; Firestore state read with `GET http://127.0.0.1:8085/v1/projects/rypacad/databases/(default)/documents/<path>` and `Authorization: Bearer owner`; an "owner REST" write is a PATCH with that header):
  A REST commit "as `qa-parent`" below means one `documents:commit` on the emulator with an unsigned token built like `token()` in `scripts/verify-rules.mjs` (project `rypacad`, `sub`/`user_id` `qa-parent`), carrying the `live.js` cancel shape (the booking update plus the session's `booked - 1`).
  1. Within 10 minutes of the fixture, `qa-parent` at `/portal/reservations`: Avery's `qa-started` row reads "This session has already started." with no buttons; `qa-soon`, `qa-later`, `qa-a`, `qa-wl` show "Cancel reservation" and "Move"; Casey's comp row shows both; Blake's `qa-m0` (a 1:1 today) reads "A 1:1 can be cancelled in the app up to the day before." with no buttons and his `qa-m1` (tomorrow) shows "Cancel reservation" and no "Move"; no "Same-day" line anywhere. Do not reload.
  2. After the start (Review Focus 4): once `qa-soon`'s start has passed (about 15 minutes after the fixture), on the same unreloaded list tap its Cancel -> Sick -> confirm: the sheet says "This session has already started."; the booking is still confirmed. A REST commit as `qa-parent` cancelling `qa-tok_qa-started` answers 403.
  3. Same-day cancel: Avery's `qa-later` -> Cancel: "Why can't Avery make it?", the confirm inert until Sick; confirm. The row reads Cancelled; `bookings/qa-tok_qa-later` has `cancelReason 'member'`, `cancelCategory 'sick'`, `cancelledAt`; a ledger row `notifications/booking-cancelled_qa-tok_qa-later_<ms>` exists (`<ms>` = that `cancelledAt`, C3).
  4. Other with a note: Blake's `qa-a` -> Other, "dentist" -> confirm; `cancelNote 'dentist'`.
  5. Move across periods: Avery's `qa-a` -> Move: the list holds `qa-dec`, `qa-dec2`, `qa-b`, `qa-later`, `qa-race` and `qa-wl2` (among others), and none of `qa-full`, `qa-res`, `qa-cxl`, `qa-hid`, `qa-tour`, `qa-tour2`, `qa-started`, `qa-soon`, `qa-wl`, `qa-m0`, `qa-m1`; pick `qa-dec` -> "Move Avery from <D+2>, 4:00 PM to <M1>, 4:00 PM?" -> Move. Old row `cancelReason 'moved'`, `movedTo 'qa-tok_qa-dec'`, no `booking-cancelled_qa-tok_qa-a*` ledger row; new row `movedFrom 'qa-tok_qa-a'`, `createdVia 'move'`, `periodKey` next month's, `chargedFrom 'period'`; `notifications/booking-confirmed_qa-tok_qa-dec` exists; `qa-a.booked` went down one and `qa-dec.booked` is 1. The old row reads "Moved to another session.".
  6. Move onto a row cancelled earlier: Avery's `qa-dec` row -> Move -> `qa-b`. `bookings/qa-tok_qa-b` is confirmed with `movedFrom 'qa-tok_qa-dec'`, a `rebookedAt`, a new `createdAt`, and no `cancelCategory`, `cancelReason` or `cancelledAt`; a ledger row `booking-confirmed_qa-tok_qa-b_move_<createdAt ms>` exists (sent by `onBookingCancelled`'s re-confirm branch, C2 Notices).
  7. Comp (Review Focus 11): Casey's `qa-a` -> Move -> `qa-dec2`: the new row has `comp: true`, `chargedFrom 'period'`; nothing about a token appears in the sheet. Then owner REST sets `athletes/qa-comp` `billing.status 'active'`; reload; on `/portal/book` with Casey chosen, next month's count reads 6 of 6 left (the moved comp spends none).
  8. Handicap: Blake's `qa-b` -> Move lists `qa-res`; press Keep it, then close. (Avery's list in item 5 did not.)
  9. Tour event: Blake's `qa-tour` -> Move: the title reads "Move to another Tour event" and the list holds `qa-tour2` and no training block; Keep it, close.
  10. `qa-hold-parent`: Drew's `qa-b` row shows "Cancel reservation" and no "Move".
  11. Athlete login and the freed seat (Review Focus 7; spec §5 "the freed seat goes to the waitlist exactly as a cancel would"): `qa-athlete` at `/portal/schedule`: the `qa-b` row shows Cancel and Move; Cancel asks "Why can't you make it?" (Keep it). `qa-wl` -> Move -> `qa-wl2`: "Move from <D+5>, 6:00 PM to <D+5>, 7:00 PM?" -> Move. `bookings/qa-tok_qa-wl` is `cancelReason 'moved'` with `cancelledBy 'qa-athlete'`; `bookings/qa-tok_qa-wl2` has `createdBy 'qa-athlete'`, `movedFrom 'qa-tok_qa-wl'`. Within a few seconds the waitlist promotes Blake into the freed seat: `bookings/qa-elite_qa-wl` confirmed with `createdBy 'system'`, `waitlist/qa-wl_qa-elite` gone, a `notifications/promoted_*` ledger row for Blake. (The day-of half of R3 - nobody promoted on the session's own day - is `promotion.test.js`'s "no same-day promotion".)
  12. The last seat goes while the list is open (Review Focus 8): `qa-parent`, Avery's `qa-wl2` -> Move; the list shows `qa-race`; leave it open, owner REST sets `sessions/qa-race` `booked 2`; tap `qa-race` -> Move: "This session just filled. Nothing was changed." above the list, which reloads without `qa-race`; `bookings/qa-tok_qa-wl2` still confirmed, `qa-wl2.booked` and `qa-race.booked` unchanged (1 and 2). Close.
  13. Series (Review Focus 9): Blake's `qa-w1` -> Cancel: the sheet offers "Cancel this and 2 later weeks"; Sick; confirm the series. `qa-elite_qa-w1`, `_qa-w2`, `_qa-w3` are cancelled with `cancelCategory 'sick'` and `cancelledVia 'series'`; no `booking-cancelled_qa-elite_qa-w*` ledger row.
  14. Copy: `/portal/book` as `qa-parent` with Avery chosen, the `qa-b` block reads "Avery is booked in. Cancel or move it from Reservations if plans change."; book Avery into `qa-dec2`: the confirmation reads "Plans change? Cancel or move it in the app any time before it starts. The token comes back."
  15. Coach: `qa-coach` opens the D+2 4:00 PM block from the Sessions tab: the roster and its counters are empty; below, greyed and inside the roster's side margins, "Avery QA" "Moved to <M1>, 4:00 PM", "Blake QA" "Cancelled · Other: dentist", "Casey QA" "Moved to <M1+1>, 4:00 PM"; no IN/OUT on them. The D+1 5:00 PM block shows "Blake QA" "Cancelled · Sick".
  16. Stale tap: the coach opens the D+3 block (Avery, Blake, Drew); with that screen open, cancel `qa-tok_qa-b` by a REST commit as `qa-parent` with `cancelCategory 'family'` and the `cancelledAt` transform; tap IN on Avery: "Avery QA cancelled - list updated." and Avery appears greyed "Cancelled · Family conflict".
  17. Academy cancel hides the greyed list: set `sessions/qa-a.status 'cancelled'` (owner REST); the coach's D+2 roster shows the cancelled card and no greyed rows.
  18. `grep -c "Trying to access secret" <scratchpad>/bookchange-emulators.log` still prints `0`.
- [ ] **Step 6: Teardown** - `preview_stop`; stop the emulator task; confirm no orphan `java` emulator (by PID, never a pattern kill); remove the `bookchange-qa` launch entry.

## Release (the owner, after the lead's review; agents run none of this)

Staging and production share one backend. Every command runs from the `rypacad` checkout (`C:\Users\Mac\Desktop\rypacadapp\rypacad`, develop), never from a `wt-*` worktree: the functions read their production settings (Stripe mode, SMTP, the portal URL, the feedback channel) from `rypacad\functions\.env`, which no worktree has, so a deploy from a worktree passes lint and ships every function without them (checkout and every email break).

1. Merge `feat/booking-changes` into develop locally (in `rypacad`). **This release also ships Parallax intake swings and combine scores**: develop `6f8aa52` holds it unreleased (`origin/develop` and `origin/main` are `94d7e4d`) and this branch merged it at `8d0f6f8`. Its own order (rules first, then develop, its staging check, then develop:main; `docs/portal/plans/2026-11-11-parallax-combine/01-plan.md` Task 11 Step 3) fits inside the steps below: its rules ride step 3 and its staging check is added to step 4. If the owner wants combine held back, decide before this step.
2. `cd C:\Users\Mac\Desktop\rypacadapp\rypacad\functions`, then `npx firebase-tools deploy --only functions --project rypacad`. Then check the new callable answers. In PowerShell (single quotes, so the JSON arrives whole): `curl.exe -s -X POST -H "Content-Type: application/json" -d '{"data":{}}' https://us-central1-rypacad.cloudfunctions.net/moveBooking`. It prints a JSON error with `"status":"UNAUTHENTICATED"` and `"reason":"signed-out"` (it reads and writes nothing). A JSON error of any other kind still proves the function is publicly reachable (check the quoting). An HTML 403 page ("Your client does not have permission") means the function's public invoker binding is missing: stop there.
3. `cd C:\Users\Mac\Desktop\rypacadapp\rypacad`, then `npx firebase-tools deploy --only firestore:rules --project rypacad` (the booking-changes rules and the combine rules together).
4. `git push origin develop` (staging), then sign in on staging as the production test family's parent: Reservations, My Schedule and Book show the new copy and no "Same-day" line. The test family holds no booking and cannot get one (its athletes are `test: true`, which the rules refuse), so there is nothing of its own to cancel or move; the cancel and move paths were proven on the emulator (Task I2). Never cancel or move a real family's booking to test. Then combine's staging check (rypacad.ryptest.com reads production, so record nothing against a real athlete).
5. `git push origin develop:main`.
6. The site branch `faq/cancel-move`, the same day or after.

Do 2-5 in one sitting: from step 2 the confirmation emails say "cancel or move it in the app any time before it starts", which the app only offers from step 5, and until step 3 a cancel from the new app is refused (its reason fields always ride along).

Rollback, in reverse: the app first (redeploy the previous production build, or revert on develop and push develop:main), then the rules, then the functions. Never the rules while the new app is live (the old rules refuse every cancel it sends, so families cannot cancel at all), and never remove `moveBooking` while the new app is live (Move breaks).
