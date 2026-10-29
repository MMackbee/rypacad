# Yannick's Mental-Performance Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the mental-performance coach (portal role `mental`, Yannick) three tools before Tue Nov 3 2026: private per-athlete notes (an intake note, one note per 1:1 session, free notes) that no other role can read, enforced in Firestore rules; a Commitment Contract board that shows who logged their minutes week by week with a per-week "Checked in" toggle and a "Due for a check-in" group fed by a Monday 08:00 reminder email; and the owner's new contract rule (20 minutes a day Monday to Friday, 10 under 12, no tier picker) applied to every family surface behind the existing `REACT_APP_CONTRACT_ENABLED` switch, with parents able to log for their children.

**Architecture:** Every decision is a pure function in `frontend/src/portal/data/` (`contractRule.js` for the age rule and week math, `contractBoard.js` for overdue and board grouping, `mentalNotes.js` for note ids and grouping), unit-tested with jest. Firestore access lives in new hook modules (`hooks/mentalLive.js` reads and writes, `hooks/mental.js` seed/live hooks, `hooks/parentContract.js`) following the `scholarships.js` precedent: they import primitives from `./live`, never the other way, and fall back to seed fixtures when `isLive()` is false. `firestore.rules` is the boundary (new `mentalNotes`, `contractCheckins`, `config` blocks; additive parent branches on `contractLogs`; `10` in the athlete tier lists; `mental` on households read), proven by a new section of `scripts/verify-rules.mjs`. The Monday email is `functions/portal/contract-checkins.js`, a duplicate of the client's overdue rule under a "CHANGE ONE, CHANGE BOTH" banner (functions are CommonJS and cannot import CRA modules), tested with `fake-firestore.js`. Screens stay in the 430 px staff column.

**Tech Stack:** React 18 (CRA 5, plain JS), react-router-dom 6, firebase 9 modular SDK, date-fns 4, jest via react-scripts (`renderScreen` from `screens/testRender.js`, no Testing Library), Firestore rules v2 (emulator REST probes, Node 22 ESM, dependency-free), Cloud Functions v1 (`firebase-functions/v1`, firebase-admin, `portal/tiny.js` runner, eslint-config-google), Node `node:test` for scripts.

**Spec:** `docs/portal/plans/2026-10-28-mental-tools/00-spec.md` (owner rulings 2026-10-28). Spec section numbers below (§3, §4.1 ...) refer to it. What the spec left to the builder (§9) and what this plan had to decide is listed under "Decided here" at the end.

## Global Constraints

- Required minutes: `contractMinutesFor(athlete, onDateISO)` returns `10` when `athlete.dob` is present and the athlete is under 12 on that date (the 12th birthday itself and after is `20`), otherwise `20`; no dob is `20`. Pure string date math, no `Date` timezone dependence.
- Contract days are Monday to Friday; a week is "met" on a day when the log's minutes are `>= required` for that day; `weekStartFor(dateISO)` is the Monday on or before it; a week summary has five weekday entries, each `met | short | none`.
- Overdue (§4.4): the latest check-in with `checkedIn == true` is more than 14 days old (`daysSince > 14`), or there is none and more than 14 days have passed since the later of `config/contract.enabledAt` and the athlete's `createdAt`; an athlete without `createdAt` counts from `enabledAt`; with no `enabledAt` a never-checked-in athlete is never overdue. The same rule, line for line, in `data/contractBoard.js` (client) and `functions/portal/contract-checkins.js` (server).
- Who is on the contract (§4.4) is one gate on both sides: `onContract(household, athlete)` in `data/contractBoard.js` (client) returns false for a household with `test === true` (absent means a real family), for a `past_due` or `lapsed` membership, and for athlete billing that is not active, exactly as `lib.membershipAllowsBooking(household, athlete)` does on the server (a missing household keeps the athlete, as the server's `membershipAllowsBooking(null, athlete)` does; no client mirror of that function exists today). `functions/portal/contract-checkins.js` applies the test skip and `lib.membershipAllowsBooking`, and `contract-checkins.test.js` reads the client file to hold the two together. `overdueCheckins` and `boardRows` take a `households` map and drop every athlete the gate refuses, so the board's three groups and the Monday email name the same athletes; the Athletes list (§5.1) still shows everyone.
- Note ids: `intake`, the session id (`cal-<uuid>` or any session id), or `free-<random>`; body at most `NOTE_MAX = 8000` characters, enforced in the rules and the editor.
- Collections: `mentalNotes/{athleteId}/entries/{entryId}` (role `mental` only, every verb, plus a `{path=**}/entries` collection-group read for `mental`); `contractCheckins/{athleteId}_{weekStart}` (`mental` writes with the id pinned and `checkedIn == true`; unchecking is a delete; `mental | ops | owner` read); `config/contract` `{ enabled: bool, enabledAt: 'YYYY-MM-DD' | null }` (owner writes, `coach | mental | ops | owner` and any `specialistId` read).
- `athletes.contractMinutes` accepts `10` everywhere it is validated: `firestore.rules` lines 274 and 300, `hooks/live.js` `setContractTier`, `functions/portal/family-validate.js` `TIER_MINUTES`, DATA-MODEL. Sign-up sends `contractMinutes: null` for every athlete; the stamp happens later from the contract screen.
- The one-time stamp (`ensureContractStart`) writes `contractMinutes = contractMinutesFor(athlete, today)` and `contractStart = today` only when the stored `contractMinutes` is `null` (the rules allow `contractStart` on that transition only). Stored 45/90 values are left alone; every screen shows the derived requirement; every new log snapshots the derived value for its date.
- The family calendar judges each day against the requirement for that day (`buildContractMonthFromLogs` accepts a function for `contractMinutes`), so a birthday mid-month never changes earlier days.
- Family-facing surfaces (calendar, log sheet, dashboard card, household card, Billing/Membership contract line, parent calendar on AthleteDetail) stay behind `contractEnabled()`. The mental tabs, the board, notes and check-ins are never behind it.
- Dates: the client's "today" for the board and notes is `academyDateISO()` (America/Chicago, `data/calendar.js`); the server's is `lib.todayISO(now)`. Weeks start Monday; week math is pure ISO arithmetic (`Date.UTC`), tested across the Nov 1 2026 DST change and the year end. A check-in's `at` Timestamp becomes its America/Chicago date on both sides (`dateOf`: client `academyDateISO(new Date(ms))`, server `lib.chicagoDate(new Date(ms))`), so a tap after 6 PM Chicago, stored past midnight UTC, stays on its own day and the 14-day boundary does not shift; ISO strings are taken as written.
- The board route `/portal/mental/contract` admits `mental`, `ops`, `owner` (toggle only for `mental`); `/portal/mental`, `/portal/mental/:athleteId`, `/portal/mental/:athleteId/notes/:entryId` admit `mental` only. The Contract tab key is `mental-contract`, never `contract`.
- Backward compatible with `main` (spec §7): staging shares production's backend, so the rules and the new function reach production before `main` is updated. Every rules change is additive (new blocks, new `allow` lines, a widened list, a widened read), checked in Task 3 and again in Task 12 by `git diff origin/main -- firestore.rules` showing no removed `allow` line; `createFamily` keeps accepting the old payload (`contractMinutes` null or a listed tier); the new scheduled function sends nothing until `config/contract.enabled` is true (Task 10).
- Deploy order after merge (owner runs it): functions (`mentalCheckinReminders`, `createFamily` accepting 10), then rules, then `git push origin develop` (staging), then `develop:main`. Before the switch goes on (`scripts/set-contract-flag.mjs --prod --on --yes`) the owner confirms or stamps `test: true` on every test household in production (the RYP Test Family and the test-era households; a console edit or a one-line script the owner runs - nothing on this branch writes the field, see Decided here #3): until it is on those docs their kids sit on the board and in the first Monday email.
- Emulator isolation for this worktree: every emulator command uses `--config firebase.mental.json` (Firestore 8081, Auth 9100, Functions 5002, no UI) and `node --env-file=scripts/emulator.mental.env`; never ports 8080, 9099 or 3000-3005; no dev server in this plan (browser QA is the session lead's, with `PORT=3006`).
- Files stay under 500 lines; new code goes in new files; the grandfathered `hooks/index.js`, `hooks/live.js`, `PortalRoutes.js`, `CommitmentContract.js`, `seed-firestore.mjs` and `verify-rules.mjs` get only the edits named here.
- Repo files are CRLF (`core.autocrlf=true`): edit existing files with the Edit tool; never `sed -i`; new files may be written with the Write tool.
- Never push, never deploy, never run a command with `--prod` (the owner runs `scripts/set-contract-flag.mjs --prod --on --yes`; the agent runs `--dry-run` and the emulator tests only), never touch production data, never read credential stores.
- Test commands: `cd frontend && CI=true npx react-scripts test --watchAll=false <pattern>`; `cd frontend && npx eslint src/portal --max-warnings=0`; `cd frontend && npm run build`; `cd functions && node portal/<file>.test.js`; `cd functions && node test/check-exports.js`; `cd functions && npx eslint .`; `node --test scripts/test/<file>.test.mjs`; `npx firebase-tools emulators:exec --config firebase.mental.json --only firestore --project rypacad "node --env-file=scripts/emulator.mental.env scripts/verify-rules.mjs"`.
- Every commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; work stays on branch `mental/tools` in `C:\Users\Mac\Desktop\rypacadapp\wt-mental`.

## Review Focus

1. **An owner "just has a look" at a note.** Notes may hold clinical disclosures about minors; a rule that lets any staff role read `mentalNotes` is the failure the spec calls out first. Every verb on `mentalNotes/{athleteId}/entries` and the collection-group read must refuse owner, ops, coach, Phil, parent and athlete alike. Pinned in Task 3 Step 1 (`taskMental`: six roles get 403 on get, list, collection-group query and create; only the `mental` token gets 200).
2. **The parent's first log of the day fails with permission-denied.** `createContractLog` runs a transaction that reads `contractLogs/{athleteId}_{date}` before writing it; for a missing doc that read goes through `logNullReadOk`, which has no parent branch today. Adding the parent to create/update/delete alone leaves every parent's first log refused. Pinned in Task 3 Step 1 (parent GET of a missing own-household log is 404, not 403; parent create 200; another household 403).
3. **A 12th birthday turns last week red.** `buildContractMonthFromLogs` judges every day of the month against one number. With the derived requirement that flips 10 -> 20 on the birthday, earlier 10-minute days would be marked missed. Pinned in Task 8 Step 1 (`calendar.contract.test.js`: a function `contractMinutes` keeps the pre-birthday 10-minute days logged).
4. **The reminder email and the board disagree.** If the server counts days from a different "today", a different week start, a different `createdAt` fallback or a different check-in date than the client, Yannick gets emailed about an athlete the board shows under "This week"; and if only the server skips test households and lapsed memberships, the board pins the RYP Test Family's kids and every pending athlete to the top of "Due for a check-in" for good while the email never names them. Pinned in Task 2 Step 1 (`onContract` and the `households` arg drop them from every board group) and Task 10 Step 1 (`contract-checkins.test.js` runs the spec's three cases, 13 -> not, 15 -> overdue, never -> overdue after enabledAt + 15, with the same inputs and expected rows as `contractBoard.test.js` in Task 2, the same gate fixtures, and a 01:00Z check-in that both sides read as the previous Chicago day).
5. **Autosave wipes the note while Yannick is typing.** `useSeedResource` resets to `{ data: null, loading: true }` on every deps change; a note hook that subscribes to the invalidation its own save bumps blanks the textarea mid-sentence. The editor owns the text; the note read runs once per `(athleteId, entryId)`; a save never invalidates the editor's own source; and the screen never keys the editor on `entry` (the first save of a new note sets `entry`, and a key that flips from 'new' to the id remounts the editor and drops whatever was typed while that save was in flight). Pinned in Task 6 Step 1 (`NoteEditor.test.js`: text typed after a save is still in the textarea when the save resolves; `saveState` goes saving -> saved, and slow after 8 s; `MentalNote.test.js`: text typed while the first save was in flight survives `entry` arriving).

---

## File Structure

**Pure modules (frontend/src/portal/data/)**
- Create `contractRule.js` - the age rule, week math, week summary.
- Create `contractBoard.js` - the on-contract gate, overdue check-ins, board rows and grouping.
- Create `mentalNotes.js` - note ids and kinds, per-athlete summary, grouping, athlete list rows.
- Modify `athlete.js` - `CONTRACT_TIERS` goes; the onboarding row label.
- Modify `signup.js` - `TIER_MINUTES`, `contractMinutes`, `contractPicked`, `contractAnswered` go; the payload sends `contractMinutes: null`.
- Modify `seed.js` - `mentalFixtures(today)` for the mental screens; dobs on the Whitfield children.
- Modify `calendar.js` - `buildContractMonthFromLogs` accepts a function for `contractMinutes`.

**Hooks (frontend/src/portal/hooks/)**
- Create `mentalLive.js` - Firestore reads and writes for notes, check-ins, contract logs between dates, mental bookings, household contact, `config/contract`.
- Create `mental.js` - `useMentalAthletes`, `useMentalAthlete`, `useMentalNote`, `useContractBoard` (seed and live).
- Create `parentContract.js` - `useParentContract(athleteId)` for the parent's AthleteDetail.
- Modify `index.js` - `useContract` and `usePracticeLog` take an explicit `athleteId`; `setTier` and `useAthleteTier` go; `ensureContractStart`; every `contractMinutes == null` gate becomes the derived requirement; re-exports of the new modules.
- Modify `live.js` - `setContractTier` accepts 10.

**Components (frontend/src/portal/components/)**
- Create `mental/NoteEditor.js`, `mental/SaveState.js`, `mental/WeekDots.js`, `mental/CheckinToggle.js`, `mental/BoardRow.js`, `mental/SessionNoteChip.js`, `mental/ContactLine.js`.
- Create `ContractSheets.js` - `LogSheet` and `DaySheet`, moved out of `CommitmentContract.js` so the parent card can use them.
- Create `ParentContractCard.js` - the parent's month calendar, day sheet and log sheet for one child.
- Modify `BottomTabBar.js` - the mental set gains Athletes and Contract (`mental-contract`).
- Modify `NumericField.js` - `aria-label={label}` on its input (Task 9's card test fills "Minutes practiced" by label; no visual change).

**Screens and routes (frontend/src/portal/)**
- Create `screens/MentalAthletes.js`, `screens/MentalAthlete.js`, `screens/MentalNote.js`, `screens/MentalContract.js`.
- Modify `screens/SpecialistDay.js` - a Note chip per mental session row (`onOpenNote`).
- Modify `screens/CommitmentContract.js` - the derived requirement, no `NoContract`/`TierChoice`, sheets imported, `athleteId` threaded.
- Modify `screens/AthleteDetail.js` - the Start-a-contract card goes; the parent's `ParentContractCard` behind `contractEnabled()`.
- Modify `screens/Registration.js`, `screens/RegistrationSteps.js` - the contract step goes.
- Delete `screens/RegistrationContract.js`.
- Modify `PortalRoutes.js` - the four mental routes; `onOpenNote` for `SpecialistDayRoute`.
- Modify `StatesHarness.js` - entries for the four mental screens; 02/07/09 states without tiers.

**Server, rules, scripts, docs**
- Modify `firestore.rules` - `mentalNotes`, the `entries` collection-group read, `contractCheckins`, `config`, parent branches on `contractLogs`, `10` in both tier lists, `mental` on households read. All additive.
- `firestore.indexes.json` - unchanged. The Firestore emulator does not enforce composite indexes, so no emulator run can "ask" for one; the gate is Task 3 Step 4's query-shape check (every new query is single-field equality or range, or an unfiltered collection group).
- Create `functions/portal/contract-checkins.js`, `functions/portal/contract-checkins.test.js` - the Monday job.
- Modify `functions/index.js` - `exports.mentalCheckinReminders`; `functions/test/check-exports.js` - 18 functions; `functions/portal/family-validate.js` - `TIER_MINUTES` gains 10.
- Create `scripts/set-contract-flag.mjs`, `scripts/test/set-contract-flag.test.mjs`.
- Modify `scripts/verify-rules.mjs` - `taskMental` and a collection-group query helper.
- Modify `scripts/seed-firestore.mjs` - past mental sessions and bookings, notes, check-ins, `config/contract`, Yannick's email.
- Modify `docs/portal/DATA-MODEL.md` - the three new collections, `contractMinutes` `10 | 20 | 45 | 90 | null`, parent logging.

---

### Task 1: Contract rule and week math

**Files:**
- Create: `frontend/src/portal/data/contractRule.js`
- Test: `frontend/src/portal/data/contractRule.test.js`

**Interfaces:**
- Consumes: nothing (pure; no `Date` timezone dependence - every date is a `'YYYY-MM-DD'` string and arithmetic goes through `Date.UTC`).
- Produces:
  - constants `REQUIRED_MINUTES = 20`, `UNDER_12_MINUTES = 10`, `UNDER_AGE = 12`, `WEEKDAY_COUNT = 5`
  - `isUnder12(dobISO: string|null, onDateISO: string): boolean` (false without a valid dob; the 12th birthday itself is not under 12)
  - `contractMinutesFor(athlete: { dob?: string|null }|null, onDateISO: string): 10|20`
  - `ageOn(dobISO, onDateISO): number|null` (whole years; null without a valid dob)
  - `weekStartFor(dateISO): string` (the Monday on or before `dateISO`)
  - `weekdaysOf(weekStartISO): string[]` (five ISO dates Mon..Fri)
  - `weekDaysOf(weekStartISO): string[]` (seven ISO dates Mon..Sun, for the dots)
  - `addDays(dateISO, n): string`, `daysBetween(fromISO, toISO): number` (whole days, `to - from`)
  - `weekSummary({ logsByDate: { [dateISO]: minutes }, weekStartISO, required: number | ((dateISO) => number) }): { metDays: number, days: [{ date, state: 'met'|'short'|'none', minutes: number }] }` (five entries, Monday first)

- [ ] **Step 1: Write the failing test**

Create `frontend/src/portal/data/contractRule.test.js`:

```js
import {
  REQUIRED_MINUTES, UNDER_12_MINUTES, addDays, ageOn, contractMinutesFor, daysBetween, isUnder12,
  weekDaysOf, weekStartFor, weekSummary, weekdaysOf,
} from './contractRule';

describe('contractMinutesFor (spec 4.3: 20 a day, 10 under 12)', () => {
  test('11 years 364 days is 10; the 12th birthday is 20; no dob is 20', () => {
    expect(contractMinutesFor({ dob: '2014-11-12' }, '2026-11-11')).toBe(10);
    expect(contractMinutesFor({ dob: '2014-11-12' }, '2026-11-12')).toBe(20);
    expect(contractMinutesFor({ dob: '2014-11-12' }, '2026-11-13')).toBe(20);
    expect(contractMinutesFor({ dob: null }, '2026-11-11')).toBe(20);
    expect(contractMinutesFor({}, '2026-11-11')).toBe(20);
    expect(contractMinutesFor(null, '2026-11-11')).toBe(20);
    expect(contractMinutesFor({ dob: 'June 2014' }, '2026-11-11')).toBe(20);
    expect(REQUIRED_MINUTES).toBe(20);
    expect(UNDER_12_MINUTES).toBe(10);
  });
  test('isUnder12 and ageOn agree with the seed children', () => {
    expect(isUnder12('2017-09-09', '2026-11-03')).toBe(true);
    expect(isUnder12('2014-03-02', '2026-11-03')).toBe(false);
    expect(isUnder12(null, '2026-11-03')).toBe(false);
    expect(ageOn('2012-06-17', '2026-11-11')).toBe(14);
    expect(ageOn('2017-09-09', '2026-09-08')).toBe(8);
    expect(ageOn('2017-09-09', '2026-09-09')).toBe(9);
    expect(ageOn(null, '2026-11-11')).toBeNull();
  });
});

describe('week math (Monday first, pure ISO arithmetic)', () => {
  test('weekStartFor across a plain week, the Nov 1 2026 DST change and the year end', () => {
    expect(weekStartFor('2026-11-11')).toBe('2026-11-09');
    expect(weekStartFor('2026-11-09')).toBe('2026-11-09');
    expect(weekStartFor('2026-11-15')).toBe('2026-11-09');
    expect(weekStartFor('2026-11-01')).toBe('2026-10-26');
    expect(weekStartFor('2026-11-02')).toBe('2026-11-02');
    expect(weekStartFor('2027-01-01')).toBe('2026-12-28');
    expect(weekStartFor('2027-01-03')).toBe('2026-12-28');
    expect(weekStartFor('2027-01-04')).toBe('2027-01-04');
  });
  test('weekdaysOf is Mon..Fri, weekDaysOf is Mon..Sun', () => {
    expect(weekdaysOf('2026-11-09')).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']);
    expect(weekDaysOf('2026-10-26')).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
    expect(weekdaysOf('2026-12-28')).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01']);
  });
  test('addDays and daysBetween', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-11-09', -7)).toBe('2026-11-02');
    expect(daysBetween('2026-11-03', '2026-11-18')).toBe(15);
    expect(daysBetween('2026-11-18', '2026-11-03')).toBe(-15);
    expect(daysBetween('2026-10-26', '2026-11-02')).toBe(7);
  });
});

describe('weekSummary', () => {
  const logs = { '2026-11-09': 20, '2026-11-10': 15, '2026-11-12': 25, '2026-11-14': 60 };
  test('met at or above the requirement, short below, none without a log; weekend logs are ignored', () => {
    const s = weekSummary({ logsByDate: logs, weekStartISO: '2026-11-09', required: 20 });
    expect(s.metDays).toBe(2);
    expect(s.days).toEqual([
      { date: '2026-11-09', state: 'met', minutes: 20 },
      { date: '2026-11-10', state: 'short', minutes: 15 },
      { date: '2026-11-11', state: 'none', minutes: 0 },
      { date: '2026-11-12', state: 'met', minutes: 25 },
      { date: '2026-11-13', state: 'none', minutes: 0 },
    ]);
  });
  test('a per-day requirement: a 12th birthday on Wednesday leaves Monday and Tuesday met at 10', () => {
    const required = (d) => contractMinutesFor({ dob: '2014-11-11' }, d);
    const s = weekSummary({ logsByDate: { '2026-11-09': 10, '2026-11-10': 10, '2026-11-11': 10 }, weekStartISO: '2026-11-09', required });
    expect(s.days.map((d) => d.state)).toEqual(['met', 'met', 'short', 'none', 'none']);
    expect(s.metDays).toBe(2);
  });
  test('no logs is five none', () => {
    const s = weekSummary({ logsByDate: {}, weekStartISO: '2026-11-09', required: 20 });
    expect(s.metDays).toBe(0);
    expect(s.days.every((d) => d.state === 'none' && d.minutes === 0)).toBe(true);
    expect(weekSummary({ logsByDate: undefined, weekStartISO: '2026-11-09', required: 20 }).metDays).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/data/contractRule.test.js`
Expected: FAIL - "Cannot find module './contractRule' from 'src/portal/data/contractRule.test.js'".

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/portal/data/contractRule.js`:

```js
/**
 * The Commitment Contract rule (owner, 2026-10-28; spec 4.3): 20 minutes a
 * day, Monday to Friday; 10 minutes a day while the athlete is under 12. No
 * tier picker. PURE: strings in, strings out; every date is 'YYYY-MM-DD'
 * and the arithmetic runs on Date.UTC so no device timezone can move a day.
 *
 * CHANGE ONE, CHANGE BOTH: the age rule and the 14-day overdue rule are
 * duplicated in functions/portal/contract-checkins.js (CommonJS cannot
 * import this file). contract-checkins.test.js reads this file to check.
 */
export const REQUIRED_MINUTES = 20;
export const UNDER_12_MINUTES = 10;
export const UNDER_AGE = 12;
export const WEEKDAY_COUNT = 5;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const validISO = (s) => typeof s === 'string' && ISO.test(s);
const parts = (iso) => iso.split('-').map(Number);
const toUTC = (iso) => { const [y, m, d] = parts(iso); return Date.UTC(y, m - 1, d); };
const fromUTC = (ms) => new Date(ms).toISOString().slice(0, 10);
const DAY_MS = 86400000;

/** Whole years from `dobISO` to `onDateISO`; null without a valid dob. */
export function ageOn(dobISO, onDateISO) {
  if (!validISO(dobISO) || !validISO(onDateISO)) return null;
  const [by, bm, bd] = parts(dobISO);
  const [y, m, d] = parts(onDateISO);
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age -= 1;
  return age;
}

/** True while the athlete is under 12 on that date; the 12th birthday itself is not under 12. */
export function isUnder12(dobISO, onDateISO) {
  const age = ageOn(dobISO, onDateISO);
  return age != null && age < UNDER_AGE;
}

/** 10 under 12 (dob present), else 20. The owner's rule; no dob defaults to 20. */
export function contractMinutesFor(athlete, onDateISO) {
  return isUnder12(athlete?.dob ?? null, onDateISO) ? UNDER_12_MINUTES : REQUIRED_MINUTES;
}

export function addDays(dateISO, n) {
  return fromUTC(toUTC(dateISO) + n * DAY_MS);
}

/** Whole days from `fromISO` to `toISO` (negative when `toISO` is earlier). */
export function daysBetween(fromISO, toISO) {
  return Math.round((toUTC(toISO) - toUTC(fromISO)) / DAY_MS);
}

/** The Monday on or before `dateISO`. */
export function weekStartFor(dateISO) {
  const dow = new Date(toUTC(dateISO)).getUTCDay(); // 0 Sun .. 6 Sat
  return addDays(dateISO, dow === 0 ? -6 : 1 - dow);
}

/** Mon..Fri of the week starting `weekStartISO`. */
export function weekdaysOf(weekStartISO) {
  return Array.from({ length: WEEKDAY_COUNT }, (_, i) => addDays(weekStartISO, i));
}

/** Mon..Sun of the week starting `weekStartISO` (the seven dots). */
export function weekDaysOf(weekStartISO) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStartISO, i));
}

/**
 * One week's contract days. `required` is a number or a function of the
 * date (so a birthday mid-week judges each day by its own requirement).
 * Weekend logs are not contract days and are ignored here, exactly as
 * buildContractMonthFromLogs treats Saturday and Sunday.
 */
