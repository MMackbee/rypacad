# Staff booking tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** The owner or ops adds, moves or cancels any non-test athlete's portal booking from the Admin screen, the session roster or the family's staff Billing view, with every charge, seat count and email decided on the server in one transaction.

**Architecture:** Three lanes in three worktrees, then one integration task.
- **Lane S** (functions) adds the `staffBookSession` callable: a pure decide module and a transactional handler, sharing small helpers with `moveBooking`. It also adds a staff mode to `moveBooking` (chosen by the caller's role), a `mental` refusal to `staffCancelBooking`, the widened re-confirm email gate, the started-session email copy and the downgrade trim's Free skip.
- **Lane C** (client shared pieces) adds pure data and copy modules, the hooks and the callable client, and the shared sheets under `components/staffBooking/`.
- **Lane E** (entry points) mounts those sheets on the Admin screen (a card, a new athlete screen and its route), the roster and the staff Billing view. It builds against Lane C's interfaces as stated below.

**Tech Stack:**
- Functions: Cloud Functions 1st gen (`firebase-functions/v1`), `firebase-admin` 12, Node 22, the `portal/tiny.js` runner and `portal/fake-firestore.js`.
- Frontend: CRA React 18, react-router-dom 6, jest with `screens/testRender.js`, date-fns.
- Firestore emulator for the rules probes and the walkthrough.

**Spec:** docs/portal/plans/2026-11-13-admin-tools/01-spec-admin-booking.md

**Base:** develop `5771750`. The spec cites lines at `770acb5`. Every range below was re-read at `5771750` and some have moved: `liveSessionAttendance` is now `hooks/index.js:3964-3987`, not `:3950-3972`.

## Global Constraints

**Repo and hygiene**
- Repo files are CRLF (`core.autocrlf=true`). Edit an existing file with a node normalize/restore script: read it, turn `\r\n` into `\n`, make anchored replacements that assert exactly one match, then put `\r\n` back. Never use `sed -i`. Check a file with `file <path>`.
- Every file stays under 500 lines, tests included.
  - Already over (touch only at the mount points named here): `screens/Roster.js` (973), `PortalRoutes.js` (1166), `hooks/index.js` (4311).
  - At the limit, **no net lines**: `functions/portal/lib.js` (497), `hooks/billing.js` (499).
  - Close to it: `components/TokenMeter.js` (481), `data/billingHub.js` (477, ends at most 480 here), `functions/index.js` (482, ends at most 492 here).
- Public repo: fixture names only (Jordan, Riley, Casey) in new code, tests and commits. Household ids are neutral (`hh1`, `hh2`).
- Commit trailer, on every commit: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Copy rules:
  - "Tour event", never "tournament", in user-facing copy.
  - Elite copy never mentions tokens.
  - Free copy never promises a token back.
- Functions code: JSDoc on every function and an 80-column limit, tests included (`eslint-config-google`).
- Frontend test mocks: use plain functions or set up `jest.fn` in `beforeEach`. CRA's `resetMocks` clears a `jest.fn()` defined at module scope before every test (the `hooks/staffCancel.test.js` pattern).

**Hands off**
- Never read `scripts/lib/prod-auth.mjs`, `frontend/.env`, `functions/.env*` or `functions/.secret.local`. Task I Step 3 overwrites the integration worktree's own `functions/.env`, `.env.local` and `.secret.local` without opening them.
- Never run anything against production.
- Never deploy, never push, never use `localhost:3000`.
- Never `taskkill /F /IM node.exe`: stop your own server by its PID only.
- No `firestore.rules` change.

**Gates**
- Functions (`cd functions`):
  - `node portal/<x>.test.js` for each test file touched;
  - `node test/check-exports.js`;
  - `npx eslint .`.
- Frontend (`cd frontend`):
  - `CI=true npx react-scripts test --watchAll=false <pattern>` (the full suite at integration);
  - `npx eslint src`. The only allowed error is the existing `src/setupTests.js:18` (`'globalThis'`);
  - `npm run build`.
- Scripts: `node --test scripts/test/*.test.mjs` (repo root, `npm run test:scripts`).
- Rules probes, on the local Firestore emulator only:
  - start the emulator with `npm run emulator`, or `npx firebase-tools emulators:start --only firestore --project rypacad`;
  - then run `node --env-file=scripts/emulator.env scripts/verify-rules.mjs`;
  - the booking-changes task records a FAIL and runs nothing between 22:30 and 01:30 Chicago time, so run outside that window.

## Review Focus

1. **A retried or double-tapped add.** A lost answer, a second tap, or two staff adding the same kid at once must give `already-booked` on the second call. Nothing is written twice and no token is counted twice. On the client, one tap makes one call, and no answer shows the unconfirmed line and reloads the lists.
   - Pinned by Task S3 Step 1 ("a second call is refused and writes nothing") and Task C6 Step 1 ("one call per tap", "no answer").
2. **An add over a cancelled row that still carries old fields.** Those fields are `cancel*`, `movedTo` / `movedFrom` / `cancelledFrom`, `noshowReason`, `comp*` and a stale `graceTokenId`, which `comp-booking.mjs` leaves today.
   - The row must be replaced whole, and exactly one "Session booked" goes out, through the widened gate keyed `{id}_staff_{ms}`.
   - A later family re-book of that row stays silent and is allowed by the rules.
   - Pinned by S3 Step 1 ("whole-document replace"), S5 Step 1 (the gate cases, and the trigger cases in `staff-book-notices.test.js`) and S8 Step 1 (the two probes).
3. **Period edges on the Chicago clock and households not anchored on the 1st.**
   - A session on the last day of an open period, added at 11:30 PM Chicago (already the next UTC day), is allowed. The same add at 12:30 AM on the 1st is `period-over`.
   - An anchor-15 household's add spends the session's own period.
   - A next-period add spends a next-period token.
   - Pinned by S1 Step 1 (`periodOver`), S2 Step 1 ("period edges", "next period"), S3 Step 1 ("an anchor-15 household spends the session's own period": the handler passes the household's anchor into the token reads) and C1 Step 1 (`staffAddFacts` next-period charge).
4. **The family move path must not change.**
   - A parent's `allowFull: true` and a `staff: true` field in the request are ignored.
   - The family refusal order is unchanged, and the response only gains `overrides: []`.
   - No staff log line is written for a family move.
   - Pinned by S4 Step 1 ("the family path is unchanged") and the existing `move.test.js` and `move-decide.test.js` family cases. The family refusal cases are unchanged; the ok result and the response gain `overrides: []` (the `moved()` helper at `move-decide.test.js:57-58` and the expected response at `move.test.js:82-84`, both edited in S4).
5. **Overfill, the seat counter and the waitlist.**
   - A counter that reads low heals to `max(live, counter) + 1`.
   - An overfill writes `capacity + 1`.
   - The athlete's own waitlist entry on the session is ignored in the position and deleted. For a single-token athlete, the token that entry held comes free. Other athletes' entries are untouched.
   - A move-out floors at 0.
   - Pinned by S2 Step 1 ("waitlist"), S3 Step 1 ("seat count", "waitlist entry", "an overfill keeps promotion off until a seat really opens"), S4 Step 1 ("a No-show from earlier this period moves": the floor at 0) and the walkthrough in Task I Step 4.

## File Structure

**Lane S: functions** (all under `functions/`)

| File | Change | Responsibility |
|---|---|---|
| `portal/staff-gates.js` | create | Pure staff helpers: `periodOver`, `takenOf`, `capacityOf`, `handicapBlocked`, `staffOverrides`, `OVERRIDES`, `logStaffBooking` |
| `portal/booking-reads.js` | create | `rowOf` and `loadTokenInputs`: the token-input reads both callables make inside their transaction |
| `portal/staff-book-decide.js` | create | Pure decision for `staffBookSession`: `REFUSALS`, `parseStaffBook`, `decideStaffBook` |
| `portal/staff-book.js` | create | The `staffBookSession` callable: reads, decide, writes, log |
| `portal/move-staff.js` | create | Pure staff-mode checks for `moveBooking` |
| `portal/move-decide.js` | modify | Three refusals added; `positionFor` extracted and exported; the staff branch; `overrides` |
| `portal/move.js` | modify | Shared reads; `ctx.staff` / `ctx.allowFull` from the role; `cancelledFrom`; refusal details; staff log; re-confirm sender key and started copy |
| `portal/notify-gates.js` | modify | Re-confirm gate accepts `createdVia: 'staff'` |
| `portal/notices.js` | modify | `bookingConfirmed` drops the cancel-or-move sentence when `started` |
| `portal/staff-cancel-decide.js` | modify | `mental` refusal |
| `portal/revoke.js` | modify | `futurePeriodBookings` skips `comp` rows |
| `index.js` | modify | Header line, `staffBookSession` export, `started` passed to the copy |
| `test/check-exports.js` | modify | 23 functions; `staffBookSession: []` |
| `portal/staff-gates.test.js`, `portal/staff-book-decide.test.js`, `portal/staff-book.test.js`, `portal/staff-book-notices.test.js`, `portal/move-staff.test.js`, `portal/revoke.test.js` | create | Tests |
| `portal/move-decide.test.js`, `portal/move.test.js`, `portal/notify-gates.test.js`, `portal/notices.test.js`, `portal/staff-cancel.test.js` | modify | Tests |
| `../scripts/rules-probes/booking-changes.mjs` | modify | Two probes for `createdVia: 'staff'` |
| `../docs/portal/DATA-MODEL.md` | modify | `createdVia`, `createdBy`, `comp`, `cancelledFrom`, the `moveBooking` staff mode, the notice key |

**Lane C: client shared pieces** (all under `frontend/src/portal/`)

| File | Change | Responsibility |
|---|---|---|
| `data/staffBooking.js` | create | Pure: roles, roster row fields, `staffMovable`, roster adapters, `searchAthletes`, `staffAddFacts`, `moveChargeKind` |
| `data/staffAthlete.js` | create | Pure: `payStateOf`, `staffAthleteModel` (the athlete model and its three groups) |
| `data/staffBookingCopy.js` | create | Every string in spec sections 10.2-10.5, the refusal map and the refusal kinds |
| `hooks/staffBooking.js` | create | `useStaffAthlete`, `useStaffSession`, `useStaffDaySessions`, `useSessionWaitlistCount`, `staffBookSession`, `staffMoveBooking`, with seed simulation |
| `hooks/callables.js` | modify | `callStaffBookSession` |
| `components/staffBooking/StaffSheet.js` | create | Bottom-sheet shell (the `MoveSheet` pattern) |
| `components/staffBooking/StaffRowActions.js` | create | The Move and Cancel row buttons |
| `components/staffBooking/AthleteSearch.js` | create | Search field, lazy directory, result rows |
| `components/staffBooking/AthletePicker.js` | create | The roster's "Add an athlete to ..." sheet |
| `components/staffBooking/StaffSessionPicker.js` | create | Day picker and that day's sessions |
| `components/staffBooking/StaffAddSheet.js` | create | Optional picker step, then the add confirm |
| `components/staffBooking/StaffMoveSheet.js` | create | Picker, then the move confirm |
| `data/staffCancel.js` | modify | `staffCancellable` refuses `mental`; `siblingsFor` also reads `nextSpent`; `REFUSALS` maps `mental` |
| `data/billingHub.js` | modify | Rows gain `type`; members gain `nextSpent` and `test` |
| `hooks/billing.js` | modify, 0 net lines | Directory athletes and the household view gain `test`; `seedMember` exported |
| Tests next to each file (`*.test.js`) | create | |

**Lane E: entry points** (all under `frontend/src/portal/`)

| File | Change | Responsibility |
|---|---|---|
| `components/TokenMeterRows.js` | create | `Evidence` and `Row`, moved out of TokenMeter; the action slot; next-period rows on the staff view |
| `components/TokenMeter.js` | modify | Imports `Evidence`; passes `onMoveRow` |
| `screens/Billing.js` | modify | Book a session per member, the Move sheet, the add sheet, one line for all three |
| `components/staffBooking/RosterStaffActions.js` | create | `RosterAddAthlete`, `RosterRowActions`: the roster wrappers that own their sheets |
| `screens/Roster.js` | modify | Two mount points; the existing status line carries the success line |
| `hooks/index.js` | modify | One import and one spread line in `liveSessionAttendance` |
| `StaffBookingRoutes.js` | create | `StaffAthleteBookingsRoute` and its lazy loader |
| `PortalRoutes.js` | modify | One import, one `<Route>` |
| `screens/StaffAthleteBookings.js` | create | The athlete's bookings screen |
| `components/staffBooking/ManageBookingsCard.js` | create | The Admin card |
| `screens/AdminDashboard.js` | modify | Mount the card after Outstanding |
| Tests (listed per task) | create | |

**Task I:** delete `scripts/comp-booking.mjs` and `scripts/test/comp-booking.test.mjs`, and update the comments that name the script.

## Lanes, worktrees and order

| Lane | Branch / worktree | Starts from | Depends on |
|---|---|---|---|
| S | `feat/staff-booking-server` / `wt-sb-server` | develop | nothing |
| C | `feat/staff-booking-client` / `wt-sb-client` | develop | nothing |
| E | `feat/staff-booking-entry` / `wt-sb-entry` | develop + Lane C's Task C0 commit (merged in) | C0 first; then E5 after C2 and E6 after C4 (merge `feat/staff-booking-client` in again) |
| I | `feat/staff-booking` (integration) | develop | S, C, E |

**How E builds while C is in flight**
- **C0** lands first. It creates every Lane C file with its final export names (stubs), plus the few real pieces Lane E's own markup and gates read.
- **E1-E4** build on C0. Their tests replace C's sheets with jest stand-ins, never C's data:

  ```js
  jest.mock('../components/staffBooking/StaffAddSheet', () => ({ __esModule: true, default: (p) => /* marker + a button calling p.onDone(line) */ }))
  ```

- **E5** waits for C2: it needs the real model and copy. **E6** waits for C4: it needs the real `AthleteSearch`.
- The lanes share no file except the one C0 merge into E. Lane S shares no file with either.

**Worktree setup** (the lead, before starting any lane)
- Junction `frontend/node_modules`.
- Copy `frontend/.env`. Every lane dev server overrides the env:
  - `PORT=3002` for C and `PORT=3003` for E;
  - `REACT_APP_PORTAL_LIVE_DATA=false` for seed checks.
- Remove the worktrees only after Task I, never mid-sprint.

---

## Lane S: server

### Task S1: Shared server helpers

**Files**
- Create `functions/portal/staff-gates.js` (pure) and `functions/portal/booking-reads.js`.
- Modify `functions/portal/move.js`:
  - `:67-76`: delete `rowOf` and import it from `booking-reads.js`;
  - `:113-124`: replace the token reads with one `loadTokenInputs` call (no behaviour change).
- Test: create `functions/portal/staff-gates.test.js`. `move.test.js` and `move-decide.test.js` stay green, unchanged.

**Interfaces**
- Consumes:
  - `lib`: `periodFor`, `todayISO`, `chicagoDate`, `tokenPeriodId`, `periodBookingsQuery`, `rows`, `graceSpendQueries`, `readGraceSpends`;
  - `booking-gates`: `openThrough`, `windowMonthsFor`, `eliteDailyCapHit`;
  - `session-time`: `sessionStarted`.
- Produces from `staff-gates.js`:
  - `OVERRIDES = ['started', 'outside-window', 'handicap-reserved', 'one-per-day', 'full']`.
  - `takenOf(live, session) -> number`: `Math.max(Number(live) || 0, Number(session.booked) || 0)`.
  - `capacityOf(session) -> number`: `Number(session.capacity) || 0`.
  - `periodOver(dateISO, anchorDay, now) -> boolean`: `lib.periodFor(dateISO, anchorDay).periodEnd < lib.todayISO(now)`.
  - `handicapBlocked(session, athlete) -> boolean`: the `move-decide.js:202-206` test. An integer `maxHandicap` and the athlete has no integer handicap at or under it.
  - `staffOverrides({session, athlete, pkg, bookings, taken, allowFull, now}) -> string[]`: a subset of `OVERRIDES`, in that order:
    - `started` when `sessionStarted(session, now)`;
    - `outside-window` when `session.date > gates.openThrough(now, gates.windowMonthsFor(pkg))`;
    - `handicap-reserved` when `handicapBlocked`;
    - `one-per-day` when `gates.eliteDailyCapHit(pkg, session.type, session.date, bookings)`;
    - `full` when `allowFull && taken >= capacityOf(session)`.
  - `logStaffBooking(entry)`: `console.log('staff booking', JSON.stringify(entry))`.
- Produces from `booking-reads.js`:
  - `rowOf(tx, ref) -> Promise<?Object>`: `{id, ...data}` or null.
  - `loadTokenInputs(tx, store, {athleteId, date, anchorDay, now}) -> Promise<{period: {periodKey, periodEnd}, tokenPeriod, periodBookings, waitlist, graceTokens, graceSpends}>`. It makes the five reads `move.js:115-124` makes today, in the same order.

- [ ] **Step 1: Write the failing test** `staff-gates.test.js` (tiny runner, `NOW = new Date('2026-11-12T18:00:00Z')`, noon Chicago Thu Nov 12):
  - `'periodOver: the Chicago date and the household anchor'`:
    - at `2026-12-01T05:30:00Z` (Nov 30, 11:30 PM Chicago), `periodOver('2026-11-30', 1)` is false;
    - at `2026-12-01T06:30:00Z` it is true;
    - at `2026-11-15T18:00:00Z`, `periodOver('2026-11-14', 15)` is true and `periodOver('2026-11-15', 15)` is false.
  - `'takenOf heals a counter that reads low'`: `takenOf(5, {booked: 2}) === 5`, `takenOf(1, {booked: 3}) === 3`, `takenOf(0, {}) === 0`, `capacityOf({}) === 0`.
  - `'handicapBlocked'`:
    - true for `{maxHandicap: 5}` with handicap 9 or no handicap;
    - false for handicap 5;
    - false on a session with no limit.
  - `'staffOverrides: every skipped limit, in one order'`:
    - a t-6 package (`{kind:'tokens', tokens:6}`) on `'2027-01-05'` gives `['outside-window']`;
    - Elite (`{kind:'elite', tokens:null}`) on `'2027-01-05'` gives `[]` (window to Jan 31);
    - today `'11:00 AM'` on Elite, with another non-cancelled training row that day, `maxHandicap 5`, handicap 9, `taken 12`, capacity 12 and `allowFull` gives exactly `['started', 'handicap-reserved', 'one-per-day', 'full']`;
    - a cancelled same-day row does not add `one-per-day`;
    - without `allowFull`, `full` is absent.
  - `'logStaffBooking writes one line'`: stub `console.log`; the arguments equal `['staff booking', '{"action":"add","by":"u-owner"}']`.
- [ ] **Step 2: Run** `cd functions && node portal/staff-gates.test.js`. Expect FAIL: `Cannot find module './staff-gates'`.
- [ ] **Step 3: Implement** both modules with the signatures above. In `move.js`, import `rowOf` and `loadTokenInputs`. `loadMove` sets `ctx.tokenPeriod`, `ctx.periodBookings`, `ctx.waitlist`, `ctx.graceTokens` and `ctx.graceSpends` from one `loadTokenInputs(tx, store, {athleteId, date: ctx.target.date, anchorDay: ctx.household && ctx.household.periodAnchorDay, now})`.
- [ ] **Step 4: Run** `node portal/staff-gates.test.js`, `node portal/move.test.js`, `node portal/move-decide.test.js` and `npx eslint .`. Expect all `ok`.
- [ ] **Step 5: Commit** `feat(functions): staff-gates and booking-reads for staff booking`.

### Task S2: The `staffBookSession` decision

**Files**
- Create `functions/portal/staff-book-decide.js` (pure).
- Modify `functions/portal/move-decide.js`:
  - `:257-272`: extract the position build into `positionFor`;
  - `:279`: export it. `decideMove` calls it with `leaveOutId: old.id`, with identical results.
- Test: create `functions/portal/staff-book-decide.test.js`, and add one case to `functions/portal/move-decide.test.js`.

**Interfaces**
- Consumes:
  - from S1: `staffOverrides`, `periodOver`, `takenOf`, `capacityOf`;
  - from `staff-cancel-decide.js`: `goodId`, `isStaff`;
  - from `lib`: `periodFor`, `chargeFor`, `membershipAllowsBooking`, `waitlistId`.
- Produces from `move-decide.js`: `positionFor(ctx, {period, leaveOutId, waitlistEntryId, sessionDate}) -> lib.tokensPosition result`.
  - It reads `ctx.pkg`, `ctx.tokenPeriod`, `ctx.periodBookings`, `ctx.graceSpends`, `ctx.waitlist`, `ctx.graceTokens`, `ctx.household.periodAnchorDay` and `ctx.now`.
  - It builds the position exactly as `:257-272` does today, with `notOld` keyed on `leaveOutId` (null means nothing is left out).
- Produces from `staff-book-decide.js`, `REFUSALS`: reason -> `{code, message}`. Messages are non-empty staff wording with no names. Codes:
  - `signed-out`: `unauthenticated`;
  - `bad-request`: `invalid-argument`;
  - `not-staff`: `permission-denied`;
  - `athlete-missing`: `not-found`;
  - `failed-precondition` for all of these: `no-household`, `test-athlete`, `session-missing`, `calendly`, `session-cancelled`, `session-hidden`, `display-only`, `period-over`, `already-booked`, `not-paid`, `no-tokens-left`, `no-session-token`, `full`.
- Produces `parseStaffBook(data) -> ?{athleteId, sessionId, free: boolean, allowFull: boolean}`.
  - Both ids must pass `goodId`. `free` and `allowFull` must be `undefined` or boolean (`null` is refused).
  - A non-object request gives null. Unknown keys are ignored, so a `householdId` in the request never reaches anything. Its JSDoc says so: this reads spec 9.1's "Anything else is `bad-request`" narrowly, as a bad id or a non-boolean `free` / `allowFull` (plan decision 5).
- Produces `decideStaffBook(ctx)`.
  - `ctx = {user, athlete, household, pkg, session, existing, live, tokenPeriod, periodBookings, graceSpends, waitlist, graceTokens, now, free, allowFull}`. Each doc carries its `id`; `existing` is the `{athleteId}_{sessionId}` row or null.
  - Returns either `{ok: true, comp, charge: {chargedFrom, graceTokenId}, period: {periodKey, periodEnd}, taken, capacity, waitlistEntryId, rebooked, overrides}` or `{ok: false, reason, details?}`. `details` is `{taken, capacity}`, sent only with `full`.
  - The first failing check wins, in spec 9.1 order 3-16:
    - `not-staff`;
    - `athlete-missing`;
    - `no-household` (no `householdId`, or no household doc);
    - `test-athlete` (`athlete.test === true || household.test === true`);
    - `session-missing` (no doc or no `date`);
    - `calendly` (`type === 'mental' || source === 'calendly' || unresolved === true`);
    - `session-cancelled`; `session-hidden`; `display-only` (`bookable === false`);
    - `period-over` (`periodOver(session.date, household.periodAnchorDay, now)`);
    - `already-booked` (`existing` exists and `status !== 'cancelled'`);
    - `not-paid` (`!free && (!pkg || !lib.membershipAllowsBooking(household, athlete))`);
    - the charge;
    - `full` (`!allowFull && taken >= capacity`, where `taken = takenOf(live, session)`).
  - **Charge:**
    - Free gives `comp: true` and `{chargedFrom: 'period', graceTokenId: null}`.
    - Otherwise:
      - `waitlistEntryId = lib.waitlistId(session.id, athlete.id)` when `ctx.waitlist` holds it;
      - `position = positionFor(ctx, {period, leaveOutId: null, waitlistEntryId, sessionDate: session.date})` with `period = lib.periodFor(session.date, household.periodAnchorDay)`;
      - `lib.chargeFor({position, sessionDate: session.date})`;
      - no `chargedFrom` gives `position.perPurchase ? 'no-session-token' : 'no-tokens-left'`.
  - `waitlistEntryId` is also returned on a Free add. `rebooked = Boolean(existing)`. `overrides = staffOverrides({session, athlete, pkg, bookings: periodBookings, taken, allowFull, now})`.

- [ ] **Step 1: Write the failing test** `staff-book-decide.test.js`.
  - Fixtures:
    - `NOW` = noon Chicago Thu Nov 12;
    - Jordan in `hh1` (anchor 1), t-6 package, handicap 4;
    - `s2` = Tue Nov 17 4:00 PM training, capacity 12, booked 3; `live: 3`.
  - Cases:
    - `'every refusal in table order'`: each reason above from one mutation of a passing ctx, including:
      - user `null` and roles coach, mental, parent, athlete give `not-staff`;
      - session `{type:'mental'}`, `{source:'calendly'}` and `{unresolved:true}` each give `calendly`;
      - existing rows with status `confirmed`, `attended` and `noshow` each give `already-booked`, and a `cancelled` row passes with `rebooked: true`;
      - `not-paid` comes from: no package, `billing:{status:'pending'}`, `billing:{status:'active', oneTime:true}` on a non-`single` package, household `membership.status` `past_due` and `lapsed`.
    - `'the first failing check wins'`: a test athlete on a full session gives `test-athlete`; no tokens on a full session gives `no-tokens-left`. `full` comes last.
    - `'full: refused with the count, allowed when asked'`: `booked 12`, capacity 12 gives `{ok:false, reason:'full', details:{taken:12, capacity:12}}`. `live 12, booked 3` gives `taken 12`. With `allowFull: true` it is ok, with `overrides: ['full']` and `taken 12`.
    - `'the charge order'`:
      - two grace tokens expiring `'2026-11-20'` and `'2026-12-05'` give `{chargedFrom:'grace', graceTokenId:<the Nov 20 one>}`;
      - one expiring `'2026-11-15'` (before the session) is skipped for the period;
      - Elite gives `'elite'`;
      - a single athlete (`{kind:'single', tokens:1}`) with `single_cs1` gives `grace` / `single_cs1`, and with none gives `no-session-token`;
      - a single athlete with `tokenPeriod {granted: 1}` gives `period`;
      - six November period rows give `no-tokens-left`.
    - `'a next-period session spends a next-period token'`:
      - for `s9` on Thu Dec 3 with `tokenPeriod {granted:6}` and six December rows: `no-tokens-left`, although November has tokens;
      - with five rows: `period` with `{periodKey:'2026-12-01', periodEnd:'2026-12-31'}`.
    - `'period edges'`:
      - at `2026-12-01T05:30:00Z`, a Nov 30 4:00 PM session is ok, with `overrides ['started']` and `periodKey '2026-11-01'`;
      - at `2026-12-01T06:30:00Z` it gives `period-over`;
      - for anchor 15 at Nov 12:
        - a Nov 16 session gives `periodKey '2026-11-15'`;
        - an Oct 27 session is ok, with `periodKey '2026-10-15'` and `overrides ['started']`: its period, Oct 15 - Nov 14, is still open;
        - an Oct 14 session (period Sep 15 - Oct 14) gives `period-over`.
    - `'Free on every package'`: t-6, Elite, single, no package, pending billing and lapsed household all give `ok`, `comp: true`, `charge {chargedFrom:'period', graceTokenId:null}`.
    - `'waitlist'`:
      - a single athlete whose only `single_cs1` token is held by their waitlist entry `s2_jordan` on this same session is charged `grace` / `single_cs1`, with `waitlistEntryId 's2_jordan'`;
      - a t-6 athlete with 5 November rows and a waitlist entry on another November session gives `no-tokens-left`;
      - the same athlete waiting on this session (the entry ignored) gives `period`.
    - `'overrides reported'`:
      - a session today at 11:00 AM gives `['started']`;
      - Tue Nov 10 gives `['started']`;
      - `'2027-01-05'` on t-6 gives `['outside-window']`;
      - `maxHandicap: 3` gives `['handicap-reserved']`;
      - Elite with another training on Nov 17 gives `['one-per-day']`.
    - `'parseStaffBook'`:
      - `{athleteId:'jordan', sessionId:'s2'}` gives `{athleteId:'jordan', sessionId:'s2', free:false, allowFull:false}`;
      - null for `null`, a missing id, `'a/b'`, `'__x__'`, `'.'`, a 201-character id, `free:'yes'`, `free:null`, `allowFull:1`;
      - an extra `householdId` key is ignored.
    - `'REFUSALS: the codes'`: the key set equals the 17 reasons above, and the codes are as listed.
  - Also in `move-decide.test.js`: one case `'positionFor with leaveOutId null counts every row'`.
- [ ] **Step 2: Run** `node portal/staff-book-decide.test.js`. Expect FAIL: `Cannot find module './staff-book-decide'`.
- [ ] **Step 3: Implement** `staff-book-decide.js` and the `positionFor` extraction, with the order and charge above.
- [ ] **Step 4: Run** `node portal/staff-book-decide.test.js`, `node portal/move-decide.test.js`, `node portal/move.test.js` and `npx eslint .`. Expect pass.
- [ ] **Step 5: Commit** `feat(functions): staffBookSession decision (staff-book-decide.js)`.

### Task S3: The `staffBookSession` callable and its export

**Files**
- Create `functions/portal/staff-book.js` and `functions/portal/staff-book.test.js`.
- Modify `functions/index.js`:
  - header `:38-42`: add an entry `staffBookSession   callable, portal/staff-book.js (2026-11-13): owner or ops adds an athlete to a session`, wrapped to 80 columns like the entries above it;
  - after `:121`: `const {staffBookSession} = require('./portal/staff-book');`;
  - after `:141`: a one-line comment and `exports.staffBookSession = staffBookSession;`.
- Modify `functions/test/check-exports.js`:
  - header `:1-12`;
  - `EXPECTED` `:41-43`: add `staffBookSession: []`;
  - message `:45-50`: `23` functions.

**Interfaces**
- Consumes:
  - S2: `parseStaffBook`, `decideStaffBook`, `REFUSALS`;
  - S1: `rowOf`, `loadTokenInputs`, `logStaffBooking`;
  - `lib.bookingId`.
- Produces `staffBookSessionHandler(data, context, deps?: {db, now}) -> Promise<{bookingId, athleteId, sessionId, periodKey, chargedFrom, graceTokenId, comp, rebooked, booked, capacity, overrides}>`.
  - `booked` is `taken + 1`. `comp` is a boolean.
  - A refusal is `new HttpsError(code, message, Object.assign({reason}, details))`.
- Produces `staffBookSession = functions.runWith({secrets: []}).https.onCall((data, context) => staffBookSessionHandler(data, context))`.
- **Reads**, inside one `store.runTransaction`, all before any write:
  1. `users/{uid}`; a caller who is not staff stops here;
  2. `athletes/{athleteId}`; stop if missing;
  3. `households/{athlete.householdId}` when the id is set;
  4. `packages/{athlete.packageId}` when the id is set;
  5. `sessions/{sessionId}`;
  6. `bookings/{athleteId}_{sessionId}`;
  7. the count of `bookings where sessionId ==` that are not cancelled;
  8. then, only with a session that has a date and a household doc, `loadTokenInputs`.
- **Writes**, after deciding:
  1. The booking.
     - `tx.create` the row `{athleteId, sessionId, householdId: athlete.householdId, date: session.date, type: session.type || null, status: 'confirmed', periodKey, chargedFrom, graceTokenId, createdBy: uid, createdVia: 'staff', createdAt: FieldValue.serverTimestamp()}`. `type` is `session.type || null`, as `move.js:159` writes it: the Admin SDK rejects `undefined`.
     - Add `comp: true` only when Free.
     - Over a cancelled row, `tx.set` the same object whole (no merge), plus `rebookedAt: FieldValue.serverTimestamp()`.
  2. `tx.update(sessions/{id}, {booked: taken + 1})`.
  3. `tx.delete(waitlist/{waitlistEntryId})` when set.
- **Log:** once, after `runTransaction` resolves (never inside it, where a retry would log twice): `logStaffBooking({action: 'add', by: uid, role, athleteId, sessionId, chargedFrom, comp, overrides})`.

- [ ] **Step 1: Write the failing test** `staff-book.test.js`.
  - Fixtures:
    - process env first, as `staff-cancel.test.js:12-13` does: `GCLOUD_PROJECT='demo-staff-book'` and `FIRESTORE_EMULATOR_HOST='127.0.0.1:9'`;
    - `fakeDb`, `NOW` as in S2, `STAMP = FieldValue.serverTimestamp()`;
    - users `u-owner` (owner), `u-ops` (ops), `u-coach` (coach), `u-parent` (parent, `hh1`);
    - athletes `jordan` (`hh1`, t-6), `riley` (`hh1`, `test: true`), `casey` (`hh2`, `billing: {status: 'pending'}`).
  - Cases:
    - `'the exact document on create'`:
      - a call as `u-owner` with `{athleteId:'jordan', sessionId:'s2', householdId:'hh2'}`;
      - `docs['bookings/jordan_s2']` deep-equals `{athleteId:'jordan', sessionId:'s2', householdId:'hh1', date:'2026-11-17', type:'training', status:'confirmed', periodKey:'2026-11-01', chargedFrom:'period', graceTokenId:null, createdBy:'u-owner', createdVia:'staff', createdAt:STAMP}`, with no `comp` and no `rebookedAt`;
      - the response deep-equals `{bookingId:'jordan_s2', athleteId:'jordan', sessionId:'s2', periodKey:'2026-11-01', chargedFrom:'period', graceTokenId:null, comp:false, rebooked:false, booked:4, capacity:12, overrides:[]}`.
    - `'Free writes comp and spends nothing'`: `comp: true`, `chargedFrom 'period'`, `graceTokenId null`, and the response has `comp: true`. Casey (pending billing) is refused `not-paid` without `free` and booked with it.
    - `'whole-document replace over a cancelled row'`:
      - the seeded `jordan_s2` is `{status:'cancelled', cancelledBy:'u-parent', cancelReason:'member', cancelCategory:'sick', cancelNote:'x', cancelledAt:OLD_TS, cancelledFrom:'confirmed', movedTo:'jordan_s9', movedFrom:'jordan_s0', noshowReason:'Sick', comp:true, compBy:'staff', chargedFrom:'grace', graceTokenId:'g-old', createdAt:OLD_TS}`;
      - after the add, the key set is exactly the create keys plus `rebookedAt`, the response has `rebooked: true`, and `graceTokenId` is null.
    - `'the seat count'`:
      - `booked 2` with 5 live rows gives `booked 6` (the counter healed);
      - `booked 12`, capacity 12, with `allowFull` gives `booked 13`, and `overrides` includes `'full'`.
    - `'the waitlist entry on this session is deleted, no other'`: `waitlist/s2_jordan` is gone; `waitlist/s2_casey` and `waitlist/s5_jordan` stay.
    - `'an overfill keeps promotion off until a seat really opens'` (the `staff-cancel.test.js:363-390` harness, with `notify.sendNotice` stubbed):
      - `s2` is at `booked 12`, capacity 12, with Riley's confirmed row on it and a waiter who can be promoted (`waitlist/s2_casey`; Casey's billing is active in this case's world);
      - a staff add of Jordan with `allowFull` writes `booked 13`;
      - a `staffCancelBookingHandler` cancel of Riley's row brings it to 12, and `promotion.handleSessionUpdate(before, after, 's2', {db, now: NOW})` promotes nobody: no `bookings/casey_s2`, the entry stays and nothing is sent;
      - cancelling Jordan's new row brings it to 11 and promotes Casey, so the first result is not vacuous.
    - `'an anchor-15 household spends the session's own period'`: `hh1` has `periodAnchorDay: 15`, and `s16` is Mon Nov 16, 4:00 PM training, capacity 12.
      - With five non-cancelled Jordan rows dated Nov 17, Nov 19, Nov 24, Dec 1 and Dec 3 (`periodKey '2026-11-15'`), the add is ok, with `chargedFrom 'period'` and `periodKey '2026-11-15'`.
      - With a sixth on Dec 8 it is refused `no-tokens-left`. Only reads over Nov 15 - Dec 14 see the December rows: reads made with anchor 1 (Nov 1 - Nov 30) would count three and allow it (plan decision 13).
    - `'every refusal writes nothing'`: for each S2 refusal reachable through docs, `JSON.stringify(docs)` is unchanged and `[err.code, err.details.reason]` is as tabled. `full` also checks `err.details` deep-equals `{reason:'full', taken:12, capacity:12}`.
    - `'signed out and bad requests'`: no auth gives `unauthenticated`/`signed-out`; `{}`, `{athleteId:'a/b', sessionId:'s2'}` and `{athleteId:'jordan', sessionId:'s2', free:'yes'}` give `invalid-argument`/`bad-request`.
    - `'a caller who is not staff reads nothing past users'`: wrap the fake so `tx.get` records each `target.path`; a coach call records only `['users/u-coach']` and is refused `not-staff`.
    - `'a second call is refused and writes nothing'`: the second identical call is refused `already-booked`, `sessions/s2.booked` stays 4, and the booking is unchanged.
    - `'one log line of ids'`: stub `console.log`; exactly one call, with args `['staff booking', JSON.stringify({action:'add', by:'u-owner', role:'owner', athleteId:'jordan', sessionId:'s2', chargedFrom:'period', comp:false, overrides:[]})]`. No athlete name appears in it.
  - In `test/check-exports.js`: `EXPECTED.staffBookSession` is `[]` and the count is `23`.
- [ ] **Step 2: Run** `node portal/staff-book.test.js` (FAIL: `Cannot find module './staff-book'`) and `node test/check-exports.js` (FAIL: the key sets differ).
- [ ] **Step 3: Implement** `staff-book.js`, with `loadStaffBook(tx, store, {uid, athleteId, sessionId, now})` and `writeStaffBook(tx, store, ctx, decision, uid)` as internal functions, plus the `index.js` and `check-exports.js` edits. `index.js` must stay under 500 lines.
- [ ] **Step 4: Run** `node portal/staff-book.test.js`, `node test/check-exports.js` (expect `ok  23 functions exported, ...`) and `npx eslint .`.
- [ ] **Step 5: Commit** `feat(functions): staffBookSession callable (owner or ops adds an athlete)`.

### Task S4: `moveBooking` staff mode

**Files**
- Create `functions/portal/move-staff.js` (pure).
- Modify `functions/portal/move-decide.js`:
  - header `:1-27`: add one paragraph on staff mode;
  - `REFUSALS` `:43-82`: add `'attended'`, `'period-over'` and `'test-athlete'`, all `failed-precondition`;
  - `decideMove` `:229-277`: add the staff branch.
- Modify `functions/portal/move.js`:
  - header `:1-25`;
  - `loadMove` `:87-126`: set `ctx.staff = isStaff(ctx.user)` (from `staff-cancel-decide.js`, which has no import cycle with `move.js`) and `ctx.allowFull = ctx.staff && args.allowFull === true`;
  - `writeMove` `:143-149`: in staff mode, the old-row cancel also writes `cancelledFrom: old.status`;
  - handler `:197-226`:
    - read `data.allowFull === true`. Any other value is false, never a `bad-request`, so the family request behaves exactly as today;
    - throw `refusal(decision.reason, decision.details)`;
    - add `overrides: decision.overrides` to the response;
    - log after commit, staff mode only.
- Test:
  - create `functions/portal/move-staff.test.js`;
  - modify `move-decide.test.js:249-268`: the REFUSALS key list gains the three;
  - modify `move-decide.test.js:57-58`: the `moved()` helper, which every ok case deep-equals, gains `overrides: []`;
  - modify `move.test.js:82-84`: the expected handler response gains `overrides: []`.
  - Every other family case in both files stays as it is.

**Interfaces**
- Produces from `move-staff.js`, all over the `decideMove` ctx:
  - `staffOldRefusal(ctx) -> ?string`:
    - `booking-missing`;
    - `old.status`: `'attended'` gives `attended`; anything other than `'confirmed'` or `'noshow'` gives `not-confirmed`;
    - `calendly-managed`; `mental-no-move`; `same-session`; `session-missing`;
    - `period-over` when `periodOver(old.date || oldSession.date, household && household.periodAnchorDay, now)`.
    - Ownership is never checked, and no `already-started`.
  - `staffTargetRefusal(ctx) -> ?string`:
    - `different-type`; `session-cancelled`; `session-hidden`; `display-only`;
    - `period-over` (the target's period);
    - `already-booked`.
    - No `session-past` and no `outside-window`.
  - `staffAthleteRefusal(ctx, comp) -> ?string`:
    - no athlete gives `membership-inactive` (as today);
    - `athlete.test === true || household.test === true` gives `test-athlete`;
    - a paid booking of a non-paying athlete (`!comp && (!pkg || !membershipAllowsBooking)`) gives `membership-inactive`.
    - No `booking-not-open`, no handicap check, no full check.
- Produces from `decideMove(ctx)`:
  - Family path: unchanged, and the ok result gains `overrides: []`.
  - Staff path (`ctx.staff === true`), in this order:
    - `staffOldRefusal`, then `staffTargetRefusal`, then `staffAthleteRefusal`;
    - the charge, through the same `positionFor(ctx, {leaveOutId: old.id, ...})` and `moveCharge`, with a comp staying free;
    - last, `full` when `!ctx.allowFull && taken >= capacity`, returning `{ok:false, reason:'full', details:{taken, capacity}}`.
  - Placing `full` last mirrors the add: the overfill question is the final confirm (plan decision).
  - Staff `overrides = staffOverrides({session: target, athlete, pkg, bookings: periodBookings without old, taken, allowFull, now})`.
- Produces from `moveBookingHandler`: the response is today's fields plus `overrides`. The staff log is `logStaffBooking({action:'move', by: uid, role, athleteId, sessionId: toSessionId, chargedFrom, comp, overrides})`.

- [ ] **Step 1: Write the failing test** `move-staff.test.js`.
  - Fixtures:
    - handler over `fakeDb`; `NOW` noon Thu Nov 12;
    - Jordan `hh1` t-6 holds `jordan_s1` on Fri Nov 13, plus a No-show `jordan_s0` on Tue Nov 10;
    - `s2` Tue Nov 17 has room;
    - `s4` Thu Nov 19 is full at 12/12.
  - Cases:
    - `'staff moves a family booking'` (as `u-owner` and `u-ops`):
      - the old row has `status 'cancelled'`, `cancelReason 'moved'`, `cancelledFrom 'confirmed'` and `cancelledBy 'u-owner'`;
      - the new row has `createdBy 'u-owner'`, `createdVia 'move'` and `movedFrom 'jordan_s1'`;
      - the response has `overrides: []`.
    - `'a No-show from earlier this period moves'`: `jordan_s0` goes to `s2`; the old row has `cancelledFrom 'noshow'`, and `overrides` is `[]`. The target is not started. `s0` is seeded at `booked: 0` (a counter that already reads low), and `s0.booked` stays 0: the move-out floors at 0.
    - `'attended, cancelled, last period'`:
      - an attended row gives `attended`;
      - a cancelled row gives `not-confirmed`;
      - an old row on Oct 27 gives `period-over`;
      - a target on Oct 30 gives `period-over`;
      - a target on Wed Nov 11 (started) is ok with `['started']`.
    - `'skipped limits come back as overrides'`:
      - a target on `'2027-01-05'` gives `['outside-window']`;
      - `maxHandicap 3` gives `['handicap-reserved']`;
      - Elite with another training on the target day gives `['one-per-day']`.
    - `'full'`:
      - to `s4` without `allowFull`: `details` deep-equals `{reason:'full', taken:12, capacity:12}`, and nothing is written;
      - with `allowFull: true`: `s4.booked === 13` and `overrides` includes `'full'`.
    - `'test-athlete'`: an athlete or a household with `test: true` is refused `test-athlete`.
    - `'payment never changes'`:
      - a comp moves free, and its `comp*` fields are copied;
      - a paid row with `billing {status:'pending'}` gives `membership-inactive`;
      - charges (a)-(d) for staff equal the family results for the same ctx: a period carry, a bonus carry, a December token, Elite.
    - `'the family path is unchanged'`:
      - `u-parent` with `{bookingId, toSessionId:'s4', allowFull:true, staff:true}` is refused `full`, and `err.details` deep-equals `{reason:'full'}` (no counts);
      - a parent's move response deep-equals today's fields plus `overrides: []`;
      - `console.log` gets no `staff booking` line for a family move;
      - `u-coach` is refused `not-yours`.
    - `'one log line per staff move'`: args equal `['staff booking', JSON.stringify({action:'move', by:'u-owner', role:'owner', athleteId:'jordan', sessionId:'s2', chargedFrom:'period', comp:false, overrides:[]})]`.
  - `move-decide.test.js:249`: the expected key list adds `'attended', 'period-over', 'test-athlete'`.
  - `move-decide.test.js:57-58`: `moved()` adds `overrides: []`. `move.test.js:82-84`: the expected response adds `overrides: []`.
- [ ] **Step 2: Run** `node portal/move-staff.test.js` (FAIL: `Cannot find module './move-staff'`), `node portal/move-decide.test.js` (FAIL: the REFUSALS key list, and every `moved()` case on the missing `overrides`) and `node portal/move.test.js` (FAIL: the response at `:82`).
- [ ] **Step 3: Implement** as above. If `move-decide.js` passes 450 lines, move more of the staff branch into `move-staff.js`.
- [ ] **Step 4: Run** `node portal/move-staff.test.js`, `node portal/move.test.js`, `node portal/move-decide.test.js`, `node portal/staff-book.test.js` and `npx eslint .`.
- [ ] **Step 5: Commit** `feat(functions): moveBooking staff mode (role-chosen, overrides, allowFull)`.

### Task S5: Emails for staff adds

**Files**
- Modify `functions/portal/notify-gates.js:105-126`: `shouldNoticeMoveReconfirm` accepts `createdVia` of `'move'` or `'staff'`, and its JSDoc says so.
- Modify `functions/portal/notices.js:128-143`: `bookingConfirmed(args)` takes an optional `args.started` (a boolean). When it is true, the body has no `CANCEL_OR_MOVE` sentence.
- Modify `functions/portal/move.js` `sendMoveReconfirm` `:228-269`:
  - `deps.now` is accepted, and defaults to `new Date()`;
  - the copy gets `started: sessionStarted(session, now)`;
  - `subjectKey` becomes `` `${bookingId}_${booking.createdVia}_${booking.createdAt.toMillis()}` ``.
- Modify `functions/index.js`. Anchor on the text: S3's header and require lines push these about 5 lines below the base numbers.
  - after the `isFreeComp` require (`:122` at base): `const {sessionStarted} = require('./portal/session-time');`;
  - the `notices.bookingConfirmed({athlete, session, booking})` line (`:252` at base) becomes `notices.bookingConfirmed({athlete, session, booking, started: sessionStarted(session, new Date())})`;
  - the "moveBooking re-confirmed a row cancelled earlier" comment (`:287-288` at base) names `staffBookSession` too.
- Test:
  - `notify-gates.test.js:82-98` (extend);
  - `notices.test.js` (new case);
  - `move.test.js:197-212` (pass `now: NOW`);
  - create `staff-book-notices.test.js` for the trigger cases. They stay out of `staff-book.test.js`, which S3 already fills (`staff-cancel.test.js` is 392 lines with less in it).

**Interfaces**
- Produces: `bookingConfirmed({athlete, session, booking, started?}) -> {title, body}`, and `sendMoveReconfirm(bookingId, booking, deps?: {db, sendNotice, now})`. The gate signature is unchanged.

- [ ] **Step 1: Write the failing tests.**
  - `notify-gates.test.js`:
    - `shouldNoticeMoveReconfirm({status:'cancelled', createdAt:ts(1)}, {status:'confirmed', createdVia:'staff', createdAt:ts(2)}) === true`;
    - false for `'staff'` with `createdAt: ts(1)` (a family re-book);
    - false for `createdVia: 'repeat'` and for no `createdVia`;
    - `shouldNoticeBookingCreated({status:'confirmed', createdBy:'u-owner', createdVia:'staff'}) === true`.
  - `notices.test.js`, `'bookingConfirmed: a session that already started drops the before-it-starts sentence'`:
    - `bookingConfirmed({athlete:{name:'Jordan Whitfield'}, session:{type:'training', date:'2026-11-10', time:'4:00 PM'}, started:true}).body === 'Jordan is booked: Training, Tue, Nov 10 at 4:00 PM.'`;
    - the same with `started:false` ends with `' You can cancel or move it in the app any time before it starts.'`.
  - `move.test.js`, the sendMoveReconfirm test:
    - pass `now: NOW`;
    - the key stays `'sam_s2_move_77'`;
    - a new case with `createdVia:'staff'` gives `'sam_s2_staff_77'`;
    - a session already started at `now` gives a body without `cancel or move`.
  - `staff-book-notices.test.js` (the `staff-cancel.test.js:316-349` harness):
    - set `GCLOUD_PROJECT='demo-staff-book-notices'` and `FIRESTORE_EMULATOR_HOST='127.0.0.1:9'` before any require, point `admin.firestore().collection` at the fake, stub `notify.sendNotice`, and `require('../index')`;
    - `'a staff add of a past session: one Session booked without the before-it-starts sentence'`: `index.onBookingCreated.run(snap, {params:{bookingId:'jordan_s0'}})` on a Tue Nov 10 row sends one `booking-confirmed`, whose body has no `before it starts`;
    - a future session sends the sentence. Its date is computed as `lib.todayISO(new Date(Date.now() + 30 * 864e5))`, never hard-coded, so the test cannot age into a past date;
    - `'a re-confirm over a cancelled row: one notice keyed by staff'`: `index.onBookingCancelled.run` with before `{status:'cancelled', createdAt:ts(1)}` and after `{status:'confirmed', createdVia:'staff', createdAt:ts(77), ...}` sends one notice with `subjectKey 'jordan_s2_staff_77'`;
    - `'a family re-book of a cancelled staff row stays silent'`: after keeps `createdAt: ts(1)`, and `sent` stays `[]`.
- [ ] **Step 2: Run** `node portal/notify-gates.test.js`, `node portal/notices.test.js`, `node portal/move.test.js` and `node portal/staff-book-notices.test.js`. Expect FAIL on the staff gate, the started body and the key.
- [ ] **Step 3: Implement** the four edits. `index.js` stays under 500 lines.
- [ ] **Step 4: Run** the same four tests, `node test/check-exports.js` and `npx eslint .`.
- [ ] **Step 5: Commit** `feat(functions): staff add emails (re-confirm gate, started copy)`.

### Task S6: `staffCancelBooking` refuses `mental`

**Files**
- Modify `functions/portal/staff-cancel-decide.js`:
  - header `:20-21`: "cancellable is a `confirmed` or `noshow` booking Calendly does not own and not a 1:1";
  - `REFUSALS` `:49-65`: add `'mental': {code: PRE, message: 'Book and change this 1:1 in Calendly.'}`: staff wording with no names, beside `calendly`'s `'Cancel this 1:1 in Calendly.'`;
  - `bookingRefusal` `:126-137`: after the `calendly` line (`:129`), add `if ((b.type || (session && session.type)) === 'mental') return 'mental';`.
- Test: `functions/portal/staff-cancel.test.js` (add cases; the file stays under 500 lines).

**Interfaces:** the refusal reason `'mental'` is `failed-precondition`. The client maps it in two places, both reading "Yannick's 1:1s are booked and changed in Calendly.":
- C0's `data/staffCancel.js` `REFUSALS`: `StaffCancelSheet` shows that map's words, through `staffCancelRefusal` in `hooks/staffCancel.js:43`;
- C2's `staffRefusalLine`, for the add and move sheets.

- [ ] **Step 1: Write the failing tests:**
  - `'a portal 1:1 is refused as mental'`:
    - a confirmed `jordan_m1` with `type:'mental'` and no `source` gives `failed-precondition`/`mental`, with nothing written;
    - a booking with no `type` on a session of `type:'mental'` gives `mental`;
    - a Calendly row still gives `calendly` (the order is kept).
  - `'a next-period row cancels with the token back'`: `jordan_s9` on Thu Dec 3 (`periodKey '2026-12-01'`) gives `cancelled[0].tokenBack === true`. `lib.tokensPosition` for December over the stored rows gives `used` one lower.
- [ ] **Step 2: Run** `node portal/staff-cancel.test.js`. Expect FAIL on the `mental` case.
- [ ] **Step 3: Implement** the three edits.
- [ ] **Step 4: Run** `node portal/staff-cancel.test.js` and `npx eslint .`.
- [ ] **Step 5: Commit** `feat(functions): staff cancel refuses portal 1:1s (mental)`.

### Task S7: The downgrade trim skips Free

**Files**
- Modify `functions/portal/revoke.js`:
  - `:197-205` (JSDoc): "counted exactly as `tokensFor` counts `used`: non-cancelled, not grace-charged and not a comp";
  - `:214`: `if (b.status === 'cancelled' || b.graceTokenId || b.comp === true) continue;`.
- Test: create `functions/portal/revoke.test.js`. `revoke.js` had no test.

**Interfaces:** none new. `trimDowngrade(hh, detail, eventId)` keeps its signature.

- [ ] **Step 1: Write the failing test** `revoke.test.js`.
  - Harness:
    - set `GCLOUD_PROJECT='demo-revoke'` and `FIRESTORE_EMULATOR_HOST='127.0.0.1:9'` before any require, then `admin.initializeApp()`;
    - patch the cached instance, as `staff-cancel.test.js:320` does: `const fs = admin.firestore(); fs.collection = (n) => fakeDb(docs).collection(n); fs.getAll = (...r) => fakeDb(docs).getAll(...r); fs.batch = () => fakeDb(docs).batch();`;
    - stub `notify.sendNotice`.
  - Dates are computed, never hard-coded: `next = lib.nextPeriod(lib.periodFor(lib.todayISO(), 1).periodKey, 1)`, and the rows sit on distinct days inside `next`. Distinct dates mean the sort never reaches the `createTime` tie-break, which the fake lacks.
  - `'a Free booking neither counts against the new grant nor is trimmed'`:
    - with grant 2, next-period rows of 3 paid and 1 `comp:true` (newest);
    - `trimDowngrade({id:'hh1', data:{periodAnchorDay:1}, ref:null}, {tokens:2, athleteIds:['jordan']}, 'evt1')` cancels exactly the newest paid row (`cancelReason 'downgrade'`), and the comp row stays `confirmed`.
  - `'two paid and two Free under a grant of 2: nothing cancelled'`: the result has `cancelled 0`, and `sent` is `[]`.
- [ ] **Step 2: Run** `node portal/revoke.test.js`. Expect FAIL: the comp row is cancelled, or one paid row too many survives.
- [ ] **Step 3: Implement** the one-line change and the JSDoc.
- [ ] **Step 4: Run** `node portal/revoke.test.js` and `npx eslint .`.
- [ ] **Step 5: Commit** `fix(functions): downgrade trim skips Free (comp) bookings`.

### Task S8: Rules probes (no rules change)

**Files**
- Modify `scripts/rules-probes/booking-changes.mjs`:
  - header `:10-12`: "createdVia 'move' or 'staff'";
  - after `:152`, before the 200 twin at `:154`: `expect("booking-changes: a family create with createdVia 'staff' refused", await bookAs(t.parent, bookingId(s), { ...fresh, createdVia: 'staff' }), 403);`;
  - after `:187`:
    - `s = await slot('rb-staff', ahead, { ...sickCancelled(), createdVia: 'staff', createdBy: uid.ops });` (a row staff really made: `createdBy` is the ops uid, not the parent's);
    - `expect('booking-changes: a family re-book of a row staff created', await newRebook(s), 200);`

**Interfaces:** none.

- [ ] **Step 1: Write the probes** above. They are the test.
- [ ] **Step 2: Run** on the emulator, outside 22:30-01:30 Chicago: `npm run emulator` (background), then `node --env-file=scripts/emulator.env scripts/verify-rules.mjs`. Expect both new lines `PASS` in both passes and every other line unchanged. A FAIL here means the rules disagree with spec 6. Stop and report; never edit `firestore.rules`.
- [ ] **Step 3: Implement:** nothing (no rules change).
- [ ] **Step 4: Run** `node --test scripts/test/*.test.mjs`. Expect green.
- [ ] **Step 5: Commit** `test(rules): probes for createdVia 'staff' (family create refused, re-book allowed)`.

### Task S9: DATA-MODEL

**Files:** Modify `docs/portal/DATA-MODEL.md`:
- `:409` (`comp`): the writer is `staffBookSession`'s Free add (`createdVia: 'staff'`, `createdBy` the staff uid); `scripts/comp-booking.mjs` until 2026-11-13. The downgrade trim skips comp rows (`revoke.js futurePeriodBookings`).
- `:411` (`createdBy`): may be a staff uid (`staffBookSession`, `moveBooking` in staff mode).
- `:418` (`createdVia`): adds `'staff'`, written only by `staffBookSession` (Admin SDK). No client may write it (probe S8).
- A new row after `:408`, `cancelledFrom`: what the row was (`'confirmed'` / `'noshow'`) when staff cancelled it (`staffCancelBooking`) or moved it (`moveBooking` staff mode).
- The Move section `:661-697`:
  - a staff-mode paragraph: owner or ops by role; `noshow` rows move; `period-over` instead of the start checks; window, handicap, Elite one-a-day and (with `allowFull`) full skipped and reported as `overrides`; `test-athlete`; `cancelledFrom` on the old row;
  - the re-confirm notice key is `booking-confirmed_{id}_{createdVia}_{createdAt ms}`.

- [ ] **Step 1:** No test (a doc). Apply the edits with the normalize/restore script.
- [ ] **Step 2: Commit** `docs(data-model): staff booking fields and moveBooking staff mode`.

---

## Lane C: client shared pieces

All paths are under `frontend/src/portal/`. Test command: `cd frontend && CI=true npx react-scripts test --watchAll=false <pattern>`.

### Task C0: Seams Lane E builds on (land first)

**Files**
- Create every Lane C file listed under File Structure, each exporting **exactly** the names in its task's Interfaces below:
  - components default-export a component that returns `null`;
  - hooks return `{data: null, loading: true, error: null}`;
  - functions throw `new Error('staff booking: not built yet')`;
  - exported constants are `''` (C2 Step 2 expects this).
- Except these, which are real in C0:
  - `data/staffBooking.js`: `STAFF_BOOK_ROLES`, `staffMayBook`, `STAFF_ROW_FIELDS`, `staffRowFields`, `staffMovable`, `rosterRowToStaffRow`, `rosterMembers`;
  - `data/staffBookingCopy.js`: `MOVE_LABEL`, `CANCEL_LABEL`, `moveAria`, `cancelAria`, `BOOK_A_SESSION`, `ADD_ATHLETE`, `testAthleteLine`;
  - `components/staffBooking/StaffRowActions.js`.
- Modify `data/staffCancel.js`:
  - `staffCancellable` `:49-55`: after the Calendly line, `if (row.type === 'mental') return false;`;
  - `siblingsFor` `:73`: search `[...(m.spent || []), ...(m.nextSpent || [])]`;
  - header `:13-18`: "not Calendly, not a 1:1";
  - `REFUSALS` `:147-157`: add `mental: "Yannick's 1:1s are booked and changed in Calendly."` (spec 10.5). `StaffCancelSheet` shows this map's words (`staffCancelRefusal`, called from `hooks/staffCancel.js:43`), not C2's, so S6's new server refusal needs its line here.
- Modify `data/billingHub.js` (+3 lines; it ends at most 480):
  - the `periodRows` booking row (`:121-139`) gains `type: b.type ?? (session && session.type) ?? null,`;
  - the `hubMemberFor` return (`:236-257`) gains `test: athlete.test === true,` after `name` and `nextSpent: nextRows.spent,` after `reserved,`.
- Modify `hooks/billing.js` (**0 net lines**):
  - `householdView` `:88`: `name: household.name ?? null, test: household.test === true,`;
  - directory push `:262`: add `test: a.test === true` inside the same object literal;
  - `:279`: `function seedMember` becomes `export function seedMember`.
- Test:
  - `data/staffCancel.test.js` (add cases);
  - `data/billingHub.test.js` (add a case);
  - create `data/staffBooking.c0.test.js`, merged into `data/staffBooking.test.js` in C1;
  - create `components/staffBooking/StaffRowActions.test.js`.

**Interfaces (real in C0)**
- `STAFF_BOOK_ROLES = ['owner', 'ops']`; `staffMayBook(role) -> boolean`.
- `STAFF_ROW_FIELDS = ['householdId', 'source', 'type', 'date', 'periodKey', 'chargedFrom', 'comp', 'graceTokenId']`.
- `staffRowFields(booking) -> object`: those keys, `comp: booking.comp === true`, the others `?? null`.
- `staffMovable(row, {periodStart = null} = {}) -> boolean`: `staffCancellable(row, {periodStart})`. Since 9.3 that already excludes `mental`; it stays a separate export so the two can diverge.
- `rosterRowToStaffRow(row, session) -> BillingHubRow`.
  - `row` is a `liveSessionAttendance` row with `staffRowFields` spread in; `session` is `{id, date, time, type, label}`.
  - Returns `{id: row.bookingId, kind: 'booking', athleteId, householdId, sessionId: session.id, date: row.date ?? session.date, time: session.time ?? null, label: session.label, type: row.type ?? session.type, status, source, chargedFrom, comp, graceTokenId, periodKey, viaGrace: Boolean(graceTokenId), viaSingle: isSingleTokenId(graceTokenId), viaComp: comp === true}`.
- `rosterMembers(rows, householdId, session) -> [{athleteId, name, spent: [BillingHubRow], reserved: [], period: {start: null}}]`: the roster rows of that household, in roster order.
- `MOVE_LABEL = 'Move'`, `CANCEL_LABEL = 'Cancel'`.
- `moveAria(first, rowLabel = null)`:
  - with a `rowLabel`: `` `Move ${first}'s ${rowLabel}` ``;
  - without one: `` `Move ${first}` ``;
  - with no first name and a `rowLabel`: `` `Move ${rowLabel}` ``.
- `cancelAria(first, rowLabel = null)`:
  - with a `rowLabel`: `` `Cancel ${first}'s ${rowLabel}` ``, the existing `RowCancel` label, byte for byte;
  - without one: `` `Cancel ${first}'s booking` ``;
  - with no first name and a `rowLabel`: `` `Cancel ${rowLabel}` ``.
- `BOOK_A_SESSION = 'Book a session'`, `ADD_ATHLETE = 'Add athlete'`.
- `testAthleteLine(first)`: `` `${first} is a test athlete. Test athletes can't be booked onto real sessions.` ``.
- `StaffRowActions({row, first = null, rowLabel = null, periodStart = null, onMove = null, onCancel = null})` renders, in order:
  - a Move button when `onMove && staffMovable(row, {periodStart})`;
  - a Cancel button when `onCancel && staffCancellable(row, {periodStart})`.
  - Each is a `<button type="button">` in `RowCancel`'s style (`TokenMeter.js:85-106`), kept whole so E1's Cancel stays identical: `height: 44`, `minWidth: 44`, `padding: '0 2px 0 6px'`, `background: 'none'`, `border: 'none'`, `font: 600 12px ${font.body}`, `cursor: 'pointer'`, `flex: 'none'`. Move uses `color.primary`, Cancel uses `color.error`.
  - The aria labels come from `moveAria` / `cancelAria`. Clicks call `onMove(row)` / `onCancel(row)`. It renders `null` when there is neither button.

- [ ] **Step 1: Write the failing tests.**
  - `staffCancel.test.js`:
    - `staffCancellable(row({type:'mental'})) === false`;
    - `staffCancelRefusal('mental')` is `"Yannick's 1:1s are booked and changed in Calendly."`;
    - `siblingsFor` finds Riley's next-period row on `s9` (Dec 3) through `nextSpent`, as `[{athleteId:'riley', name:'Riley Whitfield', row:<the Dec row>}]`.
  - `billingHub.test.js`: `periodRows` rows carry `type: 'training'`, taken from the booking or else from the session; `hubMemberFor(...).nextSpent` holds the December rows; `test` is true for `athlete.test`.
  - `staffBooking.c0.test.js`:
    - `staffRowFields({comp:undefined, type:'training'})` deep-equals `{householdId:null, source:null, type:'training', date:null, periodKey:null, chargedFrom:null, comp:false, graceTokenId:null}`;
    - `rosterRowToStaffRow` of `{bookingId:'jordan_s2', athleteId:'jordan', name:'Jordan Whitfield', status:'noshow', householdId:'hh1', type:'training', date:'2026-11-17', chargedFrom:'grace', graceTokenId:'single_cs1', comp:false}` with session `{id:'s2', date:'2026-11-17', time:'4:00 PM', type:'training', label:'Training block'}` gives `id 'jordan_s2'`, `sessionId 's2'`, `viaSingle true` and `label 'Training block'`;
    - `rosterMembers` keeps only `hh1` rows;
    - `staffMovable` is true for `confirmed` and `noshow`, false for `attended`, `cancelled`, `source:'calendly'`, `type:'mental'` and `kind:'waitlist'`, and false for a row dated before `periodStart`;
    - `staffMayBook('owner') && staffMayBook('ops') && !staffMayBook('coach')`.
  - `StaffRowActions.test.js`:
    - the buttons read `['Move', 'Cancel']` in that order;
    - the aria labels are `'Move Jordan'` and `"Cancel Jordan's booking"`, and with `rowLabel 'Tue, Nov 10 Training block'` they are `"Move Jordan's Tue, Nov 10 Training block"` and `"Cancel Jordan's Tue, Nov 10 Training block"`;
    - each `style.height === '44px'`;
    - an attended row renders nothing;
    - no `onMove` gives Cancel only.
- [ ] **Step 2: Run** `CI=true npx react-scripts test --watchAll=false src/portal/data/staffCancel src/portal/data/billingHub src/portal/data/staffBooking src/portal/components/staffBooking`. Expect FAIL on the new cases.
- [ ] **Step 3: Implement** the real pieces and the stubs. Check `wc -l` on `billingHub.js` (480 at most) and `hooks/billing.js` (499).
- [ ] **Step 4: Run** the same pattern plus `src/portal/components/TokenMeter src/portal/screens/Billing src/portal/hooks/billing`. Expect green: the existing tests are unchanged. Then run `npx eslint src`.
- [ ] **Step 5: Commit** `feat(staff-booking): client seams (row fields, row actions, billing rows carry type, nextSpent, test)`. **Lane E merges this commit before starting.**

### Task C1: Pure athlete model and add facts

**Files**
- Fill in `data/staffBooking.js` (`searchAthletes`, `staffAddFacts`, `moveChargeKind`) and create the real `data/staffAthlete.js`.
- Test: `data/staffBooking.test.js` (C0's cases moved in) and `data/staffAthlete.test.js`.

**Interfaces**
- Consumes:
  - `data/packages.js`: `periodFor`, `normalizeAnchorDay`, `eliteDailyCapHit`, `windowMonthsFor`;
  - `data/calendar.js`: `openThrough`, `academyDateISO`;
  - `data/sessionStart.js`: `sessionStarted`;
  - `data/reserved.js`: `handicapLimitOf`, `handicapOf`, `reservedEligible`;
  - `data/singleToken.js`: `isSingleTokenId`;
  - `data/bookingChanges.js`: `isFreeComp`;
  - `data/hiddenSessions.js`: `isHiddenSession`;
  - `data/billingHub.js`: `sessionLabel`;
  - `data/staffCancel.js`: `firstOf`.
- Produces `searchAthletes(directory, query) -> [{athleteId, name, householdId, householdName, packageName, test}]`.
  - `directory` is `useHouseholdsDirectory` data.
  - Each query word (trimmed, case-insensitive) must be a prefix of some word of the athlete's name.
  - Results are sorted by name, at most 8. `test` is `athlete.test || household.test`. A blank query gives `[]`.
- Produces `payStateOf(athlete, household, pkg) -> 'no-package' | 'past_due' | 'lapsed' | 'unpaid' | 'paid'`, checked in that order:
  - no package;
  - household `membership.status` `past_due`, then `lapsed`;
  - `billing.oneTime === true && packageId !== 'single'`, or `billing` present with `status !== 'active'`;
  - otherwise paid.
  - This mirrors `lib.membershipAllowsBooking` plus `!pkg`.
- Produces `staffAthleteModel({athlete, household, pkg, bookings, waitlist, graceTokens, sessionsById, tokens, today}) -> StaffAthleteModel`:

  ```
  { athleteId, name, first, householdId, householdName, packageName, test, handicap, pkg, anchorDay,
    payState, tokens /* liveTokens output with nextPeriod, or null */,
    period: {start, end}          /* periodFor(today, anchorDay) */,
    nextPeriod: {start, end},
    bookings, waitlist, graceTokens, heldSessionIds, waitingSessionIds,
    groups: { thisPeriod: Row[], nextPeriod: Row[], later: Row[] } }
  ```

  - `period` and `nextPeriod` map `periodFor`'s `{periodKey, periodEnd}` to `{start, end}`.
  - A Row is a billing-hub row (`periodRows` shape plus `type`), plus `badge`.
  - Rows are the non-cancelled bookings and the waitlist entries dated on or after `period.start`. They group by date (up to `period.end`, up to `nextPeriod.end`, later) and sort by date, then start time.
  - `badge` order: `'Waitlist'` (a waitlist row), `'Attended'`, `'No-show'`, `'Free'` (`isFreeComp`), `'Session token'` (`viaSingle`), `'Bonus token'` (`viaGrace`), else `'Booked'`.
- Produces `staffAddFacts(session, model, now) -> {offer, held, waiting, full, taken, capacity, started, warnings, charge}`:
  - `held` and `waiting` come from the model's id lists. `taken = Number(session.booked) || 0`, `capacity = Number(session.capacity) || 0`, `full = taken >= capacity`, `started = sessionStarted(session, now)`.
  - `offer = !held && !blocked`, where `blocked` is any of: status `'cancelled'`, hidden, `bookable === false`, `type === 'mental'`, `source === 'calendly'`, `unresolved === true`, or `session.date < model.period.start`.
  - `warnings` come in this order. Each entry carries what its copy needs:
    1. `{kind:'outside-window', through}` when `session.date > openThrough(now, windowMonthsFor(pkg))`;
    2. `{kind:'handicap-reserved', limit, handicap}` when `!reservedEligible(session, athlete)`;
    3. `{kind:'one-per-day', type, date}` when `eliteDailyCapHit(pkg, session.type, session.date, bookings)`;
    4. `{kind:'started', today: session.date === academyDateISO(now), date}` when started;
    5. `{kind:'waiting'}` when waiting.
  - `charge` (a prediction; the server decides). The first match wins:
    1. `payState !== 'paid'` gives `{kind:'free-only', payState}`.
    2. `tokens.unlimited` gives `{kind:'elite'}`.
    3. The first token in `model.tokens.grace` with no expiry, or an expiry on or after `session.date`, gives `{kind: isSingleTokenId(id) ? 'single' : 'grace', expiresAt}`. That list has spent and held tokens already removed and is sorted soonest expiry first, the order `lib.chargeFor` uses. Never read the raw `model.graceTokens` here: it still holds spent tokens.
    4. When `waiting && tokens.perPurchase && tokens.held > 0` with no grace token found, `{kind:'single'}`: the hold this add releases.
    5. Set `sp = periodFor(session.date, anchorDay).periodKey`. When `sp` is neither `period.start` nor `nextPeriod.start`, or it is next but `tokens.nextPeriod` is null, `{kind:'unknown'}`.
    6. Take `pos` as `tokens` (this period) or `tokens.nextPeriod` (next); `left = (pos.left || 0) + (waiting ? 1 : 0)`. When `left > 0`, `{kind:'period', left: left - 1, next, from: sp}`: `left` is what remains **after** this add.
    7. Otherwise `{kind:'none', next}`.
- Produces `moveChargeKind(row, target, model) -> {kind: 'elite' | 'free' | 'carry' | 'swap', fromMonth?, toMonth?}`:
  - `row.chargedFrom === 'elite'` or unlimited gives `elite`;
  - `isFreeComp(row)` gives `free`;
  - a `row.graceTokenId` whose raw token in `model.graceTokens` has no expiry, or an expiry on or after `target.date`, gives `carry`;
  - a period row whose own period key equals the target's (anchor-aware) gives `carry`;
  - otherwise `swap`, with `fromMonth` and `toMonth` as the `'MMMM'` names of the two period keys.

- [ ] **Step 1: Write the failing tests** (`NOW = new Date('2026-11-12T18:00:00Z')`; Jordan in `hh1`, anchor 1, t-6, handicap 4).
  - `searchAthletes`:
    - `'jor'` gives Jordan's row deep-equal `{athleteId:'jordan', name:'Jordan Whitfield', householdId:'hh1', householdName:'Whitfield family', packageName:'6 tokens', test:false}`;
    - `'JOR whit'` matches; `'ord'` does not;
    - nine "Riley" athletes give 8;
    - a test household's athlete has `test: true`;
    - `'  '` gives `[]`.
  - `payStateOf`: each of the five states from one fixture each, with the precedence `no-package` before `past_due`.
  - `staffAthleteModel`:
    - a Tue Nov 10 attended row is in `thisPeriod` with badge `'Attended'`;
    - a Dec 3 row is in `nextPeriod`;
    - an Elite Jan 7 row is in `later`, and `later` is empty without it;
    - a waitlist entry has badge `'Waitlist'`;
    - a cancelled row is excluded;
    - an Oct 27 row is excluded;
    - the badges cover `'No-show'`, `'Free'`, `'Session token'`, `'Bonus token'` and `'Booked'`;
    - `test` is true when only the household is a test one;
    - `first === 'Jordan'`.
  - `staffAddFacts` charges:
    - `period` for `left 3`: `{kind:'period', left:2, next:false, from:'2026-11-01'}`;
    - a Dec 3 session with `nextPeriod.left 6`: `{kind:'period', left:5, next:true, from:'2026-12-01'}`;
    - `grace` with `expiresAt '2026-11-20'`; an expired one is skipped;
    - `single` for `single_cs1`;
    - `elite`;
    - Jan 14 on anchor 1 gives `unknown`;
    - no left gives `{kind:'none', next:false}`;
    - `free-only` for each non-paid state;
    - waiting on this session adds one back;
    - a single athlete with `held 1` waiting on it gives `single`.
  - `staffAddFacts` warnings:
    - `'2027-01-05'` on t-6 gives `[{kind:'outside-window', through:'2026-12-31'}]`;
    - `maxHandicap 5` with handicap 9 gives `{kind:'handicap-reserved', limit:5, handicap:9}`, and with no handicap gives `handicap:null`;
    - Elite with a training on Nov 17 gives `{kind:'one-per-day', type:'training', date:'2026-11-17'}`;
    - today at 11:00 AM gives `{kind:'started', today:true, date:'2026-11-12'}`;
    - Nov 10 gives `{kind:'started', today:false, date:'2026-11-10'}`;
    - waiting gives `{kind:'waiting'}`;
    - the order holds when several apply.
  - `staffAddFacts` flags:
    - `booked 12 / capacity 12` gives `full true, taken 12, capacity 12`;
    - a session the athlete holds gives `held true, offer false`;
    - hidden, cancelled, `bookable:false`, mental and before-period sessions each give `offer false`.
  - `moveChargeKind`:
    - Elite gives `elite`; a comp gives `free`;
    - a bonus row valid on the target gives `carry`;
    - Nov to Nov gives `carry`;
    - Nov to Dec gives `{kind:'swap', fromMonth:'November', toMonth:'December'}`;
    - with anchor 15, Nov 14 to Nov 16 gives `swap`.
- [ ] **Step 2: Run** `... src/portal/data/staffBooking src/portal/data/staffAthlete`. Expect FAIL: `not built yet`.
- [ ] **Step 3: Implement.** Keep each file under 500 lines. `staffAthlete.js` imports from `staffBooking.js`, never the reverse.
- [ ] **Step 4: Run** the same tests and `npx eslint src`.
- [ ] **Step 5: Commit** `feat(staff-booking): athlete model, add facts and move charge (pure)`.

### Task C2: The copy module

**Files:** Fill in `data/staffBookingCopy.js`. Test: `data/staffBookingCopy.test.js`.

**Interfaces**
- Produces the constants below and these functions:
  - `noAthleteMatches(query)`; `athleteSubline(householdName, packageName)`;
  - `tokenLine(model)`, where a single-token athlete's `n` is `availableCount(model.tokens)` (`data/singleToken.js:100`); `groupLabel('this' | 'next', {start, end})`; `rowWhen(date, time)`;
  - `seatsPill(facts)`; `reservedTagLine(limit)`; `noSessionsOn(date)`;
  - `athletePickerTitle(label, date, time)`;
  - `addTitle(first, facts)`; `addSummary(name, date, time, label)`; `chargeLine(first, charge, {freeOn})`;
  - `warningLine(first, warning)`; `waitlistCountLine(n)`; `addConfirmLabel(first, {free, full, busy})`;
  - `staffMoveTitle(first, type)`; `staffMoveQuestion(first, from, to, {full, taken, capacity})`, where `from` and `to` are `{date, time}` (C7 passes `row` and `target`, which carry both);
  - `moveChargeLine(charge)`, taking `moveChargeKind`'s `{kind, fromMonth, toMonth}`; `moveConfirmLabel({full, busy})`;
  - `addSuccessLine({first, date, time, result, predicted})`; `moveSuccessLine(first, date, time)`;
  - `staffRefusalLine(reason, {action, first}, err)`; `refusalKind(reason, action)`; `nothingChanged(line)`.
- Dates format as follows:
  - "Tue Nov 17, 4:00 PM" via `dayTimeLabel`;
  - "Tue Nov 17" via `'EEE MMM d'`;
  - "Nov 20" and "Dec 1" via `'MMM d'`;
  - "Nov 1 - Nov 30" with a spaced hyphen.
- `refusalKind(reason, action)` returns one of:
  - `'full'`: `full`;
  - `'none-row'`: add with `no-tokens-left` or `no-session-token`;
  - `'free-only'`: add with `not-paid`;
  - `'session'` (back to the picker, reloaded, with `nothingChanged(line)`): `session-missing`, `calendly`, `session-cancelled`, `session-hidden`, `display-only`, `period-over`, `already-booked`, `different-type`, `same-session`;
  - `'unconfirmed'`: no reason;
  - `'end'` (the line and a Close): everything else, including move with `no-tokens-left` or `membership-inactive`, `attended`, `not-confirmed`, `calendly-managed`, `mental-no-move`, `mental` and `test-athlete`.
- From the roster (fixed session), `'session'` behaves as `'end'`. The sheet decides this, not the copy.

- [ ] **Step 1: Write the failing test.** Every string in spec 10.2-10.5 is pinned through the function that makes it:

| Call | Expected |
|---|---|
| `MANAGE_BOOKINGS_LABEL`, `MANAGE_BOOKINGS_BODY` | `'Manage bookings'`, `'Add, move or cancel a session for any athlete.'` |
| `FIND_ATHLETE_LABEL`, `FIND_ATHLETE_PLACEHOLDER` | `'Find an athlete'`, `'Start typing a name'` |
| `athleteSubline('Whitfield family', '6 tokens')`, `TEST_BADGE` | `'Whitfield family · 6 tokens'`, `'Test'` |
| `noAthleteMatches('zz')`, `ATHLETES_LOAD_FAILED` | `'No athlete matches "zz".'`, `"Athletes didn't load. Check your connection and try again."` |
| `BACK_TO_ADMIN`, `STAFF_VIEW_LABEL`, `FAMILY_BILLING` | `'‹ Admin'`, `'Bookings · staff view'`, `'Family billing'` |
| `tokenLine` for `left 3`, `granted 6` / Elite / single with 2 / single with 1 | `'3 of 6 tokens left this period'` / `'Elite'` / `'2 session tokens'` / `'1 session token'` |
| `tokenLine` for `unpaid` / `past_due` / `lapsed` / `no-package` | `'Not paid yet - Free only'` / `'Membership past due - Free only'` / `'Membership lapsed - Free only'` / `'No package on file - Free only'` |
| `groupLabel('this', {start:'2026-11-01', end:'2026-11-30'})`, `groupLabel('next', {...Dec})` | `'This period · Nov 1 - Nov 30'`, `'Next period · Dec 1 - Dec 31'` |
| `LATER_LABEL`, `NOTHING_BOOKED`, `rowWhen('2026-11-17', '4:00 PM')` | `'Later'`, `'Nothing booked.'`, `'Tue Nov 17 · 4:00 PM'` |
| `CANCEL_IN_CALENDLY`, `ATHLETE_NOT_ON_FILE`, `testAthleteLine('Jordan')` | `'Cancel in Calendly'`, `"That athlete isn't on file."`, `"Jordan is a test athlete. Test athletes can't be booked onto real sessions."` |
| `DAY_LABEL`, `PREV_DAY`, `NEXT_DAY`, `CLOSE` | `'Day'`, `'‹ Previous day'`, `'Next day ›'`, `'Close'` |
| `seatsPill` for 9 left / full 14 of 14 | `'9 left'` / `'Full · 14 of 14'` |
| `STARTED_TAG`, `reservedTagLine(5)`, `WAITLISTED_TAG`, `BOOKED_TAG` | `'Started'`, `'Reserved 5 or better'`, `'Waitlisted'`, `'Booked'` |
| `noSessionsOn('2026-11-17')`, `FINDING_SESSIONS`, `SESSIONS_LOAD_FAILED` | `'No sessions to book on Tue Nov 17.'`, `'Finding sessions...'`, `"Sessions didn't load. Check your connection and try again."` |
| `athletePickerTitle('Training block', '2026-11-17', '4:00 PM')`, `ON_THIS_SESSION` | `'Add an athlete to Training block, Tue Nov 17, 4:00 PM'`, `'On this session'` |
| `addTitle('Jordan', {full:false})`, `addTitle('Jordan', {full:true, taken:14, capacity:14})` | `'Add Jordan to this session?'`, `'This session is full (14 of 14) - add anyway?'` |
| `addSummary('Jordan Whitfield', '2026-11-17', '4:00 PM', 'Training block')` | `'Jordan Whitfield · Tue Nov 17, 4:00 PM · Training block'` |
| `chargeLine` period, this / next | `"Uses 1 of Jordan's tokens for this period - 2 left."` / `"Uses 1 of Jordan's tokens for next period (from Dec 1) - 5 left."` |
| `chargeLine` grace with / without expiry | `"Uses Jordan's bonus token (good through Nov 20)."` / `"Uses Jordan's bonus token."` |
| `chargeLine` single / elite / unknown | `"Uses one of Jordan's session tokens."` / `'Elite - nothing to use.'` / `'Uses a token from that period if one is left.'` |
| `chargeLine` none, this / next | `'Jordan has no tokens left for this period. Switch on Free to add anyway.'` / `'... for next period. Switch on Free to add anyway.'` |
| `chargeLine` free-only: unpaid or no-package / past_due / lapsed | `"Jordan isn't paid up, so this booking is Free."` / `"Jordan's membership is past due, so this booking is Free."` / `"Jordan's membership is lapsed, so this booking is Free."` |
| `chargeLine(..., {freeOn:true})`, `FREE_LABEL` | `'Free - no token used.'`, `'Free'` |
| `warningLine` window | `"Past Jordan's booking window - families can book through Dec 31."` |
| `warningLine` handicap, 9 / none | `"Reserved for handicaps of 5 or better - Jordan's is 9."` / `'Reserved for handicaps of 5 or better - Jordan has no handicap on file.'` |
| `warningLine` one-per-day (type training) | `'Jordan already has a Training block on Tue Nov 17 - Elite includes one a day.'`; for tournament: `'... a Tour event on ...'` |
| `warningLine` started, today / earlier | `'This session has already started.'` / `'This session was on Tue Nov 10.'` |
| `warningLine` waiting, `waitlistCountLine(3)` | `"Jordan is on this session's waitlist - adding takes Jordan off it."`, `'3 on the waitlist for this session.'` |
| `addConfirmLabel` | `'Add Jordan'`; free gives `'Add Jordan free'`; full gives `'Add anyway'`; busy gives `'Adding...'`; `BACK` is `'Back'` |
| `staffMoveTitle('Jordan', 'training' / 'tournament' / 'phil')` | `'Move Jordan to another Training block'` / `'... Tour event'` / `'... Phil session'` |
| `staffMoveQuestion` plain / full | `'Move Jordan from Tue Nov 17, 4:00 PM to Thu Nov 19, 4:00 PM?'` / `'Thu Nov 19, 4:00 PM is full (12 of 12) - move Jordan anyway?'` |
| `moveChargeLine` carry / swap / free / elite | `'The token moves with it.'` / `'Uses a December token; the November one comes back.'` / `'Stays free.'` / `null` |
| `moveConfirmLabel`, `KEEP_IT` | `'Move'`, full gives `'Move anyway'`, busy gives `'Moving...'`; `'Keep it'` |
| `addSuccessLine` period / grace / single / free / elite | `'Jordan is booked for Tue Nov 17, 4:00 PM - 1 token used.'` / `'... - bonus token used.'` / `'... - session token used.'` / `'Jordan is booked for Tue Nov 17, 4:00 PM, free.'` / `'Jordan is booked for Tue Nov 17, 4:00 PM.'` |
| `addSuccessLine` overfill (`booked 15`, `capacity 14`) | the line plus `' The session now has 15 of 14.'` |
| `addSuccessLine` simulated (`result.simulated`, `predicted {kind:'period'}`) | the same period line |
| `moveSuccessLine('Jordan', '2026-11-19', '4:00 PM')`, `STAFF_CHANGE_UNCONFIRMED` | `'Jordan moved to Thu Nov 19, 4:00 PM.'`, `"We couldn't confirm the change. Check the list before trying again."` |
| `staffRefusalLine` for `signed-out`, `not-staff`, `bad-request` | `'You are signed out. Sign in and try again.'`, `'Only the owner or ops can change bookings here.'`, `"That change wasn't complete. Try again."` |
| `athlete-missing`, `booking-missing`, `no-household` | `"That athlete isn't on file any more."`, `'That booking no longer exists.'`, `'Jordan has no family on file, so the booking would have nowhere to show.'` |
| `test-athlete`, `session-missing` | `"Jordan is a test athlete and can't be booked onto real sessions."`, `"That session isn't on the schedule any more."` |
| `calendly`, `calendly-managed`, `mental-no-move`, `mental` (all four) | `"Yannick's 1:1s are booked and changed in Calendly."` |
| `session-cancelled`, `session-hidden`, `display-only`, `period-over` | `'The academy cancelled that session.'`, `'That session is hidden from the schedule. Show it first, then add.'`, `"That session isn't booked through the portal."`, `"That session is in a billing period that's over."` |
| `already-booked`, `not-confirmed`, `attended` | `'Jordan is already on that session.'`, `'This booking was already changed.'`, `"This booking is marked attended, so it can't move."` |
| `not-paid` (add), `membership-inactive` (move) | `"Jordan isn't paid up - switch on Free."`, `"Jordan's membership isn't active, so a paid booking can't move. Cancel it and add Free instead."` |
| `no-tokens-left` / `no-session-token` (move) | `'Jordan has no tokens left for that period. Cancel it and add Free instead.'` |
| `different-type`, `same-session` | `'Pick a session of the same kind.'`, `'Pick a different session.'` |
| an unknown reason; no reason | `err.message`; `STAFF_CHANGE_UNCONFIRMED` |
| `nothingChanged('The academy cancelled that session.')` | `'The academy cancelled that session. Nothing was changed.'` |

  Also: `refusalKind` returns the right kind for every reason in the list above. No string contains "tournament". Each Elite string avoids "token".
- [ ] **Step 2: Run** `... src/portal/data/staffBookingCopy`. Expect FAIL: stubs return `''` and throw.
- [ ] **Step 3: Implement.** Reuse `dayTimeLabel` (`data/bookingChanges.js`) and the C0 constants.
- [ ] **Step 4: Run** the test and `npx eslint src`.
- [ ] **Step 5: Commit** `feat(staff-booking): staff booking copy and refusal map`.

### Task C3: Hooks and the callable

**Files**
- Fill in `hooks/staffBooking.js`.
- Modify `hooks/callables.js` (89 lines): after `callStaffCancelBooking` (`:86`), add a JSDoc block and `export const callStaffBookSession = callable('staffBookSession');`.
- Test: create `hooks/staffBooking.test.js`.
- `hooks/staffBooking.js` is not re-exported from `hooks/index.js`: screen tests mock `../hooks` (the `hooks/move.js` precedent).

**Interfaces**
- Consumes:
  - `hooks/live.js`: `fetchAthlete`, `fetchHousehold`, `fetchPackage`, `fetchBookings`, `fetchSessionsByIds`, `fetchSessionsInRange`, `fetchGraceTokensByAthlete`, `isLive`, `ERR`;
  - `hooks/waitlist.js`: `fetchWaitlistByAthlete`, `fetchWaitlistBySession`;
  - `hooks/index.js`: `liveTokens`;
  - `hooks/billing.js`: `seedMember`;
  - `hooks/invalidate.js`: `bump`, `useInvalidation`;
  - `useSeedResource`;
  - the C1 and C2 modules.
- Produces `useStaffAthlete(athleteId) -> {data: StaffAthleteModel | null, loading, error}`.
  - Live mode reads, all athlete-scoped with **no `householdId` filter** (staff read all): `fetchAthlete`, then `fetchHousehold(athlete.householdId)` and `fetchPackage(athlete.packageId)`, plus `fetchBookings(id)`, `fetchWaitlistByAthlete(id)`, `fetchGraceTokensByAthlete(id)`, `fetchSessionsByIds` (for rows dated on or after the period start) and `liveTokens(athlete, pkg, bookings, anchorDay, today)`.
  - A missing athlete gives `error.code === ERR.NOT_FOUND`.
  - Deps: `['staff-athlete', athleteId]` plus the `useInvalidation` gens of `bookings`, `sessions`, `waitlist` and `graceTokens`.
  - Seed mode builds the model with `staffAthleteModel` over the seed child (`HOUSEHOLD.children`). Its `bookings` are `seedMember(child, today, anchorDay).spent`, each row turned into a booking `{id, athleteId, sessionId, status, date, type, periodKey}`; its `tokens` come from the same member.
- Produces `useStaffSession(sessionId) -> {data: session | null, loading, error}`: `fetchSessionsByIds([id])[0]`. Seed mode reads `SEASON`.
- Produces `useStaffDaySessions(dateISO) -> {data: Session[] | null, loading, error}`: `fetchSessionsInRange(day, day)`, minus status `cancelled`, `isHiddenSession`, `bookable === false` and type `mental`. Seed mode uses `sessionsForDate(SEASON, day)` with the same filter.
- Produces `useSessionWaitlistCount(sessionId, {athleteId, enabled}) -> {data: number | null}`: the entries, excluding the athlete's own.
- Produces `staffBookSession({athleteId, sessionId, free, allowFull}, {first} = {}) -> Promise<result>`.
  - Live mode calls `callStaffBookSession({athleteId, sessionId, ...(free ? {free: true} : {}), ...(allowFull ? {allowFull: true} : {})})`.
  - Seed mode resolves `{simulated: true, bookingId: `${athleteId}_${sessionId}`, athleteId, sessionId, comp: Boolean(free), chargedFrom: null, booked: null, capacity: null, overrides: []}` and calls nothing.
- Produces `staffMoveBooking({bookingId, toSessionId, allowFull}, {first} = {})`.
  - Live mode calls `callMoveBooking({bookingId, toSessionId, ...(allowFull ? {allowFull: true} : {})})`.
  - Seed mode resolves `{simulated: true, bookingId: null, movedFrom: bookingId, sessionId: toSessionId, overrides: []}`.
- Both live calls `bump('bookings')`, `bump('sessions')` and `bump('waitlist')` after success **and** after failure.
- A failure rejects with `Object.assign(new Error(staffRefusalLine(reason, {action, first}, err)), {reason, details, cause: err})`:
  - `reason = err.reason || null`;
  - `details = err.cause && err.cause.details ? {taken: err.cause.details.taken, capacity: err.cause.details.capacity} : null`.

- [ ] **Step 1: Write the failing test** (`hooks/staffBooking.test.js`). Mock `./live`, `./callables`, `./invalidate`, `./waitlist` and `./index` with plain functions.
  - `'seed: add and move call nothing and echo'`: `isLive` false; the results deep-equal the two seed shapes above; `mockSent` is `[]`.
  - `'live add: the payload, then the lists reload'`:
    - `{athleteId:'jordan', sessionId:'s2', free:false, allowFull:false}` sends exactly `{athleteId:'jordan', sessionId:'s2'}`;
    - with both true, it sends `{athleteId:'jordan', sessionId:'s2', free:true, allowFull:true}`;
    - the bumps contain `bookings`, `sessions` and `waitlist`.
  - `'live move goes through moveBooking'`: the payload is `{bookingId:'jordan_s1', toSessionId:'s2'}`, plus `allowFull: true` only when set.
  - `'a refusal: reason, details, staff words; the lists still reload'`:
    - `Object.assign(new Error('raw'), {reason:'full', cause:{details:{reason:'full', taken:12, capacity:12}}})` rejects with `reason 'full'` and `details {taken:12, capacity:12}`;
    - a `session-hidden` rejection's message is `'That session is hidden from the schedule. Show it first, then add.'`;
    - no reason gives the message `"We couldn't confirm the change. Check the list before trying again."`.
  - `'useStaffAthlete reads staff-wide'`: `fetchBookings` is called with `('jordan')`, with no second argument; so is `fetchWaitlistByAthlete`; `liveTokens` gets the anchor; `data.groups` is present; a `NOT_FOUND` athlete gives `error.code 'not-found'`.
  - `'useStaffDaySessions drops hidden, cancelled, display-only and mental sessions'`: four bad sessions and one good one give `[good]`; `fetchSessionsInRange` is called with `('2026-11-17', '2026-11-17')`.
  - `'useSessionWaitlistCount leaves out the athlete'`: three entries, one of them Jordan's, give `2`.
- [ ] **Step 2: Run** `... src/portal/hooks/staffBooking src/portal/hooks/callables`. Expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests and `npx eslint src`.
- [ ] **Step 5: Commit** `feat(staff-booking): staff booking hooks and the staffBookSession client`.

### Task C4: Sheet shell, athlete search and athlete picker

**Files**
- Fill in `components/staffBooking/StaffSheet.js`, `AthleteSearch.js` and `AthletePicker.js`.
- Test: `AthleteSearch.test.js`, `AthletePicker.test.js`.

**Interfaces**
- `StaffSheet({title, onClose, children, footer})`:
  - the `MoveSheet` pattern: a fixed overlay (a tap on it calls `onClose`) and a bottom sheet with `role="dialog"` and `aria-label={title}`;
  - `maxHeight: '85%'` with internal scroll and a 22px side padding;
  - no horizontal overflow at 375px.
- `AthleteSearch({onPick, disabledIds = [], disabledLabel = ON_THIS_SESSION, armed = false, disableTest = false})`:
  - a `Field` labelled `FIND_ATHLETE_LABEL` with the placeholder text;
  - the directory hook (`useHouseholdsDirectory` from `hooks/billing.js`) mounts only after the field's first focus (a wrapper `onFocus`) or when `armed`;
  - result rows are `<button>` with `minHeight: 44`, the name, then `athleteSubline` under it;
  - a `TEST_BADGE` badge on test athletes;
  - `disabledIds` rows are disabled (`disabled` attribute, no `onPick`) and read `disabledLabel`;
  - test athletes are disabled the same way only when `disableTest` (the roster picker, spec 10.5). On the Admin card a test athlete shows the badge and opens its screen, which carries the test card (spec 10.2, E5);
  - no match gives `noAthleteMatches(query)`; a load error gives `ATHLETES_LOAD_FAILED`.
- `AthletePicker({session: {id, date, time, label}, onSessionIds, onPick, onClose})`: a `StaffSheet` titled `athletePickerTitle(label, date, time)`, with `<AthleteSearch armed disableTest disabledIds={onSessionIds} onPick={onPick} />` and a `CLOSE` button.

- [ ] **Step 1: Write the failing tests.**
  - `AthleteSearch.test.js` (mock `../../hooks/billing` with a counting `useHouseholdsDirectory`):
    - `'the directory loads on first focus'`: the calls stay 0 until focus, then reach at least 1;
    - typing `'jor'` shows `'Jordan Whitfield'` and `'Whitfield family · 6 tokens'`;
    - a test athlete shows `'Test'`, its button is enabled, and a click calls `onPick` with `test: true`;
    - with `disableTest`, the same row is disabled and a click calls nothing;
    - `'zz'` shows `'No athlete matches "zz".'`;
    - an error shows `"Athletes didn't load. Check your connection and try again."`;
    - each row button has `minHeight` of at least 44.
  - `AthletePicker.test.js`:
    - the title is `'Add an athlete to Training block, Tue Nov 17, 4:00 PM'`;
    - Jordan in `onSessionIds` reads `'On this session'`, is disabled, and a click calls nothing;
    - Riley's click calls `onPick({athleteId:'riley', name:'Riley Whitfield', ...})`;
    - a test athlete (Casey, `test: true` in this file) reads `'Test'`, is disabled, and a click calls nothing;
    - `'Close'` calls `onClose`.
- [ ] **Step 2: Run** `... src/portal/components/staffBooking/Athlete`. Expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests and `npx eslint src`.
- [ ] **Step 5: Commit** `feat(staff-booking): sheet shell, athlete search and athlete picker`.

### Task C5: Day and session picker

**Files:** Fill in `components/staffBooking/StaffSessionPicker.js`. Test: `StaffSessionPicker.test.js`.

**Interfaces**
- `StaffSessionPicker({model, mode = 'add', fromRow = null, onPick, notice = null, reloadKey = 0, now})`. It renders content only; the add and move sheets wrap it and put spec 10.5's Close button in the sheet footer (C6, C7).
- The day input:
  - `<input type="date" aria-label={DAY_LABEL}>` with `minHeight: 44`;
  - `min = model.period.start`, `max = SEASON_BOUNDS.end` (`'2027-02-27'`);
  - the default day is `academyDateISO(now)`, clamped into `[min, max]`.
- `PREV_DAY` and `NEXT_DAY` buttons (44px) are disabled at the bounds.
- The list comes from `useStaffDaySessions(day)` (keyed on `reloadKey`) and `staffAddFacts(s, model, now)`:
  - in `mode 'move'`, only `s.type === fromRow.type && s.id !== fromRow.sessionId`;
  - only `facts.offer || facts.held` sessions are shown;
  - order: not full first, then full; each group by start minutes;
  - each is a `SessionCard` with the time and meridiem split as `hooks/move.js moveOption` does, `type`, `name: sessionLabel(s, s.type)`, `trailing` = the `seatsPill(facts)` pill (or `BOOKED_TAG` when held), `reserved = reservedTagLine(limit)` when limited, and `meta` = the tags joined with `' · '` (`STARTED_TAG` when started, `WAITLISTED_TAG` when waiting);
  - a held card has no `onClick`.
- `notice` renders above the list with `role="status"`.
- States: `FINDING_SESSIONS` while loading, `SESSIONS_LOAD_FAILED` on error, `noSessionsOn(day)` when the list is empty.

- [ ] **Step 1: Write the failing test** (mock `../../hooks/staffBooking` `useStaffDaySessions`; a model from the real `staffAthleteModel`; NOW Thu Nov 12):
  - `'the day: today by default, bounded by the period start and the season end'`: the input has `value '2026-11-12'`, `min '2026-11-01'` and `max '2027-02-27'`; Previous at Nov 1 is disabled.
  - `'seats left first, then full'`: a 5 PM session with room comes before a 3 PM full one; the pills are `'9 left'` and `'Full · 12 of 12'`.
  - `'tags'`: `'Started'`, `'Reserved 5 or better'`, `'Waitlisted'`.
  - `'a session the athlete holds reads Booked and cannot be tapped'`: clicking it never calls `onPick`.
  - `'move lists the same type only, never its own session'`.
  - The empty, loading and failure lines are the C2 strings.
- [ ] **Step 2: Run** `... src/portal/components/staffBooking/StaffSessionPicker`. Expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test and `npx eslint src`.
- [ ] **Step 5: Commit** `feat(staff-booking): day and session picker`.

### Task C6: The add sheet

**Files:** Fill in `components/staffBooking/StaffAddSheet.js`. Test: `StaffAddSheet.test.js`.

**Interfaces**
- `StaffAddSheet({athleteId, name = null, session = null, sessionId = null, onClose, onDone, now})`.
  - It loads `useStaffAthlete(athleteId)`. With only `sessionId` it also loads `useStaffSession(sessionId)`.
  - With neither `session` nor `sessionId`, step `'pick'` (`StaffSessionPicker`, mode `'add'`) comes first, then `'confirm'`. With either, it starts at `'confirm'` and the session is fixed.
  - On the pick step, the `StaffSheet` footer holds one `CLOSE` button (44px) that calls `onClose` (spec 10.5).
- On confirm:
  - title: `addTitle`;
  - summary: `addSummary(model.name, ...)`;
  - one `chargeLine`;
  - the Free `ToggleRow` (label `FREE_LABEL`, 44px):
    - hidden for `elite`;
    - on and locked for `free-only` (toggling is a no-op);
    - off for the other kinds. With `none`, the confirm is disabled until Free is on.
  - the warnings, one `warningLine` each in warning tone. When `facts.full` and others wait, `waitlistCountLine(n)` from `useSessionWaitlistCount`.
  - the confirm button `addConfirmLabel` and the keep button `BACK`. `BACK` returns to the picker, or calls `onClose` when the session is fixed.
- One call per tap: a busy ref, plus `'Adding...'`.
  - The call is `staffBookSession({athleteId, sessionId, free, allowFull: full}, {first})`.
  - The first call carries `allowFull: true` when the title was the full question.
- On success: `onDone(addSuccessLine({first, date, time, result, predicted: facts.charge}))`, and the sheet closes (the caller unmounts it).
- On a refusal, by `refusalKind`:
  - `'full'` switches to the full question with `err.details`, and the next tap carries `allowFull`;
  - `'none-row'` turns the charge to `{kind:'none', next: Boolean(facts.charge.next)}`, so a next-period refusal still reads "next period";
  - `'free-only'` turns it to `{kind:'free-only'}` and shows the line;
  - `'session'` goes back to the picker with `notice = nothingChanged(err.message)` and `reloadKey + 1`. With a fixed session, it behaves as `'end'`;
  - `'end'` shows `err.message` and only `CLOSE`;
  - `'unconfirmed'` calls `onDone(STAFF_CHANGE_UNCONFIRMED)`.

- [ ] **Step 1: Write the failing test** (mock `../../hooks/staffBooking` with real-model fixtures and a scriptable `staffBookSession`; NOW Thu Nov 12):
  - `'the Free switch'`:
    - unpaid: `'Free'` is on, and toggling leaves it on; the confirm reads `'Add Jordan free'`;
    - no tokens: the confirm is disabled until Free is on, then reads `'Add Jordan free'`;
    - Elite: no `'Free'` row, and `'Elite - nothing to use.'`.
  - `'a full session asks first, and the first call carries allowFull'`: the title is `'This session is full (12 of 12) - add anyway?'`; the confirm is `'Add anyway'`; the call payload has `allowFull: true`.
  - `'a full refusal turns into the question'`: a rejection with `reason 'full'` and `details {taken:13, capacity:12}` gives the title `'This session is full (13 of 12) - add anyway?'`; the next call has `allowFull: true`.
  - `'warnings show'`:
    - window: `"Past Jordan's booking window - families can book through Dec 31."`;
    - started: `'This session has already started.'`;
    - waiting: `"Jordan is on this session's waitlist - adding takes Jordan off it."`;
    - `'2 on the waitlist for this session.'` on a full session.
  - `'one call per tap'`: two clicks before the call resolves make one call; the button reads `'Adding...'` while busy.
  - `'no answer'`: a rejection with no reason calls `onDone("We couldn't confirm the change. Check the list before trying again.")`.
  - `'success lines'`: period, Free and overfill (`{booked:13, capacity:12}`) give `'Jordan is booked for Tue Nov 17, 4:00 PM - 1 token used. The session now has 13 of 12.'`.
  - `'a refusal about the session goes back to the picker'`: `session-hidden` gives the picker with `'That session is hidden from the schedule. Show it first, then add. Nothing was changed.'`; with a fixed `sessionId` it ends with that line and `'Close'`.
  - `'a refusal about the athlete ends the sheet'`: `test-athlete` gives `"Jordan is a test athlete and can't be booked onto real sessions."` and only `'Close'`.
  - `'Back'` from the confirm returns to the picker.
  - `'Close on the pick step'`: the pick step shows `'Close'`, and a click calls `onClose`.
  - `'a no-tokens refusal on a next-period session'`: `no-tokens-left` on a Dec 3 session gives `'Jordan has no tokens left for next period. Switch on Free to add anyway.'`.
- [ ] **Step 2: Run** `... src/portal/components/staffBooking/StaffAddSheet`. Expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test and `npx eslint src`.
- [ ] **Step 5: Commit** `feat(staff-booking): add sheet`.

### Task C7: The move sheet

**Files:** Fill in `components/staffBooking/StaffMoveSheet.js`. Test: `StaffMoveSheet.test.js`.

**Interfaces**
- `StaffMoveSheet({row, name = null, onClose, onDone, now})`. `row` is a billing-hub row: `id`, `athleteId`, `sessionId`, `date`, `time`, `type`, `label`, `chargedFrom`, `graceTokenId`, `comp`.
- It loads `useStaffAthlete(row.athleteId)` and renders a `StaffSheet` titled `staffMoveTitle(first, row.type)`.
- Every fact comes from `moveModel = {...model, bookings: model.bookings.filter((b) => b.id !== row.id)}`. The row being moved is left out, as the server leaves it out (S4), so a same-day move never shows a false one-a-day warning. The picker gets `moveModel` too.
- Step `'pick'`: `StaffSessionPicker` with mode `'move'`, `model={moveModel}` and `fromRow={row}`, plus `CLOSE` (44px) in the `StaffSheet` footer, calling `onClose`.
- Step `'confirm'`:
  - `staffMoveQuestion(first, row, target, facts)`, where `facts = staffAddFacts(target, moveModel, now)`;
  - `moveChargeLine(moveChargeKind(row, target, model))`;
  - the warnings as an add;
  - the buttons `moveConfirmLabel` and `KEEP_IT`.
- The call is `staffMoveBooking({bookingId: row.id, toSessionId: target.id, allowFull: facts.full}, {first})`, one per tap.
- On success: `onDone(moveSuccessLine(first, target.date, target.time))`.
- Refusals follow C6's kinds with `action 'move'`. `full` uses the full question and `'Move anyway'`.

- [ ] **Step 1: Write the failing test:**
  - the titles for training, tournament and phil (exact C2 strings);
  - the picker shows the same type only and not the row's own session;
  - `'Move Jordan from Tue Nov 17, 4:00 PM to Thu Nov 19, 4:00 PM?'`; full gives `'Thu Nov 19, 4:00 PM is full (12 of 12) - move Jordan anyway?'` and `'Move anyway'`, and the payload has `allowFull: true`;
  - the charge lines: `'The token moves with it.'` (Nov to Nov), `'Uses a December token; the November one comes back.'` (Nov to Dec), `'Stays free.'` (a comp), and none for Elite;
  - `'Moving...'` while busy, with one call;
  - success gives `onDone('Jordan moved to Thu Nov 19, 4:00 PM.')`;
  - `membership-inactive` gives `"Jordan's membership isn't active, so a paid booking can't move. Cancel it and add Free instead."` with `'Close'`;
  - `no-tokens-left` gives `'Jordan has no tokens left for that period. Cancel it and add Free instead.'`;
  - `attended` gives `"This booking is marked attended, so it can't move."`;
  - `session-cancelled` goes back to the picker with `'The academy cancelled that session. Nothing was changed.'`;
  - `'Keep it'` calls `onClose`;
  - `'Close'` on the pick step calls `onClose`;
  - an Elite row at 4:00 PM on Tue Nov 17 moved to a 6:00 PM training the same day shows no one-a-day line.
- [ ] **Step 2: Run** `... src/portal/components/staffBooking/StaffMoveSheet`. Expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the whole `src/portal/components/staffBooking src/portal/data/staff src/portal/hooks/staffBooking` set and `npx eslint src`.
- [ ] **Step 5: Commit** `feat(staff-booking): move sheet`.

---

## Lane E: entry points

All paths are under `frontend/src/portal/`. E starts from develop with Task C0 merged in.

E's tests replace C's sheets with jest stand-ins. Each stand-in renders `<div data-sheet="add|move|athlete|cancel">` with the props it got as `data-*`, plus a `done` button that calls `props.onDone(<line>)` or `props.onPick(...)`. C's own tests cover what is inside the sheets.

### Task E1: TokenMeter rows, Move in the action slot, next-period rows

**Files**
- Create `components/TokenMeterRows.js`. Move `TokenMeter.js:62-64` (`shortDay`), `:73-78` (`STATUS_BADGE`), `:108-135` (`Row`) and `:155-208` (`Evidence`) into it. Delete `RowCancel` (`:80-106`): `StaffRowActions` replaces it with an identical Cancel.
- Modify `components/TokenMeter.js`:
  - imports `:1-26`: import `{Evidence}`;
  - JSDoc `:335-339`: add `onMoveRow`;
  - the signature at `:340`: `onMoveRow`;
  - the three `Evidence` call sites `:385`, `:394`, `:478`: pass `onMoveRow`.
- Test: create `components/TokenMeter.staffrows.test.js`. `TokenMeter.test.js` and `TokenMeter.cancel.test.js` stay green, unchanged.

**Interfaces**
- Consumes: from C0, `StaffRowActions` and `member.nextSpent`.
- Produces `Evidence({member, onCancelRow, onMoveRow})` and `Row({row, last, first, periodStart, onCancel, onMove})`.
  - The action slot is `<StaffRowActions row={row} first={first} rowLabel={`${shortDay(row.date)}${row.time ? ` ${row.time}` : ''} ${row.label}`} periodStart={member.period?.start ?? null} onMove={onMoveRow} onCancel={onCancelRow} />`.
  - When `onCancelRow || onMoveRow` (the staff view) and `member.nextPeriod`, the rows of `member.nextSpent` come after the next-period line, with the same actions.
- Produces `TokenMeter({..., onMoveRow})`.

- [ ] **Step 1: Write the failing test** `TokenMeter.staffrows.test.js` (real `hubMemberFor` members, as `TokenMeter.cancel.test.js` builds them):
  - `'Move sits before Cancel on each Booked or No-show row'`: the buttons in a row read `['Move', 'Cancel']`; the aria label is `"Move Jordan's Tue, Nov 10 Training block"`; an attended row has neither;
  - `'next-period rows on the staff view, with the same actions'`: a Dec 3 booking renders under the `Next period from ...` line, with Move and Cancel, when `onCancelRow` is given; without it (the parent's meter) the Dec row is absent and the count line is unchanged;
  - `'onMoveRow hands over the row'`: a click calls it with the row (`id 'jordan_s9'`).
- [ ] **Step 2: Run** `... src/portal/components/TokenMeter`. Expect FAIL on the new file only.
- [ ] **Step 3: Implement** the move-out and the slot. `TokenMeter.js` drops to about 350 lines.
- [ ] **Step 4: Run** `... src/portal/components/TokenMeter src/portal/screens/Billing` (all green) and `npx eslint src`.
- [ ] **Step 5: Commit** `refactor(billing): TokenMeter rows in their own file; Move and next-period rows on the staff view`.

### Task E2: The staff Billing view

**Files**
- Modify `screens/Billing.js`:
  - imports `:12-23`;
  - header comment `:44-47`;
  - state and handlers `:82-90`: `bookTarget`, `moveTarget`, `onMoveRow`;
  - `MemberSection` `:142-168`: after `TokenMeter`, the "Book a session" button or the test line;
  - `TokenMeter` `:150-158`: `onMoveRow`;
  - sheets `:179-190`: `StaffAddSheet` and `StaffMoveSheet` beside `StaffCancelSheet`.
- Test: create `screens/Billing.staffbooking.test.js`. `Billing.test.js`, `Billing.single.test.js` and `Billing.staffcancel.test.js` stay green.

**Interfaces**
- Consumes:
  - `StaffAddSheet({athleteId, name, onClose, onDone})`;
  - `StaffMoveSheet({row, name, onClose, onDone})`;
  - `staffMayBook`, `BOOK_A_SESSION`, `testAthleteLine`;
  - `firstOf` (`data/staffCancel.js`);
  - `data.household.test` and `member.test` (from C0).
- Behaviour, on the staff view with `staffMayBook(role)` only:
  - Each member gets `<Button variant="outline" height={44}>Book a session</Button>`, whatever the package state.
  - When `data.household?.test || member.test`, the member gets `testAthleteLine(firstOf(member.name))` instead.
  - `onMoveRow` is passed, except for a test household or member.
  - All three sheets' `onDone` call `setCancelLine(line)` and close; opening any sheet clears the line.
  - The parent view is unchanged.

- [ ] **Step 1: Write the failing test** (the `Billing.staffcancel.test.js` harness, plus stand-ins for `StaffAddSheet` and `StaffMoveSheet`):
  - `'the owner and ops see Book a session under each meter'`: 3 for 3 members; a pending-billing member still has one. For roles coach, mental, phil, and the family view (no `staff`): none.
  - `'a test household shows the test line instead'`: `"Jordan is a test athlete. Test athletes can't be booked onto real sessions."`, and no Book button.
  - `'Move beside Cancel, next-period rows on the staff view only'`: after opening the lists, each Booked or No-show row has `['Move', 'Cancel']`; the Dec 3 row appears with both; the parent view has no Dec row.
  - `'Book opens the add sheet for that athlete; its line shows above the page'`: the stand-in has `data-athlete="riley"`; done gives `role="status"` with `'Riley is booked for Tue Nov 17, 4:00 PM - 1 token used.'`.
  - `'Move opens the move sheet with the row; its line shows'`: the stand-in has `data-booking="jordan_s1"`; done gives `'Jordan moved to Thu Nov 19, 4:00 PM.'`.
- [ ] **Step 2: Run** `... src/portal/screens/Billing`. Expect FAIL on the new file.
- [ ] **Step 3: Implement.** `Billing.js` stays under 500 lines (about 440).
- [ ] **Step 4: Run** `... src/portal/screens/Billing src/portal/components/TokenMeter` and `npx eslint src`.
- [ ] **Step 5: Commit** `feat(billing): staff Book a session and Move on the family's Billing`.

### Task E3: The roster

**Files**
- Modify `hooks/index.js`:
  - after `:208`: `import { staffRowFields } from '../data/staffBooking';`;
  - in `liveSessionAttendance`, after `noshowReason` (`:3982`): `...staffRowFields(b),`.
- Create `components/staffBooking/RosterStaffActions.js`.
- Modify `screens/Roster.js`:
  - imports after `:33`;
  - the header (`:531-540`): wrap the existing Cancel session `Button` and the new `<RosterAddAthlete>` in one `<div style={{display: 'flex', gap: 10, marginTop: 12}}>`. Each child gets `flex: 1`, and the Cancel button's own `marginTop` goes;
  - the row: inside `AthleteRow`'s children (`:672-678`), `{live ? <RosterRowActions ... /> : null}`. In seed mode and on a typed URL there is no session id, so `useSessionAttendance` returns no rows (`hooks/index.js:4009-4014`) while the demo roster still renders, and `row` would be undefined;
  - both `onDone` call the existing `setStaleLine(line)`, whose sticky `role="status"` line (`:641`) carries the success line.
- Test:
  - create `screens/Roster.staffbooking.test.js`;
  - add one case to `hooks/index.reserved.test.js`;
  - `Roster.*.test.js` stay green.

**Interfaces**
- Consumes:
  - `AthletePicker({session, onSessionIds, onPick, onClose})`;
  - `StaffAddSheet({athleteId, name, sessionId, onClose, onDone})`;
  - `StaffMoveSheet({row, name, onClose, onDone})`;
  - `StaffCancelSheet({row, member, members, onClose, onCancelled})`;
  - `StaffRowActions`, `rosterRowToStaffRow`, `rosterMembers`, `staffMayBook`, `ADD_ATHLETE`;
  - `firstOf` (`data/staffCancel.js`), `periodFor` (`data/packages.js`), `academyDateISO` (`data/calendar.js`).
- Produces `RosterAddAthlete({role, session: {id, date, time, type, label}, rows, hidden, onDone})`:
  - `null` unless `staffMayBook(role) && !hidden`;
  - otherwise the `ADD_ATHLETE` button (`variant="outline"`, `height={44}`), then `AthletePicker` with `onSessionIds = rows.map((r) => r.athleteId)` (the roster's rows are its confirmed, attended and no-show bookings), then `StaffAddSheet` with `sessionId: session.id`.
- Produces `RosterRowActions({role, row, rows, session, sessionCancelled, onDone, now = new Date()})`:
  - `null` unless `row && staffMayBook(role) && !sessionCancelled`;
  - otherwise `StaffRowActions` over `rosterRowToStaffRow(row, session)` with `first = firstOf(row.name)` and no `rowLabel`, so the labels are `'Move Jordan'` and `"Cancel Jordan's booking"`;
  - `periodStart` is the start of the household's current period: `periodFor(academyDateISO(now), Number(row.periodKey.slice(8, 10))).periodKey` when `row.periodKey` is set (a period key's day is the household anchor), else null. A row from a period that is over then has no buttons (spec 10.1 `staffMovable`, plan decision 14);
  - it owns the move and cancel sheets: `members = rosterMembers(rows, row.householdId, session)` and `member = {athleteId: row.athleteId, name: row.name}`.
- In `Roster.js`:
  - `session` facts are `{id: sessionId, date: block?.date, time: block?.time, type: session?.type, label: session?.name}`;
  - `hidden = sessionCancelled || session?.type === 'mental' || held || demoInLive || !live`;
  - the row's raw data is `rows.find((r) => r.athleteId === athlete.id)`, which may be undefined (hence the `row &&` check).
  - The button still shows on a read-only roster (ops) and on a past session.
  - `!live` hides it in seed mode too: the seed roster has no session id to add to and no booking ids to move. Seed simulation is exercised from the athlete screen and Billing (spec 10.7).

- [ ] **Step 1: Write the failing tests.**
  - `Roster.staffbooking.test.js`: the `Roster.bookchange.test.js` mock block, with rows that carry `householdId 'hh1'`, `type 'training'` and `date '2026-11-17'`, `block` live with `sessionId 's2'`, plus stand-ins for `AthletePicker`, `StaffAddSheet`, `StaffMoveSheet` and `StaffCancelSheet`.
    - `'Add athlete beside Cancel session for the owner and ops'`: for roles owner and ops (ops with `readOnly`), both buttons exist, share one parent, and each has `style.flex` `'1 1 0%'`.
    - `'never for a coach or a mental account'`.
    - `'none on a mental session, a cancelled one, a held Calendly slot or a typed URL with no session'`: `block.type 'mental'`; `sessionStatus 'cancelled'`; `sessionUnresolved true`; `isLive` true with no `sessionId`.
    - `'a past session still offers Add athlete'`: `block.date '2026-11-10'`.
    - `'no row actions in seed mode or on a typed URL'`: with `isLive` false (the seed roster renders), and with `isLive` true and no `sessionId`, there is no `Move` or `Cancel` row button and nothing throws.
    - `'Move and Cancel under each confirmed or no-show row'`: the aria labels `'Move Jordan'` and `"Cancel Jordan's booking"`; none on the attended row; none on a cancelled session; none for a coach. These rows carry no `periodKey`, so no clock enters the test.
    - `'a period that is over'`: on an Oct 27 roster whose rows carry `date '2026-10-27'` and `periodKey '2026-10-01'`, no row has Move or Cancel (that period is over on any later date), and Add athlete still shows (the server judges the add).
    - `'Add athlete: pick, then confirm'`: the picker stand-in gets `data-on-session="a1,a2,a3"`; picking gives an add stand-in with `data-athlete` set and `data-session="s2"`.
    - `'the status line carries the success line'`: the stand-in's `onDone('Jordan moved to Thu Nov 19, 4:00 PM.')` gives that text in `[role="status"]`.
  - `hooks/index.reserved.test.js`, `'the roster rows carry what the staff sheets read'`: `fetchBookingsBySession` returns one doc with `householdId:'hh1', source:null, type:'training', date:'2026-11-17', periodKey:'2026-11-01', chargedFrom:'period', comp:true, graceTokenId:null`; the row `toMatchObject`s the same values.
- [ ] **Step 2: Run** `... src/portal/screens/Roster src/portal/hooks/index.reserved`. Expect FAIL on the new cases.
- [ ] **Step 3: Implement.** `Roster.js` grows only by the imports, the facts line, the wrapper and the row mount.
- [ ] **Step 4: Run** `... src/portal/screens/Roster src/portal/hooks/index` and `npx eslint src`.
- [ ] **Step 5: Commit** `feat(roster): Add athlete, and Move and Cancel per row, for the owner and ops`.

### Task E4: The athlete screen's route

**Files**
- Create `StaffBookingRoutes.js` (the `CombineRoutes.js` pattern).
- Create the skeleton `screens/StaffAthleteBookings.js`: a default export returning `null`, filled in E5.
- Modify `PortalRoutes.js`:
  - after `:25`: `import { StaffAthleteBookingsRoute } from './StaffBookingRoutes';`;
  - after the `admin/households/:householdId` route (`:1121-1128`): `<Route path="admin/athletes/:athleteId/bookings" element={<RequireRole roles={['ops', 'owner']}><StaffAthleteBookingsRoute /></RequireRole>} />`.
- Test: create `PortalRoutes.staffbooking.test.js`.

**Interfaces**
- Produces `loadStaffAthleteBookings = () => import('./screens/StaffAthleteBookings')` and `StaffAthleteBookingsRoute()`:
  - `useParams().athleteId`;
  - the role from `useAuthSession` (wait while live and loading; seed defaults to `'owner'`);
  - it renders `<StaffAthleteBookings bare athleteId role onBack={() => navigate('/portal/admin')} onOpenHousehold={(id) => navigate(`/portal/admin/households/${id}`)} />` inside `<Suspense>`, with the screen lazy.
- Consumes `StaffAthleteBookings({athleteId, role, onBack, onOpenHousehold, bare})` (E5).

- [ ] **Step 1: Write the failing test.** Copy the harness from `PortalRoutes.combine.test.js` (its lines 1-99) and mock `./screens/StaffAthleteBookings` as a component rendering `STAFF BOOKINGS ${athleteId} as ${role}` with Back and Family buttons.
  - `'owner and ops reach /portal/admin/athletes/jordan/bookings'`: the text is `'STAFF BOOKINGS jordan as owner'` (or `ops`).
  - `'coach, mental, parent and athlete are turned away'`: the text is absent, and the location is not the route.
  - `'Back goes to Admin; Family billing to the household'`: the paths are `/portal/admin` and `/portal/admin/households/hh1`.
- [ ] **Step 2: Run** `... src/portal/PortalRoutes`. Expect FAIL on the new file.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `... src/portal/PortalRoutes` (all of them) and `npx eslint src`.
- [ ] **Step 5: Commit** `feat(routes): /portal/admin/athletes/:athleteId/bookings for the owner and ops`.

### Task E5: The athlete's bookings screen (after C2 is merged into E)

**Files:** Fill in `screens/StaffAthleteBookings.js`. Test: create `screens/StaffAthleteBookings.test.js`.

**Interfaces**
- Consumes:
  - `useStaffAthlete`;
  - the C2 strings (`BACK_TO_ADMIN`, `STAFF_VIEW_LABEL`, `athleteSubline`, `tokenLine`, `BOOK_A_SESSION`, `FAMILY_BILLING`, `groupLabel`, `LATER_LABEL`, `NOTHING_BOOKED`, `rowWhen`, `CANCEL_IN_CALENDLY`, `testAthleteLine`, `ATHLETE_NOT_ON_FILE`);
  - `StaffRowActions`;
  - `StaffAddSheet({athleteId, name, onClose, onDone})`: no session, so it opens on the picker;
  - `StaffMoveSheet({row, name, onClose, onDone})`;
  - `StaffCancelSheet({row, member, members, onClose, onCancelled})`.
- Produces `StaffAthleteBookings({athleteId, role, onBack, onOpenHousehold, bare = false, now})`.
- Layout, in a `PhoneFrame` with the staff tab bar, `active="admin"` and a 22px gutter:
  - **Header:** `BackLink` `BACK_TO_ADMIN`, the `SectionLabel` `STAFF_VIEW_LABEL`, `ScreenTitle` with the name, and the sub-line `athleteSubline`.
  - **Token line:** `tokenLine(model)`.
  - **Buttons:** `BOOK_A_SESSION` (primary, height 50; not shown for a test athlete) and `FAMILY_BILLING` (outline, height 44, `onOpenHousehold(model.householdId)`).
  - **Test athlete:** a card with `testAthleteLine(first)`.
  - **Status line:** after any change, a `role="status"` line above the groups.
  - **Groups:** `groupLabel('this', model.period)`, `groupLabel('next', model.nextPeriod)`, and `LATER_LABEL` only when `groups.later.length`. An empty group reads `NOTHING_BOOKED`.
  - **Rows:**
    - `rowWhen`, the label, then the badge;
    - `StaffRowActions` with `first = model.first`, no `rowLabel` and `periodStart = model.period.start`;
    - a test athlete's rows get Cancel only (`onMove` null): the server refuses `test-athlete` on a move and allows a cancel;
    - a Calendly row reads `CANCEL_IN_CALENDLY`;
    - attended, mental and waitlist rows have no actions.
  - **Cancel:** `StaffCancelSheet` with `member = {athleteId: model.athleteId, name: model.name}` and `members = [{athleteId, name, spent: [...groups.thisPeriod, ...groups.nextPeriod].filter(isBooking), reserved: [], period: {start: model.period.start}}]`, where `isBooking = (r) => r.kind === 'booking'`. Its `onCancelled(line)` sets the status line.
  - **Missing athlete:** `ATHLETE_NOT_ON_FILE` (`error.code === 'not-found'`).

- [ ] **Step 1: Write the failing test** (mock `../hooks/staffBooking` `useStaffAthlete` with a model from the real `staffAthleteModel`; stand-ins for the three sheets):
  - the header text includes `'‹ Admin'`, `'Bookings · staff view'`, `'Jordan Whitfield'` and `'Whitfield family · 6 tokens'`;
  - `'3 of 6 tokens left this period'`;
  - `'the groups'`: `'This period · Nov 1 - Nov 30'`, `'Next period · Dec 1 - Dec 31'`; `'Later'` is absent without a later row and present with a Jan 7 Elite row; an empty next group reads `'Nothing booked.'`;
  - `'a row'`: `'Tue Nov 17 · 4:00 PM'`, `'Training block'`, `'Booked'`;
  - `'actions per row'`: a confirmed row has Move and Cancel; attended, waitlist and mental rows have none; a Calendly row reads `'Cancel in Calendly'`;
  - `'a test athlete'`: `"Jordan is a test athlete. Test athletes can't be booked onto real sessions."`, no `'Book a session'`, and its rows have Cancel only;
  - `'a missing athlete'`: `"That athlete isn't on file."`;
  - `'Book a session opens the add sheet; its line shows'`: the status reads `'Jordan is booked for Tue Nov 17, 4:00 PM - 1 token used.'`;
  - `'Family billing'` calls `onOpenHousehold('hh1')`.
- [ ] **Step 2: Run** `... src/portal/screens/StaffAthleteBookings`. Expect FAIL.
- [ ] **Step 3: Implement.** Keep it under 500 lines. Move the row list into `components/staffBooking/BookingGroups.js` if needed.
- [ ] **Step 4: Run** the test, `... src/portal/PortalRoutes` and `npx eslint src`.
- [ ] **Step 5: Commit** `feat(admin): an athlete's bookings, staff view`.

### Task E6: The Manage bookings card (after C4 is merged into E)

**Files**
- Create `components/staffBooking/ManageBookingsCard.js`.
- Modify `screens/AdminDashboard.js`:
  - imports `:10-14`;
  - after `<OutstandingCard ... />` (`:162`): `<ManageBookingsCard />`.
- Test: create `components/staffBooking/ManageBookingsCard.test.js`, and add one case to `screens/AdminDashboard.test.js`.

**Interfaces**
- Consumes: `AthleteSearch` (C4) and `MANAGE_BOOKINGS_LABEL` / `MANAGE_BOOKINGS_BODY` (C2).
- Produces `ManageBookingsCard()`: a large `Card` with `SectionLabel` `MANAGE_BOOKINGS_LABEL`, `Body` `MANAGE_BOOKINGS_BODY`, and `<AthleteSearch onPick={(a) => navigate(`/portal/admin/athletes/${a.athleteId}/bookings`)} />`. It is shown for both owner and ops. Test athletes stay tappable here (no `disableTest`).

- [ ] **Step 1: Write the failing tests.**
  - `ManageBookingsCard.test.js` (mock `../../hooks/billing` with a counting directory):
    - `'Manage bookings'` and `'Add, move or cancel a session for any athlete.'` are shown;
    - `'lazy load'`: the directory hook is not called before focus, and is called after;
    - `'test badge'`: Riley (`test: true`) shows `'Test'`, and a tap sets the location to `/portal/admin/athletes/riley/bookings` (that screen carries the test card, E5);
    - `'no match'`: `'No athlete matches "zz".'`;
    - tapping Jordan sets the location to `/portal/admin/athletes/jordan/bookings`.
  - `AdminDashboard.test.js`, `'Manage bookings sits right after Outstanding, for owner and ops'`: the text index of `'Manage bookings'` is greater than `'Outstanding'`'s and less than `'Sign-ups'`'s.
- [ ] **Step 2: Run** `... src/portal/components/staffBooking/ManageBookingsCard src/portal/screens/AdminDashboard`. Expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests (the other AdminDashboard tests stay green: they already mock `../hooks/billing`) and `npx eslint src`.
- [ ] **Step 5: Commit** `feat(admin): Manage bookings card`.

---

## Task I: Integrate, gate, walk through, retire the script

**Files**
- Delete `scripts/comp-booking.mjs` and `scripts/test/comp-booking.test.mjs`.
- Modify the comments that name the script:
  - `functions/portal/notify-gates.js:67-68` ("the owner's Calendly re-link script can write a booking for any date");
  - `frontend/src/portal/data/bookingChanges.js:83` ("A free comp (staff Free add, `functions/portal/staff-book.js`)");
  - `scripts/hide-sessions.mjs:13` ("`staffBookSession` refuses a hidden session (`session-hidden`).");
  - `scripts/provision-test-family.mjs:39-40` ("Never book a test athlete from the panel: `staffBookSession` refuses `test-athlete`, and no script writes past the rules.");
  - `docs/portal/DATA-MODEL.md:180` ("`staffBookSession` refuses a hidden session") and `:409` (drop the script clause S9 kept).
- Leave the dated plan docs as history. Keep `comp-grant.mjs` and `comp-membership.mjs`.

**Steps**
- [ ] **Step 1: Merge.**
  - Create `feat/staff-booking` from develop in a fresh worktree `wt-sb-int`, set up as the Worktree setup above says.
  - `git merge --no-ff` `feat/staff-booking-server`, then `feat/staff-booking-client`, then `feat/staff-booking-entry`.
  - Expect no conflicts: E's only shared commit is C0. Any conflict means a lane touched another's file; resolve toward the owning lane and note it.
- [ ] **Step 2: Full gates**, each green:
  - `cd functions`, then `for f in portal/*.test.js; do node "$f" || exit 1; done`, `node test/check-exports.js` (23) and `npx eslint .`;
  - `cd frontend`, then `CI=true npx react-scripts test --watchAll=false` (the whole suite), `npx eslint src` (only `src/setupTests.js:18`) and `npm run build`;
  - at the repo root, `node --test scripts/test/*.test.mjs`;
  - the rules probes as in S8, in both passes.
  - `wc -l` on every touched file: each under 500, except the three already-over files at mount-point growth only. `lib.js` stays at 497 and `hooks/billing.js` at 499.
- [ ] **Step 3: Emulator setup** (spec 14.2: local only, never staging, never production):
  - In `wt-sb-int` only, sanitise the functions env first, as the memory note "Emulator pulls real secrets" says. **Never in the main checkout:** its files are the live deploy config, and nothing is copied from them.
  - **Overwrite, never open.** Write each of the worktree's three files whole (a heredoc or `fs.writeFileSync`), without reading, printing, grepping or copying what was there:
    - `functions/.env`, exactly:

      ```
      STRIPE_MODE=test
      ```

    - `functions/.env.local`, exactly:

      ```
      STRIPE_MODE=test
      SMTP_USER=placeholder@example.test
      SMTP_PASS=placeholder
      STRIPE_SECRET_KEY=sk_test_harness
      STRIPE_WEBHOOK_SECRET=whsec_placeholder
      CALENDLY_WEBHOOK_SIGNING_KEY=placeholder
      SLACK_FEEDBACK_TOKEN=xoxb-placeholder
      ```

    - `functions/.secret.local`, exactly the same six secret lines, without `STRIPE_MODE`.
  - Why these keys:
    - The six are every secret the functions declare: `functions/portal/secrets.js` (`MAIL_SECRETS`, `STRIPE_WEBHOOK_SECRETS`, `CHECKOUT_SECRETS`, `CALENDLY_SECRETS`, `FEEDBACK_SECRETS`), as `test/check-exports.js` `EXPECTED` binds them. A missing or empty one makes the emulator read the real value from Secret Manager.
    - No secret name goes in `functions/.env`: a name in both `.env` and `secrets.js` is a conflict (`functions/env.template`).
    - No `SMTP_HOST` and no `COURIER_AUTH_TOKEN` in any file, so `portal/email.js` has no transport: every notice records `skipped` on its `notifications` ledger row, which Step 4 still reads. `COURIER_AUTH_TOKEN` is read by the code but never declared, so the emulator never fetches it.
    - No `SLACK_FEEDBACK_CHANNEL`, so `submitFeedback` stops before Slack.
    - The other keys the code reads (`PORTAL_URL`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM`, `STRIPE_SIBLING_COUPON`, `SCHOLARSHIP_ORIGINS`, `SCHOLARSHIP_TO`, `COURIER_EVENT_*`, `PUSH_*`) have defaults or are not reached by the walkthrough. If one turns out to be needed, ask the lead for its value; never read it from a file.
  - List the folder's file names only (`ls -a functions`). The emulator also loads `functions/.env.rypacad`: if that or any other `.env.*` file is there, stop and ask the lead.
  - Start `npx firebase-tools emulators:start --only firestore,auth,functions --project rypacad` as a background task. Grep its log for `Trying to access secret`: it must be absent. If it appears, stop the emulator by its PID, write the three files again as above and restart; a second hit means stop and report.
  - If Java is missing, prepend the JDK 21 `bin` to `PATH`. If 8080 is held by an orphan Java emulator, stop it by its PID.
  - Seed with `npm run seed:emulator`. If it exits early in a month, write the few docs needed with a scratchpad script run through `node --env-file=scripts/emulator.env`.
  - Create `users/sb-owner {role:'owner'}` and `users/sb-ops {role:'ops'}` in the emulator, and make sure the family has the five athletes the walkthrough needs:
    - a paid t-6 athlete;
    - an unpaid (pending) athlete;
    - an Elite athlete;
    - a single-token athlete;
    - a test athlete.
  - Never read or copy production.
  - Add a `.claude/launch.json` entry `ryp-sb-int`: `ryp-qa-emulator`'s settings with the worktree's `frontend` path, port 3001, `REACT_APP_USE_EMULATORS=true`. Stop any other server on 3001 first.
  - Sign in with `await window.__rypTestAuth.signInAs('sb-owner')`, later `'sb-ops'`.
- [ ] **Step 4: Walk through.** As owner and again as ops, and from every entry point:
  - [ ] **Add with a token** (Admin card, then the athlete screen, Book a session).
    - The line reads `... - 1 token used.`
    - The doc has `createdVia 'staff'`, `createdBy` the staff uid, and `householdId` from the athlete.
    - `booked` rose by 1, and the meter on Billing is one lower.
  - [ ] **A Free add.** The doc has `comp: true`, and the meter is unchanged.
  - [ ] **An unpaid athlete.** The token line reads `Not paid yet - Free only`, the switch is on and locked, and the line ends `..., free.`
  - [ ] **An overfill.**
    - The title reads `This session is full (12 of 12) - add anyway?`, then `booked 13` and the line ends ` The session now has 13 of 12.`
    - The family's Book tab shows the session as Full.
    - A family cancel brings it to 12, and no promotion fires until a second cancel.
  - [ ] **Today's started session, and an earlier day this period.** The warnings `This session has already started.` / `This session was on Tue Nov 10.` show. The ledger body has no "before it starts" sentence.
  - [ ] **Beyond the window.** `Past Jordan's booking window - families can book through Dec 31.`
  - [ ] **A re-confirm over a cancelled row** (cancel one first).
    - The doc has no `cancel*`, `movedTo`, `comp*`, `noshowReason` or stale `graceTokenId`, and `rebookedAt` is set.
    - There is one `notifications` row, keyed `booking-confirmed_<id>_staff_<ms>`.
  - [ ] **A move**, from the roster row and from Billing, including into a full session (`... is full (12 of 12) - move Jordan anyway?`).
    - The old row has `cancelledFrom`.
    - The roster shows the greyed `Moved to Thu Nov 19, 4:00 PM`.
  - [ ] **A cancel of a next-period row from Billing.** The token comes back, and no ledger row is written.
  - [ ] **The roster's Add athlete:** the picker shows `On this session` and a `Test` row; the add, then the status line.
  - [ ] **Refusals.** A test athlete, opened from the Admin card, shows the test card and no Book button. Mental and hidden sessions never appear in the day list.
  - [ ] **The `notifications` ledger:** exactly one `booking-confirmed` per add or move, none for the staff cancel.
  - [ ] **375px, mobile preset in the browser pane, for every sheet and both screens:**
    - no horizontal scroll and a 22px gutter;
    - every tap target at least 44px;
    - two-button rows split in halves;
    - sheets scroll inside 85%.
- [ ] **Step 5: Retire `comp-booking.mjs`.**
  - Only after Step 4 has proved a Free add for an unpaid athlete, including over a cancelled row.
  - Delete the two files and apply the comment edits above.
  - Rerun `node --test scripts/test/*.test.mjs`, `cd functions && npx eslint .` and `cd frontend && npx eslint src`.
  - Commit, as **the branch's last commit**: `chore(scripts): retire comp-booking.mjs (the panel's Free add replaces it)`.
- [ ] **Step 6: Merge to develop locally.**
  - `git checkout develop && git merge --no-ff feat/staff-booking`. **No push.**
  - Stop the emulator and the dev server by PID. Remove the `ryp-sb-int` launch entry.
  - Remove the worktrees: the junction first, then `git worktree remove`.
- [ ] **Step 7: Hand over** (the lead, in the closing message to the owner):
  - **Functions deploy** (the owner runs it):

    ```
    npx firebase-tools deploy --only functions:staffBookSession,functions:moveBooking,functions:staffCancelBooking,functions:onBookingCancelled,functions:onBookingCreated,functions:stripeWebhook
    ```

    If the first `staffBookSession` call fails with an internal or permission error, check the invoker binding (the rypacad GCP org-constraints note).
  - **Push develop**, then a read-only check on staging. Staging runs on the production database, so make no adds there:
    - the Admin card search;
    - an athlete's screen and its groups;
    - the day picker lists;
    - the roster's buttons;
    - the test athlete's screen.
  - **Release:** the owner pushes `develop:main`. No rules deploy.
  - Update the auto-memory notes "Comp booking" and "Staff cancel" to point to the panel.

---

## Spec coverage

| Spec | Where |
|---|---|
| 2.1 (A) Admin search, athlete screen, Book | E6, E5, E4, C4-C6 |
| 2.1 (B) roster Add, Move and Cancel; Billing Book, Move and next-period rows | E3, E2, E1 |
| 2.2 cost, Free, unpaid Free only, no tokens offers Free | S2, C1 (`charge`), C6 |
| 2.3 overfill confirm | S2/S3 (`full` last, `allowFull`), C6, C7 |
| 2.4 the current period and past; beyond the window | S1 (`periodOver`), S2, S4 |
| 2.5 skipped limits as warnings | S1 (`staffOverrides`), C1 (warnings), C6 |
| 2.6 emails | S5 |
| 2.7 owner and ops; mental excluded | S2 (`calendly`), S4 (kept), S6 (`mental`), C0 (`staffCancellable`), C3 (day list) |
| 5 anti-goals: double charge, counter drift, invisible booking, test athletes, half moves, two emails | S2, S3, S4, S5, S7 |
| 6 constraints (no rules, live client, sizes, CRLF, copy) | Global Constraints, S4 (family path), S8 |
| 9.1-9.7 | S1-S7 |
| 10.1 shared pieces | C0-C7 |
| 10.2-10.4 entry points | E1-E6 |
| 10.5 copy | C2 (every string), C0 (the cancel sheet's `mental` line), C4-C7 and E1-E6 (rendered) |
| 10.6 layout | C0, C4, C5 (44px), I Step 4 (375px) |
| 10.7 seed mode | C3 (simulated results, seed model and day list), E3 (no staff actions in seed mode or on a typed URL) |
| 11 retire the script | I Step 5 |
| 12 docs | S9, S3 (index header), I Step 5 and Step 7 (memory notes) |
| 13 tests | each task's Step 1; `staff-book.test.js` is split into `staff-book-decide.test.js`, `staff-book.test.js` and `staff-book-notices.test.js` (the S5 trigger cases) for the 500-line limit |
| 14 release | I Steps 3-7 |

## Decisions this plan makes (the spec left them open)

1. "{left} left" in the period charge line counts what remains **after** the add.
2. "{n} session tokens" reads "1 session token" for one.
3. `payStateOf` precedence: no package, past due, lapsed, unpaid.
4. In staff mode, `moveBooking` checks `full` last (after the charge), as the add does. `full` refusal counts are sent in staff mode only, so the family error stays `{reason}`.
5. Unknown keys in a `staffBookSession` request are ignored. That reads spec 9.1's "Anything else is `bad-request`" narrowly: a bad id and a non-boolean `free` or `allowFull` are still `bad-request`, and `parseStaffBook`'s JSDoc says so. A non-boolean `allowFull` to `moveBooking` reads as false, never `bad-request`.
6. A test athlete's rows offer Cancel and never Move: on the athlete screen, and on Billing for a test household or member.
7. An add from the roster has a fixed session, so a refusal about the session ends the sheet instead of returning to a picker.
8. "No answer" closes the sheet and shows the unconfirmed line on the page (spec 10.5 lists it with the success lines).
9. Shared helpers live in `staff-gates.js` and `booking-reads.js`. `positionFor` is extracted from `move-decide.js`. `isStaff` reaches `move.js` from `staff-cancel-decide.js`, never `move-decide.js`, which would make an import cycle.
10. `revoke.js` gets its first unit test, using the patched admin instance as `staff-cancel.test.js` does.
11. Lane C's data splits into `staffBooking.js` and `staffAthlete.js`. A shell `StaffSheet.js` and the search `AthleteSearch.js` are added.
12. The roster shows no staff actions in seed mode, which has no real session or booking ids. Seed simulation runs from the athlete screen and Billing.
13. Review Focus 3's handler pin (S3, "an anchor-15 household spends the session's own period") uses rows of the session's own period, partly in December. The plan check proposed six rows between Oct 15 and Nov 14 and an ok add. Those rows carry `periodKey '2026-10-15'` and never count against the Nov 15 - Dec 14 period, so that case would pass even if the anchor never reached `loadTokenInputs`. Only reads made with anchor 15 see the December rows, so the sixth row's `no-tokens-left` proves it.
14. On the roster, a row's period start comes from its own `periodKey`, whose day is the household anchor. A row from a period that is over shows no Move or Cancel, as spec 10.1's `staffMovable` asks; a row with no `periodKey` leaves the period to the server.

## Not in this plan

The owner's request this workflow relayed: "combine the session view and the today views in terms of having 1 calendar that can display golf, phil, and yannick in a more accessible spot". The spec `01-spec-admin-booking.md` does not cover it, so this plan builds nothing for it.

It would touch these:
- `/portal/coach` "Today" (`screens/CoachDashboard.js`).
- `/portal/my-sessions` "Sessions" (`screens/SpecialistDay.js`, with its specialist switcher).
- The owner, ops, coach and mental tab sets in `components/BottomTabBar.js`.

It has its own design, `05-spec-staff-calendar.md` (coming), and must start only after Lane E merges, because it touches `PortalRoutes.js` and the roster's `backTo`.

That design settles where the one calendar lives, which roles see it, and whether staff booking's day list should share its data. The staff day list here leaves Yannick's mental sessions out on purpose. Once the owner approves that design, it is planned as its own lane.