export function weekSummary({ logsByDate, weekStartISO, required }) {
  const logs = logsByDate || {};
  const need = typeof required === 'function' ? required : () => required;
  const days = weekdaysOf(weekStartISO).map((date) => {
    const minutes = Number(logs[date]) || 0;
    const state = minutes <= 0 ? 'none' : minutes >= need(date) ? 'met' : 'short';
    return { date, state, minutes };
  });
  return { metDays: days.filter((d) => d.state === 'met').length, days };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/data/contractRule.test.js`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/portal/data/contractRule.js frontend/src/portal/data/contractRule.test.js
git commit -m "feat(contract): age rule and week math

contractMinutesFor (20, 10 under 12), Monday weeks and the five-day
week summary as pure ISO arithmetic.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Board grouping and note helpers

**Files:**
- Create: `frontend/src/portal/data/contractBoard.js`
- Create: `frontend/src/portal/data/mentalNotes.js`
- Test: `frontend/src/portal/data/contractBoard.test.js`
- Test: `frontend/src/portal/data/mentalNotes.test.js`

**Interfaces:**
- Consumes: `contractRule.js` (`ageOn`, `contractMinutesFor`, `daysBetween`, `weekStartFor`, `weekSummary`, `addDays`); `calendar.js` (`academyDateISO`, for the America/Chicago date of a Timestamp).
- Produces (`contractBoard.js`):
  - `OVERDUE_DAYS = 14`
  - `dateOf(v): string|null` - `'YYYY-MM-DD'` from an ISO string (first ten characters, as written), or the America/Chicago date (`academyDateISO(new Date(ms))`) of a `Date` or an object with `toMillis()` (Firestore Timestamp); null otherwise
  - `onContract(household, athlete): boolean` - spec 4.4's "who is on the contract": false when `household.test === true`, when `household.membership.status` is `past_due` or `lapsed`, when `athlete.billing.oneTime === true` and `athlete.packageId !== 'single'`, or when `athlete.billing` exists with a status other than `active`; true otherwise, including a missing household. The mirror of `functions/portal/lib.js` `membershipAllowsBooking` plus the test-household skip (CHANGE ONE, CHANGE BOTH; `contract-checkins.test.js` greps this file for it)
  - `lastCheckinFor(athleteId, checkins): string|null` - the latest `dateOf(c.at)` (falling back to `c.weekStart`) among `checkedIn == true` rows for that athlete
  - `overdueCheckins({ athletes, households, checkins, today, enabledAt }): [{ athleteId, lastCheckin, daysSince }]` over the athletes `onContract(households[a.householdId], a)` keeps (`households` is `{ [id]: doc }` or an array of docs with `id`; absent means every athlete), sorted by `daysSince` descending, then name
  - `boardRows({ athletes, households, logsByAthlete: { [athleteId]: { [dateISO]: minutes } }, checkins, today, enabledAt, weekStartISO }): { due: Row[], thisWeek: Row[], checkedIn: Row[] }` with `Row = { athleteId, name, age, required, thisWeek, lastWeek, lastCheckin, checkedInThisWeek, daysSince }`; `due` sorted as `overdueCheckins`, `thisWeek` by `thisWeek.metDays` ascending then name, `checkedIn` by name; an athlete `onContract` refuses appears in no group
- Produces (`mentalNotes.js`):
  - `NOTE_MAX = 8000`, `NOTE_KINDS = ['intake', 'session', 'free']`
  - `noteEntryId({ kind, sessionId, random }): string`
  - `kindOf(entryId): 'intake'|'session'|'free'`
  - `athleteNoteSummary(entries): { hasIntake: boolean, latestNoteDate: string|null }` (entries carry `id` and `updatedAtMs`; the date is `dateOf(updatedAtMs)`)
  - `groupEntries(entries): { intake: entry|null, sessions: entry[] (sessionDate desc, then updatedAtMs desc), free: entry[] (updatedAtMs desc) }`
  - `mentalAthleteRows({ athletes, bookings, entries, today }): [{ athleteId, name, age, nextSession, lastSession, hasIntake, latestNoteDate }]` sorted by name; `nextSession` is the earliest non-cancelled mental booking `date >= today`, `lastSession` the latest `date < today`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/portal/data/contractBoard.test.js`:

```js
import { OVERDUE_DAYS, boardRows, dateOf, lastCheckinFor, onContract, overdueCheckins } from './contractBoard';

const ath = (id, name, dob, extra = {}) => ({ id, name, dob, ...extra });

describe('dateOf', () => {
  test('ISO strings as written; Dates and Timestamps as their Chicago date; anything else is null', () => {
    expect(dateOf('2026-11-12')).toBe('2026-11-12');
    expect(dateOf('2026-11-12T19:30:00.000Z')).toBe('2026-11-12');
    expect(dateOf({ toMillis: () => Date.UTC(2026, 10, 12, 23) })).toBe('2026-11-12');
    // 01:00Z on Nov 12 is 7 PM Chicago on Nov 11: an evening tap stays on its own day.
    expect(dateOf(new Date(Date.UTC(2026, 10, 12, 1)))).toBe('2026-11-11');
    expect(dateOf({ toMillis: () => Date.UTC(2026, 10, 12, 1) })).toBe('2026-11-11');
    expect(lastCheckinFor('x', [{ athleteId: 'x', weekStart: '2026-11-09', checkedIn: true, at: { toMillis: () => Date.UTC(2026, 10, 11, 1) } }])).toBe('2026-11-10');
    expect(dateOf(null)).toBeNull();
    expect(dateOf(42)).toBeNull();
  });
});

describe('overdueCheckins (spec 4.4, 14 days)', () => {
  const today = '2026-11-25';
  const athletes = [
    ath('a', 'Ava', '2012-01-01'),
    ath('b', 'Ben', '2012-01-01'),
    ath('c', 'Cal', '2012-01-01'),
    ath('d', 'Dee', '2012-01-01', { createdAt: '2026-11-20' }),
  ];
  const checkins = [
    { athleteId: 'b', weekStart: '2026-11-09', checkedIn: true, at: '2026-11-12' },
    { athleteId: 'c', weekStart: '2026-11-09', checkedIn: true, at: '2026-11-10' },
    { athleteId: 'c', weekStart: '2026-11-02', checkedIn: true, at: '2026-11-03' },
  ];
  test('never checked in and 22 days past enabledAt is overdue; 13 days is not; 15 is; a new athlete counts from createdAt', () => {
    expect(OVERDUE_DAYS).toBe(14);
    expect(overdueCheckins({ athletes, checkins, today, enabledAt: '2026-11-03' })).toEqual([
      { athleteId: 'a', lastCheckin: null, daysSince: 22 },
      { athleteId: 'c', lastCheckin: '2026-11-10', daysSince: 15 },
    ]);
  });
  test('exactly 14 days is not overdue', () => {
    const rows = overdueCheckins({ athletes: [athletes[0]], checkins: [], today: '2026-11-17', enabledAt: '2026-11-03' });
    expect(rows).toEqual([]);
    expect(overdueCheckins({ athletes: [athletes[0]], checkins: [], today: '2026-11-18', enabledAt: '2026-11-03' })).toEqual([
      { athleteId: 'a', lastCheckin: null, daysSince: 15 },
    ]);
  });
  test('without enabledAt a never-checked-in athlete is not overdue, an old check-in still is', () => {
    expect(overdueCheckins({ athletes, checkins, today, enabledAt: null })).toEqual([
      { athleteId: 'c', lastCheckin: '2026-11-10', daysSince: 15 },
    ]);
  });
  test('lastCheckinFor ignores checkedIn false and falls back to weekStart', () => {
    expect(lastCheckinFor('c', checkins)).toBe('2026-11-10');
    expect(lastCheckinFor('a', checkins)).toBeNull();
    expect(lastCheckinFor('x', [{ athleteId: 'x', weekStart: '2026-11-09', checkedIn: false, at: '2026-11-12' }])).toBeNull();
    expect(lastCheckinFor('y', [{ athleteId: 'y', weekStart: '2026-11-09', checkedIn: true }])).toBe('2026-11-09');
  });
});

describe('onContract (spec 4.4: the one gate the board and the Monday email share)', () => {
  test('test households, past_due or lapsed memberships and non-active billing are off the contract', () => {
    expect(onContract({ name: 'Whitfield family' }, { id: 'a' })).toBe(true);
    expect(onContract(undefined, { id: 'a' })).toBe(true);
    expect(onContract({ test: true }, { id: 'a' })).toBe(false);
    expect(onContract({ membership: { status: 'past_due' } }, { id: 'a' })).toBe(false);
    expect(onContract({ membership: { status: 'lapsed' } }, { id: 'a' })).toBe(false);
    expect(onContract({ membership: { status: 'active' } }, { id: 'a', billing: { status: 'active' } })).toBe(true);
    expect(onContract({ membership: { status: 'active' } }, { id: 'a', billing: { status: 'pending' } })).toBe(false);
    expect(onContract({}, { id: 'a', billing: { status: 'active', oneTime: true }, packageId: 't-6' })).toBe(false);
    expect(onContract({}, { id: 'a', billing: { status: 'active', oneTime: true }, packageId: 'single' })).toBe(true);
  });
  test('overdueCheckins and boardRows drop athletes who are not on the contract (same fixtures as contract-checkins.test.js)', () => {
    const athletes = [
      ath('a', 'Ava', '2012-01-01', { householdId: 'hh' }),
      ath('t', 'Test Kid', '2012-01-01', { householdId: 'hh-test' }),
      ath('p', 'Pat', '2012-01-01', { householdId: 'hh-due' }),
      ath('u', 'Uma', '2012-01-01', { householdId: 'hh', billing: { status: 'pending' } }),
    ];
    const households = { hh: { name: 'Whitfield family' }, 'hh-test': { name: 'RYP Test Family', test: true }, 'hh-due': { name: 'Late family', membership: { status: 'past_due' } } };
    expect(overdueCheckins({ athletes, households, checkins: [], today: '2026-11-25', enabledAt: '2026-11-03' }).map((r) => r.athleteId)).toEqual(['a']);
    const groups = boardRows({ athletes, households, logsByAthlete: {}, checkins: [], today: '2026-11-25', enabledAt: '2026-11-03', weekStartISO: '2026-11-23' });
    expect([...groups.due, ...groups.thisWeek, ...groups.checkedIn].map((r) => r.athleteId)).toEqual(['a']);
    // An array of household docs (fetchAllHouseholds' shape) works too.
    expect(overdueCheckins({ athletes, households: Object.entries(households).map(([id, h]) => ({ id, ...h })), checkins: [], today: '2026-11-25', enabledAt: '2026-11-03' })).toHaveLength(1);
  });
});

describe('boardRows (spec 5.4)', () => {
  const today = '2026-11-11';
  const weekStartISO = '2026-11-09';
  const athletes = [
    ath('jordan', 'Jordan Whitfield', '2012-06-17'),
    ath('nico', 'Nico Whitfield', '2017-09-09'),
    ath('reese', 'Reese Whitfield', '2014-03-02'),
    ath('sage', 'Sage Parker', null),
  ];
  const logsByAthlete = {
    jordan: { '2026-11-09': 20, '2026-11-10': 30, '2026-11-04': 20 },
    nico: { '2026-11-09': 10, '2026-11-10': 10, '2026-11-11': 5 },
    sage: { '2026-11-09': 20, '2026-11-10': 20, '2026-11-11': 20 },
  };
  const checkins = [
    { athleteId: 'jordan', weekStart: '2026-11-09', checkedIn: true, at: '2026-11-10' },
    { athleteId: 'nico', weekStart: '2026-11-02', checkedIn: true, at: '2026-11-04' },
    { athleteId: 'sage', weekStart: '2026-11-02', checkedIn: true, at: '2026-11-05' },
  ];
  const groups = boardRows({ athletes, logsByAthlete, checkins, today, enabledAt: '2026-10-20', weekStartISO });

  test('three groups: due (overdue), this week (fewest days met first), checked in this week', () => {
    expect(groups.due.map((r) => r.athleteId)).toEqual(['reese']);
    expect(groups.thisWeek.map((r) => r.athleteId)).toEqual(['nico', 'sage']);
    expect(groups.checkedIn.map((r) => r.athleteId)).toEqual(['jordan']);
  });
  test('a row carries age, the derived requirement, both week summaries and the check-in facts', () => {
    const nico = groups.thisWeek[0];
    expect(nico).toMatchObject({ name: 'Nico Whitfield', age: 9, required: 10, checkedInThisWeek: false, lastCheckin: '2026-11-04', daysSince: 7 });
    expect(nico.thisWeek.metDays).toBe(2);
    expect(nico.thisWeek.days.map((d) => d.state)).toEqual(['met', 'met', 'short', 'none', 'none']);
    expect(nico.lastWeek.metDays).toBe(0);
    const jordan = groups.checkedIn[0];
    expect(jordan).toMatchObject({ age: 14, required: 20, checkedInThisWeek: true, lastCheckin: '2026-11-10', daysSince: 1 });
    expect(jordan.lastWeek.metDays).toBe(1);
    expect(groups.thisWeek[1]).toMatchObject({ athleteId: 'sage', age: null, required: 20 });
    expect(groups.due[0]).toMatchObject({ lastCheckin: null, daysSince: 22, required: 20 });
  });
  test('a past week: checked-in is judged for that week, this week is that week', () => {
    const past = boardRows({ athletes, logsByAthlete, checkins, today, enabledAt: '2026-10-20', weekStartISO: '2026-11-02' });
    expect(past.checkedIn.map((r) => r.athleteId).sort()).toEqual(['nico', 'sage']);
    expect(past.checkedIn[0].thisWeek.days[0].date).toBe('2026-11-02');
    expect(past.thisWeek.map((r) => r.athleteId)).toEqual(['jordan']);
  });
});
```

Create `frontend/src/portal/data/mentalNotes.test.js`:

```js
import { NOTE_MAX, athleteNoteSummary, groupEntries, kindOf, mentalAthleteRows, noteEntryId } from './mentalNotes';

const ms = (iso) => Date.UTC(...iso.split('-').map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))), 15);

describe('note ids (spec 4.1)', () => {
  test('intake, the session id, or free-<random>', () => {
    expect(noteEntryId({ kind: 'intake' })).toBe('intake');
    expect(noteEntryId({ kind: 'session', sessionId: 'cal-9f2a' })).toBe('cal-9f2a');
    expect(noteEntryId({ kind: 'free', random: 'k3x9' })).toBe('free-k3x9');
    expect(kindOf('intake')).toBe('intake');
    expect(kindOf('free-k3x9')).toBe('free');
    expect(kindOf('cal-9f2a')).toBe('session');
    expect(kindOf('2026-11-10-s1')).toBe('session');
    expect(NOTE_MAX).toBe(8000);
  });
});

describe('summary and grouping', () => {
  const entries = [
    { id: 'cal-b', athleteId: 'jordan', kind: 'session', sessionId: 'cal-b', sessionDate: '2026-11-05', body: 'b', updatedAtMs: ms('2026-11-05') },
    { id: 'intake', athleteId: 'jordan', kind: 'intake', sessionId: null, sessionDate: null, body: 'i', updatedAtMs: ms('2026-11-03') },
    { id: 'free-1', athleteId: 'jordan', kind: 'free', sessionId: null, sessionDate: null, body: 'f', updatedAtMs: ms('2026-11-04') },
    { id: 'cal-a', athleteId: 'jordan', kind: 'session', sessionId: 'cal-a', sessionDate: '2026-11-10', body: 'a', updatedAtMs: ms('2026-11-10') },
  ];
  test('athleteNoteSummary: has an intake, latest note date', () => {
    expect(athleteNoteSummary(entries)).toEqual({ hasIntake: true, latestNoteDate: '2026-11-10' });
    expect(athleteNoteSummary([entries[0]])).toEqual({ hasIntake: false, latestNoteDate: '2026-11-05' });
    expect(athleteNoteSummary([])).toEqual({ hasIntake: false, latestNoteDate: null });
  });
  test('groupEntries: intake, sessions newest first, free newest first', () => {
    const g = groupEntries(entries);
    expect(g.intake.id).toBe('intake');
    expect(g.sessions.map((e) => e.id)).toEqual(['cal-a', 'cal-b']);
    expect(g.free.map((e) => e.id)).toEqual(['free-1']);
    expect(groupEntries([]).intake).toBeNull();
  });
});

describe('mentalAthleteRows (Athletes list, spec 5.1)', () => {
  const athletes = [{ id: 'reese', name: 'Reese Whitfield', dob: '2014-03-02' }, { id: 'jordan', name: 'Jordan Whitfield', dob: '2012-06-17' }];
  const bookings = [
    { id: 'jordan_cal-a', athleteId: 'jordan', sessionId: 'cal-a', date: '2026-11-10', type: 'mental', status: 'confirmed' },
    { id: 'jordan_cal-b', athleteId: 'jordan', sessionId: 'cal-b', date: '2026-11-05', type: 'mental', status: 'attended' },
    { id: 'jordan_cal-c', athleteId: 'jordan', sessionId: 'cal-c', date: '2026-11-17', type: 'mental', status: 'confirmed' },
    { id: 'jordan_cal-x', athleteId: 'jordan', sessionId: 'cal-x', date: '2026-11-12', type: 'mental', status: 'cancelled' },
    { id: 'reese_s1', athleteId: 'reese', sessionId: 's1', date: '2026-11-11', type: 'training', status: 'confirmed' },
  ];
  const entries = [{ id: 'intake', athleteId: 'jordan', kind: 'intake', updatedAtMs: ms('2026-11-03') }];
  test('rows by name with next and last 1:1 and the note facts', () => {
    expect(mentalAthleteRows({ athletes, bookings, entries, today: '2026-11-11' })).toEqual([
      { athleteId: 'jordan', name: 'Jordan Whitfield', age: 14, nextSession: '2026-11-17', lastSession: '2026-11-10', hasIntake: true, latestNoteDate: '2026-11-03' },
      { athleteId: 'reese', name: 'Reese Whitfield', age: 12, nextSession: null, lastSession: null, hasIntake: false, latestNoteDate: null },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/data/contractBoard.test.js src/portal/data/mentalNotes.test.js`
Expected: FAIL - "Cannot find module './contractBoard'" and "Cannot find module './mentalNotes'".

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/portal/data/contractBoard.js`:

```js
/**
 * Yannick's contract board (spec 4.4, 5.4): who is on the contract, who is
 * overdue for a check-in and the three groups the board shows. PURE. The
 * on-contract gate and the 14-day rule here are the ones
 * functions/portal/contract-checkins.js applies for the Monday email
 * (CHANGE ONE, CHANGE BOTH; that file's test greps this one), so the email
 * and the screen never disagree.
 */
import { addDays, ageOn, contractMinutesFor, daysBetween, weekSummary } from './contractRule';
import { academyDateISO } from './calendar';

export const OVERDUE_DAYS = 14;

/**
 * 'YYYY-MM-DD' from an ISO string (as written), or the America/Chicago date
 * of a Date or a Firestore Timestamp (a check-in tapped at 7 PM Chicago is
 * stored past midnight UTC and must stay on its own day); null otherwise.
 */
export function dateOf(v) {
  if (v == null) return null;
  if (typeof v === 'string') return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
  const ms = v instanceof Date ? v.getTime() : typeof v.toMillis === 'function' ? v.toMillis() : null;
  return ms == null || Number.isNaN(ms) ? null : academyDateISO(new Date(ms));
}

/**
 * Who is on the contract (spec 4.4): not a test household, and a membership
 * that allows booking. Line for line the server's lib.membershipAllowsBooking
 * plus the test skip; a missing household keeps the athlete, as the server's
 * membershipAllowsBooking(null, athlete) does.
 */
export function onContract(household, athlete) {
  if (household && household.test === true) return false;
  const status = household?.membership?.status;
  if (status === 'past_due' || status === 'lapsed') return false;
  const billing = athlete?.billing;
  if (billing && billing.oneTime === true && athlete.packageId !== 'single') return false;
  return !billing || billing.status === 'active';
}

const householdMap = (households) => {
  if (!households) return null;
  if (Array.isArray(households)) return Object.fromEntries(households.map((h) => [h.id, h]));
  return households;
};
const onContractAthletes = (athletes, households) => {
  const byId = householdMap(households);
  return (athletes || []).filter((a) => !byId || onContract(byId[a.householdId], a));
};

/** The latest check-in date for an athlete (checkedIn true only); `at` wins, `weekStart` is the fallback. */
export function lastCheckinFor(athleteId, checkins) {
  let latest = null;
  for (const c of checkins || []) {
    if (c.athleteId !== athleteId || c.checkedIn !== true) continue;
    const d = dateOf(c.at) || dateOf(c.weekStart);
    if (d && (!latest || d > latest)) latest = d;
  }
  return latest;
}

const later = (a, b) => (a && b ? (a > b ? a : b) : a || b || null);
const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''));

function checkinFacts(athlete, checkins, today, enabledAt) {
  const lastCheckin = lastCheckinFor(athlete.id, checkins);
  const since = lastCheckin || later(dateOf(enabledAt), dateOf(athlete.createdAt));
  const daysSince = since ? daysBetween(since, today) : null;
  return { lastCheckin, daysSince, overdue: daysSince != null && daysSince > OVERDUE_DAYS };
}

export function overdueCheckins({ athletes, households, checkins, today, enabledAt }) {
  return onContractAthletes(athletes, households)
    .map((a) => ({ athlete: a, ...checkinFacts(a, checkins, today, enabledAt) }))
    .filter((r) => r.overdue)
    .sort((x, y) => y.daysSince - x.daysSince || byName(x.athlete, y.athlete))
    .map((r) => ({ athleteId: r.athlete.id, lastCheckin: r.lastCheckin, daysSince: r.daysSince }));
}

export function boardRows({ athletes, households, logsByAthlete, checkins, today, enabledAt, weekStartISO }) {
  const lastWeekStart = addDays(weekStartISO, -7);
  const rows = onContractAthletes(athletes, households).map((a) => {
    const required = (d) => contractMinutesFor(a, d);
    const logs = (logsByAthlete || {})[a.id] || {};
    const facts = checkinFacts(a, checkins, today, enabledAt);
    const checkedInThisWeek = (checkins || []).some((c) => c.athleteId === a.id && c.weekStart === weekStartISO && c.checkedIn === true);
    return {
      athleteId: a.id, name: a.name, age: ageOn(a.dob ?? null, today), required: contractMinutesFor(a, today),
      thisWeek: weekSummary({ logsByDate: logs, weekStartISO, required }),
      lastWeek: weekSummary({ logsByDate: logs, weekStartISO: lastWeekStart, required }),
      lastCheckin: facts.lastCheckin, checkedInThisWeek, daysSince: facts.daysSince, overdue: facts.overdue,
    };
  });
  const strip = ({ overdue, ...row }) => row;
  return {
    due: rows.filter((r) => r.overdue && !r.checkedInThisWeek).sort((x, y) => y.daysSince - x.daysSince || byName(x, y)).map(strip),
    thisWeek: rows.filter((r) => !r.overdue && !r.checkedInThisWeek).sort((x, y) => x.thisWeek.metDays - y.thisWeek.metDays || byName(x, y)).map(strip),
    checkedIn: rows.filter((r) => r.checkedInThisWeek).sort(byName).map(strip),
  };
}
```

Create `frontend/src/portal/data/mentalNotes.js`:

```js
/**
 * Yannick's private notes (spec 4.1): ids, kinds, per-athlete summary and
 * grouping, and the Athletes list rows. PURE. The documents themselves are
 * readable by role 'mental' only (firestore.rules mentalNotes).
 */
import { ageOn } from './contractRule';
import { dateOf } from './contractBoard';

export const NOTE_MAX = 8000;
export const NOTE_KINDS = ['intake', 'session', 'free'];

export function noteEntryId({ kind, sessionId, random }) {
  if (kind === 'intake') return 'intake';
  if (kind === 'free') return `free-${random}`;
  return sessionId;
}

export function kindOf(entryId) {
  if (entryId === 'intake') return 'intake';
  if (typeof entryId === 'string' && entryId.startsWith('free-')) return 'free';
  return 'session';
}

export function athleteNoteSummary(entries) {
  const list = entries || [];
  const latest = list.reduce((m, e) => (e.updatedAtMs > m ? e.updatedAtMs : m), 0);
  return { hasIntake: list.some((e) => e.id === 'intake'), latestNoteDate: latest ? dateOf(new Date(latest)) : null };
}

export function groupEntries(entries) {
  const list = entries || [];
  const newest = (a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0);
  return {
    intake: list.find((e) => e.id === 'intake') || null,
    sessions: list.filter((e) => kindOf(e.id) === 'session').sort((a, b) => String(b.sessionDate || '').localeCompare(String(a.sessionDate || '')) || newest(a, b)),
    free: list.filter((e) => kindOf(e.id) === 'free').sort(newest),
  };
}

export function mentalAthleteRows({ athletes, bookings, entries, today }) {
  const live = (bookings || []).filter((b) => b.type === 'mental' && b.status !== 'cancelled');
  return (athletes || [])
    .map((a) => {
      const mine = live.filter((b) => b.athleteId === a.id).map((b) => b.date).filter(Boolean).sort();
      const summary = athleteNoteSummary((entries || []).filter((e) => e.athleteId === a.id));
      return {
        athleteId: a.id, name: a.name, age: ageOn(a.dob ?? null, today),
        nextSession: mine.find((d) => d >= today) || null,
        lastSession: mine.filter((d) => d < today).pop() || null,
        ...summary,
      };
    })
    .sort((x, y) => String(x.name || '').localeCompare(String(y.name || '')));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/data/contractBoard.test.js src/portal/data/mentalNotes.test.js`
Expected: PASS (14 tests across the two files: 10 in contractBoard.test.js, 4 in mentalNotes.test.js).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/portal/data/contractBoard.js frontend/src/portal/data/contractBoard.test.js frontend/src/portal/data/mentalNotes.js frontend/src/portal/data/mentalNotes.test.js
git commit -m "feat(mental): board grouping and note helpers

onContract (the gate the board and the Monday email share),
overdueCheckins and boardRows (14-day rule, Chicago check-in dates,
three groups), note ids, grouping and the Athletes list rows, all pure.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Firestore rules, probes and indexes

**Files:**
- Modify: `firestore.rules` (lines 274, 300, 1140-1184, 1215; new blocks after the `contractLogs` block and after the diagnostics collection-group block)
- Modify: `scripts/verify-rules.mjs` (new `groupListAs` and `listUnderAs` helpers beside `listAs`, new `taskMental`, one call in `runPass`)
- `firestore.indexes.json`: no change expected (Step 4's query-shape check decides, not the emulator, which never enforces composite indexes)

**Interfaces:**
- Consumes: existing rules helpers `signedIn()`, `me()`, `athleteData(id)`; verify-rules helpers `seed`, `del`, `call`, `createAs`, `updateAs`, `listAs`, `token`, `t`, `expect`, `BASE`.
- Produces: rules blocks `mentalNotes/{athleteId}/entries/{entryId}`, `{path=**}/entries/{entryId}`, `contractCheckins/{checkinId}`, `config/{docId}`; parent `allow` lines on `contractLogs`; `10` in both tier lists; `mental` on households read. `taskMental()` exported from verify-rules; `groupListAs(auth, collectionId)` and `listUnderAs(auth, parentPath, collectionId, filters = {})` (module-private). `listAs` posts `runQuery` at the documents root with `from: [{ collectionId }]`, and a Firestore `collectionId` is one path segment: passing `'mentalNotes/ath-mental/entries'` to it gets `400 INVALID_ARGUMENT` from the emulator, never 200 or 403, and nothing in verify-rules lists a subcollection today (the diagnostics probes never list `athletes/{id}/diagnostics`). A subcollection list is posted to its parent document, `${BASE}/mentalNotes/ath-mental:runQuery` with `collectionId: 'entries'`; that is `listUnderAs`.

- [ ] **Step 1: Write the failing probes**

In `scripts/verify-rules.mjs`, directly under `listAs` (after its closing brace, line 82), add:

```js
// A collection-group query as a real user (allDescendants), for the {path=**}/entries rule.
async function groupListAs(auth, collectionId) {
  const res = await fetch(`${BASE}:runQuery`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${auth}` },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId, allDescendants: true }] } }) });
  const body = await res.json().catch(() => null);
  const err = Array.isArray(body) ? body.find((r) => r && r.error)?.error : body?.error;
  return err ? err.code : res.status;
}
// A list of ONE document's subcollection as a real user. runQuery goes to the parent document
// (`.../documents/mentalNotes/ath-mental:runQuery`, from: [{ collectionId: 'entries' }]): a collectionId is a
// single path segment, so listAs with a slash in it is a 400 from the emulator, never the 200 or 403 a probe wants.
async function listUnderAs(auth, parentPath, collectionId, filters = {}) {
  const where = { compositeFilter: { op: 'AND', filters: Object.entries(filters).map(([fieldPath, v]) => ({ fieldFilter: { field: { fieldPath }, op: 'EQUAL', value: fsValue(v) } })) } };
  const res = await fetch(`${BASE}/${parentPath}:runQuery`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${auth}` },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId }], ...(Object.keys(filters).length ? { where } : {}) } }) });
  const body = await res.json().catch(() => null);
  const err = Array.isArray(body) ? body.find((r) => r && r.error)?.error : body?.error;
  return err ? err.code : res.status;
}
```

Before `async function runPass(label)`, add:

```js
export async function taskMental() {
  console.log('Mental tools: mentalNotes (role mental only), contractCheckins, config/contract, parent contract logs, contractMinutes 10, households read for mental');
  const staff = { mental: 'mental-probe', owner: 'owner-probe', phil: 'phil-probe' };
  await seed('users', staff.mental, { role: 'mental', specialistId: 'mental' });
  await seed('users', staff.owner, { role: 'owner' });
  await seed('users', staff.phil, { role: 'coach', specialistId: 'phil' });
  const mental = token(staff.mental, { email: 'mental@example.com', email_verified: true });
  const owner = token(staff.owner, { email: 'owner@example.com', email_verified: true });
  const phil = token(staff.phil, { email: 'phil@example.com', email_verified: true });
  await seed('athletes', 'ath-mental', { name: 'Probe Mental', householdId: 'hh', contractMinutes: null, coachId: null, dob: '2015-01-01' });
  const notes = 'mentalNotes/ath-mental/entries';
  const note = { athleteId: 'ath-mental', kind: 'session', sessionId: 'cal-probe', sessionDate: '2026-11-10', body: 'Private.', createdBy: staff.mental, updatedBy: staff.mental };
  const others = [['owner', owner], ['ops', t.ops], ['coach', t.coach], ['phil', phil], ['parent', t.parent], ['athlete', t.athlete]];

  // Notes: Yannick writes, reads, lists, group-queries, edits and deletes; nobody else gets anything.
  expect('mental creates a session note', await createAs(mental, notes, 'cal-probe', note, ['createdAt', 'updatedAt']), 200);
  expect('mental creates with a wrong athleteId', await createAs(mental, notes, 'cal-other', { ...note, athleteId: 'ath-active' }, ['createdAt', 'updatedAt']), 403);
  expect('mental creates a body over 8000', await createAs(mental, notes, 'free-big', { ...note, kind: 'free', sessionId: null, sessionDate: null, body: 'x'.repeat(8001) }, ['createdAt', 'updatedAt']), 403);
  expect('mental creates with another createdBy', await createAs(mental, notes, 'free-by', { ...note, kind: 'free', sessionId: null, sessionDate: null, createdBy: 'someone' }, ['createdAt', 'updatedAt']), 403);
  expect('mental reads the note', (await call('GET', `/${notes}/cal-probe`, null, mental)).status, 200);
  expect('mental lists the athlete notes', await listUnderAs(mental, 'mentalNotes/ath-mental', 'entries'), 200);
  expect('mental queries the entries collection group', await groupListAs(mental, 'entries'), 200);
  expect('mental edits the body', await updateAs(mental, notes, 'cal-probe', { body: 'Edited.', updatedBy: staff.mental }, ['body', 'updatedBy', 'updatedAt'], ['updatedAt']), 200);
  expect('mental cannot move the note to another athlete', await updateAs(mental, notes, 'cal-probe', { athleteId: 'ath-active', updatedBy: staff.mental }, ['athleteId', 'updatedBy', 'updatedAt'], ['updatedAt']), 403);
  for (const [who, auth] of others) {
    expect(`${who} reads a note`, (await call('GET', `/${notes}/cal-probe`, null, auth)).status, 403);
    expect(`${who} lists notes`, await listUnderAs(auth, 'mentalNotes/ath-mental', 'entries'), 403);
    expect(`${who} queries the entries group`, await groupListAs(auth, 'entries'), 403);
    expect(`${who} creates a note`, await createAs(auth, notes, `free-${who}`, { ...note, kind: 'free', sessionId: null, sessionDate: null, createdBy: uid[who] || staff[who], updatedBy: uid[who] || staff[who] }, ['createdAt', 'updatedAt']), 403);
    expect(`${who} deletes a note`, (await call('DELETE', `/${notes}/cal-probe`, null, auth)).status, 403);
  }
  expect('mental deletes the note', (await call('DELETE', `/${notes}/cal-probe`, null, mental)).status, 200);

  // Check-ins: id pinned to athleteId_weekStart, checkedIn true only, mental writes, owner/ops read, parent nothing.
  const checkin = { athleteId: 'ath-mental', weekStart: '2026-11-09', checkedIn: true, by: staff.mental };
  expect('mental checks an athlete in', await createAs(mental, 'contractCheckins', 'ath-mental_2026-11-09', checkin, ['at']), 200);
  expect('mental check-in with a mismatched id', await createAs(mental, 'contractCheckins', 'ath-mental_2026-11-10', checkin, ['at']), 403);
  expect('mental check-in with checkedIn false', await createAs(mental, 'contractCheckins', 'ath-mental_2026-11-02', { ...checkin, weekStart: '2026-11-02', checkedIn: false }, ['at']), 403);
  expect('owner reads a check-in', (await call('GET', '/contractCheckins/ath-mental_2026-11-09', null, owner)).status, 200);
  expect('ops lists check-ins', await listAs(t.ops, 'contractCheckins', { weekStart: '2026-11-09' }), 200);
  expect('owner cannot write a check-in', await createAs(owner, 'contractCheckins', 'ath-mental_2026-11-16', { ...checkin, weekStart: '2026-11-16', by: staff.owner }, ['at']), 403);
  expect('parent cannot read check-ins', (await call('GET', '/contractCheckins/ath-mental_2026-11-09', null, t.parent)).status, 403);
  expect('coach cannot read check-ins', await listAs(t.coach, 'contractCheckins', {}), 403);
  expect('mental unchecks (delete)', (await call('DELETE', '/contractCheckins/ath-mental_2026-11-09', null, mental)).status, 200);

  // config/contract: owner writes; staff read; families do not.
  const cfg = (auth, fields) => call('PATCH', '/config/contract', { fields: fsFields(fields) }, auth).then((r) => r.status);
  expect('owner writes config/contract', await cfg(owner, { enabled: true, enabledAt: '2026-11-10' }), 200);
  expect('owner writes an off switch', await cfg(owner, { enabled: false, enabledAt: null }), 200);
  expect('ops cannot write config/contract', await cfg(t.ops, { enabled: true, enabledAt: '2026-11-10' }), 403);
  expect('owner cannot write an extra field', await cfg(owner, { enabled: true, enabledAt: '2026-11-10', note: 'x' }), 403);
  expect('mental reads config/contract', (await call('GET', '/config/contract', null, mental)).status, 200);
  expect('coach reads config/contract', (await call('GET', '/config/contract', null, t.coach)).status, 200);
  expect('parent cannot read config/contract', (await call('GET', '/config/contract', null, t.parent)).status, 403);

  // Parent logs for their own kid (spec 4.3): the transaction's read of a missing doc, the create, the delete; another household is refused.
  const log = { athleteId: 'ath-mental', date: '2026-11-09', minutes: 20, contractMinutes: 10, createdBy: uid.parent };
  expect('parent reads a missing own-household log (404, not 403)', (await call('GET', '/contractLogs/ath-mental_2026-11-09', null, t.parent)).status, 404);
  expect('parent logs for an own-household kid', await createAs(t.parent, 'contractLogs', 'ath-mental_2026-11-09', log), 200);
  expect('parent re-logs the same day (update)', await updateAs(t.parent, 'contractLogs', 'ath-mental_2026-11-09', { ...log, minutes: 35 }, undefined, ['createdAt']), 200);
  expect('another household parent cannot log for the kid', await createAs(t.other, 'contractLogs', 'ath-mental_2026-11-10', { ...log, date: '2026-11-10', createdBy: uid.other }), 403);
  expect('another household parent cannot read the missing log', (await call('GET', '/contractLogs/ath-mental_2026-11-10', null, t.other)).status, 403);
  expect('parent deletes the log', (await call('DELETE', '/contractLogs/ath-mental_2026-11-09', null, t.parent)).status, 200);

  // contractMinutes 10 (spec 4.3) and the household read for mental (spec 3).
  const tier = (auth, id, fields) => call('PATCH', `/athletes/${id}?${Object.keys(fields).map((k) => `updateMask.fieldPaths=${k}`).join('&')}`, { fields: fsFields(fields) }, auth).then((r) => r.status);
  expect('parent stamps 10 with contractStart', await tier(t.parent, 'ath-mental', { contractMinutes: 10, contractStart: '2026-11-03' }), 200);
  expect('parent cannot stamp 15', await tier(t.parent, 'ath-mental', { contractMinutes: 15 }), 403);
  expect('mental reads a household', (await call('GET', '/households/hh', null, mental)).status, 200);
  expect('mental lists households (the board\'s on-contract gate reads them all)', await listAs(mental, 'households', {}), 200);
  expect('coach still cannot read a household', (await call('GET', '/households/hh', null, t.coach)).status, 403);

  await del('config', 'contract');
  await del('athletes', 'ath-mental');
  for (const u of Object.values(staff)) await del('users', u);
}
```

In `runPass`, add `await taskMental();` after `await taskReissue();`.

- [ ] **Step 2: Run the probes to verify they fail**

Run (repo root): `npx firebase-tools emulators:exec --config firebase.mental.json --only firestore --project rypacad "node --env-file=scripts/emulator.mental.env scripts/verify-rules.mjs"`
Expected: the new section prints FAIL lines ("mental creates a session note -> 403 (wanted 200)", "parent logs for an own-household kid -> 403 (wanted 200)", "mental reads a household -> 403 (wanted 200)", "owner writes config/contract -> 403 (wanted 200)" ...) and the run ends "N FAILED" with exit 1. Every pre-existing section still passes.

- [ ] **Step 3: Write the rules**

In `firestore.rules`:

1. Line 274 (`athleteCreateShapeOk`): `(d.contractMinutes in [20, 45, 90, 95] || d.contractMinutes == null)` becomes `(d.contractMinutes in [10, 20, 45, 90, 95] || d.contractMinutes == null)`.
2. Line 300 (`contractMinutesUpdateOk`): `(after.contractMinutes in [20, 45, 90, 95] || after.contractMinutes == null)` becomes `(after.contractMinutes in [10, 20, 45, 90, 95] || after.contractMinutes == null)`.
3. After the diagnostics collection-group block (ends line 507), add:

```
    // Mental tools (spec 4.1, 2026-10-28): Yannick's per-athlete notes. Role
    // 'mental' only, every verb; the collection-group read lets the Athletes
    // list fetch every athlete's entries in one query. No other branch.
    match /mentalNotes/{athleteId}/entries/{entryId} {
      function noteKeys() {
        return ['athleteId', 'kind', 'sessionId', 'sessionDate', 'body', 'createdBy', 'updatedBy', 'createdAt', 'updatedAt'];
      }
      function noteShapeOk() {
        let d = request.resource.data;
        return d.keys().hasAll(noteKeys()) && d.keys().hasOnly(noteKeys())
          && d.athleteId == athleteId
          && d.kind in ['intake', 'session', 'free']
          && (d.sessionId is string || d.sessionId == null)
          && (d.sessionDate is string || d.sessionDate == null)
          && d.body is string && d.body.size() <= 8000
          && d.updatedBy == request.auth.uid
          && d.updatedAt == request.time;
      }
      allow read: if signedIn() && me().role == 'mental';
      allow create: if signedIn() && me().role == 'mental' && noteShapeOk()
        && request.resource.data.createdBy == request.auth.uid
        && request.resource.data.createdAt == request.time;
      allow update: if signedIn() && me().role == 'mental' && noteShapeOk()
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['body', 'sessionDate', 'updatedBy', 'updatedAt']);
      allow delete: if signedIn() && me().role == 'mental';
    }
    match /{path=**}/entries/{entryId} {
      allow read: if signedIn() && me().role == 'mental';
    }
```

4. In the `contractLogs` block, add a helper directly under `logShapeOk()` and three `allow` lines (keep every existing line as it is):

```
    // Parents log for their kids (owner, 2026-10-28; spec 4.3): the same household test the read rule uses.
    function logParentOwns(id) {
      return me().role == 'parent'
        && exists(/databases/$(database)/documents/athletes/$(id))
        && athleteData(id).householdId == me().householdId;
    }
    allow create, update: if signedIn()
      && logParentOwns(request.resource.data.athleteId)
      && logId == request.resource.data.athleteId + '_' + request.resource.data.date
      && logShapeOk();
    allow delete: if signedIn() && logParentOwns(logId.split('_')[0]);
```

   In `logNullReadOk()` (lines 1165-1168) append `|| logParentOwns(logId.split('_')[0])` to the return expression. Replace the stale comment at lines 1183-1184 (`// No delete: ...`) with `// Delete: the athlete's own login or a parent of the household (above).`

5. After the `contractLogs` block's closing brace, add:

```
    // Contract check-ins (spec 4.2): Yannick marks an athlete checked in for
    // a week; owners and ops read the board. Unchecking is a delete.
    match /contractCheckins/{checkinId} {
      function checkinShapeOk() {
        let d = request.resource.data;
        return d.keys().hasAll(['athleteId', 'weekStart', 'checkedIn', 'by', 'at'])
          && d.keys().hasOnly(['athleteId', 'weekStart', 'checkedIn', 'by', 'at'])
          && d.athleteId is string
          && d.weekStart is string && d.weekStart.matches('[0-9]{4}-[0-9]{2}-[0-9]{2}')
          && d.checkedIn == true
          && d.by == request.auth.uid
          && d.at == request.time
          && checkinId == d.athleteId + '_' + d.weekStart;
      }
      allow read: if signedIn() && me().role in ['mental', 'ops', 'owner'];
      allow create, update: if signedIn() && me().role == 'mental' && checkinShapeOk();
      allow delete: if signedIn() && me().role == 'mental';
    }

    // config/contract (spec 6): the server-readable mirror of
    // REACT_APP_CONTRACT_ENABLED. The owner writes it (scripts/set-contract-flag.mjs);
    // staff read it; the Monday job reads it with the Admin SDK.
    match /config/{docId} {
      allow read: if signedIn() && (me().role in ['coach', 'mental', 'ops', 'owner'] || me().get('specialistId', null) != null);
      allow write: if signedIn() && me().role == 'owner' && docId == 'contract'
        && request.resource.data.keys().hasOnly(['enabled', 'enabledAt'])
        && request.resource.data.enabled is bool
        && (request.resource.data.enabledAt is string || request.resource.data.enabledAt == null);
    }
```

6. Line 1215 (households read): `|| me().role in ['ops', 'owner']` becomes `|| me().role in ['mental', 'ops', 'owner']`, with the comment `// 'mental' (spec 3, 2026-10-28): guardian contact for follow-up; the UI shows name, email and phone only.` on the line above.

- [ ] **Step 4: Run the probes to verify they pass; check additivity**

Run: `npx firebase-tools emulators:exec --config firebase.mental.json --only firestore --project rypacad "node --env-file=scripts/emulator.mental.env scripts/verify-rules.mjs"`
Expected: every line PASS; the run ends "ALL PASS (both passes)". A green run says nothing about production index needs: the Firestore emulator does not enforce composite indexes, so it can never "ask" for one. Check the query shapes by inspection instead - every query `mentalLive.js` (Task 4) will issue is single-field equality or range (`weekStart ==`, `type ==`, `date >=` with `date <=` on the same field) or an unfiltered read (`collectionGroup('entries')`, `contractCheckins`, `households`, `athletes`), none of which needs a composite index. If a multi-field or filtered collection-group query is ever added, write its index into `firestore.indexes.json` directly in that task; nothing is added here.

Run: `git diff origin/main -- firestore.rules | grep -E '^-\s*allow'`
Expected: no output (no `allow` line removed; spec §7).

- [ ] **Step 5: Commit**

```bash
git add firestore.rules scripts/verify-rules.mjs firestore.indexes.json
git commit -m "feat(rules): mental notes, check-ins, config/contract, parent logs

mentalNotes and its collection group for role mental only;
contractCheckins id-pinned; config/contract owner-written; parents
create, update, delete and null-read their household's contract logs;
contractMinutes 10; households readable by mental. All additive,
probed in taskMental.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Seed fixtures, mentalLive.js and the mental hooks

**Files:**
- Modify: `frontend/src/portal/data/seed.js` (dobs on the Whitfield children; new `mentalFixtures(today)`)
- Create: `frontend/src/portal/hooks/mentalLive.js`
- Create: `frontend/src/portal/hooks/mental.js`
- Modify: `frontend/src/portal/hooks/index.js` (line 219 area: re-export the new hooks)
- Test: `frontend/src/portal/hooks/mental.test.js`
- Test: `frontend/src/portal/hooks/mentalLive.test.js`

**Interfaces:**
- Consumes: `./live` (`ERR`, `LiveDataError`, `isLive`, `requireUser`, `wrap`, `fetchAllAthletes`, `fetchAllHouseholds` (exists at live.js ~1917; provable for `mental` once Task 3 widens the households read), `fetchAthlete`, `fetchSessionsByIds`, `fetchBookings`, `fetchHousehold`, `fetchContractLogsSince`), `./invalidate` (`bump`, `useInvalidation`), `./useSeedResource`, `../data/contractRule`, `../data/contractBoard`, `../data/mentalNotes`, `../data/calendar` (`academyDateISO`), `../../firebase` (`auth`, `db`), `firebase/firestore`.
- Produces (`seed.js`): `HOUSEHOLD.children[*].dob` (`jordan '2012-06-17'`, `reese '2014-03-02'`, `nico '2017-09-09'`); `mentalFixtures(today): { athletes, bookings, sessions, entries, logsByAthlete, checkins, config, households }` where `athletes = [jordan (dob 2012-06-17), nico (dob 2017-09-09)]`, three mental sessions (`cal-seed-a` on `addDays(weekStart, -9)` 4:00 PM attended, `cal-seed-b` on `addDays(weekStart, -2)` 4:30 PM attended, `cal-seed-c` on `addDays(weekStart, 8)` 5:00 PM confirmed, all jordan), one intake note (`intake`, jordan), two session notes (`cal-seed-a`, `cal-seed-b`, jordan), two weeks of logs (this week and last: jordan 20/30/0/25/20 and 20/20/20/20/20; nico 10/10/5/0/0 and 10/10/10/10/10), two check-ins (`jordan` this week at Tuesday, `nico` last week at Wednesday), `config = { enabled: true, enabledAt: addDays(weekStart, -14) }`, `households = { whitfield: { name: 'Whitfield family', guardian: { name: 'Dana', email: 'dana@email.com', phone: null } } }`.
- Produces (`mentalLive.js`):
  - `MENTAL_NOTES_KEY = 'mentalNotes'`, `CHECKINS_KEY = 'contractCheckins'`
  - `fetchMentalEntries(athleteId): Promise<Entry[]>` (`Entry = { id, athleteId, kind, sessionId, sessionDate, body, createdAtMs, updatedAtMs }`)
  - `fetchAllMentalEntries(): Promise<Entry[]>` (`collectionGroup(db, 'entries')`, unfiltered)
  - `saveMentalEntry({ athleteId, entryId, kind, sessionId, sessionDate, body }): Promise<{ id, created: boolean }>` (transaction: `tx.get`; missing -> `tx.set` with `createdBy`, `createdAt`; present -> `tx.update({ body, sessionDate, updatedBy, updatedAt })`; then `bump('mentalNotes')`)
  - `deleteMentalEntry({ athleteId, entryId }): Promise<{ id }>` (+ bump)
  - `fetchCheckins({ weekStartISO }): Promise<Checkin[]>` (`where('weekStart', '==', weekStartISO)`)
  - `fetchCheckinsForAthletes(athleteIds): Promise<Checkin[]>` (whole collection, filtered client-side; `Checkin = { id, athleteId, weekStart, checkedIn, by, at }` with `at` left as the Timestamp)
  - `setCheckin({ athleteId, weekStartISO, checkedIn }): Promise<{ id, checkedIn }>` (true -> `setDoc` `{ athleteId, weekStart, checkedIn: true, by: uid, at: serverTimestamp() }`; false -> `deleteDoc`; `bump('contractCheckins')`)
  - `fetchContractLogsBetween({ athleteIds, fromISO, toISO }): Promise<{ [athleteId]: { [date]: minutes } }>` (`where('date', '>=', fromISO), where('date', '<=', toISO)` single-field range; filtered to `athleteIds` when given)
  - `fetchMentalBookings(athleteId): Promise<[{ id, sessionId, date, time, status, attendee }]>` (`fetchBookings(athleteId)` filtered to `type === 'mental'`, joined to `fetchSessionsByIds` for `time`; sorted by date desc)
  - `fetchAllMentalBookings(): Promise<Booking[]>` (`where('type', '==', 'mental')`)
  - `fetchHouseholdContact(householdId): Promise<{ familyName, guardianName, email, phone } | null>` (null on any error; only those four fields leave this function)
  - `fetchContractConfig(): Promise<{ enabled: boolean, enabledAt: string|null }>` (`{ enabled: false, enabledAt: null }` when the doc is missing)
- Produces (`mental.js`):
  - `useMentalAthletes(): { data: Row[]|null, loading, error }` (rows from `mentalAthleteRows`)
  - `useMentalAthlete(athleteId): { data: { athlete: { id, name, age, dob, householdId, required }, contact, sessions: [{ sessionId, date, time, status, attendee, hasNote }], notes: { intake, sessions, free }, contract: { thisWeek, lastCheckin, required } } | null, loading, error }`
  - `useMentalNote({ athleteId, entryId, sessionDate = null, athleteName = null }): { entry, athleteName, loading, error, save(body), remove(), saveState: 'idle'|'saving'|'saved'|'slow'|'error', savedAt: number|null }` with `SLOW_SAVE_MS = 8000`; `athleteName` is the argument when given, else resolved once per `athleteId` from `fetchAthlete(athleteId).name` (live) or the fixture athlete (seed), so a refresh or a deep link to a note still says whose note it is
  - `useContractBoard(weekStartISO): { rows: { due, thisWeek, checkedIn } | null, config, setCheckin({ athleteId, checkedIn }), loading, error }`; the live source reads `fetchAllHouseholds()` beside the athletes and hands `households` to `boardRows`, so the board applies the same on-contract gate as the Monday email (Review Focus 4)
  - every hook falls back to `mentalFixtures(academyDateISO())` when `!isLive()`; `setCheckin`/`save`/`remove` are local echoes in seed mode

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/portal/hooks/mentalLive.test.js`:

```js
jest.mock('../../firebase', () => ({ auth: { currentUser: { uid: 'mental' } }, db: {} }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => 'col'), collectionGroup: jest.fn(() => 'group'), doc: jest.fn((db, ...p) => ({ path: p.join('/') })),
  getDoc: jest.fn(), getDocs: jest.fn(), query: jest.fn((...a) => a), where: jest.fn((...a) => a), setDoc: jest.fn(), deleteDoc: jest.fn(),
  runTransaction: jest.fn(), serverTimestamp: jest.fn(() => 'NOW'),
}));
import { collectionGroup, deleteDoc, getDoc, getDocs, runTransaction, setDoc, where } from 'firebase/firestore';
import { ERR } from './live';
import {
  fetchAllMentalEntries, fetchContractConfig, fetchContractLogsBetween, fetchHouseholdContact, saveMentalEntry, setCheckin,
} from './mentalLive';

const snap = (docs) => ({ docs: docs.map(([id, data]) => ({ id, data: () => data })) });
const ts = (ms) => ({ toMillis: () => ms });

beforeEach(() => jest.clearAllMocks());

test('fetchAllMentalEntries is one unfiltered collection-group read with plain ms timestamps', async () => {
  getDocs.mockResolvedValue(snap([['intake', { athleteId: 'jordan', kind: 'intake', sessionId: null, sessionDate: null, body: 'i', createdAt: ts(1), updatedAt: ts(2) }]]));
  const rows = await fetchAllMentalEntries();
  expect(collectionGroup).toHaveBeenCalledWith({}, 'entries');
  expect(where).not.toHaveBeenCalled();
  expect(rows).toEqual([{ id: 'intake', athleteId: 'jordan', kind: 'intake', sessionId: null, sessionDate: null, body: 'i', createdAtMs: 1, updatedAtMs: 2 }]);
});

test('saveMentalEntry creates with createdBy/createdAt once, then updates body, sessionDate, updatedBy, updatedAt only', async () => {
  const tx = { get: jest.fn(), set: jest.fn(), update: jest.fn() };
  runTransaction.mockImplementation((db, fn) => fn(tx));
  tx.get.mockResolvedValueOnce({ exists: () => false });
  const created = await saveMentalEntry({ athleteId: 'jordan', entryId: 'cal-a', kind: 'session', sessionId: 'cal-a', sessionDate: '2026-11-10', body: 'First.' });
  expect(created).toEqual({ id: 'cal-a', created: true });
  expect(tx.set).toHaveBeenCalledWith({ path: 'mentalNotes/jordan/entries/cal-a' }, {
    athleteId: 'jordan', kind: 'session', sessionId: 'cal-a', sessionDate: '2026-11-10', body: 'First.', createdBy: 'mental', updatedBy: 'mental', createdAt: 'NOW', updatedAt: 'NOW',
  });
  tx.get.mockResolvedValueOnce({ exists: () => true });
  const edited = await saveMentalEntry({ athleteId: 'jordan', entryId: 'cal-a', kind: 'session', sessionId: 'cal-a', sessionDate: '2026-11-10', body: 'Second.' });
  expect(edited).toEqual({ id: 'cal-a', created: false });
  expect(tx.update).toHaveBeenCalledWith({ path: 'mentalNotes/jordan/entries/cal-a' }, { body: 'Second.', sessionDate: '2026-11-10', updatedBy: 'mental', updatedAt: 'NOW' });
});

test('saveMentalEntry refuses a body over 8000 characters before any write', async () => {
  await expect(saveMentalEntry({ athleteId: 'jordan', entryId: 'intake', kind: 'intake', sessionId: null, sessionDate: null, body: 'x'.repeat(8001) })).rejects.toMatchObject({ code: ERR.INVALID });
  expect(runTransaction).not.toHaveBeenCalled();
});

test('setCheckin true writes the pinned doc; false deletes it', async () => {
  await setCheckin({ athleteId: 'jordan', weekStartISO: '2026-11-09', checkedIn: true });
  expect(setDoc).toHaveBeenCalledWith({ path: 'contractCheckins/jordan_2026-11-09' }, { athleteId: 'jordan', weekStart: '2026-11-09', checkedIn: true, by: 'mental', at: 'NOW' });
  await setCheckin({ athleteId: 'jordan', weekStartISO: '2026-11-09', checkedIn: false });
  expect(deleteDoc).toHaveBeenCalledWith({ path: 'contractCheckins/jordan_2026-11-09' });
});

test('fetchContractLogsBetween is a date range only and groups minutes by athlete and date', async () => {
  getDocs.mockResolvedValue(snap([
    ['jordan_2026-11-09', { athleteId: 'jordan', date: '2026-11-09', minutes: 20 }],
    ['nico_2026-11-09', { athleteId: 'nico', date: '2026-11-09', minutes: 10 }],
    ['sage_2026-11-09', { athleteId: 'sage', date: '2026-11-09', minutes: 20 }],
  ]));
  const out = await fetchContractLogsBetween({ athleteIds: ['jordan', 'nico'], fromISO: '2026-11-02', toISO: '2026-11-15' });
  expect(where).toHaveBeenCalledWith('date', '>=', '2026-11-02');
  expect(where).toHaveBeenCalledWith('date', '<=', '2026-11-15');
  expect(where).not.toHaveBeenCalledWith('athleteId', expect.anything(), expect.anything());
  expect(out).toEqual({ jordan: { '2026-11-09': 20 }, nico: { '2026-11-09': 10 } });
});

test('fetchHouseholdContact returns four fields and nothing else; null when refused', async () => {
  getDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ name: 'Whitfield family', guardian: { name: 'Dana', email: 'dana@email.com', phone: '612-555-0100' }, stripeCustomerId: 'cus_1', membership: { status: 'active' } }) });
  expect(await fetchHouseholdContact('whitfield')).toEqual({ familyName: 'Whitfield family', guardianName: 'Dana', email: 'dana@email.com', phone: '612-555-0100' });
  getDoc.mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'permission-denied' }));
  expect(await fetchHouseholdContact('other')).toBeNull();
});

test('fetchContractConfig: missing doc is off', async () => {
  getDoc.mockResolvedValueOnce({ exists: () => false });
  expect(await fetchContractConfig()).toEqual({ enabled: false, enabledAt: null });
  getDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ enabled: true, enabledAt: '2026-11-10' }) });
  expect(await fetchContractConfig()).toEqual({ enabled: true, enabledAt: '2026-11-10' });
});
```

Create `frontend/src/portal/hooks/mental.test.js` (the Probe/mountHook idiom from `index.contract.test.js`):

```js
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

jest.mock('../../firebase', () => ({ auth: { currentUser: null }, db: {} }));
jest.mock('firebase/firestore', () => ({}));
jest.mock('./live', () => ({ ...jest.requireActual('./live'), isLive: () => false }));
jest.mock('../data/calendar', () => ({ ...jest.requireActual('../data/calendar'), academyDateISO: () => '2026-11-11' }));
import { useContractBoard, useMentalAthlete, useMentalAthletes, useMentalNote } from './mental';

function mountHook(useHook) {
  const out = { current: null };
  function Probe() { out.current = useHook(); return null; }
  const div = document.createElement('div');
  const root = createRoot(div);
  return { out, render: async () => { await act(async () => { root.render(<Probe />); }); }, unmount: () => act(() => root.unmount()) };
}
const settle = async (h) => { await h.render(); await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

test('seed mode: the Athletes list shows Jordan and Nico with the fixture facts', async () => {
  const h = mountHook(() => useMentalAthletes());
  await settle(h);
  expect(h.out.current.loading).toBe(false);
  expect(h.out.current.data.map((r) => [r.athleteId, r.age, r.hasIntake, r.nextSession != null, r.lastSession != null])).toEqual([
    ['jordan', 14, true, true, true], ['nico', 9, false, false, false],
  ]);
  h.unmount();
});

test('seed mode: the athlete page has the intake, two session notes, three sessions, the contact and the contract summary', async () => {
  const h = mountHook(() => useMentalAthlete('jordan'));
  await settle(h);
  const d = h.out.current.data;
  expect(d.athlete).toMatchObject({ id: 'jordan', age: 14, required: 20 });
  expect(d.contact).toEqual({ familyName: 'Whitfield family', guardianName: 'Dana', email: 'dana@email.com', phone: null });
  expect(d.sessions.map((s) => s.hasNote)).toEqual([false, true, true]);
  expect(d.notes.intake.id).toBe('intake');
  expect(d.notes.sessions).toHaveLength(2);
  expect(d.contract).toMatchObject({ required: 20 });
  expect(d.contract.thisWeek.metDays).toBe(4);
  expect(d.contract.lastCheckin).toBe('2026-11-10');
  h.unmount();
});

test('seed mode: useMentalNote saves locally and reports saved with a time', async () => {
  const h = mountHook(() => useMentalNote({ athleteId: 'nico', entryId: 'intake' }));
  await settle(h);
  expect(h.out.current.entry).toBeNull();
  expect(h.out.current.saveState).toBe('idle');
  await act(async () => { await h.out.current.save('First intake line.'); });
  expect(h.out.current.saveState).toBe('saved');
  expect(typeof h.out.current.savedAt).toBe('number');
  expect(h.out.current.entry.body).toBe('First intake line.');
  await act(async () => { await h.out.current.remove(); });
  expect(h.out.current.entry).toBeNull();
  h.unmount();
});

test('seed mode: the board groups the fixtures and a local check-in moves the row', async () => {
  const h = mountHook(() => useContractBoard('2026-11-09'));
  await settle(h);
  expect(h.out.current.config).toEqual({ enabled: true, enabledAt: '2026-10-26' });
  expect(h.out.current.rows.checkedIn.map((r) => r.athleteId)).toEqual(['jordan']);
  expect(h.out.current.rows.thisWeek.map((r) => r.athleteId)).toEqual(['nico']);
  await act(async () => { await h.out.current.setCheckin({ athleteId: 'nico', checkedIn: true }); });
  expect(h.out.current.rows.checkedIn.map((r) => r.athleteId)).toEqual(['jordan', 'nico']);
  h.unmount();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/hooks/mentalLive.test.js src/portal/hooks/mental.test.js`
Expected: FAIL - "Cannot find module './mentalLive'" and "Cannot find module './mental'".

- [ ] **Step 3: Write the implementation**

In `frontend/src/portal/data/seed.js`: add `dob: '2012-06-17'` to jordan, `dob: '2014-03-02'` to reese and `dob: '2017-09-09'` to nico in `HOUSEHOLD.children` (the dobs already named in the comments), then append:

```js
/* ---------------------------------------------------------------- mental -- */

/**
 * Yannick's screens in seed mode (spec 5): two athletes, three mental
 * sessions, one intake and two session notes, two weeks of logs and
 * check-ins. Dates are relative to `today` so the board always has a
 * current week. Pure data; the hooks in hooks/mental.js read it when
 * isLive() is false.
 */
export function mentalFixtures(today) {
  const week = weekStartFor(today);
  const day = (n) => addContractDays(week, n);
  const athletes = [
    { id: 'jordan', name: 'Jordan Whitfield', dob: '2012-06-17', householdId: 'whitfield' },
    { id: 'nico', name: 'Nico Whitfield', dob: '2017-09-09', householdId: 'whitfield' },
  ];
  const sessions = [
    { id: 'cal-seed-a', date: day(-9), time: '4:00 PM', type: 'mental', status: 'scheduled', durationMinutes: 30 },
    { id: 'cal-seed-b', date: day(-2), time: '4:30 PM', type: 'mental', status: 'scheduled', durationMinutes: 30 },
    { id: 'cal-seed-c', date: day(8), time: '5:00 PM', type: 'mental', status: 'scheduled', durationMinutes: 30 },
  ];
  const bookings = sessions.map((s, i) => ({
    id: `jordan_${s.id}`, athleteId: 'jordan', sessionId: s.id, date: s.date, type: 'mental', status: i < 2 ? 'attended' : 'confirmed', attendee: 'athlete',
  }));
  const at = (iso) => Date.UTC(...iso.split('-').map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))), 22);
  const entries = [
    { id: 'intake', athleteId: 'jordan', kind: 'intake', sessionId: null, sessionDate: null, body: 'Intake: wants to stop replaying bad holes. Sleeps fine. Pre-shot routine exists but is skipped under pressure.', createdAtMs: at(day(-9)), updatedAtMs: at(day(-9)) },
    { id: 'cal-seed-a', athleteId: 'jordan', kind: 'session', sessionId: 'cal-seed-a', sessionDate: day(-9), body: 'Session 1: breathing count before each shot. Homework: three holes with the routine on every shot.', createdAtMs: at(day(-9)), updatedAtMs: at(day(-9)) },
    { id: 'cal-seed-b', athleteId: 'jordan', kind: 'session', sessionId: 'cal-seed-b', sessionDate: day(-2), body: 'Session 2: kept the routine on 14 of 18. Next: the first tee.', createdAtMs: at(day(-2)), updatedAtMs: at(day(-2)) },
  ];
  const logsByAthlete = {
    jordan: { [day(0)]: 20, [day(1)]: 30, [day(3)]: 25, [day(4)]: 20, [day(-7)]: 20, [day(-6)]: 20, [day(-5)]: 20, [day(-4)]: 20, [day(-3)]: 20 },
    nico: { [day(0)]: 10, [day(1)]: 10, [day(2)]: 5, [day(-7)]: 10, [day(-6)]: 10, [day(-5)]: 10, [day(-4)]: 10, [day(-3)]: 10 },
  };
  const checkins = [
    { id: `jordan_${week}`, athleteId: 'jordan', weekStart: week, checkedIn: true, by: 'mental', at: day(1) },
    { id: `nico_${day(-7)}`, athleteId: 'nico', weekStart: day(-7), checkedIn: true, by: 'mental', at: day(-5) },
  ];
  return {
    athletes, sessions, bookings, entries, logsByAthlete, checkins,
    config: { enabled: true, enabledAt: day(-14) },
    households: { whitfield: { name: 'Whitfield family', guardian: { name: 'Dana', email: 'dana@email.com', phone: null } } },
  };
}
```

with `import { addDays as addContractDays, weekStartFor } from './contractRule';` at the top of `seed.js`.

Create `frontend/src/portal/hooks/mentalLive.js` (Firestore access only; imports from `./live`, never the reverse):

```js
/**
 * Firestore reads and writes for Yannick's tools (spec 4.1, 4.2, 6).
 * Imports shared primitives FROM ./live, never the other way (the
 * scholarships.js precedent). Every list read here is provable for role
 * 'mental' without an index: the notes group query is unfiltered, the
 * check-ins and bookings reads are single-field equality, the logs read
 * is a single-field date range.
 */
import { collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { ERR, LiveDataError, fetchBookings, fetchSessionsByIds, requireUser, wrap } from './live';
import { bump } from './invalidate';
import { NOTE_MAX } from '../data/mentalNotes';

export const MENTAL_NOTES_KEY = 'mentalNotes';
export const CHECKINS_KEY = 'contractCheckins';

const ms = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : null);
const entryRow = (d) => {
  const { createdAt, updatedAt, ...rest } = d.data();
  return { id: d.id, ...rest, createdAtMs: ms(createdAt), updatedAtMs: ms(updatedAt) };
};
const noteRef = (athleteId, entryId) => doc(db, 'mentalNotes', athleteId, 'entries', entryId);

export async function fetchMentalEntries(athleteId) {
  if (!athleteId) throw new LiveDataError(ERR.INVALID, 'fetchMentalEntries: athleteId is required.');
  try {
    const snap = await getDocs(collection(db, 'mentalNotes', athleteId, 'entries'));
    return snap.docs.map(entryRow);
  } catch (err) { throw wrap(err, 'fetchMentalEntries'); }
}

export async function fetchAllMentalEntries() {
  try {
    const snap = await getDocs(collectionGroup(db, 'entries'));
    return snap.docs.map(entryRow);
  } catch (err) { throw wrap(err, 'fetchAllMentalEntries'); }
}

export async function saveMentalEntry({ athleteId, entryId, kind, sessionId = null, sessionDate = null, body }) {
  if (!athleteId || !entryId) throw new LiveDataError(ERR.INVALID, 'saveMentalEntry: athleteId and entryId are required.');
  if (typeof body !== 'string' || body.length > NOTE_MAX) throw new LiveDataError(ERR.INVALID, `saveMentalEntry: body must be a string of at most ${NOTE_MAX} characters.`);
  const user = requireUser();
  const ref = noteRef(athleteId, entryId);
  try {
    const created = await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists()) {
        tx.update(ref, { body, sessionDate, updatedBy: user.uid, updatedAt: serverTimestamp() });
        return false;
      }
      tx.set(ref, { athleteId, kind, sessionId, sessionDate, body, createdBy: user.uid, updatedBy: user.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      return true;
    });
    bump(MENTAL_NOTES_KEY);
    return { id: entryId, created };
  } catch (err) { throw wrap(err, 'saveMentalEntry'); }
}

export async function deleteMentalEntry({ athleteId, entryId }) {
  requireUser();
  try {
    await deleteDoc(noteRef(athleteId, entryId));
    bump(MENTAL_NOTES_KEY);
    return { id: entryId };
  } catch (err) { throw wrap(err, 'deleteMentalEntry'); }
}

const checkinRow = (d) => ({ id: d.id, ...d.data() });

export async function fetchCheckins({ weekStartISO }) {
  try {
    const snap = await getDocs(query(collection(db, 'contractCheckins'), where('weekStart', '==', weekStartISO)));
    return snap.docs.map(checkinRow);
  } catch (err) { throw wrap(err, 'fetchCheckins'); }
}

export async function fetchCheckinsForAthletes(athleteIds) {
  try {
    const snap = await getDocs(collection(db, 'contractCheckins'));
    const ids = athleteIds ? new Set(athleteIds) : null;
    return snap.docs.map(checkinRow).filter((c) => !ids || ids.has(c.athleteId));
  } catch (err) { throw wrap(err, 'fetchCheckinsForAthletes'); }
}

export async function setCheckin({ athleteId, weekStartISO, checkedIn }) {
  const user = requireUser();
  const ref = doc(db, 'contractCheckins', `${athleteId}_${weekStartISO}`);
  try {
    if (checkedIn) await setDoc(ref, { athleteId, weekStart: weekStartISO, checkedIn: true, by: user.uid, at: serverTimestamp() });
    else await deleteDoc(ref);
    bump(CHECKINS_KEY);
    return { id: `${athleteId}_${weekStartISO}`, checkedIn: Boolean(checkedIn) };
  } catch (err) { throw wrap(err, 'setCheckin'); }
}

export async function fetchContractLogsBetween({ athleteIds = null, fromISO, toISO }) {
  try {
    const snap = await getDocs(query(collection(db, 'contractLogs'), where('date', '>=', fromISO), where('date', '<=', toISO)));
    const ids = athleteIds ? new Set(athleteIds) : null;
    const out = {};
    for (const d of snap.docs) {
      const { athleteId, date, minutes } = d.data();
      if (ids && !ids.has(athleteId)) continue;
      (out[athleteId] = out[athleteId] || {})[date] = minutes || 0;
    }
    return out;
  } catch (err) { throw wrap(err, 'fetchContractLogsBetween'); }
}

export async function fetchMentalBookings(athleteId) {
  const bookings = (await fetchBookings(athleteId)).filter((b) => b.type === 'mental');
  const sessions = await fetchSessionsByIds(bookings.map((b) => b.sessionId));
  const byId = new Map(sessions.map((s) => [s.id, s]));
  return bookings
    .map((b) => ({ id: b.id, sessionId: b.sessionId, date: b.date, time: byId.get(b.sessionId)?.time ?? null, status: b.status, attendee: b.attendee ?? 'athlete' }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export async function fetchAllMentalBookings() {
  try {
    const snap = await getDocs(query(collection(db, 'bookings'), where('type', '==', 'mental')));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) { throw wrap(err, 'fetchAllMentalBookings'); }
}

/** Guardian contact only (spec 3): nothing else from the household doc leaves this function. */
export async function fetchHouseholdContact(householdId) {
  if (!householdId) return null;
  try {
    const snap = await getDoc(doc(db, 'households', householdId));
    if (!snap.exists()) return null;
    const h = snap.data();
    return { familyName: h.name ?? null, guardianName: h.guardian?.name ?? null, email: h.guardian?.email ?? null, phone: h.guardian?.phone ?? null };
  } catch (err) { return null; }
}

export async function fetchContractConfig() {
  try {
    const snap = await getDoc(doc(db, 'config', 'contract'));
    if (!snap.exists()) return { enabled: false, enabledAt: null };
    const c = snap.data();
    return { enabled: c.enabled === true, enabledAt: typeof c.enabledAt === 'string' ? c.enabledAt : null };
  } catch (err) { throw wrap(err, 'fetchContractConfig'); }
}
```

Create `frontend/src/portal/hooks/mental.js`. Shape (bodies follow the signatures and the tests):

- `useMentalAthletes()`: `live = isLive()`; `today = academyDateISO()`; gens `useInvalidation('mentalNotes')`, `useInvalidation('bookings')`; seed value `mentalAthleteRows({ ...mentalFixtures(today), today })`; live source `Promise.all([fetchAllAthletes(), fetchAllMentalBookings(), fetchAllMentalEntries()]).then(([athletes, bookings, entries]) => mentalAthleteRows({ athletes, bookings, entries, today }))`, deps `['mental-athletes', today, notesGen, bookingsGen]`.
- `useMentalAthlete(athleteId)`: gens `mentalNotes`, `contractLogs`, `contractCheckins`; seed from the fixtures (athlete by id, contact from `households[athlete.householdId]`, sessions from `bookings` for the athlete joined to `sessions` for `time`, `hasNote = entries.some((e) => e.id === sessionId)`, notes `groupEntries`, contract `{ thisWeek: weekSummary({ logsByDate: logsByAthlete[id], weekStartISO: weekStartFor(today), required: (d) => contractMinutesFor(athlete, d) }), lastCheckin: lastCheckinFor(id, checkins), required: contractMinutesFor(athlete, today) }`); live source `Promise.all([fetchAthlete(athleteId), fetchMentalBookings(athleteId), fetchMentalEntries(athleteId), fetchContractLogsBetween({ athleteIds: [athleteId], fromISO: weekStartFor(today), toISO: addDays(weekStartFor(today), 6) }), fetchCheckinsForAthletes([athleteId])])` then `fetchHouseholdContact(athlete.householdId)`; the same shape. `athlete` in the payload is `{ id, name, age: ageOn(dob, today), dob, householdId, required }`.
- `useMentalNote({ athleteId, entryId, sessionDate = null, athleteName = null })`: `useState` for `entry`, `saveState`, `savedAt`, `name` (initial `athleteName`); a `useEffect` on `[athleteId, entryId]` that in live mode runs `fetchMentalEntries(athleteId)` once and picks `entryId` (no invalidation subscription: Review Focus 5), in seed mode picks from `mentalFixtures(today).entries`; a second `useEffect` on `[athleteId]` that, only when `name` is null, resolves it from `fetchAthlete(athleteId)` (live; errors leave it null) or the fixture athlete (seed) - the deep-link fallback; the hook returns `athleteName: name`; `save(body)`: sets `saving`, starts a `setTimeout(SLOW_SAVE_MS)` that flips to `slow` if still saving, awaits `saveMentalEntry({ athleteId, entryId, kind: kindOf(entryId), sessionId: kindOf(entryId) === 'session' ? entryId : null, sessionDate, body })` (seed: resolves immediately), then sets `entry` to the merged row, `saveState 'saved'`, `savedAt Date.now()`; on error `'error'` and rethrows nothing (the editor reads `saveState`); `remove()`: `deleteMentalEntry` (seed: local), `entry = null`, `saveState 'idle'`. Export `SLOW_SAVE_MS = 8000`.
- `useContractBoard(weekStartISO)`: gens `contractLogs`, `contractCheckins`, `athletes`; `today = academyDateISO()`; seed value `{ rows: boardRows({ ...f, today, enabledAt: f.config.enabledAt, weekStartISO }), config: f.config }` (the spread carries the fixture `households` map) with a local `useState` copy of `checkins` so `setCheckin` re-groups; live source `Promise.all([fetchAllAthletes(), fetchAllHouseholds(), fetchContractLogsBetween({ fromISO: addDays(weekStartISO, -7), toISO: addDays(weekStartISO, 6) }), fetchCheckinsForAthletes(null), fetchContractConfig()])` -> `{ rows: boardRows({ athletes, households, logsByAthlete, checkins, today, enabledAt: config.enabledAt, weekStartISO }), config }` (`households` is the array `fetchAllHouseholds` returns; `boardRows` maps it by id), deps `['contract-board', weekStartISO, today, logsGen, checkinsGen, athletesGen]`; `setCheckin({ athleteId, checkedIn })` -> live `setCheckin({ athleteId, weekStartISO, checkedIn })` from `mentalLive.js` (its `bump('contractCheckins')` re-runs the source), seed updates the local list. Returns `{ rows: state.data?.rows ?? null, config: state.data?.config ?? null, setCheckin, loading, error }`.

In `frontend/src/portal/hooks/index.js`, after line 219 (`export { coachingFor, ... };`), add:

```js
// 2026-10-28: Yannick's tools (hooks/mental.js, hooks/mentalLive.js); role
// 'mental' screens only - the notes reads are refused for every other role.
export { useContractBoard, useMentalAthlete, useMentalAthletes, useMentalNote } from './mental';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/hooks/mentalLive.test.js src/portal/hooks/mental.test.js src/portal/data`
Expected: PASS (7 + 4 new tests; every existing `data/` test still passes with the dobs added to the seed children).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/portal/data/seed.js frontend/src/portal/hooks/mentalLive.js frontend/src/portal/hooks/mental.js frontend/src/portal/hooks/index.js frontend/src/portal/hooks/mentalLive.test.js frontend/src/portal/hooks/mental.test.js
git commit -m "feat(mental): seed fixtures, Firestore access and hooks

mentalLive.js reads and writes notes, check-ins, logs between dates,
mental bookings, guardian contact and config/contract; mental.js hooks
with seed fixtures for two athletes, three sessions and two weeks.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Tabs, routes and the Athletes screen

**Files:**
- Modify: `frontend/src/portal/components/BottomTabBar.js` (lines 101-104)
- Modify: `frontend/src/portal/PortalRoutes.js` (loaders near line 57-79; `CURRENT_ROUTE_CHUNKS` near 90-110; routes near 750-760)
- Create: `frontend/src/portal/screens/MentalAthletes.js`
- Test: `frontend/src/portal/components/BottomTabBar.test.js` (one added test)
- Test: `frontend/src/portal/screens/MentalAthletes.test.js`
- Test: `frontend/src/portal/PortalRoutes.mental.test.js`

**Interfaces:**
- Consumes: `useMentalAthletes` from `../hooks`; `RequireRole`, `useAuthSession`, `isLive` as `PortalRoutes.js` already does; `PhoneFrame`, `BottomTabBar`, `Primitives` (`SectionLabel`, `ScreenTitle`, `SignOutButton`, `Body`, `ErrorNotice`), `AthleteRow`, `Field`, `SkeletonCard`.
- Produces:
  - `TABS.mental = [sessions, { key: 'athletes', label: 'Athletes', icon: 'people', route: '/portal/mental' }, { key: 'mental-contract', label: 'Contract', icon: 'target', route: '/portal/mental/contract' }, tour]`
  - routes (relative, under `/portal`): `mental` (roles `['mental']`, `MentalAthletesRoute`), `mental/contract` (roles `['mental', 'ops', 'owner']`, `MentalContractRoute`, Task 7), `mental/:athleteId` (`['mental']`, `MentalAthleteRoute`, Task 6), `mental/:athleteId/notes/:entryId` (`['mental']`, `MentalNoteRoute`, Task 6); Task 5 declares all four, the three later screens' routes rendering `{null}` inside `RequireRole` until Task 6 and Task 7 replace them
  - `CURRENT_ROUTE_CHUNKS.mental = [loadMentalAthletes, loadMentalAthlete, loadMentalNote, loadMentalContract]` (one segment, four screens)
  - `export default function MentalAthletes({ bare = false, onOpenAthlete, onSignOut })` - header "Athletes" over the section label "Mental game", a search `Field` (aria-label "Search athletes", filters by name, case-insensitive), one `Card large` of `AthleteRow`s, each wrapped in `<div role="button" tabIndex={0} aria-label={row.name} onClick={() => onOpenAthlete(row.athleteId)} onKeyDown={enter/space -> the same}>` (`AthleteRow` is a plain `div` with no role or accessible name and its text runs name, meta and trailing together, and `testRender.button` only finds `button`, `[role=button]` or `[role=switch]` whose trimmed text or `aria-label` equals the label - the wrapper is what lets `r.click('Jordan Whitfield')` and a screen reader reach the row; `AthleteRow` itself gets no `onClick`); `meta` per row: `Age 14 · Next 1:1 Nov 17` / `Age 14 · Last 1:1 Nov 10` / `Age 9 · No 1:1 yet`; `trailing` is `Intake` (green `Body`) when `hasIntake`, else `No intake` (tertiary); a note date line `Note Nov 3` below the name when `latestNoteDate`; empty search result `No athlete matches "<q>"`; footer `<BottomTabBar role="mental" active="athletes" />`

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/portal/components/BottomTabBar.test.js`:

```js
test('mental: Sessions, Athletes, Contract (key mental-contract) and Tour, with the contract switch off', async () => {
  delete process.env.REACT_APP_CONTRACT_ENABLED;
  const r = await renderScreen(<BottomTabBar role="mental" active="athletes" />, { path: '/portal/mental' });
  expect(['Sessions', 'Athletes', 'Contract', 'Tour'].every((l) => r.text().includes(l))).toBe(true);
  expect(TABS.mental.map((t) => t.key)).toEqual(['sessions', 'athletes', 'mental-contract', 'tour']);
  expect(TABS.mental.find((t) => t.key === 'mental-contract').route).toBe('/portal/mental/contract');
  r.unmount();
});
```

(import `TABS` beside the default import if the file does not already.)

Create `frontend/src/portal/screens/MentalAthletes.test.js`:

```js
import React from 'react';
import { renderScreen } from './testRender';

let mockRows;
jest.mock('../hooks', () => ({
  useMentalAthletes: () => ({ data: mockRows, loading: false, error: null }),
  useSelfManaged: () => false,
}));
import MentalAthletes from './MentalAthletes';

beforeEach(() => {
  mockRows = [
    { athleteId: 'jordan', name: 'Jordan Whitfield', age: 14, nextSession: '2026-11-17', lastSession: '2026-11-10', hasIntake: true, latestNoteDate: '2026-11-03' },
    { athleteId: 'nico', name: 'Nico Whitfield', age: 9, nextSession: null, lastSession: null, hasIntake: false, latestNoteDate: null },
    { athleteId: 'sage', name: 'Sage Parker', age: null, nextSession: null, lastSession: '2026-11-05', hasIntake: false, latestNoteDate: null },
  ];
});

test('every athlete, with age, next or last 1:1, intake and latest note', async () => {
  const onOpenAthlete = jest.fn();
  const r = await renderScreen(<MentalAthletes bare onOpenAthlete={onOpenAthlete} />, { path: '/portal/mental' });
  expect(r.text()).toContain('Age 14 · Next 1:1 Nov 17');
  expect(r.text()).toContain('Age 9 · No 1:1 yet');
  expect(r.text()).toContain('Last 1:1 Nov 5');
  expect(r.text()).toContain('Note Nov 3');
  expect(r.text()).toContain('No intake');
  await r.click('Jordan Whitfield');
  expect(onOpenAthlete).toHaveBeenCalledWith('jordan');
  r.unmount();
});

test('search filters by name', async () => {
  const r = await renderScreen(<MentalAthletes bare />, { path: '/portal/mental' });
  await r.fill('Search athletes', 'sage');
  await r.flush();
  expect(r.text()).toContain('Sage Parker');
  expect(r.text()).not.toContain('Jordan Whitfield');
  await r.fill('Search athletes', 'zz');
  await r.flush();
  expect(r.text()).toContain('No athlete matches "zz"');
  r.unmount();
});
```

Create `frontend/src/portal/PortalRoutes.mental.test.js` (seed mode: `RequireRole` is unguarded; this pins the paths and the tab routing):

```js
import React from 'react';
import { renderScreen } from './screens/testRender';
import PortalRoutes from './PortalRoutes';

test('/portal/mental renders the Athletes screen and its tab bar reaches the board', async () => {
  const r = await renderScreen(<PortalRoutes />, { path: '/portal/mental' });
  await r.flush();
  expect(r.text()).toContain('Athletes');
  expect(r.text()).toContain('Jordan Whitfield');
  await r.click('Contract');
  await r.flush();
  expect(r.location().pathname).toBe('/portal/mental/contract');
  r.unmount();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/components/BottomTabBar.test.js src/portal/screens/MentalAthletes.test.js src/portal/PortalRoutes.mental.test.js`
Expected: FAIL - the tab test's `toEqual(['sessions', 'athletes', 'mental-contract', 'tour'])` receives `['sessions', 'tour']`; "Cannot find module './MentalAthletes'"; the routes test's location stays `/portal` (catch-all).

- [ ] **Step 3: Write the implementation**

`BottomTabBar.js` lines 101-104 become:

```js
  mental: [
    { key: 'sessions', label: 'Sessions', icon: 'today', route: '/portal/my-sessions' },
    // 2026-10-28 (spec 5): Yannick's athletes and his contract board. The
    // board's key is NOT 'contract' - that key is hidden while the family
    // switch is off, and the board is not behind it.
    { key: 'athletes', label: 'Athletes', icon: 'people', route: '/portal/mental' },
    { key: 'mental-contract', label: 'Contract', icon: 'target', route: '/portal/mental/contract' },
    { key: 'tour', label: 'Tour', icon: 'trophy', route: '/portal/tour' },
  ],
```

`PortalRoutes.js`:
- Loaders beside `loadSpecialistDay`: `const loadMentalAthletes = () => import('./screens/MentalAthletes');`, `loadMentalAthlete`, `loadMentalNote`, `loadMentalContract` with the matching `lazy(...)` constants.
- `CURRENT_ROUTE_CHUNKS`: add `mental: [loadMentalAthletes, loadMentalAthlete, loadMentalNote, loadMentalContract]`.
- Route wrapper beside `SpecialistDayRoute`:

```jsx
function MentalAthletesRoute({ onSignOut }) {
  const navigate = useNavigate();
  return <MentalAthletes bare onSignOut={onSignOut} onOpenAthlete={(id) => navigate(`/portal/mental/${id}`)} />;
}
```

- Routes, directly after the `my-sessions` route (the static `mental/contract` is declared before `mental/:athleteId`):

```jsx
<Route path="mental" element={<RequireRole roles={['mental']}><MentalAthletesRoute onSignOut={onSignOut} /></RequireRole>} />
<Route path="mental/contract" element={<RequireRole roles={['mental', 'ops', 'owner']}>{null}</RequireRole>} />
<Route path="mental/:athleteId/notes/:entryId" element={<RequireRole roles={['mental']}>{null}</RequireRole>} />
<Route path="mental/:athleteId" element={<RequireRole roles={['mental']}>{null}</RequireRole>} />
```

(The three `{null}` placeholders render nothing and keep the location, so the routes test's Contract click lands on `/portal/mental/contract`; Tasks 6 and 7 replace them with the screens.)

Create `screens/MentalAthletes.js` per the Interfaces: `const [q, setQ] = useState('')`; `rows = (data ?? []).filter((r) => r.name.toLowerCase().includes(q.trim().toLowerCase()))`; each row is the `role="button" aria-label={row.name}` wrapper from the Interfaces around an `AthleteRow` (the wrapper carries `onClick`; without it the test's `r.click('Jordan Whitfield')` throws `no button "Jordan Whitfield"` before and after this step); date labels through `format(parseISO(iso), 'MMM d')` from date-fns; loading -> two `SkeletonCard`s; error -> `ErrorNotice title="Athletes didn't load"`; header idiom from `SpecialistDay.js` lines 86-95.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/components/BottomTabBar.test.js src/portal/screens/MentalAthletes.test.js src/portal/PortalRoutes.mental.test.js`
Expected: PASS (existing BottomTabBar tests plus 1; 2; 1).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/portal/components/BottomTabBar.js frontend/src/portal/components/BottomTabBar.test.js frontend/src/portal/PortalRoutes.js frontend/src/portal/PortalRoutes.mental.test.js frontend/src/portal/screens/MentalAthletes.js frontend/src/portal/screens/MentalAthletes.test.js
git commit -m "feat(mental): Athletes tab, routes and the Athletes screen

Mental tab set gains Athletes and Contract (key mental-contract); the
four /portal/mental routes; the searchable athlete list with next/last
1:1, intake and latest note.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Athlete page, note editor and the My Sessions chip

**Files:**
- Create: `frontend/src/portal/components/mental/SaveState.js`, `components/mental/NoteEditor.js`, `components/mental/SessionNoteChip.js`, `components/mental/ContactLine.js`
- Create: `frontend/src/portal/screens/MentalAthlete.js`, `screens/MentalNote.js`
- Modify: `frontend/src/portal/screens/SpecialistDay.js` (signature; both `SessionCard` render sites)
- Modify: `frontend/src/portal/PortalRoutes.js` (`SpecialistDayRoute` gains `onOpenNote`; the two placeholder routes)
- Test: `frontend/src/portal/components/mental/NoteEditor.test.js`, `screens/MentalAthlete.test.js`, `screens/MentalNote.test.js`, `screens/SpecialistDay.test.js`

**Interfaces:**
- Consumes: `useMentalAthlete`, `useMentalNote`, `useSpecialistSessions` from `../hooks`; `NOTE_MAX` from `../data/mentalNotes`; `SessionCard` (`action` prop), `Primitives`, `Button`, `PhoneFrame`, `BottomTabBar`, `BackLink`, `Card`, `SectionLabel`, `Body`.
- Produces:
  - `SaveState({ state, savedAt })` -> one line: `idle` -> `Not saved yet`, `saving` -> `Saving…`, `saved` -> `Saved · 10:42` (`format(savedAt, 'H:mm')`), `slow` -> `Not saved yet — still trying`, `error` -> `Not saved. Check your connection and keep typing; it retries on the next change.`
  - `NoteEditor({ initialBody = '', saveState, savedAt, onSave(body), onDelete, canDelete, autosaveMs = 10000 })` - `<textarea aria-label="Note" maxLength={NOTE_MAX}>`; saves on blur when dirty and every `autosaveMs` while dirty (one interval, started on first edit); `${NOTE_MAX - length} characters left` below 500 left; delete is a `Delete note` button that swaps to `Delete this note? ` + `Yes, delete` / `Keep` inline (no `window.confirm`); `onSave` is never called with an unchanged body
  - `SessionNoteChip({ hasNote, onClick })` - a `<button>` labelled `Note` / `Edit note` (the Roster `NoteChip` styling), `onClick` calls `e.stopPropagation()` first
  - `ContactLine({ contact })` - `Whitfield family · Dana · dana@email.com · 612-555-0100` with `mailto:` and `tel:` links; renders nothing when `contact` is null
  - `MentalAthlete({ bare = false, athleteId, onBack, onOpenNote({ entryId, sessionDate, athleteName }), onSignOut })` (`athleteName` is `data.athlete.name`, so the note page can say whose note it is) - header: name, `Age 14 · 20 min a day`, `ContactLine`; **Intake** card with `Open intake note` / `Write intake note`; **Sessions** card listing `sessions` (`Nov 10 · 4:00 PM · Attended`) each with a `SessionNoteChip`; **Other notes** card listing `free` notes by date with `New note` (entryId `free-<8 random base36 chars>`); **Contract** card `This week 4/5 · 20 min a day · Last check-in Nov 10` (`Never checked in` when null); footer `<BottomTabBar role="mental" active="athletes" />`
  - `MentalNote({ bare = false, athleteId, entryId, sessionDate = null, athleteName = null, onBack })` - title `Intake note` / `Session note · Nov 10` / `Note`, the athlete's name as the line under the title and as the `BackLink` label (`‹ Jordan Whitfield`; `name = athleteName ?? hook.athleteName`, the hook's `fetchAthlete` fallback covering a refresh or deep link; `‹ Athlete` only while both are null), `NoteEditor` bound to `useMentalNote`; after `remove()` it calls `onBack()`. Private clinical notes must never open without saying whose they are
  - `SpecialistDay({ ..., onOpenNote })` - when `activeId === 'mental'`, `role === 'mental'` and the session has at least one athlete, each `SessionCard` gets `action={<SessionNoteChip hasNote={false} onClick={() => onOpenNote({ athleteId: s.athletes[0].athleteId, sessionId: s.sessionId, sessionDate: s.date, athleteName: s.athletes[0].name })} />}`
  - `SpecialistDayRoute` passes `onOpenNote={({ athleteId, sessionId, sessionDate, athleteName }) => navigate(`/portal/mental/${athleteId}/notes/${sessionId}`, { state: { sessionDate, athleteName } })}`; `MentalAthleteRoute` passes `onOpenNote={({ entryId, sessionDate, athleteName }) => navigate(`/portal/mental/${athleteId}/notes/${entryId}`, { state: { sessionDate, athleteName } })}`; `MentalNoteRoute` reads `useParams()` and `useLocation().state?.sessionDate ?? null`, `state?.athleteName ?? null`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/portal/components/mental/NoteEditor.test.js`:

```js
import React from 'react';
import { renderScreen } from '../../screens/testRender';
import NoteEditor from './NoteEditor';
import SaveState from './SaveState';

beforeEach(() => { jest.useFakeTimers('modern'); jest.setSystemTime(new Date('2026-11-11T10:42:00')); });
afterEach(() => jest.useRealTimers());

test('autosaves on blur and every 10 s while dirty; never with an unchanged body', async () => {
  const onSave = jest.fn();
  const r = await renderScreen(<NoteEditor initialBody="Start." saveState="idle" savedAt={null} onSave={onSave} />, { path: '/x' });
  const ta = r.container.querySelector('textarea[aria-label="Note"]');
  await r.fill('Note', 'Start. More.');
  await r.flush();
  await r.act(() => { jest.advanceTimersByTime(10000); });
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(onSave).toHaveBeenLastCalledWith('Start. More.');
  await r.act(() => { jest.advanceTimersByTime(10000); });
  expect(onSave).toHaveBeenCalledTimes(1);
  await r.fill('Note', 'Start. More. Again.');
  // react-dom 18 wires onBlur to the native `focusout` event (registerSimpleEvent('focusout', 'onBlur'));
  // a dispatched 'blur' never reaches React's root listener and onSave would stay at one call.
  await r.act(() => { ta.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
  expect(onSave).toHaveBeenCalledTimes(2);
  expect(onSave).toHaveBeenLastCalledWith('Start. More. Again.');
  r.unmount();
});

test('text typed after a save stays in the textarea when new props arrive', async () => {
  const onSave = jest.fn();
  const r = await renderScreen(<NoteEditor initialBody="A" saveState="saving" savedAt={null} onSave={onSave} />, { path: '/x' });
  await r.fill('Note', 'A B');
  await r.rerender(<NoteEditor initialBody="A" saveState="saved" savedAt={Date.now()} onSave={onSave} />);
  expect(r.container.querySelector('textarea').value).toBe('A B');
  expect(r.text()).toContain('Saved · 10:42');
  r.unmount();
});

test('delete confirms inline', async () => {
  const onDelete = jest.fn();
  const r = await renderScreen(<NoteEditor initialBody="A" saveState="saved" savedAt={Date.now()} onSave={jest.fn()} onDelete={onDelete} canDelete />, { path: '/x' });
  await r.click('Delete note');
  expect(r.text()).toContain('Delete this note?');
  await r.click('Keep');
  expect(onDelete).not.toHaveBeenCalled();
  await r.click('Delete note');
  await r.click('Yes, delete');
  expect(onDelete).toHaveBeenCalledTimes(1);
  r.unmount();
});

test('SaveState copy for every state', async () => {
  for (const [state, text] of [['idle', 'Not saved yet'], ['saving', 'Saving…'], ['slow', 'still trying'], ['error', 'Not saved. Check your connection']]) {
    const r = await renderScreen(<SaveState state={state} savedAt={null} />, { path: '/x' });
    expect(r.text()).toContain(text);
    r.unmount();
  }
});
```

(`renderScreen` has no `rerender`/`act`: add both to `screens/testRender.js` as thin wrappers - `rerender(el)` re-renders the same root inside `act`, `act(fn)` wraps `fn` in React's `act` - the only edit to that file.)

Create `frontend/src/portal/screens/MentalAthlete.test.js`:

```js
import React from 'react';
import { renderScreen } from './testRender';

let mockData;
jest.mock('../hooks', () => ({
  useMentalAthlete: () => ({ data: mockData, loading: false, error: null }),
  useSelfManaged: () => false,
}));
import MentalAthlete from './MentalAthlete';

beforeEach(() => {
  mockData = {
    athlete: { id: 'jordan', name: 'Jordan Whitfield', age: 14, dob: '2012-06-17', householdId: 'whitfield', required: 20 },
    contact: { familyName: 'Whitfield family', guardianName: 'Dana', email: 'dana@email.com', phone: '612-555-0100' },
    sessions: [
      { sessionId: 'cal-c', date: '2026-11-17', time: '5:00 PM', status: 'confirmed', attendee: 'athlete', hasNote: false },
      { sessionId: 'cal-b', date: '2026-11-10', time: '4:30 PM', status: 'attended', attendee: 'parent', hasNote: true },
    ],
    notes: { intake: null, sessions: [{ id: 'cal-b', sessionDate: '2026-11-10', updatedAtMs: 1 }], free: [{ id: 'free-k3x9', updatedAtMs: 2, body: 'Call Dana about tee times.' }] },
    contract: { thisWeek: { metDays: 4, days: [] }, lastCheckin: '2026-11-10', required: 20 },
  };
});

test('header, contact, intake, sessions with chips, other notes and the contract summary', async () => {
  const onOpenNote = jest.fn();
  const r = await renderScreen(<MentalAthlete bare athleteId="jordan" onOpenNote={onOpenNote} />, { path: '/portal/mental/jordan' });
  expect(r.text()).toContain('Age 14 · 20 min a day');
  expect(r.text()).toContain('Whitfield family · Dana · dana@email.com · 612-555-0100');
  expect(r.container.querySelector('a[href="mailto:dana@email.com"]')).not.toBeNull();
  expect(r.text()).toContain('Nov 10 · 4:30 PM · Attended · Parent attending');
  expect(r.text()).toContain('This week 4/5 · 20 min a day · Last check-in Nov 10');
  await r.click('Write intake note');
  expect(onOpenNote).toHaveBeenCalledWith({ entryId: 'intake', sessionDate: null, athleteName: 'Jordan Whitfield' });
  await r.click('Edit note');
  expect(onOpenNote).toHaveBeenCalledWith({ entryId: 'cal-b', sessionDate: '2026-11-10', athleteName: 'Jordan Whitfield' });
  await r.click('Note');
  expect(onOpenNote).toHaveBeenCalledWith({ entryId: 'cal-c', sessionDate: '2026-11-17', athleteName: 'Jordan Whitfield' });
  await r.click('New note');
  expect(onOpenNote.mock.calls.at(-1)[0].entryId).toMatch(/^free-[a-z0-9]{8}$/);
  expect(onOpenNote.mock.calls.at(-1)[0].athleteName).toBe('Jordan Whitfield');
  r.unmount();
});

test('no contact and never checked in', async () => {
  mockData = { ...mockData, contact: null, contract: { ...mockData.contract, lastCheckin: null } };
  const r = await renderScreen(<MentalAthlete bare athleteId="jordan" />, { path: '/portal/mental/jordan' });
  expect(r.text()).not.toContain('Whitfield family');
  expect(r.text()).toContain('Never checked in');
  r.unmount();
});
```

Create `frontend/src/portal/screens/MentalNote.test.js`:

```js
import React from 'react';
import { renderScreen } from './testRender';

const mockSave = jest.fn();
const mockRemove = jest.fn();
let mockEntry;
let mockHookName = null;
jest.mock('../hooks', () => ({
  useMentalNote: () => ({ entry: mockEntry, athleteName: mockHookName, loading: false, error: null, save: mockSave, remove: mockRemove, saveState: 'idle', savedAt: null }),
  useSelfManaged: () => false,
}));
import MentalNote from './MentalNote';

beforeEach(() => { mockHookName = null; });

test('a session note: title with the date, whose note it is, the editor bound to save, delete goes back', async () => {
  mockEntry = { id: 'cal-b', body: 'Kept the routine.', sessionDate: '2026-11-10' };
  const onBack = jest.fn();
  const r = await renderScreen(<MentalNote bare athleteId="jordan" entryId="cal-b" sessionDate="2026-11-10" athleteName="Jordan Whitfield" onBack={onBack} />, { path: '/portal/mental/jordan/notes/cal-b' });
  expect(r.text()).toContain('Session note · Nov 10');
  expect(r.text()).toContain('Jordan Whitfield');
  expect(r.container.querySelector('textarea').value).toBe('Kept the routine.');
  await r.click('Delete note');
  await r.click('Yes, delete');
  await r.flush();
  expect(mockRemove).toHaveBeenCalledTimes(1);
  expect(onBack).toHaveBeenCalledTimes(1);
  r.unmount();
});

test('a new intake note has no delete and the intake title; a deep link takes the name from the hook', async () => {
  mockEntry = null;
  mockHookName = 'Nico Whitfield';
  const r = await renderScreen(<MentalNote bare athleteId="nico" entryId="intake" onBack={jest.fn()} />, { path: '/portal/mental/nico/notes/intake' });
  expect(r.text()).toContain('Intake note');
  expect(r.text()).toContain('Nico Whitfield');
  expect(r.text()).toContain('Not saved yet');
  expect(r.button('Delete note')).toBeNull();
  r.unmount();
});

test('text typed while the first save was in flight survives entry arriving (Review Focus 5)', async () => {
  // A new note: entry is null until the first autosave resolves and useMentalNote sets it. If the screen
  // keyed the editor on entry.id, that moment would remount NoteEditor and reset it to the saved body.
  mockEntry = null;
  const el = <MentalNote bare athleteId="nico" entryId="intake" athleteName="Nico Whitfield" onBack={jest.fn()} />;
  const r = await renderScreen(el, { path: '/portal/mental/nico/notes/intake' });
  await r.fill('Note', 'First line.');
  mockSave.mockClear();
  await r.fill('Note', 'First line. Typed during the save.');
  mockEntry = { id: 'intake', body: 'First line.', sessionDate: null };
  await r.rerender(el);
  expect(r.container.querySelector('textarea').value).toBe('First line. Typed during the save.');
  r.unmount();
});
```

Create `frontend/src/portal/screens/SpecialistDay.test.js`:

```js
import React from 'react';
import { renderScreen } from './testRender';

let mockSessions;
jest.mock('../hooks', () => ({
  useSpecialistSessions: () => ({ data: { sessions: mockSessions }, loading: false, error: null }),
  useSelfManaged: () => false,
}));
import SpecialistDay from './SpecialistDay';

beforeEach(() => {
  jest.useFakeTimers('modern'); jest.setSystemTime(new Date('2026-11-11T15:00:00'));
  mockSessions = [
    { sessionId: 'cal-c', date: '2026-11-17', dayLabel: 'Tue Nov 17', time: '5:00 PM', booked: 1, capacity: 1, type: 'mental', durationMinutes: 30, athletes: [{ athleteId: 'jordan', name: 'Jordan', attendee: 'athlete' }] },
    { sessionId: 'cal-d', date: '2026-11-19', dayLabel: 'Thu Nov 19', time: '4:00 PM', booked: 0, capacity: 1, type: 'mental', durationMinutes: 30, athletes: [] },
  ];
});
afterEach(() => jest.useRealTimers());

test('a mental row with an athlete gets a Note chip that opens the note without opening attendance', async () => {
  const onOpenNote = jest.fn();
  const onOpenSession = jest.fn();
  const r = await renderScreen(<SpecialistDay bare specialistId="mental" role="mental" onOpenNote={onOpenNote} onOpenSession={onOpenSession} />, { path: '/portal/my-sessions' });
  expect(r.container.querySelectorAll('button').length).toBeGreaterThan(0);
  await r.click('Note');
  expect(onOpenNote).toHaveBeenCalledWith({ athleteId: 'jordan', sessionId: 'cal-c', sessionDate: '2026-11-17', athleteName: 'Jordan' });
  expect(onOpenSession).not.toHaveBeenCalled();
  r.unmount();
});

test('Phil and an ops switcher see no Note chip', async () => {
  const phil = await renderScreen(<SpecialistDay bare specialistId="phil" role="coach" onOpenNote={jest.fn()} />, { path: '/portal/my-sessions' });
  expect(phil.button('Note')).toBeNull();
  phil.unmount();
  const ops = await renderScreen(<SpecialistDay bare specialistId="mental" role="ops" canSwitch onOpenNote={jest.fn()} />, { path: '/portal/my-sessions' });
  expect(ops.button('Note')).toBeNull();
  ops.unmount();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/components/mental src/portal/screens/MentalAthlete.test.js src/portal/screens/MentalNote.test.js src/portal/screens/SpecialistDay.test.js`
Expected: FAIL - "Cannot find module './NoteEditor'", "./MentalAthlete", "./MentalNote"; SpecialistDay: `r.click('Note')` throws "no button Note".

- [ ] **Step 3: Write the implementation**

Build the four components and two screens per the Interfaces. Pinned details:

- `NoteEditor`: `const [body, setBody] = useState(initialBody)`; `const bodyRef = useRef(initialBody)` kept equal to `body` on every change; `const [dirty, setDirty] = useState(false)` set true on the first change; `const last = useRef(initialBody)`; `const commit = () => { if (bodyRef.current !== last.current) { last.current = bodyRef.current; onSave(bodyRef.current); } }`; `useEffect(() => { if (!dirty) return undefined; const id = setInterval(commit, autosaveMs); return () => clearInterval(id); }, [dirty])` (the ref keeps the interval's `commit` current); `onBlur={commit}`; `initialBody` is read only at mount (never written back into state - Review Focus 5). Textarea style from `FeedbackSheet.js` 178-208 with `minHeight: '55vh'`, `resize: 'none'`, font `400 16px`.
- `SaveState` colors: `saved` `textTertiary`, `slow`/`error` `errorMid`.
- `MentalNote`: `const { entry, athleteName: hookName, save, remove, saveState, savedAt, loading } = useMentalNote({ athleteId, entryId, sessionDate, athleteName })`; `const name = athleteName ?? hookName`; mount the editor only when `!loading`, with `key={`${athleteId}/${entryId}`}` (the route params, stable for the page's life, so a different note gets a fresh editor) and NEVER a key that involves `entry`: `useMentalNote` sets `entry` when the first save of a new note resolves, and a key such as `entry?.id ?? 'new'` would flip at that moment, remount `NoteEditor`, reset its text to the saved body and drop whatever was typed while the save was in flight (Review Focus 5; `NoteEditor.test.js` cannot see this because it rerenders with new props, which is why `MentalNote.test.js` has its own case); `initialBody={entry?.body ?? ''}`; `canDelete={Boolean(entry)}`; `onDelete={async () => { await remove(); onBack(); }}`.
- `MentalAthlete` status labels: `confirmed` -> `Booked`, `attended` -> `Attended`, `noshow` -> `No-show`, `cancelled` -> `Cancelled`; `attendee === 'parent'` appends ` · Parent attending` (`PARENT_ATTENDING_NOTE` from `data/specialists.js`); the random part of a free note id is `Math.random().toString(36).slice(2, 10).padEnd(8, '0')`.
- `SpecialistDay`: add `onOpenNote` to the signature; in both `SessionCard` sites add `action={showNote && s.athletes[0] ? <SessionNoteChip hasNote={false} onClick={() => onOpenNote({ athleteId: s.athletes[0].athleteId, sessionId: s.sessionId, sessionDate: s.date, athleteName: s.athletes[0].name })} /> : undefined}` where `const showNote = activeId === 'mental' && role === 'mental' && typeof onOpenNote === 'function';`.
- `MentalAthlete`: every `onOpenNote` call sends `athleteName: data.athlete.name` beside `entryId` and `sessionDate`.
- `PortalRoutes.js`: `MentalAthleteRoute` (`useParams().athleteId`; `onBack -> navigate('/portal/mental')`; `onOpenNote -> navigate(`/portal/mental/${athleteId}/notes/${entryId}`, { state: { sessionDate, athleteName } })`), `MentalNoteRoute` (`useParams()`, `const state = useLocation().state; sessionDate = state?.sessionDate ?? null; athleteName = state?.athleteName ?? null`, `onBack -> navigate(`/portal/mental/${athleteId}`)`); `SpecialistDayRoute`'s `onOpenNote` forwards `athleteName` into the same `state`; replace the two `{null}` placeholders.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/components/mental src/portal/screens/MentalAthlete.test.js src/portal/screens/MentalNote.test.js src/portal/screens/SpecialistDay.test.js src/portal/PortalRoutes.mental.test.js`
Expected: PASS (4; 2; 3; 2; 1).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/portal/components/mental frontend/src/portal/screens/MentalAthlete.js frontend/src/portal/screens/MentalAthlete.test.js frontend/src/portal/screens/MentalNote.js frontend/src/portal/screens/MentalNote.test.js frontend/src/portal/screens/SpecialistDay.js frontend/src/portal/screens/SpecialistDay.test.js frontend/src/portal/screens/testRender.js frontend/src/portal/PortalRoutes.js
git commit -m "feat(mental): athlete page, note editor and the My Sessions chip

Intake, session and free notes with autosave on blur and every 10 s,
inline delete confirm, guardian contact line; a Note chip on each
mental session row.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: The contract board

**Files:**
- Create: `frontend/src/portal/components/mental/WeekDots.js`, `components/mental/CheckinToggle.js`, `components/mental/BoardRow.js`
- Create: `frontend/src/portal/screens/MentalContract.js`
- Modify: `frontend/src/portal/PortalRoutes.js` (`MentalContractRoute`; the placeholder route)
- Test: `frontend/src/portal/components/mental/BoardRow.test.js`, `screens/MentalContract.test.js`

**Interfaces:**
- Consumes: `useContractBoard` from `../hooks`; `weekStartFor`, `addDays`, `weekDaysOf` from `../data/contractRule`; `academyDateISO` from `../data/calendar`; `Toggle` (the bare switch from `components/Toggle.js`, not `ToggleRow`); `PhoneFrame`, `BottomTabBar`, `Primitives`.
- Produces:
  - `WeekDots({ days })` - seven 10 px dots Mon..Sun: `met` primary green, `short` `errorMid`, `none` `track` with a `border` rule; Saturday and Sunday `dimmed` with no border; each dot `aria-label="Mon met"` etc.
  - `CheckinToggle({ checked, onChange, name })` - the bare `Toggle` with `label={`Checked in · ${name}`}`
  - `BoardRow({ row, canToggle, onToggle(checked) })` - line 1 name + `Age 9 · 10 min`; line 2 `This week 2/5` + `WeekDots`; line 3 `Last week 5/5 · Last check-in Nov 4` (`Never checked in`; `22 days` appended in the due group when `row.daysSince > 14`); the toggle on the right when `canToggle`
  - `MentalContract({ bare = false, role = 'mental', onSignOut })` - week switcher `‹` / `›` (aria-labels `Previous week`, `Next week`; next disabled when the week is the current one) around `Week of Nov 9`; three groups with section labels `Due for a check-in · n`, `This week · n`, `Checked in this week · n`; a dashed empty line per empty group (`No one is due`, `Everyone is checked in`, `No check-ins yet this week`); banner `The contract switch is off: families are not logging yet.` when `config.enabled === false`; `canToggle = role === 'mental'`; footer `<BottomTabBar role={role} active="mental-contract" />` for `mental`, `<BottomTabBar role={role} />` for ops/owner; `style={{ maxWidth: 720 }}` on the `PhoneFrame` so a tablet shows a wider column
  - `MentalContractRoute` resolves `role` from `useAuthSession` (`'mental'` in seed mode; in live mode `user?.role ?? null`, never defaulted to `'mental'`) and renders `<MentalContract bare role={role} onSignOut={onSignOut} />` only once its own auth subscription has finished loading (`if (live && loading) return null;`, the `SpecialistDayRoute` guard); `canToggle` is therefore false for an owner or ops user from the first frame

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/portal/components/mental/BoardRow.test.js`:

```js
import React from 'react';
import { renderScreen } from '../../screens/testRender';
import BoardRow from './BoardRow';
import WeekDots from './WeekDots';

const days = [
  { date: '2026-11-09', state: 'met', minutes: 10 }, { date: '2026-11-10', state: 'met', minutes: 10 }, { date: '2026-11-11', state: 'short', minutes: 5 },
  { date: '2026-11-12', state: 'none', minutes: 0 }, { date: '2026-11-13', state: 'none', minutes: 0 },
];
const row = { athleteId: 'nico', name: 'Nico Whitfield', age: 9, required: 10, thisWeek: { metDays: 2, days }, lastWeek: { metDays: 5, days }, lastCheckin: '2026-11-04', checkedInThisWeek: false, daysSince: 7 };

test('seven dots: five weekdays by state, two muted weekend dots', async () => {
  const r = await renderScreen(<WeekDots days={days} />, { path: '/x' });
  const dots = r.container.querySelectorAll('[data-dot]');
  expect(dots).toHaveLength(7);
  expect([...dots].map((d) => d.getAttribute('data-dot'))).toEqual(['met', 'met', 'short', 'none', 'none', 'weekend', 'weekend']);
  expect(dots[0].getAttribute('aria-label')).toBe('Mon met');
  r.unmount();
});

test('a row with the toggle fires onToggle once per tap', async () => {
  const onToggle = jest.fn();
  const r = await renderScreen(<BoardRow row={row} canToggle onToggle={onToggle} />, { path: '/x' });
  expect(r.text()).toContain('Age 9 · 10 min');
  expect(r.text()).toContain('This week 2/5');
  expect(r.text()).toContain('Last week 5/5 · Last check-in Nov 4');
  await r.click('Checked in · Nico Whitfield');
  expect(onToggle).toHaveBeenCalledTimes(1);
  expect(onToggle).toHaveBeenCalledWith(true);
  r.unmount();
});

test('read-only row: no toggle; a due row says how many days', async () => {
  const r = await renderScreen(<BoardRow row={{ ...row, lastCheckin: null, daysSince: 22 }} canToggle={false} />, { path: '/x' });
  expect(r.button('Checked in · Nico Whitfield')).toBeNull();
  expect(r.text()).toContain('Never checked in · 22 days');
  r.unmount();
});
```

Create `frontend/src/portal/screens/MentalContract.test.js`:

```js
import React from 'react';
import { renderScreen } from './testRender';

let mockBoard;
const mockSetCheckin = jest.fn();
jest.mock('../hooks', () => ({
  useContractBoard: (weekStartISO) => ({ ...mockBoard(weekStartISO), setCheckin: mockSetCheckin, loading: false, error: null }),
  useSelfManaged: () => false,
}));
jest.mock('../data/calendar', () => ({ ...jest.requireActual('../data/calendar'), academyDateISO: () => '2026-11-11' }));
import MentalContract from './MentalContract';

const r0 = (id, name, metDays) => ({ athleteId: id, name, age: 12, required: 20, thisWeek: { metDays, days: [] }, lastWeek: { metDays: 0, days: [] }, lastCheckin: null, checkedInThisWeek: false, daysSince: null });
const mockBoardDefault = () => ({ config: { enabled: true, enabledAt: '2026-11-03' }, rows: { due: [], thisWeek: [r0('nico', 'Nico', 2)], checkedIn: [] } });

beforeEach(() => {
  mockBoard = (week) => ({
    config: { enabled: true, enabledAt: '2026-11-03' },
    rows: week === '2026-11-09'
      ? { due: [{ ...r0('reese', 'Reese', 0), daysSince: 22 }], thisWeek: [r0('nico', 'Nico', 2)], checkedIn: [{ ...r0('jordan', 'Jordan', 4), checkedInThisWeek: true }] }
      : { due: [], thisWeek: [r0('jordan', 'Jordan', 5)], checkedIn: [] },
  });
});

test('three groups with counts, the current week, the toggle writes', async () => {
  const r = await renderScreen(<MentalContract bare role="mental" />, { path: '/portal/mental/contract' });
  expect(r.text()).toContain('Week of Nov 9');
  expect(r.text()).toContain('Due for a check-in · 1');
  expect(r.text()).toContain('This week · 1');
  expect(r.text()).toContain('Checked in this week · 1');
  expect(r.button('Next week').disabled).toBe(true);
  await r.click('Checked in · Nico');
  expect(mockSetCheckin).toHaveBeenCalledWith({ athleteId: 'nico', checkedIn: true });
  await r.click('Checked in · Jordan');
  expect(mockSetCheckin).toHaveBeenCalledWith({ athleteId: 'jordan', checkedIn: false });
  r.unmount();
});

test('the week switcher goes back and the empty groups say so', async () => {
  const r = await renderScreen(<MentalContract bare role="mental" />, { path: '/portal/mental/contract' });
  await r.click('Previous week');
  await r.flush();
  expect(r.text()).toContain('Week of Nov 2');
  expect(r.text()).toContain('No one is due');
  expect(r.text()).toContain('No check-ins yet this week');
  expect(r.button('Next week').disabled).toBe(false);
  r.unmount();
});

test('owner and ops see the board without toggles; the off switch shows a banner', async () => {
  mockBoard = () => ({ ...mockBoardDefault(), config: { enabled: false, enabledAt: null } });
  const r = await renderScreen(<MentalContract bare role="owner" />, { path: '/portal/mental/contract' });
  expect(r.button('Checked in · Nico')).toBeNull();
  expect(r.text()).toContain('The contract switch is off');
  r.unmount();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/components/mental/BoardRow.test.js src/portal/screens/MentalContract.test.js`
Expected: FAIL - "Cannot find module './BoardRow'", "./MentalContract".

- [ ] **Step 3: Write the implementation**

Pinned details beyond the Interfaces:
- `WeekDots`: `weekDaysOf(days[0].date)` gives the seven dates; a weekday's dot is `days[i].state`, the last two are `'weekend'`; `data-dot={state}`; labels `['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i] + ' ' + state`.
- `CheckinToggle` uses `Toggle` from `components/Toggle.js` (the bare `role="switch"` button), never `ToggleRow` (it fires `onChange` twice per tap).
- `MentalContract`: `const today = academyDateISO(); const current = weekStartFor(today); const [week, setWeek] = useState(current);` `useContractBoard(week)`; `Week of ${format(parseISO(week), 'MMM d')}`; `onToggle` for a row: `setCheckin({ athleteId: row.athleteId, checkedIn: !row.checkedInThisWeek })`.
- `PortalRoutes.js`: `MentalContractRoute({ onSignOut })` with `const live = isLive(); const { user, loading } = useAuthSession(live ? undefined : { variant: 'idle' }); if (live && loading) return null; const role = live ? (user?.role ?? null) : 'mental';` then `<MentalContract bare role={role} onSignOut={onSignOut} />`. The guard is `SpecialistDayRoute`'s (PortalRoutes.js ~464-468): this route's own `useAuthSession` subscription starts loading after `RequireRole`'s has finished, so without it an owner or ops user would first render the board with `Checked in` toggles (`(live && user?.role) || 'mental'` reads `'mental'` while `user` is null) and a tap during that flash would hit the `contractCheckins` rules for a 403. `MentalContract`'s `canToggle = role === 'mental'` keeps a null role read-only; replace the `mental/contract` placeholder.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/components/mental src/portal/screens/MentalContract.test.js src/portal/PortalRoutes.mental.test.js`
Expected: PASS (3 new BoardRow/WeekDots tests; 3; 1).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/portal/components/mental/WeekDots.js frontend/src/portal/components/mental/CheckinToggle.js frontend/src/portal/components/mental/BoardRow.js frontend/src/portal/components/mental/BoardRow.test.js frontend/src/portal/screens/MentalContract.js frontend/src/portal/screens/MentalContract.test.js frontend/src/portal/PortalRoutes.js
git commit -m "feat(mental): the contract board

Due / This week / Checked in groups, seven dots per week, the Checked
in toggle for role mental, a week switcher, read-only for owner and ops.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: The family contract rule (no picker, derived requirement)

**Files:**
- Modify: `frontend/src/portal/data/calendar.js` (`buildContractMonthFromLogs`, line 241)
- Modify: `frontend/src/portal/data/athlete.js` (`CONTRACT_TIERS` goes; onboarding row label)
- Modify: `frontend/src/portal/data/signup.js` (`TIER_MINUTES`, `contractAnswered`, `contractMinutes`/`contractPicked` on entries, line 175 validation, `athleteBody`)
- Modify: `frontend/src/portal/hooks/live.js` (line 1686-1688)
- Modify: `frontend/src/portal/hooks/index.js` (`liveContract`, `useContract`, `useAthleteTier` removed, `usePracticeLog`, `livePracticeLog`, `liveChildCard`, `liveAthleteDashboard`, `deriveWhoNeedsCall`, `liveAthleteDetail`, `useCoachRoster`, the membership payload's `contractMinutes`, `contractFor` seed `minutesPerDay`)
- Create: `frontend/src/portal/components/ContractSheets.js` (`LogSheet`, `DaySheet` moved out of `CommitmentContract.js`)
- Modify: `frontend/src/portal/screens/CommitmentContract.js`, `screens/AthleteDetail.js`, `screens/Registration.js`, `screens/RegistrationSteps.js`, `screens/OnboardingSteps.js` (no change needed beyond the hook signature), `StatesHarness.js` (02 and 07 and 09 states)
- Delete: `frontend/src/portal/screens/RegistrationContract.js`
- Modify: `functions/portal/family-validate.js` (line 16)
- Tests modified: `data/calendar.contract.test.js`, `data/signup.test.js`, `hooks/index.contract.test.js`, `hooks/live.contract.test.js`, `screens/CommitmentContract.state.test.js`, `screens/AthleteDetail.test.js`, `screens/Registration.test.js`, `screens/Registration.off.test.js`, `screens/Registration.family.test.js`, `screens/RegistrationSteps.test.js`, `functions/portal/family-validate.test.js`

**Interfaces:**
- Consumes: `contractMinutesFor` from `data/contractRule.js`; `academyDateISO`.
- Produces:
  - `buildContractMonthFromLogs({ today, minutesByDate, contractMinutes, startISO, endISO })` where `contractMinutes` is a number or `(iso) => number`
  - `useContract({ variant, today, practice, athleteId = null })` -> `{ data, loading, error, ensureContractStart() }`; `data.tierMinutes` is the derived requirement for `today` (`data.required` is the same value under its new name; keep `tierMinutes` so the screen's copy sites change in place); `data.needsStart` is true when the stored `contractMinutes` is null; `tiers` is gone
  - `ensureContractStart()` -> live: `setContractTier({ athleteId, minutes: contractMinutesFor(athlete, today), start: true })` only when `athlete.contractMinutes == null`, else `{ athleteId, skipped: true }`; seed: `{ simulated: true }`
  - `usePracticeLog({ today, practice, athleteId = null })` -> unchanged shape; `logPractice({ minutes, date })` snapshots `contractMinutes: contractMinutesFor(athlete, date ?? today)`
  - an `athleteId` of null keeps today's self path (`liveAthleteIdentity`); a string resolves `fetchAthlete(athleteId)` (the parent path)
  - `CommitmentContract({ variant, bare, practice, onLog, onLogged, athleteId = null })`; on first live load with `data.needsStart` it calls `ensureContractStart()` once; the `none` variant and `NoContract`/`TierChoice` are gone; `${tierMinutes} min tier` copy becomes `${tierMinutes} min a day`
  - `setContractTier` accepts `[10, 20, 45, 90]`
  - `signup.js`: `newAthleteEntry()` has no `contractMinutes`/`contractPicked`; `athleteBody` sends `contractMinutes: null`; `validateAthleteEntry` has no `contract` option; `contractAnswered` and `TIER_MINUTES` are removed
  - `Registration.js`: `STEPS.signup` and `STEPS.link` have no `contract` row; `stepsFor(mode)`; `VARIANT_STEP.contract` gone; `withContract` gone
  - `family-validate.js`: `TIER_MINUTES = [10, 20, 45, 90]`, error copy `Pick 10, 20, 45 or 90 minutes, or none.`
  - `AthleteDetail`: `StartContractCard`, `TIER_MINUTES`, `hasNoTier`, the `noTier` prop go; the `min tier` subline part becomes `${contractMinutesFor(athlete, today)} min a day` (still through `hideContractParts`, whose regex gains `\bmin a day$`)

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/portal/data/calendar.contract.test.js`:

```js
test('a per-day requirement: a 12th birthday mid-month leaves the earlier 10-minute days logged', () => {
  const required = (iso) => (iso < '2026-11-18' ? 10 : 20);
  const minutesByDate = new Map([['2026-11-16', 10], ['2026-11-17', 10], ['2026-11-18', 10], ['2026-11-19', 20]]);
  const m = buildContractMonthFromLogs({ today: '2026-11-20', minutesByDate, contractMinutes: required, startISO: '2026-11-16', endISO: '2027-02-27' });
  expect(m.dayStates['2026-11-16']).toBe('logged');
  expect(m.dayStates['2026-11-17']).toBe('logged');
  expect(m.dayStates['2026-11-18']).toBe('missed');
  expect(m.dayStates['2026-11-19']).toBe('logged');
  expect(buildContractMonthFromLogs({ today: '2026-11-20', minutesByDate, contractMinutes: 20, startISO: '2026-11-16', endISO: '2027-02-27' }).dayStates['2026-11-16']).toBe('missed');
});
```

In `hooks/index.contract.test.js` replace the `setTier` block (lines 216-233, `test('setTier stamps contractStart only on a start', ...)`) with the two tests below, written in that file's own idiom: the mocks are reached as `live.fetchCurrentUser`, `live.setContractTier` ... (`import * as live from './live'`, line 42), `mountHook` is `async` and returns `{ result, unmount }` (not `out`; it renders and settles itself), `settle()` takes no argument, and CRA's `resetMocks` leaves `live.isLive()` falsy before every test, so each test that wants the live path must call `live.isLive.mockReturnValue(true)` first or both hooks run in seed mode and `setContractTier` / `createContractLog` are never called.

```js
test('ensureContractStart stamps the derived requirement and contractStart once, for the self path and a named athlete', async () => {
  live.isLive.mockReturnValue(true);
  live.fetchCurrentUser.mockResolvedValue({ uid: 'u-j', role: 'athlete', athleteId: 'jordan' });
  live.fetchAthlete.mockImplementation(async (id) => ({
    id, name: id, dob: id === 'nico' ? '2017-09-09' : '2012-06-17', contractMinutes: id === 'reese' ? 45 : null,
  }));
  live.fetchContractLogs.mockResolvedValue([]);
  live.setContractTier.mockResolvedValue({ ok: true });
  const self = await mountHook(() => useContract({ today: '2026-11-11' }));
  expect(self.result.current.data.tierMinutes).toBe(20);
  expect(self.result.current.data.needsStart).toBe(true);
  await act(async () => { await self.result.current.ensureContractStart(); });
  expect(live.setContractTier).toHaveBeenCalledWith({ athleteId: 'jordan', minutes: 20, start: true });
  const kid = await mountHook(() => useContract({ today: '2026-11-11', athleteId: 'nico' }));
  expect(kid.result.current.data.tierMinutes).toBe(10);
  await act(async () => { await kid.result.current.ensureContractStart(); });
  expect(live.setContractTier).toHaveBeenCalledWith({ athleteId: 'nico', minutes: 10, start: true });
  const stamped = await mountHook(() => useContract({ today: '2026-11-11', athleteId: 'reese' }));
  expect(stamped.result.current.data.tierMinutes).toBe(20);
  expect(stamped.result.current.data.needsStart).toBe(false);
  expect(await stamped.result.current.ensureContractStart()).toEqual({ athleteId: 'reese', skipped: true });
  expect(live.setContractTier).toHaveBeenCalledTimes(2);
  await self.unmount(); await kid.unmount(); await stamped.unmount();
});

test('logPractice snapshots the requirement for the logged date, for a named athlete too', async () => {
  live.isLive.mockReturnValue(true);
  live.fetchAthlete.mockResolvedValue({ id: 'nico', dob: '2014-11-18', contractMinutes: null });
  live.fetchContractLogs.mockResolvedValue([]);
  live.createContractLog.mockResolvedValue({});
  const h = await mountHook(() => usePracticeLog({ today: '2026-11-20', athleteId: 'nico' }));
  await act(async () => { await h.result.current.logPractice({ minutes: 15, date: '2026-11-17' }); });
  expect(live.createContractLog).toHaveBeenLastCalledWith({ athleteId: 'nico', date: '2026-11-17', minutes: 15, contractMinutes: 10 });
  await act(async () => { await h.result.current.logPractice({ minutes: 15 }); });
  expect(live.createContractLog).toHaveBeenLastCalledWith({ athleteId: 'nico', date: '2026-11-20', minutes: 15, contractMinutes: 20 });
  await h.unmount();
});
```

Three edits around them in the same file: add `createContractLog: jest.fn(),` to the `jest.mock('./live', ...)` list (lines 14-26; `fetchAthlete`, `fetchContractLogs`, `fetchCurrentUser` and `setContractTier` are already there); in the `./index` import (lines 36-44) remove `useAthleteTier` (the hook is deleted in this task, and Step 4's grep gate would catch a stale import) and add `usePracticeLog`; `act` is already imported from React. Also change the existing `useHousehold`/`useAthleteDashboard`/`deriveWhoNeedsCall` cases in that file that set `contractMinutes: null` to expect a contract card / a Behind row for that athlete (the derived requirement applies to everyone) - each such assertion flips from "null card" to a card with `total` = the days due.

In `hooks/live.contract.test.js`, the `setContractTier` refusal test's accepted list becomes `[10, 20, 45, 90]`: add `await setContractTier({ athleteId: 'a', minutes: 10 })` resolving and `minutes: 15` rejecting with `'setContractTier: minutes must be 10, 20, 45, 90 or null.'`.

`screens/CommitmentContract.state.test.js`: delete the NoContract test (lines 93-102); add:

```js
test('the header shows the derived requirement and never a picker', async () => {
  mockData = { ...mockData, tierMinutes: 10, needsStart: false };
  const r = await renderScreen(<CommitmentContract bare />, { path: '/portal/contract' });
  expect(r.text()).toContain('10 min a day');
  expect(r.text()).not.toMatch(/Pick your daily investment|Start the \d+ min contract/);
  r.unmount();
});
test('a first open stamps the contract once', async () => {
  mockEnsure.mockClear();
  mockData = { ...mockData, needsStart: true };
  const r = await renderScreen(<CommitmentContract bare />, { path: '/portal/contract' });
  await r.flush();
  expect(mockEnsure).toHaveBeenCalledTimes(1);
  r.unmount();
});
```

with the hooks mock returning `ensureContractStart: mockEnsure` instead of `setTier`, and `mockData` gaining `needsStart: false` in `beforeEach`.

`screens/AthleteDetail.test.js` lines 62-107: the "contract on" case asserts `'20 min a day'` in the subline and no `'Start a contract'`; the harness `noTier` case (84-89) is deleted; the `useAthleteTier` mock entry is removed.

`data/signup.test.js` lines 223-262 and `screens/RegistrationSteps.test.js` lines 265-320: delete the contract-step and tier-validation cases; in `signup.test.js` assert `newAthleteEntry()` has no `contractMinutes` key and `buildCreateFamilyPayload(form).athletes[0].contractMinutes` is `null`. `Registration.off.test.js`: two tests go - line 227, "the harness's contract variant still shows the step; its other variants follow the flag" (it renders `variant="contract"` and expects `Step 5 of 6` and `Commitment Contract`; the `contract` harness variant no longer exists; its second half, `variant="consent"` showing `Step 5 of 5` and `Consent and waiver`, moves into the 5-steps test at line 46), and line 238, 'smoke: flag on, the contract step is back (6 steps)'; the 5-steps test at line 46 runs with the flag on too (add a second call with `process.env.REACT_APP_CONTRACT_ENABLED = 'true'`, restored in a `finally`); the draft-clamping tests at lines 188, 200 and 218 stay as they are unless they fail. `Registration.test.js` line 261 test ("the contract is its own step") is deleted; its header comment "6-step layout" becomes "5-step layout". `Registration.family.test.js`: remove any step named Contract from its step walk.

`functions/portal/family-validate.test.js` line 78: `contractMinutes: 95` still refuses `'contract-tier'`; add `contractMinutes: 10` accepted and `15` refused.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/data/calendar.contract.test.js src/portal/hooks/index.contract.test.js src/portal/hooks/live.contract.test.js src/portal/screens/CommitmentContract.state.test.js src/portal/screens/AthleteDetail.test.js` and `cd functions && node portal/family-validate.test.js`
Expected: FAIL - `dayStates['2026-11-16']` is `'missed'` (a function `contractMinutes` is not a number); `ensureContractStart is not a function`; `setContractTier` rejects 10; `'10 min a day'` not found (`'10 min tier'`); family-validate refuses 10 with `contract-tier`.

- [ ] **Step 3: Write the implementation**

1. `data/calendar.js` line 241: `const need = typeof contractMinutes === 'function' ? contractMinutes : () => contractMinutes; const fulfilled = (iso) => (minutesByDate.get(iso) || 0) >= need(iso);`.
2. `data/contractFlag.js` line 18: `const CONTRACT_PART = /\bmin tier$|\bmin a day$|\bcontract\b/i;` (`contractFlag.test.js` gains one case: `'Age 9 · 10 min a day'` hides to `'Age 9'` while off).
3. `hooks/live.js` lines 1686-1688: `[10, 20, 45, 90]` and `'setContractTier: minutes must be 10, 20, 45, 90 or null.'`.
4. `hooks/index.js`:
   - `import { contractMinutesFor } from '../data/contractRule';`; remove the `CONTRACT_TIERS` import (line 159).
   - `async function liveAthleteFor(athleteId) { if (athleteId) return { athlete: await fetchAthlete(athleteId) }; return liveAthleteIdentity(); }` beside `liveAthleteIdentity`.
   - `liveContract(today, athleteId)`: `const { athlete } = await liveAthleteFor(athleteId); const required = (iso) => contractMinutesFor(athlete, iso); const logs = await fetchContractLogs(athlete.id); ... buildContractMonthFromLogs({ today, minutesByDate, contractMinutes: required, ...contractWindowFor(athlete) })`; return `{ ..., tierMinutes: contractMinutesFor(athlete, today), required: contractMinutesFor(athlete, today), needsStart: athlete.contractMinutes == null }`; the `if (contractMinutes == null) return NO_CONTRACT_MONTH` branch and `tiers` go.
   - `useContract({ variant = 'ontrack', today = todayISO(), practice = false, athleteId = null } = {})`: seed value `{ ...(contractFor(variant, today)), tierMinutes: 20, required: 20, needsStart: false }` (`variant === 'none'` is no longer special); live deps `['contract', today, athleteId, contractLogsGen, athletesGen]`; `ensureContractStart` per the Interfaces; return `{ ...state, ensureContractStart }`. `contractFor`'s `minutesPerDay: 45` becomes `20`.
   - Delete `useAthleteTier` (lines 3206-3213) and `NO_CONTRACT_MONTH`'s `tiers` use.
   - `usePracticeLog({ today = todayISO(), practice = false, athleteId = null } = {})`: `SEED_CONTRACT_MINUTES = 20`; `logPractice`: `const { athlete } = await liveAthleteFor(athleteId); return createContractLog({ athleteId: athlete.id, date: target, minutes, contractMinutes: contractMinutesFor(athlete, target) });`; `removeLog` the same resolver; `livePracticeLog(today, athleteId)` returns `contractMinutes: contractMinutesFor(athlete, today)`; deps gain `athleteId`.
   - `liveChildCard` (1647-1701): drop the `contractMinutes != null` gate; `contractMinutes: (iso) => contractMinutesFor(a, iso)` into the month builder; `ageLine` `Age N · ${contractMinutesFor(a, today)} min a day`.
   - Membership payload `contractMinutes` (1994 seed, 2060 live): the derived value for today.
   - `useCoachRoster` meta (2683): `${contractMinutesFor(a, today)} min a day`.
   - `liveAthleteDashboard` (2915, 2934-2949): the card is always built, with the function requirement.
   - `deriveWhoNeedsCall` (3605): remove the `continue`; the builder gets `(iso) => contractMinutesFor(a, iso)`.
   - `liveAthleteDetail` subline (3369): `${contractMinutesFor(athlete, today)} min a day`; the payload keeps `contractMinutes` (stored) and gains `dob`.
   - `SEED_CONTRACT_MINUTES = { jordan: 45, reese: 20, nico: null }` (1935) becomes `{ jordan: 20, reese: 20, nico: 10 }`.
5. `components/ContractSheets.js`: move `LogSheet` (lines 548-666) and `DaySheet` (464-546) out of `CommitmentContract.js` unchanged as named exports (`export function LogSheet`, `export function DaySheet`) with their imports; `CommitmentContract.js` imports them.
6. `screens/CommitmentContract.js`: signature gains `athleteId = null`, passed to both hooks; remove lines 78-79 (`noContract`), `NoContract` (678-759) and `TierChoice` (761-827); line 148 `{data?.tierMinutes} min a day`; a `useEffect` on `[data?.needsStart]` that calls `contractHook.ensureContractStart()` once (`useRef` guard) when `data?.needsStart && !practice`; `LogSheet`'s copy line 597 `${contractMinutes} min a day is the contract minimum, not a unit — log the real time practiced.`.
7. `data/athlete.js`: delete `CONTRACT_TIERS` (152-165); the onboarding row label `'Commitment Contract tier'` becomes `'Commitment Contract'`.
8. `data/signup.js`: delete `TIER_MINUTES` (14) and `contractAnswered`; `newAthleteEntry` drops the two fields; delete line 175; `athleteBody` sends `contractMinutes: null`; `validateAthleteEntry` and `buildCreateFamilyPayload`/`buildAddAthletesPayload` lose the `contract` option.
9. `screens/Registration.js`: remove the `contract` rows from `STEPS` (59-63), `stepsFor` keeps only the mode lookup, `VARIANT_STEP.contract` (68), `withContract` (112), the `contract` argument at 195 and 245-247, `valid.contract` (211) and the `ContractStep` render (321-323). `RegistrationSteps.js` line 28 re-export goes. Delete `screens/RegistrationContract.js`.
10. `screens/AthleteDetail.js`: delete `TIER_MINUTES` (42), `StartContractCard` (359-449), `hasNoTier` (105-109), the `noTier` prop and the render at 151; nothing else in this task (Task 9 adds the parent card).
11. `StatesHarness.js`: 02 loses `['contract', '4 Contract']`; 07 loses `['none', 'No contract']`; 09 loses `['populated', 'No contract tier', { noTier: true }]`.
12. `functions/portal/family-validate.js` line 16: `const TIER_MINUTES = [10, 20, 45, 90];`, line 98 copy `'Pick 10, 20, 45 or 90 minutes, or none.'`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal` and `cd functions && node portal/family-validate.test.js && node portal/family.test.js`
Expected: PASS across the frontend suite (no test imports `RegistrationContract`, `CONTRACT_TIERS`, `TIER_MINUTES`, `useAthleteTier` or `setTier` any more: `grep -rn "CONTRACT_TIERS\|useAthleteTier\|contractPicked\|RegistrationContract" frontend/src` prints nothing); the two functions tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A frontend/src/portal functions/portal/family-validate.js functions/portal/family-validate.test.js
git commit -m "feat(contract): the owner's rule replaces the tier picker

20 min a day, 10 under 12, derived per date on every family surface;
one-time stamp of contractMinutes and contractStart on first open;
NoContract, the sign-up contract step and the Start-a-contract card go;
contract hooks take an explicit athleteId; setContractTier and
createFamily accept 10.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Parents log for their kids

**Files:**
- Create: `frontend/src/portal/hooks/parentContract.js`
- Create: `frontend/src/portal/components/ParentContractCard.js`
- Modify: `frontend/src/portal/hooks/index.js` (re-export `useParentContract`)
- Modify: `frontend/src/portal/screens/AthleteDetail.js` (render the card for `role === 'parent'` behind `contractEnabled()`)
- Modify: `frontend/src/portal/components/NumericField.js` (one line: `aria-label={label}` on the `<input>`)
- Test: `frontend/src/portal/hooks/parentContract.test.js`, `components/ParentContractCard.test.js`, `screens/AthleteDetail.test.js` (one added test)

**Interfaces:**
- Consumes: `useContract`, `usePracticeLog` from `./index` (with `athleteId`); `RangeCalendarCard`, `DayGridLegend`, `LogSheet`, `DaySheet` (Task 8's `ContractSheets.js`), `Card`, `SectionLabel`, `Body`, `Button`, `SavedToast`; `contractEnabled`; `monthBounds`, `todayISO`.
- Produces:
  - `useParentContract(athleteId): { month: data|null, loading, error, logPractice({ minutes, date }), removeLog({ date }), ensureContractStart(), loggedToday: boolean, todayMinutes: number, required: number }` - composes `useContract({ athleteId })` and `usePracticeLog({ athleteId })`; calls `ensureContractStart()` itself once when `month.needsStart` (so the parent's first open stamps the kid)
  - `ParentContractCard({ athleteId, athleteName })` - a `Card large` titled `Commitment Contract` with `${required} min a day · Monday to Friday`, the state line (`month.state.line`), the `RangeCalendarCard` month grid (same props as `CommitmentContract.js` lines 180-194), `DaySheet` on a tapped day (`onAddLate`, `onRemove`), a `Log today · ${required} min` button (or `Logged today · ${todayMinutes} min` + `+ Add more`) opening `LogSheet`, `SavedToast` `Saved` for 1.6 s after a save; loading -> `SkeletonCard`; error -> `ErrorNotice title="Contract didn't load"`
  - `AthleteDetail` renders `<ParentContractCard athleteId={athleteId} athleteName={athlete?.name} />` directly under the login-status card when `role === 'parent' && contractEnabled()`
  - `NumericField({ label, ... })` renders its `<input>` with `aria-label={label}`. Today the label is a sibling `div` and the input has no accessible name, and `testRender.fill` looks the field up by `[aria-label="..."]`, so the card test's `r.fill('Minutes practiced', '15')` throws `no field "Minutes practiced"` (no existing test fills this input: `CommitmentContract.test.js` only finds the `Log today` button). One attribute, no visual change; `CommitmentContract`'s own `LogSheet` gets the label for free

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/portal/hooks/parentContract.test.js`:

```js
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const mockEnsure = jest.fn(async () => ({ athleteId: 'nico', minutes: 10 }));
const mockLog = jest.fn(async () => ({}));
const mockRemove = jest.fn(async () => ({}));
let mockContract;
jest.mock('./index', () => ({
  useContract: jest.fn(() => ({ data: mockContract, loading: false, error: null, ensureContractStart: mockEnsure })),
  usePracticeLog: jest.fn(() => ({ data: { loggedToday: true, todayMinutes: 12, contractMinutes: 10 }, totalMinutes: 12, logPractice: mockLog, removeLog: mockRemove })),
}));
import { useContract, usePracticeLog } from './index';
import { useParentContract } from './parentContract';

function mountHook(useHook) {
  const out = { current: null };
  function Probe() { out.current = useHook(); return null; }
  const root = createRoot(document.createElement('div'));
  return { out, render: async () => { await act(async () => { root.render(<Probe />); }); }, unmount: () => act(() => root.unmount()) };
}

beforeEach(() => { jest.clearAllMocks(); mockContract = { month: { start: '2026-11-01' }, tierMinutes: 10, required: 10, needsStart: true, state: { line: 'x' } }; });

test('threads the athleteId into both hooks, stamps once on needsStart, and forwards the writes', async () => {
  const h = mountHook(() => useParentContract('nico'));
  await h.render();
  await h.render();
  expect(useContract).toHaveBeenCalledWith({ athleteId: 'nico' });
  expect(usePracticeLog).toHaveBeenCalledWith({ athleteId: 'nico' });
  expect(mockEnsure).toHaveBeenCalledTimes(1);
  expect(h.out.current).toMatchObject({ required: 10, loggedToday: true, todayMinutes: 12 });
  await act(async () => { await h.out.current.logPractice({ minutes: 10, date: '2026-11-10' }); });
  expect(mockLog).toHaveBeenCalledWith({ minutes: 10, date: '2026-11-10' });
  await act(async () => { await h.out.current.removeLog({ date: '2026-11-10' }); });
  expect(mockRemove).toHaveBeenCalledWith({ date: '2026-11-10' });
  h.unmount();
});

test('no stamp when the kid is already stamped', async () => {
  mockContract = { ...mockContract, needsStart: false };
  const h = mountHook(() => useParentContract('nico'));
  await h.render();
  expect(mockEnsure).not.toHaveBeenCalled();
  h.unmount();
});
```

Create `frontend/src/portal/components/ParentContractCard.test.js`:

```js
import React from 'react';
import { renderScreen } from '../screens/testRender';

const mockLog = jest.fn(async () => ({}));
let mockValue;
jest.mock('../hooks', () => ({ useParentContract: () => mockValue, useSelfManaged: () => false }));
import ParentContractCard from './ParentContractCard';

beforeEach(() => {
  jest.useFakeTimers('modern'); jest.setSystemTime(new Date('2026-11-11T15:00:00'));
  mockValue = {
    month: { month: { start: '2026-11-01', label: 'November 2026', name: 'November' }, dayStates: { '2026-11-09': 'logged', '2026-11-10': 'missed', '2026-11-11': 'open' }, stats: { logged: 1 }, state: { kind: 'ontrack', line: '1 of 2 days due so far.' } },
    loading: false, error: null, logPractice: mockLog, removeLog: jest.fn(), ensureContractStart: jest.fn(), loggedToday: false, todayMinutes: 0, required: 10,
  };
});
afterEach(() => jest.useRealTimers());

test('the card shows the rule, the state line and logs today through the sheet', async () => {
  const r = await renderScreen(<ParentContractCard athleteId="nico" athleteName="Nico" />, { path: '/portal/athlete/nico' });
  expect(r.text()).toContain('10 min a day · Monday to Friday');
  expect(r.text()).toContain('1 of 2 days due so far.');
  await r.click('Log today · 10 min');
  expect(r.text()).toContain('10 min a day is the contract minimum, not a unit');
  await r.click('Enter minutes');
  await r.fill('Minutes practiced', '15');
  await r.click('Save · 15 min');
  await r.flush();
  expect(mockLog).toHaveBeenCalledWith({ minutes: 15, date: undefined });
  expect(r.text()).toContain('Saved');
  r.unmount();
});

test('logged today shows the total and offers more', async () => {
  mockValue = { ...mockValue, loggedToday: true, todayMinutes: 25 };
  const r = await renderScreen(<ParentContractCard athleteId="nico" athleteName="Nico" />, { path: '/portal/athlete/nico' });
  expect(r.text()).toContain('Logged today · 25 min');
  expect(r.button('+ Add more')).not.toBeNull();
  r.unmount();
});
```

Append to `frontend/src/portal/screens/AthleteDetail.test.js` (its hooks mock gains `useParentContract: () => ({ month: null, loading: true, error: null, logPractice: jest.fn(), removeLog: jest.fn(), ensureContractStart: jest.fn(), loggedToday: false, todayMinutes: 0, required: 20 })`):

```js
test('a parent sees the contract card only with the switch on; staff never do', async () => {
  delete process.env.REACT_APP_CONTRACT_ENABLED;
  const off = await renderScreen(<AthleteDetail bare athleteId="nico" role="parent" />, { path: '/portal/athlete/nico' });
  expect(off.text()).not.toContain('Commitment Contract');
  off.unmount();
  process.env.REACT_APP_CONTRACT_ENABLED = 'true';
  const on = await renderScreen(<AthleteDetail bare athleteId="nico" role="parent" />, { path: '/portal/athlete/nico' });
  expect(on.text()).toContain('Commitment Contract');
  on.unmount();
  const ops = await renderScreen(<AthleteDetail bare athleteId="nico" role="ops" />, { path: '/portal/athlete/nico' });
  expect(ops.text()).not.toContain('Commitment Contract');
  ops.unmount();
  delete process.env.REACT_APP_CONTRACT_ENABLED;
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/hooks/parentContract.test.js src/portal/components/ParentContractCard.test.js src/portal/screens/AthleteDetail.test.js`
Expected: FAIL - "Cannot find module './parentContract'", "./ParentContractCard"; the AthleteDetail case finds no `Commitment Contract` with the flag on.

- [ ] **Step 3: Write the implementation**

Create `hooks/parentContract.js`:

```js
/**
 * The parent's contract view of one child (owner, 2026-10-28; spec 4.3):
 * the same month and log hooks the athlete screen uses, with an explicit
 * athleteId, plus the one-time stamp on first open. Rules: a parent may
 * create, update and delete contractLogs for an athlete of their household
 * (firestore.rules contractLogs, logParentOwns).
 */
import { useEffect, useRef } from 'react';
import { useContract, usePracticeLog } from './index';

export function useParentContract(athleteId) {
  const contract = useContract({ athleteId });
  const log = usePracticeLog({ athleteId });
  const stamped = useRef(false);
  useEffect(() => {
    if (!contract.data?.needsStart || stamped.current) return;
    stamped.current = true;
    contract.ensureContractStart().catch(() => { stamped.current = false; });
  }, [contract.data?.needsStart]); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    month: contract.data ?? null, loading: contract.loading, error: contract.error,
    logPractice: log.logPractice, removeLog: log.removeLog, ensureContractStart: contract.ensureContractStart,
    loggedToday: Boolean(log.data?.loggedToday), todayMinutes: log.data?.todayMinutes || 0,
    required: contract.data?.required ?? log.data?.contractMinutes ?? 20,
  };
}
```

`hooks/index.js`: `export { useParentContract } from './parentContract';` beside the Task 4 re-export (the module imports from `./index`, which is a cycle React tolerates because every use is inside a function body; keep the import order: `parentContract.js` imports `./index`, `index.js` re-exports `./parentContract` at the bottom of its export block).

`components/ParentContractCard.js`: per the Interfaces; `const { month, loading, error, logPractice, removeLog, loggedToday, todayMinutes, required } = useParentContract(athleteId)`; `handleSaveLog = async (minutes) => { await logPractice({ minutes, date: logSheetDate ?? undefined }); setLogSheetDate(null); setToast(true); setTimeout(() => setToast(false), 1600); }`; the sheets are the Task 8 exports; `dayStates`, `onSelectDay`, `blankOutsideRange`, `gridKey` exactly as `CommitmentContract.js` lines 180-194.

`screens/AthleteDetail.js`: import `ParentContractCard` and `contractEnabled` (already imported); after the login-status card: `{role === 'parent' && contractEnabled() ? <ParentContractCard athleteId={athleteId} athleteName={athlete?.name} /> : null}`.

`components/NumericField.js`: add `aria-label={label}` to the `<input>` (beside `inputMode="decimal"`); nothing else changes.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/hooks/parentContract.test.js src/portal/components/ParentContractCard.test.js src/portal/screens/AthleteDetail.test.js`
Expected: PASS (2; 2; the file's existing tests plus 1).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/portal/hooks/parentContract.js frontend/src/portal/hooks/parentContract.test.js frontend/src/portal/hooks/index.js frontend/src/portal/components/ParentContractCard.js frontend/src/portal/components/ParentContractCard.test.js frontend/src/portal/components/NumericField.js frontend/src/portal/screens/AthleteDetail.js frontend/src/portal/screens/AthleteDetail.test.js
git commit -m "feat(contract): parents log for their kids

useParentContract composes the contract hooks with an explicit
athleteId; AthleteDetail shows the month calendar and Log today sheet
for a parent behind the contract switch.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: The Monday reminder function

**Files:**
- Create: `functions/portal/contract-checkins.js`
- Create: `functions/portal/contract-checkins.test.js`
- Modify: `functions/index.js` (header comment list; a new export after `tokenExpiryReminders`)
- Modify: `functions/test/check-exports.js` (`EXPECTED.mentalCheckinReminders: MAIL`; 17 -> 18 in the assert and both messages; the header comment)

**Interfaces:**
- Consumes: `./lib` (`todayISO`, `ageAt`, `membershipAllowsBooking`, `rows`), `./email` (`sendEmail`), `./secrets` (`MAIL_SECRETS`), `firebase-functions/v1`, `firebase-admin` (via `db` from `index.js`).
- Produces (`contract-checkins.js`, CommonJS, eslint-config-google clean):
  - `OVERDUE_DAYS = 14`
  - `dateOf(v): ?string` (same contract as the client's: an ISO string as written; a `Date` or Timestamp as its America/Chicago date through `lib.chicagoDate(new Date(ms))`, the client's `academyDateISO`)
  - `lastCheckinFor(athleteId, checkins): ?string`
  - `overdueAthletes({athletes, households, checkins, today, enabledAt}): !Array<{athleteId, name, age, lastCheckin, daysSince}>` - `athletes` are rows with `id`; `households` is `{[id]: doc}`; skips `household.test === true` and `!membershipAllowsBooking(household, athlete)` (the client's `onContract`, Task 2); otherwise the client rule; sorted `daysSince` desc then name
  - `reminderEmail(overdue, today): {subject, text}` - subject `Contract check-ins due · ${n} athlete${n === 1 ? '' : 's'}`; text lines: `Due for a check-in as of ${today}:`, blank, one line per athlete `- ${name} (age ${age ?? '?'}): ${lastCheckin ? `last check-in ${lastCheckin}` : 'never checked in'}, ${daysSince} days`, blank, `Open the board: https://portal.rypacademy.com/portal/mental/contract`
  - `remindMentalCheckins({db, sendEmail, today}): Promise<{status: 'off'|'none'|'sent'|'skipped'|'failed', overdue: number, to: ?string}>` - reads `config/contract` (`enabled !== true` -> `off`), `athletes`, `households`, `contractCheckins`, `users where role == 'mental'` (the first doc with a string `email`; none -> `skipped`, `to: null`), sends one email with `kind: 'mental-checkins'`
  - `index.js`: `exports.mentalCheckinReminders = functions.runWith({secrets: MAIL_SECRETS}).pubsub.schedule('0 8 * * 1').timeZone('America/Chicago').onRun(...)` calling `contractCheckins.remindMentalCheckins({db, today: lib.todayISO(new Date())})` inside the same try/catch shape as `tokenExpiryReminders`

- [ ] **Step 1: Write the failing test**

Create `functions/portal/contract-checkins.test.js`. It is linted (`functions/.eslintignore` excludes only `node_modules/` and `test/`, and eslint-config-google's `max-len` is 80 with URLs ignored), so every line below is at most 80 columns, as every existing `portal/*.test.js` is:

```js
/**
 * The Monday check-in reminder (spec 4.4, 8) with the stand-in Firestore.
 *   node portal/contract-checkins.test.js
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {test, run} = require('./tiny');
const {fakeDb} = require('./fake-firestore');
const cc = require('./contract-checkins');

const HH = {householdId: 'hh', packageId: 't-6'};
const ath = (id, name, dob, extra) =>
  Object.assign({id, name, dob}, HH, extra);
const base = () => ({
  'config/contract': {enabled: true, enabledAt: '2026-11-03'},
  'households/hh': {name: 'Whitfield family'},
  'households/hh-test': {name: 'RYP Test Family', test: true},
  'households/hh-due': {
    name: 'Late family', membership: {status: 'past_due'},
  },
  'users/mental': {role: 'mental', email: 'yannick@example.com'},
  'users/owner': {role: 'owner', email: 'owner@example.com'},
  'athletes/a': Object.assign({name: 'Ava', dob: '2012-01-01'}, HH),
  'athletes/b': Object.assign({name: 'Ben', dob: '2012-01-01'}, HH),
  'athletes/c': Object.assign({name: 'Cal', dob: '2017-09-09'}, HH),
  'athletes/d': Object.assign(
      {name: 'Dee', dob: '2012-01-01', createdAt: '2026-11-20'}, HH),
  'athletes/t': {name: 'Test Kid', dob: '2012-01-01', householdId: 'hh-test'},
  'athletes/p': {
    name: 'Pat', dob: '2012-01-01', householdId: 'hh-due', packageId: 't-6',
  },
  'athletes/u': Object.assign(
      {name: 'Uma', dob: '2012-01-01', billing: {status: 'pending'}}, HH),
  'contractCheckins/b_2026-11-09': {
    athleteId: 'b', weekStart: '2026-11-09', checkedIn: true, by: 'mental',
    at: '2026-11-12',
  },
  'contractCheckins/c_2026-11-09': {
    athleteId: 'c', weekStart: '2026-11-09', checkedIn: true, by: 'mental',
    at: '2026-11-10',
  },
});
const pick = (docs, prefix) => Object.entries(docs)
    .filter(([k]) => k.startsWith(prefix))
    .map(([k, v]) => Object.assign({id: k.slice(prefix.length)}, v));

test('overdueAthletes: the client cases plus the membership and ' +
    'test-family gates', () => {
  // never -> 22 days, 13 -> not, 15 -> overdue, createdAt counts; the test
  // family, a past_due household and pending billing are off the contract.
  const docs = base();
  const athletes = pick(docs, 'athletes/');
  const households = {};
  for (const h of pick(docs, 'households/')) households[h.id] = h;
  const checkins = pick(docs, 'contractCheckins/');
  const rows = cc.overdueAthletes({
    athletes, households, checkins, today: '2026-11-25',
    enabledAt: '2026-11-03',
  });
  assert.deepEqual(rows, [
    {athleteId: 'a', name: 'Ava', age: 14, lastCheckin: null, daysSince: 22},
    {athleteId: 'c', name: 'Cal', age: 9, lastCheckin: '2026-11-10',
      daysSince: 15},
  ]);
  assert.equal(cc.OVERDUE_DAYS, 14);
  const ava = [ath('a', 'Ava', '2012-01-01')];
  // 14 days exactly is not overdue; 15 is.
  assert.deepEqual(cc.overdueAthletes({
    athletes: ava, households, checkins: [], today: '2026-11-17',
    enabledAt: '2026-11-03',
  }), []);
  assert.equal(cc.overdueAthletes({
    athletes: ava, households, checkins: [], today: '2026-11-18',
    enabledAt: '2026-11-03',
  })[0].daysSince, 15);
  // No enabledAt: a never-checked-in athlete is never overdue.
  assert.deepEqual(cc.overdueAthletes({
    athletes: ava, households, checkins: [], today: '2026-11-25',
    enabledAt: null,
  }), []);
});

test('dateOf: a Timestamp is its America/Chicago date (an evening tap ' +
    'stays on its own day)', () => {
  assert.equal(cc.dateOf('2026-11-12'), '2026-11-12');
  assert.equal(cc.dateOf('2026-11-12T19:30:00.000Z'), '2026-11-12');
  // 01:00Z on Nov 11 is 7 PM Chicago on Nov 10 - the client reads it the
  // same way (contractBoard.test.js).
  const ts = {toMillis: () => Date.UTC(2026, 10, 11, 1)};
  assert.equal(cc.dateOf(ts), '2026-11-10');
  assert.equal(cc.dateOf(new Date(Date.UTC(2026, 10, 11, 23))), '2026-11-11');
  assert.equal(cc.dateOf(null), null);
  assert.equal(cc.dateOf(42), null);
  assert.equal(cc.lastCheckinFor('x', [
    {athleteId: 'x', weekStart: '2026-11-09', checkedIn: true, at: ts},
  ]), '2026-11-10');
});

test('the rule text matches the client module (CHANGE ONE, ' +
    'CHANGE BOTH)', () => {
  const src = fs.readFileSync(path.join(__dirname,
      '../../frontend/src/portal/data/contractBoard.js'), 'utf8');
  assert.match(src, /export const OVERDUE_DAYS = 14;/);
  assert.match(src, /daysSince > OVERDUE_DAYS/);
  // The on-contract gate: the client's onContract must read the same three
  // tests as lib.membershipAllowsBooking plus the test-household skip.
  assert.match(src, /export function onContract\(/);
  assert.match(src, /household\.test === true/);
  assert.match(src, /status === 'past_due' \|\| status === 'lapsed'/);
  assert.match(src, /billing\.oneTime === true/);
  assert.match(src, /billing\.status === 'active'/);
});

test('reminderEmail names each athlete', () => {
  const mail = cc.reminderEmail([
    {athleteId: 'a', name: 'Ava', age: 14, lastCheckin: null, daysSince: 22},
    {athleteId: 'c', name: 'Cal', age: 9, lastCheckin: '2026-11-10',
      daysSince: 15},
  ], '2026-11-30');
  assert.equal(mail.subject, 'Contract check-ins due · 2 athletes');
  assert.equal(mail.text, [
    'Due for a check-in as of 2026-11-30:', '',
    '- Ava (age 14): never checked in, 22 days',
    '- Cal (age 9): last check-in 2026-11-10, 15 days', '',
    'Open the board: https://portal.rypacademy.com/portal/mental/contract',
  ].join('\n'));
  const one = cc.reminderEmail([
    {name: 'Ava', age: null, lastCheckin: null, daysSince: 15},
  ], '2026-11-30');
  assert.equal(one.subject, 'Contract check-ins due · 1 athlete');
});

test('remindMentalCheckins: one email naming the overdue athletes',
    async () => {
  const mails = [];
  const sendEmail = async (m) => {
    mails.push(m);
    return {status: 'sent'};
  };
  const out = await cc.remindMentalCheckins({
    db: fakeDb(base()), sendEmail, today: '2026-11-25',
  });
  assert.deepEqual(out, {
    status: 'sent', overdue: 2, to: 'yannick@example.com',
  });
  assert.equal(mails.length, 1);
  assert.equal(mails[0].to, 'yannick@example.com');
  assert.equal(mails[0].kind, 'mental-checkins');
  assert.match(mails[0].text, /- Ava \(age 14\): never checked in, 22 days/);
  assert.match(mails[0].text, /- Cal \(age 9\)/);
  assert.doesNotMatch(mails[0].text, /Test Kid|Pat|Uma|Ben|Dee/);
});

test('remindMentalCheckins: zero overdue sends nothing', async () => {
  const mails = [];
  const docs = base();
  const checkedIn = (id) => ({
    athleteId: id, weekStart: '2026-11-16', checkedIn: true, by: 'mental',
    at: '2026-11-18',
  });
  docs['contractCheckins/a_2026-11-16'] = checkedIn('a');
  docs['contractCheckins/c_2026-11-16'] = checkedIn('c');
  const out = await cc.remindMentalCheckins({
    db: fakeDb(docs), sendEmail: async (m) => mails.push(m),
    today: '2026-11-25',
  });
  assert.deepEqual(out, {
    status: 'none', overdue: 0, to: 'yannick@example.com',
  });
  assert.equal(mails.length, 0);
});

test('remindMentalCheckins: the switch off sends nothing; no mental email ' +
    'skips', async () => {
  const mails = [];
  const send = async (m) => mails.push(m);
  const remind = (docs) => cc.remindMentalCheckins({
    db: fakeDb(docs), sendEmail: send, today: '2026-11-25',
  });
  const off = base();
  off['config/contract'] = {enabled: false, enabledAt: null};
  assert.deepEqual(await remind(off), {status: 'off', overdue: 0, to: null});
  const missing = base();
  delete missing['config/contract'];
  assert.equal((await remind(missing)).status, 'off');
  const noEmail = base();
  noEmail['users/mental'] = {role: 'mental', email: null};
  assert.deepEqual(await remind(noEmail), {
    status: 'skipped', overdue: 2, to: null,
  });
  assert.equal(mails.length, 0);
});

run();
```

Update `functions/test/check-exports.js`: add `mentalCheckinReminders: MAIL,` after `tokenExpiryReminders: MAIL,`; the deepEqual message gains `', mentalCheckinReminders'`; `assert.equal(Object.keys(EXPECTED).length, 18, '18 functions');`; the header comment adds `mentalCheckinReminders (Yannick's Monday reminder, 2026-10-28) - 18 in all`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd functions && node portal/contract-checkins.test.js` and `cd functions && node test/check-exports.js`
Expected: FAIL - "Cannot find module './contract-checkins'"; check-exports: the key lists differ (`mentalCheckinReminders` missing from index).

- [ ] **Step 3: Write the implementation**

Create `functions/portal/contract-checkins.js` (80-column lines, JSDoc on every function declaration, `@return`):

```js
/**
 * Yannick's Monday check-in reminder (spec 4.4, 2026-10-28).
 *
 * CHANGE ONE, CHANGE BOTH: the 14-day rule below is the client's
 * frontend/src/portal/data/contractBoard.js (overdueCheckins), duplicated
 * because Cloud Functions are CommonJS. contract-checkins.test.js reads that
 * file to keep the two in step. Who is on the contract: every athlete of a
 * household that is not test: true and whose membership allows booking, the
 * tokenExpiryReminders gate. The email goes straight to the users doc with
 * role 'mental' (email.sendEmail, the scholarship.js pattern); no ledger,
 * so a retried run on the same Monday sends again - accepted for one
 * weekly mail.
 */
'use strict';

const lib = require('./lib');
const email = require('./email');

const OVERDUE_DAYS = 14;
const BOARD_URL = 'https://portal.rypacademy.com/portal/mental/contract';
const DAY_MS = 86400000;

/**
 * @param {*} v An ISO string, a Date or a Timestamp.
 * @return {?string} 'YYYY-MM-DD' or null. A string is taken as written; a
 *     Date or Timestamp becomes its America/Chicago date (lib.chicagoDate,
 *     the client's academyDateISO), so a check-in tapped at 7 PM Chicago
 *     and stored past midnight UTC stays on its own day.
 */
function dateOf(v) {
  if (v == null) return null;
  if (typeof v === 'string') {
    return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
  }
  const ms = v instanceof Date ? v.getTime() :
      typeof v.toMillis === 'function' ? v.toMillis() : null;
  return ms == null || Number.isNaN(ms) ? null : lib.chicagoDate(new Date(ms));
}

/**
 * @param {string} fromISO
 * @param {string} toISO
 * @return {number} Whole days from `fromISO` to `toISO`.
 */
function daysBetween(fromISO, toISO) {
  const ms = (iso) => Date.UTC(...iso.split('-').map((n, i) =>
    (i === 1 ? Number(n) - 1 : Number(n))));
  return Math.round((ms(toISO) - ms(fromISO)) / DAY_MS);
}

/**
 * @param {string} athleteId
 * @param {!Array<!Object>} checkins contractCheckins rows.
 * @return {?string} The latest checked-in date (`at`, else `weekStart`).
 */
function lastCheckinFor(athleteId, checkins) {
  let latest = null;
  for (const c of checkins || []) {
    if (c.athleteId !== athleteId || c.checkedIn !== true) continue;
    const d = dateOf(c.at) || dateOf(c.weekStart);
    if (d && (!latest || d > latest)) latest = d;
  }
  return latest;
}

/**
 * @param {{athletes: !Array<!Object>, households: !Object,
 *     checkins: !Array<!Object>, today: string, enabledAt: ?string}} args
 * @return {!Array<{athleteId: string, name: string, age: ?number,
 *     lastCheckin: ?string, daysSince: number}>} Oldest first.
 */
function overdueAthletes(args) {
  const {athletes, households, checkins, today, enabledAt} = args;
  const since0 = dateOf(enabledAt);
  const out = [];
  for (const a of athletes || []) {
    const household = (households || {})[a.householdId] || null;
    // Who is on the contract: the client's onContract (contractBoard.js).
    if (household && household.test === true) continue;
    if (!lib.membershipAllowsBooking(household, a)) continue;
    const lastCheckin = lastCheckinFor(a.id, checkins);
    const created = dateOf(a.createdAt);
    const since = lastCheckin ||
        (since0 && created ? (since0 > created ? since0 : created) :
          since0 || created);
    if (!since) continue;
    const daysSince = daysBetween(since, today);
    if (daysSince <= OVERDUE_DAYS) continue;
    out.push({athleteId: a.id, name: a.name || a.id,
      age: lib.ageAt(a.dob, today), lastCheckin, daysSince});
  }
  return out.sort((x, y) => y.daysSince - x.daysSince ||
      String(x.name).localeCompare(String(y.name)));
}

/**
 * @param {!Array<!Object>} overdue overdueAthletes rows.
 * @param {string} today
 * @return {{subject: string, text: string}}
 */
function reminderEmail(overdue, today) {
  const n = overdue.length;
  const lines = [`Due for a check-in as of ${today}:`, ''];
  for (const r of overdue) {
    const last = r.lastCheckin ? `last check-in ${r.lastCheckin}` :
        'never checked in';
    lines.push(`- ${r.name} (age ${r.age == null ? '?' : r.age}): ${last}, ` +
        `${r.daysSince} days`);
  }
  lines.push('', `Open the board: ${BOARD_URL}`);
  const subject = `Contract check-ins due · ${n} athlete${n === 1 ? '' : 's'}`;
  return {subject, text: lines.join('\n')};
}

/**
 * @param {{db: !Object, sendEmail: (Function|undefined), today: string}} args
 * @return {!Promise<{status: string, overdue: number, to: ?string}>}
 */
async function remindMentalCheckins(args) {
  const {db, today} = args;
  const send = args.sendEmail || email.sendEmail;
  const cfg = await db.collection('config').doc('contract').get();
  const config = cfg.exists ? cfg.data() : null;
  if (!config || config.enabled !== true) {
    return {status: 'off', overdue: 0, to: null};
  }
  const [aSnap, hSnap, cSnap, uSnap] = await Promise.all([
    db.collection('athletes').get(),
    db.collection('households').get(),
    db.collection('contractCheckins').get(),
    db.collection('users').where('role', '==', 'mental').get(),
  ]);
  const households = {};
  for (const h of lib.rows(hSnap)) households[h.id] = h;
  const overdue = overdueAthletes({athletes: lib.rows(aSnap), households,
    checkins: lib.rows(cSnap), today, enabledAt: config.enabledAt || null});
  const user = lib.rows(uSnap).find((u) => typeof u.email === 'string' &&
      u.email.length > 0) || null;
  const to = user ? user.email : null;
  if (overdue.length === 0) return {status: 'none', overdue: 0, to};
  if (!to) return {status: 'skipped', overdue: overdue.length, to: null};
  const mail = reminderEmail(overdue, today);
  const sent = await send({to, subject: mail.subject, text: mail.text,
    kind: 'mental-checkins'});
  return {status: (sent && sent.status) || 'failed', overdue: overdue.length,
    to};
}

module.exports = {OVERDUE_DAYS, dateOf, lastCheckinFor, overdueAthletes,
  reminderEmail, remindMentalCheckins};
```

`functions/index.js`: `const contractCheckins = require('./portal/contract-checkins');` and `const lib = require('./portal/lib');` beside the `jobs` require (line 89; reuse `lib` if it is already required); after `tokenExpiryReminders` (line 394):

```js
/**
 * Yannick's check-in reminder (2026-10-28): Monday 08:00 America/Chicago,
 * one email to the role-'mental' user naming every athlete overdue for a
 * check-in; nothing while config/contract.enabled is false.
 */
exports.mentalCheckinReminders = functions
    .runWith({secrets: MAIL_SECRETS})
    .pubsub
    .schedule('0 8 * * 1')
    .timeZone('America/Chicago')
    .onRun(async () => {
      try {
        const out = await contractCheckins.remindMentalCheckins({
          db, today: lib.todayISO(new Date())});
        console.log('mentalCheckinReminders:', JSON.stringify(out));
      } catch (err) {
        console.error('mentalCheckinReminders error:', err);
      }
      return null;
    });
```

Header comment (lines 19-29): add `mentalCheckinReminders   Monday 08:00 America/Chicago (mental tools, 2026-10-28)`.

- [ ] **Step 4: Run tests to verify they pass; lint; additivity**

Run: `cd functions && node portal/contract-checkins.test.js && node test/check-exports.js && npx eslint .`
Expected: `7 passing`; `ok  18 functions exported, secrets bound per contract 6.4`; eslint clean (both new files are linted, `max-len` 80: `awk 'length($0) > 80' portal/contract-checkins.js portal/contract-checkins.test.js` prints nothing).

Run: `git diff origin/main -- functions/index.js | grep -E '^-\s*exports\.'`
Expected: no output (no export removed; `main`'s functions keep deploying - spec §7).

- [ ] **Step 5: Commit**

```bash
git add functions/portal/contract-checkins.js functions/portal/contract-checkins.test.js functions/index.js functions/test/check-exports.js
git commit -m "feat(functions): Monday check-in reminder for the mental coach

overdueAthletes (the client's 14-day rule, membership and test-family
gates) and one email to the role-mental user; off until
config/contract.enabled.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: The switch script, emulator seed, DATA-MODEL and the harness

**Files:**
- Create: `scripts/set-contract-flag.mjs`, `scripts/test/set-contract-flag.test.mjs`
- Modify: `scripts/seed-firestore.mjs` (Yannick's email; two past mental sessions and bookings; `mentalNotes/jordan/entries`; `contractCheckins`; `config/contract`; nico's contract logs)
- Modify: `docs/portal/DATA-MODEL.md`
- Modify: `frontend/src/portal/StatesHarness.js`

**Interfaces:**
- Consumes: `scripts/lib/firestore-rest.mjs` (`resolveTarget`, `getDoc`, `commit`, `docName`, `fsFields`).
- Produces (`set-contract-flag.mjs`):
  - `parseArgs(argv): { prod, on, dryRun, yes } | { error }` - exactly one of `--on | --off`, exactly one of `--dry-run | --yes`; anything else is `{ error }`
  - `enabledAtFor({ on, today, current }): string|null` - `null` when off; when on, the current doc's `enabledAt` if the doc is already `enabled: true` with a string `enabledAt`, else `today`. A second `--on` (a staging rehearsal, a re-run to be sure) must not move the date: `enabledAt` is the overdue clock for every never-checked-in athlete, and a new date would drop them all out of "Due for a check-in" and out of the email for another 14 days
  - `buildWrite({ on, today, current = null }): { update: { name, fields } }` - `config/contract` `{ enabled: on, enabledAt: enabledAtFor({ on, today, current }) }` (a full-document update, no mask, no precondition)
  - `main(argv, { today = chicagoToday() })` - prints `Target: ...`, the current doc (or `config/contract: not set`), the planned value (and `enabledAt kept: already on since 2026-11-10` when a re-run keeps it); `--dry-run` prints `Would write it. Run again with --yes instead of --dry-run.` and returns 0; `--yes` commits, reads back, prints `config/contract is now { enabled: true, enabledAt: '2026-11-10' }` and returns 0, or 1 when the read-back differs
- Produces (`seed-firestore.mjs`): `users/mental.email = 'yannick@example.com'`; sessions `cal-seedpast0001` (Tue two weeks before the run date, `6:00 PM`, type `mental`, source `calendly`, status `scheduled`, booked 1) and `cal-seedpast0002` (Thu last week, `6:00 PM`), bookings `jordan_cal-seedpast0001` (status `attended`) and `jordan_cal-seedpast0002` (`attended`), both with the Calendly booking shape of `reese_cal-seedevt0001`; `'mentalNotes/jordan/entries'` with `intake`, `cal-seedpast0001`, `cal-seedpast0002` (bodies from `data/seed.js` `mentalFixtures`, `createdBy`/`updatedBy` `'mental'`, `createdAt`/`updatedAt` the session evening); `contractCheckins` `jordan_<thisMonday>` and `nico_<lastMonday>`; `config/contract` `{ enabled: true, enabledAt: <14 days before the run date> }`; `contractLogs` for nico: 10 minutes on each weekday of last week and this week up to yesterday (`contractMinutes: 10`, `createdBy: 'parent-dana'`); jordan's existing logs keep `contractMinutes: 45` (history under the old tier)
- Produces (`DATA-MODEL.md`): Id-conventions rows for `mentalNotes/{athleteId}/entries`, `contractCheckins`, `config`; three `###` sections under Collections with field tables and `Rules probe: scripts/verify-rules.mjs taskMental`; the athletes `contractMinutes` row reads `10 | 20 | 45 | 90 | null` with a 2026-10-28 note (derived from age, stamped once, 45/90 legacy); the contractLogs section's `createdBy` note says a parent of the household may write, update and delete (2026-10-28) and `contractMinutes` is the requirement for that date
- Produces (`StatesHarness.js`): entries `MA` Mental Athletes (`MentalAthletes`, role mental), `MP` Mental Athlete (`MentalAthlete`, `{ athleteId: 'jordan' }` and `{ athleteId: 'nico' }`), `MN` Mental Note (`MentalNote`, `{ athleteId: 'jordan', entryId: 'intake' }` and `{ athleteId: 'jordan', entryId: 'cal-seed-b', sessionDate: <fixture> }`), `MC` Mental Contract (`MentalContract`, `{ role: 'mental' }` and `{ role: 'owner' }`); the 09 entry gains `['populated', 'Parent · contract on', { role: 'parent' }]`

- [ ] **Step 1: Write the failing test**

Create `scripts/test/set-contract-flag.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWrite, enabledAtFor, main, parseArgs } from '../set-contract-flag.mjs';
import { commit, docName, fsFields, getDoc, resolveTarget } from '../lib/firestore-rest.mjs';

test('parseArgs: exactly one of --on | --off and one of --dry-run | --yes', () => {
  assert.ok(parseArgs(['--on']).error);
  assert.ok(parseArgs(['--dry-run']).error);
  assert.ok(parseArgs(['--on', '--off', '--yes']).error);
  assert.ok(parseArgs(['--on', '--dry-run', '--yes']).error);
  assert.ok(parseArgs(['--on', '--dry-run', '--force']).error);
  assert.deepEqual(parseArgs(['--prod', '--on', '--dry-run']), { prod: true, on: true, dryRun: true, yes: false });
  assert.deepEqual(parseArgs(['--off', '--yes']), { prod: false, on: false, dryRun: false, yes: true });
});

test('buildWrite: enabled with the date on, enabled false with null off; a re-run keeps the date', () => {
  const on = buildWrite({ on: true, today: '2026-11-10' });
  assert.equal(on.update.name, docName('config', 'contract'));
  assert.deepEqual(on.update.fields, fsFields({ enabled: true, enabledAt: '2026-11-10' }));
  assert.equal(on.updateMask, undefined);
  assert.deepEqual(buildWrite({ on: false, today: '2026-11-10' }).update.fields, fsFields({ enabled: false, enabledAt: null }));
  // Already on: a second --on keeps enabledAt (the overdue clock), whatever today is.
  const again = buildWrite({ on: true, today: '2026-11-17', current: { enabled: true, enabledAt: '2026-11-10' } });
  assert.deepEqual(again.update.fields, fsFields({ enabled: true, enabledAt: '2026-11-10' }));
  assert.equal(enabledAtFor({ on: true, today: '2026-11-17', current: { enabled: true, enabledAt: '2026-11-10' } }), '2026-11-10');
  // Off, or on without a usable date: today.
  assert.equal(enabledAtFor({ on: true, today: '2026-11-17', current: { enabled: false, enabledAt: null } }), '2026-11-17');
  assert.equal(enabledAtFor({ on: true, today: '2026-11-17', current: { enabled: true, enabledAt: null } }), '2026-11-17');
  assert.equal(enabledAtFor({ on: true, today: '2026-11-17', current: null }), '2026-11-17');
  assert.equal(enabledAtFor({ on: false, today: '2026-11-17', current: { enabled: true, enabledAt: '2026-11-10' } }), null);
});

test('against the emulator: dry-run writes nothing, --yes writes and reads back, a second --on keeps enabledAt', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const t = await resolveTarget({ prod: false });
  await commit(t, [{ delete: docName('config', 'contract') }]).catch(() => {});
  assert.equal(await main(['--on', '--dry-run'], { today: '2026-11-10' }), 0);
  assert.equal(await getDoc(t, 'config', 'contract'), null);
  assert.equal(await main(['--on', '--yes'], { today: '2026-11-10' }), 0);
  assert.deepEqual(await getDoc(t, 'config', 'contract'), { enabled: true, enabledAt: '2026-11-10' });
  assert.equal(await main(['--on', '--yes'], { today: '2026-11-17' }), 0);
  assert.deepEqual(await getDoc(t, 'config', 'contract'), { enabled: true, enabledAt: '2026-11-10' });
  assert.equal(await main(['--off', '--yes'], { today: '2026-11-18' }), 0);
  assert.deepEqual(await getDoc(t, 'config', 'contract'), { enabled: false, enabledAt: null });
  assert.equal(await main(['--on', '--yes'], { today: '2026-11-19' }), 0);
  assert.deepEqual(await getDoc(t, 'config', 'contract'), { enabled: true, enabledAt: '2026-11-19' });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/test/set-contract-flag.test.mjs`
Expected: FAIL - "Cannot find module '.../scripts/set-contract-flag.mjs'".

- [ ] **Step 3: Write the implementation**

Create `scripts/set-contract-flag.mjs` on the `comp-booking.mjs` shape:

```js
/**
 * Flip the server-readable contract switch (spec 6): config/contract
 * { enabled, enabledAt }. The Monday reminder (mentalCheckinReminders)
 * sends nothing while enabled is false. The family-facing switch is still
 * REACT_APP_CONTRACT_ENABLED on Railway; the owner sets both.
 *
 *   node scripts/set-contract-flag.mjs --prod --on --dry-run
 *   node scripts/set-contract-flag.mjs --prod --on --yes      (the owner runs this one)
 *   node --env-file=scripts/emulator.mental.env scripts/set-contract-flag.mjs --on --yes
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { commit, docName, fsFields, getDoc, resolveTarget } from './lib/firestore-rest.mjs';

const chicagoToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());

export function parseArgs(argv) {
  const out = { prod: false, on: null, dryRun: false, yes: false };
  for (const a of argv) {
    if (a === '--prod') out.prod = true;
    else if (a === '--on') { if (out.on === false) return { error: 'Pass --on or --off, not both.' }; out.on = true; }
    else if (a === '--off') { if (out.on === true) return { error: 'Pass --on or --off, not both.' }; out.on = false; }
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--yes') out.yes = true;
    else return { error: `Unknown argument: ${a}` };
  }
  if (out.on == null) return { error: 'Pass --on or --off.' };
  if (out.dryRun === out.yes) return { error: 'Pass exactly one of --dry-run or --yes.' };
  return out;
}

/**
 * enabledAt is the overdue clock for every never-checked-in athlete (spec 4.4),
 * so a second --on (a rehearsal, a re-run to be sure) must NOT move it: keep
 * the stored date while the switch is already on; otherwise today; null off.
 */
export function enabledAtFor({ on, today, current }) {
  if (!on) return null;
  const kept = current && current.enabled === true && typeof current.enabledAt === 'string' ? current.enabledAt : null;
  return kept || today;
}

export function buildWrite({ on, today, current = null }) {
  return { update: { name: docName('config', 'contract'), fields: fsFields({ enabled: on, enabledAt: enabledAtFor({ on, today, current }) }) } };
}

export async function main(argv = process.argv.slice(2), { today = chicagoToday() } = {}) {
  const args = parseArgs(argv);
  if (args.error) { console.error(args.error); return 1; }
  const target = await resolveTarget({ prod: args.prod });
  console.log(`Target: ${target.label}${args.dryRun ? ' (dry run, nothing is written)' : ''}`);
  const current = await getDoc(target, 'config', 'contract');
  console.log(current ? `config/contract: ${JSON.stringify(current)}` : 'config/contract: not set');
  const enabledAt = enabledAtFor({ on: args.on, today, current });
  const next = { enabled: args.on, enabledAt };
  if (args.on && enabledAt !== today) console.log(`enabledAt kept: already on since ${enabledAt} (the overdue clock does not move on a re-run)`);
  console.log(`Planned: ${JSON.stringify(next)}`);
  if (args.dryRun) { console.log('Would write it. Run again with --yes instead of --dry-run.'); return 0; }
  await commit(target, [buildWrite({ on: args.on, today, current })]);
  const after = await getDoc(target, 'config', 'contract');
  const ok = after && after.enabled === next.enabled && (after.enabledAt ?? null) === next.enabledAt;
  console.log(ok ? `config/contract is now ${JSON.stringify(after)}` : `Read-back differs: ${JSON.stringify(after)}`);
  return ok ? 0 : 1;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main().then((c) => { process.exitCode = c; }, (e) => { console.error(e.message); process.exitCode = 1; });
```

`scripts/seed-firestore.mjs`: the fixtures per the Interfaces, added inside `buildDocs` beside the existing mental slots (L739-765), the Calendly session/booking (L817-866), contractLogs (L1047-1082) and users (L1112); the returned object (L1521-1540) gains `'mentalNotes/jordan/entries': mentalEntries, contractCheckins, config`. Past session dates: `isoDate` of the run date minus 14 and minus 5 days moved to the nearest earlier Tuesday/Thursday is not needed - use the exact offsets `-14` and `-5` days (any weekday is fine for a Calendly session). The seed's sanity summary (L1603-1822) prints `mental notes: 3, check-ins: 2, config/contract: enabled`.

`docs/portal/DATA-MODEL.md`: per the Interfaces, following the `scholarshipApplications` section format (L958-1009).

`StatesHarness.js`: per the Interfaces, each entry in the `SCREEN_STATES` shape of the `SD` entry (L319-324).

- [ ] **Step 4: Run tests to verify they pass; seed the mental emulator**

Run: `npx firebase-tools emulators:exec --config firebase.mental.json --only firestore --project rypacad "node --env-file=scripts/emulator.mental.env --test scripts/test/set-contract-flag.test.mjs"`
Expected: 3 passing (the emulator case not skipped).

Run: `node --test scripts/test/*.test.mjs`
Expected: every pure test passes; emulator-gated cases skip.

Run: `npx firebase-tools emulators:exec --config firebase.mental.json --only firestore --project rypacad "node --env-file=scripts/emulator.mental.env scripts/seed-firestore.mjs"`
Expected: the seeder prints its sanity summaries including `mental notes: 3, check-ins: 2, config/contract: enabled` and commits without error (it accepts `127.0.0.1:8081` as local).

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/screens/Mental`
Expected: PASS (the harness has no test of its own; Task 12's build compiles the new entries).

- [ ] **Step 5: Commit**

```bash
git add scripts/set-contract-flag.mjs scripts/test/set-contract-flag.test.mjs scripts/seed-firestore.mjs docs/portal/DATA-MODEL.md frontend/src/portal/StatesHarness.js
git commit -m "feat(mental): switch script, emulator seed, data model, harness

scripts/set-contract-flag.mjs (--on|--off, --dry-run|--yes); past
mental sessions, notes, check-ins and config/contract in the emulator
seed; DATA-MODEL for the new collections and contractMinutes 10;
harness entries for the four mental screens.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Gate

**Files:**
- No new files. Fix-ups only, committed as `fix(mental): gate fix-ups` if anything fails.

**Interfaces:**
- Consumes: everything above.
- Produces: a green branch ready for the session lead's browser QA and the merge into `develop`.

- [ ] **Step 1: Frontend suite, lint, build**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false`
Expected: every suite passes; no suite imports `RegistrationContract`, `CONTRACT_TIERS`, `TIER_MINUTES`, `useAthleteTier`.

Run: `cd frontend && npx eslint src/portal --max-warnings=0`
Expected: clean.

Run: `cd frontend && npm run build`
Expected: "Compiled successfully" (or compiled with only pre-existing warnings); the build output lists the four mental chunks.

- [ ] **Step 2: Functions tests and lint**

Run (from `functions/`): `for f in portal/*.test.js; do node "$f" || exit 1; done && node test/check-exports.js && npx eslint .`
Expected: every file prints `N passing` with no `FAIL`; `ok  18 functions exported`; eslint clean.

- [ ] **Step 3: Scripts and rules on the mental emulator**

Run: `node --test scripts/test/*.test.mjs`
Expected: pass (emulator cases skipped).

Run: `npx firebase-tools emulators:exec --config firebase.mental.json --only firestore --project rypacad "node --env-file=scripts/emulator.mental.env scripts/verify-rules.mjs"`
Expected: `ALL PASS (both passes)`.

Run: `npx firebase-tools emulators:exec --config firebase.mental.json --only firestore --project rypacad "node --env-file=scripts/emulator.mental.env scripts/seed-firestore.mjs && node --env-file=scripts/emulator.mental.env --test scripts/test/set-contract-flag.test.mjs"`
Expected: the seed commits; 3 passing.

- [ ] **Step 4: Backward compatibility with `main` (spec §7)**

Run: `git fetch origin main && git diff origin/main -- firestore.rules | grep -E '^-\s*allow'`
Expected: no output.

Run: `git diff origin/main -- functions/index.js | grep -E '^-\s*exports\.'`
Expected: no output.

Run: `git diff origin/main --stat -- firestore.rules functions/index.js functions/portal/family-validate.js firestore.indexes.json`
Expected: only additions in the rules, index.js and family-validate (the tier list widened), and `firestore.indexes.json` unchanged (Task 3 Step 4's query-shape check found no multi-field or filtered collection-group query; the emulator never enforces indexes, so a green emulator run was not the evidence).

- [ ] **Step 5: File sizes and worktree hygiene**

Run: `wc -l frontend/src/portal/data/contractRule.js frontend/src/portal/data/contractBoard.js frontend/src/portal/data/mentalNotes.js frontend/src/portal/hooks/mentalLive.js frontend/src/portal/hooks/mental.js frontend/src/portal/hooks/parentContract.js frontend/src/portal/components/mental/*.js frontend/src/portal/components/ContractSheets.js frontend/src/portal/components/ParentContractCard.js frontend/src/portal/screens/Mental*.js functions/portal/contract-checkins.js scripts/set-contract-flag.mjs`
Expected: every new file under 500 lines; `CommitmentContract.js` is shorter than before Task 8.

Run: `git status --short`
Expected: only `firebase.mental.json` and `scripts/emulator.mental.env` untracked (they stay untracked: local emulator isolation for this worktree, the session lead decides whether to commit or ignore them).

- [ ] **Step 6: Commit any fix-ups**

```bash
git add -A frontend/src/portal functions scripts docs firestore.rules firestore.indexes.json
git commit -m "fix(mental): gate fix-ups

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Then hand over to the session lead: branch `mental/tools` green; QA on the emulator (sign in as `mental` through `window.__rypTestAuth.signInAs('mental')` against the default ports, or the lead's own setup); the deploy and push order from Global Constraints.

---

## Decided here (not pinned by the spec or the recon; for the reviewer)

1. **Overdue clock for never-checked-in athletes.** `enabledAt` and the athlete's `createdAt` (absent on every production athlete today) with absent `createdAt` -> `enabledAt`; `households.signup.at` is not consulted. With no `enabledAt` a never-checked-in athlete is never overdue.
2. **Check-in date.** "Last check-in" is the America/Chicago date of the check-in doc's `at` (client `academyDateISO(new Date(ms))`, server `lib.chicagoDate`), falling back to `weekStart`; the week's doc id stays `athleteId_weekStart`. A UTC date would show a Tuesday-evening tap as Wednesday and move the 14-day boundary by a day for those athletes.
3. **`households.test`.** No such field exists on this branch; the job and the board treat `test === true` as excluded and absent as a real family (the assessments branch introduces the field). Because nothing here writes it, the release order (Global Constraints) has the owner confirm or stamp `test: true` on every production test household before `set-contract-flag.mjs --prod --on --yes`; if `mental/tools` merges after `assessments/v1.2`, the integrator verifies the field is present on those docs instead.
4. **Weekend logs** are ignored by the board's week summary (five weekday entries), matching `buildContractMonthFromLogs`; the seven dots draw Saturday and Sunday muted.
5. **Per-day requirement in the family calendar.** `buildContractMonthFromLogs` gains a function form of `contractMinutes` so a 12th birthday mid-month leaves earlier days alone (the spec's "changes nothing retroactively"); the stored per-log snapshot is still not consulted by the calendar.
6. **Stored 45/90 tiers.** Left in the database; every screen and every new log uses the derived value; `ensureContractStart` writes only when the stored value is null (the rules' `contractStart` condition), so a legacy 45/90 athlete never gets `contractStart` stamped and counts from the season start.
7. **Copy.** `20 min a day` replaces `20 min tier` everywhere (hooks, AthleteDetail subline, CommitmentContract header, LogSheet line, coach roster meta, parent card); `hideContractParts` hides the new phrase while the switch is off.
8. **Sign-up.** The contract step goes entirely (not hidden behind the flag): `STEPS` lose the row, `createFamily` receives `contractMinutes: null`; `family.js` therefore never stamps `contractStart` at sign-up.
9. **Mental bookings reads and indexes.** `fetchMentalBookings(athleteId)` filters `fetchBookings(athleteId)` client-side on `type` (no composite index); the Athletes list reads `where('type', '==', 'mental')` once; `fetchContractLogsBetween` is a single-field date range filtered client-side by athlete; `fetchCheckinsForAthletes` and `fetchAllHouseholds` read whole collections. No new index is needed, and that is established by inspecting the query shapes (Task 3 Step 4), not by the emulator: the Firestore emulator does not enforce composite indexes, so the spec's "if the emulator asks" (§9) can never fire and a green emulator run proves nothing about production. Any later multi-field or filtered collection-group query writes its index into `firestore.indexes.json` in the task that adds it.
10. **Note save semantics.** `saveMentalEntry` is a transaction (`tx.get` then `set` or `update`) rather than `setDoc(merge)`, so `createdAt`/`createdBy` are written exactly once and the update rule's `hasOnly(['body', 'sessionDate', 'updatedBy', 'updatedAt'])` holds.
11. **Note editor state machine.** `SLOW_SAVE_MS = 8000` (the assessments tracker's value) in `hooks/mental.js`; the editor keeps its own text and reads `initialBody` once; a failed save shows the error line and retries on the next change.
12. **Free note ids.** `free-` + 8 base-36 characters from `Math.random()`.
13. **Owner/ops entry to the board.** By URL only (`/portal/mental/contract`); no tab is added to the owner or ops sets.
14. **SpecialistDay's public coachNote chip** on the attendance screen is left as it is (spec 5.5: "Nothing else changes there"); the risk that clinical text lands in the public field is recorded for the owner.
15. **Email idempotency.** No ledger for the Monday mail (spec: "directly ... no new notification category"); a retried pubsub run on the same Monday would send twice.
16. **Email copy and the mental address.** Subject `Contract check-ins due · n athlete(s)`, plain-text lines per athlete, the board URL; the first `users` doc with `role == 'mental'` and a string `email` is the recipient; the emulator seed gives Yannick `yannick@example.com`.
17. **`config/contract` read rule** admits `coach`, `mental`, `ops`, `owner` and any `specialistId`; `--off` writes `enabledAt: null`.
18. **Board route roles** `['mental', 'ops', 'owner']`; the other three mental routes `['mental']`.
19. **Extra files beyond the lead's list.** `components/ContractSheets.js` (LogSheet/DaySheet extracted so the parent card can use them and `CommitmentContract.js` shrinks), `components/ParentContractCard.js`, `components/mental/SaveState.js`, `PortalRoutes.mental.test.js`, `screens/SpecialistDay.test.js`; `testRender.js` gains `rerender` and `act`.
20. **Seed fixture dates** are relative to the run date (`mentalFixtures(today)` in `data/seed.js`; offsets in `seed-firestore.mjs`), so the board always has a current week; tests pin `academyDateISO` to `2026-11-11`.
21. **Contract board "today"** is `academyDateISO()` (Chicago), not `todayISO()` (device), for both the board and the athlete page; the family screens keep `todayISO()` as today.
22. **The placeholder routes in Task 5** render `{null}` until Tasks 6 and 7 fill them, so the tab-bar routing test can pin the paths early.
23. **One on-contract gate, both sides.** Spec 4.4 says the board's "Due for a check-in" and the Monday email are the same list from the same pure function; the test-household and membership gates are therefore part of that function on the client too (`onContract` in `contractBoard.js`, a mirror of `lib.membershipAllowsBooking` plus the test skip, greped by `contract-checkins.test.js`), and `useContractBoard` reads `fetchAllHouseholds()` to feed it. An athlete the gate refuses is in no board group at all (the board is the contract board; the Athletes list still shows everyone). Without this, every test and pending athlete would pin to the top of "Due" for good while the email never named them.
24. **The note editor's key.** `MentalNote` keys `NoteEditor` on the route params, never on `entry`: the first save of a new note sets `entry`, and a key that flips then would remount the editor mid-sentence. `MentalContractRoute` waits for its own auth subscription like `SpecialistDayRoute` so an owner never sees the toggles for a frame. `set-contract-flag.mjs --on` keeps an existing `enabledAt` so a re-run never resets the overdue clock.
