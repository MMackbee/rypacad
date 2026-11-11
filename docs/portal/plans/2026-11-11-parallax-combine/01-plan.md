# Parallax Intake Swings and Combine Scores Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Coaches tick "Parallax intake swings" once per athlete from the training-session attendance screen and open a per-athlete Combine screen from the same row; athletes and parents add their own combine scores (four distances, 0 to 1000, every score kept) from the athlete home and the child's page.

**Architecture:** Two new subcollections under `athletes/{athleteId}`, `milestones/parallaxIntake` (create-only, one fixed id) and `combineScores/{autoId}` (create and delete, never update), guarded by an additive rules block nested in the athletes match and proven by `scripts/rules-probes/combine.mjs`. Every decision the UI makes (validation, copy, sorting, best and latest, who may tick, undo or delete, the exact write shapes) lives in one pure module, `data/combine.js`, which both UI lanes import. Firestore access sits in two new live files (`hooks/combineLive.js`, `hooks/parallaxLive.js`) that import from `hooks/live.js` (the `mentalConsentLive.js` pattern), with React hooks beside them (`hooks/combine.js`, `hooks/parallax.js`) that fall back to seed data when `isLive()` is false. New components go under `components/combine/`; the grandfathered files (`Roster.js`, `PortalRoutes.js`, `AthleteDashboard.js`) only gain the lines that mount them, and the route wrappers live in a new `CombineRoutes.js` (the `AssessmentRoutes.js` pattern).

**Tech Stack:** React 18 (CRA 5, plain JS), react-router-dom 6, firebase 9 modular SDK, jest via react-scripts (`renderScreen` from `screens/testRender.js`, no Testing Library), Firestore rules v2 probed over the emulator REST API (Node 22 ESM).

**Spec:** `docs/portal/plans/2026-11-11-parallax-combine/00-spec.md` (owner-approved 2026-11-11, "go with your recommendations"). Section numbers (§3, §4) refer to it. Points the spec left open are settled under "Decided here" at the end.

## Global Constraints

- Base: develop `94d7e4d`. Integration branch `feat/parallax-combine` in `C:\Users\Mac\Desktop\rypacadapp\wt-combine`. Lane branches and worktrees are set up in Task 2. The main checkout `C:\Users\Mac\Desktop\rypacadapp\rypacad` is never touched.
- Never push, never deploy, never pass `--prod`, never run anything against production, never touch `localhost:3000`, never print a `.env` file or any secret. `firebase.combine.json` is a lane-local config: never commit it.
- No real family names and no phone numbers in code, tests, fixtures, seed data or commit messages (public repo). Use the seed cast (`Jordan Whitfield`, `Dana`, `Sam Lee`, `Luke`) and probe names.
- Always write "Parallax intake swings" in full in the UI (`INTAKE_LABEL`), never "Parallax" alone: Phil's Parallax composite score is a different thing and stays untouched.
- Rules are purely additive (staging and production share one backend): `git diff 94d7e4d -- firestore.rules | grep -c '^-[^-]'` prints `0`. Never name a subcollection `entries` or `assessments` (the `{path=**}` rules at firestore.rules 1041 and 1050 would widen reads); never use or require `coachId`.
- No `firestore.indexes.json` change: subcollection reads are unfiltered `getDocs`/`getDoc`; all sorting happens client-side.
- Files stay under 500 lines. Grandfathered files gain only the lines named in their task: `screens/Roster.js` (955, ends at 966 or fewer), `PortalRoutes.js` (1175, ends at 1182 or fewer), `screens/AthleteDashboard.js` (508, ends at exactly 510). `hooks/index.js` and `hooks/live.js` are not edited at all.
- New hook files never import `hooks/index.js` or `hooks/useAuthSession.js` (screen tests mock both partially, so a missing export crashes the mounted card). The viewer comes from `live.js` `fetchCurrentUser()`.
- Lanes B and C never edit `data/combine.js`. A missing helper is written locally in the lane's own file and reported in the task's summary.
- Repo files are CRLF. Never use the Edit tool or `sed -i` on repo files. Existing files are edited with the anchored node script below; new files are written with the Write tool and then converted with `to-crlf.mjs`. Check every touched file with `file <path>` ("with CRLF line terminators") and `git diff --stat` (only the expected lines moved).

  `<scratchpad>/crlf-edit.mjs` (each lane writes it once into its own scratchpad, outside the repo):
  ```js
  // node crlf-edit.mjs <file> <edits.json>; edits: [{ "find": s, "replace": s } | { "after": s, "insert": s } | { "before": s, "insert": s }], LF strings
  import { readFileSync, writeFileSync } from 'node:fs';
  const [file, spec] = process.argv.slice(2);
  const raw = readFileSync(file, 'utf8');
  let text = raw.replace(/\r\n/g, '\n');
  for (const e of JSON.parse(readFileSync(spec, 'utf8'))) {
    const anchor = e.find ?? e.after ?? e.before;
    const n = text.split(anchor).length - 1;
    if (n !== 1) throw new Error(`${file}: anchor found ${n} times: ${anchor.slice(0, 80)}`);
    const out = e.find != null ? e.replace : e.after != null ? anchor + e.insert : e.insert + anchor;
    text = text.replace(anchor, () => out);
  }
  writeFileSync(file, raw.includes('\r\n') ? text.replace(/\n/g, '\r\n') : text);
  ```
  `<scratchpad>/to-crlf.mjs`: `for (const f of process.argv.slice(2)) { const t = readFileSync(f, 'utf8').replace(/\r?\n/g, '\r\n'); writeFileSync(f, t); }` (same imports).
- A code block nested under a list item carries the list's 4-space indent: strip those 4 spaces; what remains is the file's own indentation (the rules block at 6 spaces, the PortalRoutes route lines at 6, the Roster JSX at 16, like the `ClubheadChip` block above it).
- Commands (Bash, from the lane's worktree root):
  - one test file: `cd frontend && CI=true npx react-scripts test --watchAll=false <path under frontend/>`
  - all tests: `cd frontend && CI=true npx react-scripts test --watchAll=false`
  - lint: `cd frontend && npx eslint <changed files under src/> --max-warnings=0` (no output, exit 0)
  - build: `cd frontend && CI=true npm run build` (exit 0, no "Failed to compile")
  - rules: see Task 3 Step 4.
- Commits name their files (`git add <paths>`, never `-A`) and end with the trailer line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (pass it as a second `-m`).

## Shared contract

Every lane builds against these names. They are fixed here so B and C can start the moment Task 1 lands.

### Firestore

| Path | Fields (exactly these keys) | Writes | Reads |
|---|---|---|---|
| `athletes/{athleteId}/milestones/parallaxIntake` | `athleteId` (== path id), `at` (server time), `by` (uid), `byName` (string, 1..40) | create: role `coach` or `owner`, only when absent; update: never; delete: owner any time, `by` while `request.time < at + 10 min` | `coach`, `mental`, `ops`, `owner`, any account with a `specialistId` |
| `athletes/{athleteId}/combineScores/{autoId}` | `athleteId` (== path id), `distance` (`u100`/`u125`/`u150`/`u180`), `score` (int 0..1000), `date` (`YYYY-MM-DD`, not ahead of today, 60 days back at most), `enteredBy` (uid), `enteredRole` (== the writer's role), `createdAt` (server time) | create: `coach`, `owner`, the athlete's own login, a parent of the athlete's household; update: never; delete: `enteredBy` any time, owner | the athlete's own login, a parent of the household, `coach`, `mental`, `ops`, `owner`, any `specialistId` |

### `frontend/src/portal/data/combine.js` (Lane A, Task 1)

Constants:
- `COMBINE_DISTANCES = [{ id: 'u100', label: 'Under 100 yd' }, { id: 'u125', label: 'Under 125 yd' }, { id: 'u150', label: 'Under 150 yd' }, { id: 'u180', label: 'Under 180 yd' }]`
- `SCORE_MAX = 1000`, `COMBINE_DAYS_BACK = 60`, `SEED_COMBINE_ATHLETE_ID = 'jordan'`
- `INTAKE_LABEL = 'Parallax intake swings'`, `INTAKE_DOC_ID = 'parallaxIntake'`, `INTAKE_UNDO_MS = 600000`, `INTAKE_NAME_MAX = 40`
- Copy: `SCORE_ERROR = 'Enter a whole number from 0 to 1000.'`, `DATE_FUTURE_ERROR = 'Pick a date no later than today.'`, `DATE_OLD_ERROR = 'Pick a date in the last 60 days.'`, `DATE_MISSING_ERROR = 'Pick a date.'`, `COMBINE_SAVE_ERROR = 'Not saved. Check the connection and try again.'`, `COMBINE_DELETE_ERROR = 'Not deleted. Check the connection and try again.'`, `COMBINE_LOAD_ERROR = "The combine scores didn't load."`, `COMBINE_READ_ONLY_NOTE = 'Coaches, athletes and parents enter combine scores.'`, `COMBINE_EMPTY = 'No scores yet.'`, `NO_SCORE = 'No score yet'`, `DELETE_PROMPT = 'Delete this score?'`, `INTAKE_SAVE_ERROR = 'Not saved. Tap to try again.'`, `INTAKE_UNDO_LATE = 'Ten minutes have passed. Ask the owner to clear it.'`, `INTAKE_LOAD_ERROR = "Parallax intake swings didn't load."`

Functions (all pure):
- `distanceLabel(id: string) -> string` (unknown id: the id itself)
- `parseScore(text: string|number|null) -> { score: number|null, error: string|null }`
- `combineDateProblem(iso: string, today: string) -> string|null`
- `combineDateFloor(today: string) -> string` (today minus 60 days)
- `shortDay(iso: string) -> string` (`'2026-11-05'` -> `'Nov 5'`)
- `formatScore(n: number) -> string` (`'1000'`, never `'1,000'`)
- `roleWord(role) -> 'Coach'|'Owner'|'Athlete'|'Parent'|'Staff'`
- `combineEntryRole(role) -> 'coach'|'owner'|'athlete'|'parent'|null` (null: this role does not enter scores)
- `canDeleteScore(row, viewer: { uid, role }|null) -> boolean`
- `combineScoreDoc({ athleteId, distance, score, date, uid, role, stamp }) -> { athleteId, distance, score, date, enteredBy, enteredRole, createdAt }` (throws `Error` on an unknown distance, a score outside 0..1000 or not an integer, or a role `combineEntryRole` returns null for)
- `sortScores(rows) -> rows` (new array, newest first)
- `combineSummary(rows) -> { u100: { best, latest }, u125: {...}, u150: {...}, u180: {...} }` (each `row|null`)
- `bestIds(summary) -> string[]` (the ids of the best rows)
- `firstName(name) -> string|null`
- `intakeByName({ displayName, authName, role }) -> string`
- `intakeDoc({ athleteId, uid, byName, stamp }) -> { athleteId, at, by, byName }`
- `intakeDoneLine(milestone) -> string` (`'done Nov 12 · Luke'`, America/Chicago date of `at`)
- `canTickIntake(role, readOnly) -> boolean`
- `intakeUndo(milestone, viewer: { uid, role }|null, nowMs: number) -> 'undo'|'owner-clear'|null`

A score row is `{ id, athleteId, distance, score, date, enteredBy, enteredRole, createdAt }`; a milestone is `{ athleteId, at, by, byName }` (`at` a Firestore Timestamp, a Date or ms).

### Hooks

Lane B (`hooks/combineLive.js`, `hooks/combine.js`):
- `COMBINE_KEY = 'combineScores'` (the invalidation key), `combineStamp()`, `fetchCombineScores(athleteId) -> Promise<row[]>`, `createCombineScore(athleteId, body) -> Promise<string>` (new id), `deleteCombineScore(athleteId, scoreId) -> Promise<void>`
- `useCombine(athleteId, { fallbackName = null } = {}) -> { data: CombineView|null, loading, error, save({ distance, score, date }) -> Promise<void>, remove(scoreId) -> Promise<void> }` where `CombineView = { athlete: { id, name: string|null }, viewer: { uid, role }, canEnter: boolean, rows: row[] (sortScores), summary, best: string[] (bestIds), today: 'YYYY-MM-DD' (Chicago) }`
- `useCombineCard({ athleteId = null, practice = false } = {}) -> { data: { athleteId, summary }|null, loading, error }`

Lane C (`hooks/parallaxLive.js`, `hooks/parallax.js`):
- `INTAKE_KEY = 'milestones'`, `intakeStamp()`, `fetchIntake(athleteId) -> Promise<milestone|null>`, `createIntake(athleteId, body) -> Promise<{ status: 'done' } | { status: 'already', milestone }>`, `deleteIntake(athleteId) -> Promise<void>`
- `useParallaxIntakes(athleteIds: string[], { enabled = false } = {}) -> { data: { byAthlete: { [athleteId]: milestone|null }, viewer: { uid, role, byName } }|null, loading, error, tick(athleteId) -> Promise<'done'|'already'>, undo(athleteId) -> Promise<void> }`; `clearIntakeCache()` (tests)

### Routes and props

- `/portal/combine` (roles `athlete`): the signed-in athlete's own scores. `/portal/combine/:athleteId` (roles `parent`, `coach`, `mental`, `ops`, `owner`). Navigation state `{ name }` is the caller's name for the athlete. `CombineRoutes.js` exports `loadCombine` and `CombineRoute`.
- `screens/Combine.js`: `export default function Combine({ bare = false, athleteId, fallbackName = null, onBack })`.
- `SessionAttendance` (Roster.js) gains two props: `onOpenCombine(athleteId, name)` and `showIntake` (boolean, default `false`). `SessionAttendanceRoute` passes `showIntake` and `onOpenCombine={(athleteId, name) => navigate(\`/portal/combine/${athleteId}\`, { state: { name } })}`. Callers that pass neither (the harness, the existing tests) render and read exactly as today.
- `components/combine/CombineCard.js`: `export default function CombineCard({ athleteId = null, practice = false, to })`; navigates to `to` itself with `useNavigate`.
- `components/combine/TrainingRowExtras.js`: `export default function TrainingRowExtras({ athleteId, name, intakes, role, readOnly, onOpenCombine })`.

### Seed mode

- Combine seed athlete `jordan`; seed viewer `{ uid: 'coach-luke', role: 'coach' }`.
- Intake seed: the demo roster ids `r1`..`r6` (`data/seed.js` ROSTER); `r1` and `r4` ticked (`by: 'coach-luke', byName: 'Luke', at: new Date('2026-11-03T22:15:00Z')`), the rest not; seed viewer `{ uid: 'coach-luke', role: 'coach', byName: 'Luke' }`.

## Review Focus

1. **A double tap on Save stores two scores.** Ids are auto ids, so nothing dedupes a second create; a coach on a phone in a loud bay taps twice. Expect one row. Pinned in Task 5 Step 1 ("a double tap saves once": Save is disabled while its save is in flight).
2. **Saving one distance wipes what was typed in another.** `useSeedResource` blanks `data` to null on every reload, and a bump after each save reloads; a screen that renders "Loading…" for a null `data` unmounts all four blocks and loses their drafts. Expect the other blocks to keep their text. Pinned in Task 4 Step 1 (`data` stays the last view while a reload for the same athlete runs) and Task 5 Step 1 (an Under 125 yd draft survives an Under 100 yd save).
3. **The evening in Chicago.** From 6 PM CST the UTC date is already tomorrow: a date field defaulting to the UTC date is refused by the client's own "no later than today" check, and a "done" label from the UTC date says tomorrow. Expect Chicago dates everywhere. Pinned in Task 1 Step 1 (`intakeDoneLine` at `2026-11-13T03:00:00Z` reads `Nov 12`), Task 4 Step 1 (`data.today` at that instant is `'2026-11-12'`) and Task 3 (the rules accept the UTC today and 59 days back).
4. **Two coaches tick the same athlete, or one coach's screen is stale.** The second create lands on an existing doc, which the rules treat as an update and refuse. Expect the earlier tick to show ("done … · Luke"), not an error. Pinned in Task 8 Step 1 (`createIntake` turns that refusal into `{ status: 'already', milestone }`; the hook shows that milestone) and Task 3 Step 1 (a second coach's write over a tick is 403).
5. **Undo after the window, and the owner's mis-tap.** A coach's screen opened at minute 9 still offers the undo at minute 11, and the rules refuse it; the owner can clear any tick, including one made weeks ago by someone else, with one stray tap. Expect "Ten minutes have passed. Ask the owner to clear it." and an inline confirm for the owner. Pinned in Task 9 Step 1 (late copy on a permission-denied undo; the owner-clear confirm with Keep and Clear) and Task 3 Step 1 (an 11-minute-old tick: coach delete 403, owner delete 200).

## Lanes

| Lane | Worktree, branch | Tasks | Starts after |
|---|---|---|---|
| A rules-data | `wt-combine`, `feat/parallax-combine` | 1, then 3 | now |
| lead | `wt-combine` | 2, 11, 12 | Task 1 (Task 2); every lane (Task 11) |
| B combine-ui | `wt-combine-ui`, `feat/parallax-combine-ui` | 4, 5, 6, 7 | Task 2 |
| C roster | `wt-combine-roster`, `feat/parallax-combine-roster` | 8, 9, 10 | Task 2 |

No file is touched by two lanes. A: `data/combine.js`, `firestore.rules`, `scripts/verify-rules.mjs`, `scripts/rules-probes/combine.mjs`, `docs/portal/DATA-MODEL.md`. B: `hooks/combine*.js`, `screens/Combine*.js`, `components/combine/Combine{DistanceBlock,History,Card}*.js`, `CombineRoutes.js`, `PortalRoutes.js`, `PortalRoutes.combine.test.js`, `screens/AthleteDashboard*.js`, `screens/AthleteDetail*.js`. C: `hooks/parallax*.js`, `components/combine/{ParallaxTick,CombineButton,TrainingRowExtras}*.js`, `screens/Roster.js`, `screens/Roster.combine.test.js`.

---

### Task 1: Shared data helpers

LANE A. Depends on: none. Blocks Task 2.

**Files:**
- Create: `frontend/src/portal/data/combine.js`
- Test: `frontend/src/portal/data/combine.test.js`

**Interfaces:**
- Consumes: `msOf`, `monthDayLabel`, `shortDate` from `./mentalConsent`; `addDaysISO` from `./calendar`; `isoToMs`, `daysBetween` from `./assessmentWindows`.
- Produces: everything listed under "Shared contract, data/combine.js".

- [ ] **Step 1: Write the failing tests** in `data/combine.test.js`. The fixture every summary test uses:

```js
const at = (iso) => new Date(iso);
const ROWS = [
  { id: 'a', athleteId: 'jordan', distance: 'u100', score: 640, date: '2026-11-01', enteredBy: 'u-luke', enteredRole: 'coach', createdAt: at('2026-11-01T22:00:00Z') },
  { id: 'b', athleteId: 'jordan', distance: 'u100', score: 655, date: '2026-11-05', enteredBy: 'u-jordan', enteredRole: 'athlete', createdAt: at('2026-11-06T01:00:00Z') },
  { id: 'c', athleteId: 'jordan', distance: 'u100', score: 655, date: '2026-11-09', enteredBy: 'u-luke', enteredRole: 'coach', createdAt: at('2026-11-09T22:00:00Z') },
  { id: 'd', athleteId: 'jordan', distance: 'u100', score: 600, date: '2026-11-10', enteredBy: 'u-luke', enteredRole: 'coach', createdAt: null },
  { id: 'e', athleteId: 'jordan', distance: 'u150', score: 1000, date: '2026-11-10', enteredBy: 'u-dana', enteredRole: 'parent', createdAt: at('2026-11-10T20:00:00Z') },
];
```

Tests and assertions:
- `four distances, in order`: `COMBINE_DISTANCES` equals the contract array; `distanceLabel('u150') === 'Under 150 yd'`; `distanceLabel('x') === 'x'`.
- `parseScore takes whole numbers 0 to 1000 only`: `'742'` -> `{ score: 742, error: null }`; `' 0 '` -> 0; `'1000'` -> 1000; `742` (number) -> 742; each of `'', '  ', '1001', '-1', '742.5', '742.0', '7e2', '1,000', '74 2', 'abc', null, undefined, 742.5` -> `{ score: null, error: SCORE_ERROR }`.
- `combineDateProblem: today back to 60 days` with `today = '2026-11-12'`: `'2026-11-12'` null; `'2026-09-13'` null (60 days); `'2026-09-12'` `DATE_OLD_ERROR`; `'2026-11-13'` `DATE_FUTURE_ERROR`; `''`, `'2026-02-30'`, `'2026-11-5'` `DATE_MISSING_ERROR`. `combineDateFloor('2026-11-12') === '2026-09-13'`.
- `shortDay and formatScore`: `shortDay('2026-11-05') === 'Nov 5'`; `formatScore(1000) === '1000'`; `formatScore(0) === '0'`.
- `role words and who enters`: `roleWord` maps coach, owner, athlete, parent to `Coach`, `Owner`, `Athlete`, `Parent`, anything else to `Staff`; `combineEntryRole` returns the same four ids and `null` for `mental`, `ops`, `null`.
- `canDeleteScore`: row `a` with viewer `{ uid: 'u-luke', role: 'coach' }` true; row `b` with that viewer false; row `b` with `{ uid: 'owner', role: 'owner' }` true; any row with `null` false.
- `combineScoreDoc is the seven keys`: `combineScoreDoc({ athleteId: 'jordan', distance: 'u125', score: 700, date: '2026-11-10', uid: 'u-dana', role: 'parent', stamp: 'NOW' })` `toEqual({ athleteId: 'jordan', distance: 'u125', score: 700, date: '2026-11-10', enteredBy: 'u-dana', enteredRole: 'parent', createdAt: 'NOW' })`; it throws for `role: 'ops'`, `distance: 'u200'`, `score: 1001`, `score: 7.5`.
- `newest first`: `sortScores(ROWS).map((r) => r.id)` equals `['d', 'e', 'c', 'b', 'a']` (same date: a missing `createdAt` counts as newest); the input array is not mutated.
- `best and latest per distance`: `combineSummary(ROWS).u100` has `best.id === 'b'` (a tie goes to the earlier date) and `latest.id === 'd'`; `u150` best and latest `'e'`; `u125` and `u180` are `{ best: null, latest: null }`; `bestIds(combineSummary(ROWS))` equals `['b', 'e']`.
- `first names`: `firstName('Luke Smith') === 'Luke'`; `firstName('  Dana ') === 'Dana'`; `firstName('')`, `firstName(null)` null; `firstName('x'.repeat(50)).length === 40`. `intakeByName({ displayName: null, authName: 'Pat Lee', role: 'owner' }) === 'Pat'`; all names null: `'Owner'` for role owner, `'Coach'` for coach.
- `intakeDoc is the four keys`: `intakeDoc({ athleteId: 'jordan', uid: 'u-luke', byName: 'Luke', stamp: 'NOW' })` `toEqual({ athleteId: 'jordan', at: 'NOW', by: 'u-luke', byName: 'Luke' })`.
- `the done line is the Chicago date` (Review Focus 3): `intakeDoneLine({ at: at('2026-11-12T23:30:00Z'), byName: 'Luke' }) === 'done Nov 12 · Luke'`; `at('2026-11-13T03:00:00Z')` also `'done Nov 12 · Luke'`; a Timestamp-like `{ toMillis: () => Date.parse('2026-11-12T23:30:00Z') }` the same; `at: null` gives `'done · Luke'`.
- `who ticks`: `canTickIntake('coach', false)` and `('owner', false)` true; `('coach', true)`, `('mental', false)`, `('ops', false)` false.
- `undo inside ten minutes, the owner after` with `T = Date.parse('2026-11-12T22:00:00Z')`, `m = { at: new Date(T), by: 'u-luke', byName: 'Luke' }`: `intakeUndo(m, { uid: 'u-luke', role: 'coach' }, T + 599999) === 'undo'`; at `T + 600000` null; `{ uid: 'owner', role: 'owner' }` at `T + 86400000` `'owner-clear'`; an owner who ticked it, inside the window, `'undo'`; another coach null; `intakeUndo(null, ...)` null.

- [ ] **Step 2: Run the tests to verify they fail**
Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/data/combine.test.js`
Expected: FAIL, "Cannot find module './combine'".

- [ ] **Step 3: Implement `data/combine.js`** with the contract's names. `parseScore` accepts a number that is an integer in range, or a string that is `/^\d+$/` after `trim()` and at most 1000. `combineDateProblem` returns `DATE_MISSING_ERROR` when `isoToMs(iso)` is null, else uses `daysBetween(iso, today)`: below 0 future, above 60 old. Sorting keys: `date` descending, then `msOf(createdAt)` descending with null as `Infinity`, then `id` descending. Best: highest `score`, ties to the earlier `date`, then the earlier `createdAt`. `intakeDoneLine` uses `shortDate(at)` from `./mentalConsent` (Chicago). `intakeUndo` is `'undo'` when `milestone.by === viewer.uid` and `nowMs < msOf(at) + INTAKE_UNDO_MS`, else `'owner-clear'` for role owner, else null.

- [ ] **Step 4: Run the tests to verify they pass**
Run: the Step 2 command. Expected: PASS, every test green. Then `cd frontend && npx eslint src/portal/data/combine.js src/portal/data/combine.test.js --max-warnings=0` (no output).

- [ ] **Step 5: CRLF and commit**
`node <scratchpad>/to-crlf.mjs frontend/src/portal/data/combine.js frontend/src/portal/data/combine.test.js`, `file` both (CRLF), then:
```bash
git add frontend/src/portal/data/combine.js frontend/src/portal/data/combine.test.js
git commit -m "feat(combine): data helpers for combine scores and Parallax intake swings" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Lane worktrees

LANE lead. Depends on: Task 1 committed on `feat/parallax-combine`.

**Files:** none in the repo. Local only: two worktrees, their `node_modules` junctions and `.env` copies.

**Interfaces:**
- Produces: `wt-combine-ui` (Lane B) and `wt-combine-roster` (Lane C), both at the Task 1 commit.

- [ ] **Step 1: Create the worktrees** (PowerShell):
```powershell
git -C C:\Users\Mac\Desktop\rypacadapp\wt-combine worktree add C:\Users\Mac\Desktop\rypacadapp\wt-combine-ui -b feat/parallax-combine-ui
git -C C:\Users\Mac\Desktop\rypacadapp\wt-combine worktree add C:\Users\Mac\Desktop\rypacadapp\wt-combine-roster -b feat/parallax-combine-roster
foreach ($w in 'wt-combine-ui','wt-combine-roster') {
  New-Item -ItemType Junction -Path "C:\Users\Mac\Desktop\rypacadapp\$w\frontend\node_modules" -Target C:\Users\Mac\Desktop\rypacadapp\rypacad\frontend\node_modules | Out-Null
  Copy-Item C:\Users\Mac\Desktop\rypacadapp\wt-combine\frontend\.env "C:\Users\Mac\Desktop\rypacadapp\$w\frontend\.env"
}
```
Never print the `.env`. Lanes B and C need no emulator (jest only).

- [ ] **Step 2: Verify**
Run: `git -C C:\Users\Mac\Desktop\rypacadapp\wt-combine-ui log --oneline -1` and the same for `wt-combine-roster`.
Expected: both print the Task 1 commit. `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/data/combine.test.js` passes in each.

---

### Task 3: Rules, rules probes and the data model

LANE A. Depends on: Task 1 (same worktree, no code dependency).

**Files:**
- Modify: `firestore.rules` (insert inside `match /athletes/{athleteId}`, after the `assessmentProfile` block, before its closing brace at line 977)
- Create: `scripts/rules-probes/combine.mjs`
- Modify: `scripts/verify-rules.mjs` (one import, one call, one export name)
- Modify: `docs/portal/DATA-MODEL.md` (two id-convention rows, two sections)

**Interfaces:**
- Consumes: `call, commitAs, createAs, del, expect, listUnderAs, patchWrite, seed, t, token, uid` from `../verify-rules.mjs`; the global probe fixtures `ath-active` (household `hh`), `ath-other` (`hh-other`), `ath-absent`, `ath-pending`, `ath-elite`, `ath-elite-pending`, and the tokens `t.coach` (`coach-probe`), `t.parent` (`hh`), `t.other` (`hh-other`), `t.athlete` (login of `ath-active`), `t.ops`, `t.stranger`.
- Produces: `export async function taskCombine()`; the rules the contract table states.

- [ ] **Step 1: Write the failing probe** `scripts/rules-probes/combine.mjs`. It seeds its own users at the start and deletes them, and every doc it wrote, in a `finally`: `cb-owner` `{ role: 'owner' }`, `cb-mental` `{ role: 'mental', specialistId: 'mental' }`, `cb-phil` `{ role: 'coach', specialistId: 'phil' }`, `cb-coach2` `{ role: 'coach' }`, each with `token(id, { email: '<id>@example.com', email_verified: true })`. Helpers: `MS = (a) => \`athletes/${a}/milestones\``, `CS = 'athletes/ath-active/combineScores'`, `intake(a, by, byName = 'Luke', extra = {})`, `score(by, role, extra = {})` (athleteId `ath-active`, distance `u100`, score 742, date = the UTC today), `utcDay(n)` = the UTC date `n` days back, `getAs(auth, path)` = `call('GET', path, null, auth)` status, `delAs(auth, path)` = `call('DELETE', path, null, auth)` status. Writes go through `createAs(auth, col, id, fields, ['at'])` (milestones) or `['createdAt']` (scores), so the server time is `REQUEST_TIME` like the client's `serverTimestamp()`.

  Milestone cases (`want` in brackets):
  - coach ticks `ath-active` [200]; `cb-coach2` writes over it with `commitAs(coach2, [patchWrite(MS('ath-active'), 'parallaxIntake', <all four fields>, <all four keys>, ['at'])])` [403]; `cb-coach2` deletes it [403]; the coach deletes it (inside ten minutes) [200].
  - owner ticks `ath-other` [200]; Phil ticks `ath-elite` [200].
  - on `ath-absent`: mental, ops, the parent, the athlete login each tick [403]; the coach with `at` a client time one minute ago and no transform [403]; `by` another uid [403]; `byName: ''` [403]; `byName` 41 characters [403]; an extra key `note` [403]; no `byName` key [403]; `athleteId: 'ath-other'` [403]; doc id `parallaxSwings` [403].
  - `byName` exactly 40 characters on `ath-pending` [200].
  - reads of `ath-other`'s tick: coach, mental, ops, owner, Phil [200]; `t.other` (that athlete's own household parent) [403]; `t.athlete` reading `ath-active`'s path [403]; stranger [403]; the coach's get of the missing `ath-absent` tick [404].
  - an old tick: `seed(MS('ath-elite-pending'), 'parallaxIntake', { athleteId: 'ath-elite-pending', at: new Date(Date.now() - 11 * 60000), by: uid.coach, byName: 'Luke' })`; the coach deletes it [403]; the owner deletes it [200].

  Score cases on `CS` (ids `cb-coach`, `cb-owner`, `cb-phil`, `cb-athlete`, `cb-parent`, then one id per case):
  - coach, owner, Phil (`enteredRole 'coach'`), `t.athlete` (`'athlete'`), `t.parent` (`'parent'`) enter [200 each].
  - `t.other` with `'parent'` [403]; `t.athlete` on `athletes/ath-other/combineScores` [403]; ops with `'ops'` [403]; mental with `'mental'` [403]; stranger [403].
  - coach with `enteredRole: 'owner'` [403]; `enteredBy` another uid [403]; `createdAt` a client time [403].
  - distances `u125`, `u150`, `u180` [200]; `u200`, `U100`, `''` [403].
  - scores 0 and 1000 [200]; 1001, -1, 742.5 (`doubleValue`), `'742'` [403].
  - dates: `utcDay(0)` and `utcDay(59)` [200]; `utcDay(-1)` (tomorrow, UTC) and `utcDay(63)` [403]; `utcDay(0).slice(0, 8) + '32'` [403]; `'2026-11-5'` [403].
  - an extra key `note` [403]; no `date` key [403]; `athleteId: 'ath-other'` [403].
  - update `cb-phil` to score 800 with `patchWrite` as the coach [403] and as the owner [403].
  - deletes: parent deletes `cb-parent` [200]; parent deletes `cb-coach` [403]; `cb-coach2` deletes `cb-coach` [403]; coach deletes `cb-coach` [200]; owner deletes `cb-athlete` [200].
  - lists: `listUnderAs(auth, 'athletes/ath-active', 'combineScores')` as `t.athlete`, `t.parent`, coach, mental, ops, owner, Phil [200]; as `t.other` and stranger [403]; `t.athlete` on `'athletes/ath-other'` [403].

  Register it in `scripts/verify-rules.mjs` with `crlf-edit.mjs`: `after` `import { taskTourBrackets } from './rules-probes/tour-brackets.mjs';\n` insert `import { taskCombine } from './rules-probes/combine.mjs';\n`; `after` `    await taskTourBrackets();\n` insert `    await taskCombine();\n`; `find` `commitAs, bookAs, listAs, expect, token` `replace` `commitAs, bookAs, listAs, listUnderAs, expect, token`.

- [ ] **Step 2: Start the lane emulator and run the probe to verify it fails**
Start (background, from `wt-combine`): `npx firebase-tools emulators:start --only auth,firestore --project demo-rules-probe --config firebase.combine.json`. Wait for "All emulators ready".
verify-rules reads `FIRESTORE_EMULATOR_HOST` from the environment through `localEmulatorHost()`; `scripts/emulator.env` sets `127.0.0.1:8080`, and `node --env-file` never overrides a variable already set (checked on Node 22.17.1), so set it on the command:
Run: `FIRESTORE_EMULATOR_HOST=127.0.0.1:8084 node --env-file=scripts/emulator.env scripts/verify-rules.mjs` (PowerShell: `$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8084'; node --env-file=scripts/emulator.env scripts/verify-rules.mjs`).
Expected: FAIL lines in the combine section (every 200 case answers 403: no rule matches yet); last line `N FAILED`.

- [ ] **Step 3: Add the rules** with `crlf-edit.mjs`: `before` `    }\n\n    // ---- diagnostics collection-group read` insert:

```
      // ---- athletes/{id}/milestones/parallaxIntake (2026-11-11) -------
      // Parallax intake swings (plans/2026-11-11-parallax-combine spec 3):
      // one fixed doc per athlete, so "once" is create-only. A coach (Phil
      // included) or the owner ticks it; nobody updates it; the owner clears
      // it any time, whoever ticked it within ten minutes (a mis-tap). Staff
      // read it; families do not. Not a field on the athlete doc: families
      // read that doc and coaches have no write branch on it. Additive.
      match /milestones/{milestoneId} {
        function intakeShapeOk() {
          let d = request.resource.data;
          return milestoneId == 'parallaxIntake'
            && d.keys().hasAll(['athleteId', 'at', 'by', 'byName'])
            && d.keys().hasOnly(['athleteId', 'at', 'by', 'byName'])
            && d.athleteId == athleteId
            && d.at == request.time
            && d.by == request.auth.uid
            && d.byName is string && d.byName.size() >= 1 && d.byName.size() <= 40;
        }
        allow read: if signedIn() && (
          me().role in ['coach', 'mental', 'ops', 'owner']
          || me().get('specialistId', null) != null
        );
        allow create: if signedIn() && me().role in ['coach', 'owner'] && intakeShapeOk();
        allow delete: if signedIn() && (
          me().role == 'owner'
          || (resource.data.by == request.auth.uid
              && request.time < resource.data.at + duration.value(10, 'm'))
        );
      }

      // ---- athletes/{id}/combineScores/{autoId} (2026-11-11) ----------
      // Combine scores (spec 4): every attempt kept, auto ids. A coach or the
      // owner enters for any athlete, the athlete's own login and a parent
      // of the household for that athlete; nobody updates (a wrong score is
      // deleted and re-entered); whoever entered it and the owner delete.
      // Never named 'entries' or 'assessments' (the collection-group reads
      // below would widen). Additive.
      match /combineScores/{scoreId} {
        function combineKeys() {
          return ['athleteId', 'distance', 'score', 'date', 'enteredBy', 'enteredRole', 'createdAt'];
        }
        // Not ahead of today, at most 60 days back. Rules see UTC only: the
        // date's UTC midnight has passed (a Chicago today's always has), and
        // 62 days covers 60 Chicago days plus the time zone (recentDate's
        // slack). An invalid date errors and is refused. data/combine.js
        // combineDateProblem is exact.
        function combineDateOk(s) {
          let p = s.split('-');
          let day = timestamp.date(int(p[0]), int(p[1]), int(p[2]));
          return day <= request.time && day > request.time - duration.value(62, 'd');
        }
        function combineShapeOk() {
          let d = request.resource.data;
          return d.keys().hasAll(combineKeys()) && d.keys().hasOnly(combineKeys())
            && d.athleteId == athleteId
            && d.distance in ['u100', 'u125', 'u150', 'u180']
            && d.score is int && d.score >= 0 && d.score <= 1000
            && isoDate(d.date) && combineDateOk(d.date)
            && d.enteredBy == request.auth.uid
            && d.enteredRole == me().role
            && d.createdAt == request.time;
        }
        function combineFamilyOk() {
          return (me().role == 'athlete' && me().athleteId == athleteId)
            || (me().role == 'parent' && athleteData(athleteId).householdId == me().householdId);
        }
        allow read: if signedIn() && (
          me().role in ['coach', 'mental', 'ops', 'owner']
          || me().get('specialistId', null) != null
          || combineFamilyOk()
        );
        allow create: if signedIn() && (me().role in ['coach', 'owner'] || combineFamilyOk()) && combineShapeOk();
        allow delete: if signedIn() && (me().role == 'owner' || resource.data.enteredBy == request.auth.uid);
      }
```

- [ ] **Step 4: Run the probe to verify it passes**
Run: the Step 2 command (the running emulator reloads `firestore.rules` on save; verify-rules also loads the file itself through the rules-load endpoint).
Expected: every line PASS; last line `ALL PASS (both passes)`. Then `git diff 94d7e4d -- firestore.rules | grep -c '^-[^-]'` prints `0`.

- [ ] **Step 5: The data model** with `crlf-edit.mjs` on `docs/portal/DATA-MODEL.md`: `before` ``| `assessmentSettings` | `current` |`` insert two id-convention rows: ``| `athletes/{athleteId}/milestones` | `parallaxIntake` | **2026-11-11.** Parallax intake swings, once per athlete by construction (create-only). See [below](#athletesathleteidmilestonesparallaxintake-2026-11-11). |`` and ``| `athletes/{athleteId}/combineScores` | auto id | **2026-11-11.** Every combine attempt, kept; never updated. See [below](#athletesathleteidcombinescoresautoid-2026-11-11). |``; `before` `### Billing rows (derived, no new collection)` insert two sections, `### \`athletes/{athleteId}/milestones/parallaxIntake\` (2026-11-11)` and `### \`athletes/{athleteId}/combineScores/{autoId}\` (2026-11-11)`, each with the fields, writers, readers and delete rule from the contract table, the reads (one `getDoc` per attendance row on training sessions; one unfiltered `getDocs` per athlete, sorted client-side, no index), "no seed", and the probe (`scripts/rules-probes/combine.mjs` `taskCombine`).

- [ ] **Step 6: Commit**
`file` the four files (CRLF), then:
```bash
git add firestore.rules scripts/verify-rules.mjs scripts/rules-probes/combine.mjs docs/portal/DATA-MODEL.md
git commit -m "feat(combine): rules for Parallax intake swings and combine scores, with probes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Leave the emulator running only if Task 11 follows in this session; otherwise stop it (its own PID, never `taskkill /IM node.exe`).

---

### Task 4: Combine adapter and hooks

LANE B. Depends on: Task 2.

**Files:**
- Create: `frontend/src/portal/hooks/combineLive.js`, `frontend/src/portal/hooks/combine.js`
- Test: `frontend/src/portal/hooks/combineLive.test.js`, `frontend/src/portal/hooks/combine.test.js`

**Interfaces:**
- Consumes: `ERR, LiveDataError, wrap, requireUser, isLive, fetchCurrentUser, fetchAthlete` from `./live`; `bump, useInvalidation` from `./invalidate`; `useSeedResource`; from `../data/combine`: `combineScoreDoc, combineEntryRole, sortScores, combineSummary, bestIds, SEED_COMBINE_ATHLETE_ID`; `academyDateISO, addDaysISO` from `../data/calendar`.
- Produces: the Lane B hook names in the Shared contract; `seedCombineRows(athleteId, today) -> row[]` and `SEED_COMBINE_VIEWER = { uid: 'coach-luke', role: 'coach' }` (exported for tests).

- [ ] **Step 1: Write the failing tests.**
`combineLive.test.js` mocks `../../firebase` (`{ auth: { currentUser: { uid: 'u-luke' } }, db: {} }`), `firebase/firestore` (`collection`, `doc` returning `{ path }` like `mentalConsentLive.test.js`, `getDocs`, `addDoc`, `deleteDoc`, `serverTimestamp: () => 'NOW'`, implementations restored in `beforeEach`) and `./invalidate` (`bump: jest.fn()`):
- `reads one athlete's scores, unfiltered`: `fetchCombineScores('jordan')` calls `collection({}, 'athletes', 'jordan', 'combineScores')`, returns `[{ id: 's1', ...data }]`; `query`/`where`/`orderBy` are not imported.
- `creates with addDoc and bumps`: `createCombineScore('jordan', body)` resolves the new ref's id, `addDoc` got `('col', body)`, `bump` got `'combineScores'`.
- `deletes by path and bumps`: `deleteCombineScore('jordan', 's1')` deletes `athletes/jordan/combineScores/s1`; `bump('combineScores')`.
- `refusals keep their code`: a rejected `getDocs` `{ code: 'permission-denied' }` rejects with `code: ERR.PERMISSION`; a missing athleteId rejects `ERR.INVALID`.

`combine.test.js` mocks `./live` (requireActual plus `isLive`, `fetchCurrentUser`, `fetchAthlete` as `jest.fn()`) and `./combineLive` (requireActual plus `fetchCombineScores`, `createCombineScore`, `deleteCombineScore` as `jest.fn()`, `combineStamp: () => 'NOW'`), and uses the `mountHook`/`settle` helper from `hooks/assessments.test.js`. Rows: Task 1's `ROWS` fixture.
- `live: the view for a parent`: `fetchCurrentUser` -> `{ uid: 'u-dana', role: 'parent' }`, `fetchAthlete` -> `{ id: 'jordan', name: 'Jordan Whitfield' }`, `fetchCombineScores` -> `ROWS`; `data.athlete` `{ id: 'jordan', name: 'Jordan Whitfield' }`, `data.viewer` `{ uid: 'u-dana', role: 'parent' }`, `data.canEnter` true, `data.rows.map((r) => r.id)` `['d', 'e', 'c', 'b', 'a']`, `data.best` `['b', 'e']`.
- `live: an unreadable athlete keeps the caller's name`: `fetchAthlete` rejects; `useCombine('jordan', { fallbackName: 'Jordan W' })` gives `data.athlete.name === 'Jordan W'`.
- `save writes the seven keys as the viewer`: `save({ distance: 'u125', score: 700, date: '2026-11-10' })` calls `createCombineScore('jordan', { athleteId: 'jordan', distance: 'u125', score: 700, date: '2026-11-10', enteredBy: 'u-dana', enteredRole: 'parent', createdAt: 'NOW' })`.
- `ops and mental read but do not enter`: viewer `{ uid: 'u-ops', role: 'ops' }`: `canEnter` false; `save(...)` rejects `{ code: ERR.INVALID }`; `createCombineScore` not called.
- `remove deletes by id`: `remove('c')` calls `deleteCombineScore('jordan', 'c')`.
- `a reload keeps the last view` (Review Focus 2): make the second `fetchCombineScores` call a pending promise; call `bump('combineScores')` from the real `./invalidate` (the mocked `createCombineScore` does not bump); while `loading` is true, `data` is the previous view (not null); a mount for a different athleteId never shows another athlete's view.
- `today is the Chicago date` (Review Focus 3): `jest.useFakeTimers().setSystemTime(new Date('2026-11-13T03:00:00Z'))`, then `data.today === '2026-11-12'` (restore real timers after).
- `seed: rows, save and remove`: `isLive` false; `useCombine('jordan')` gives `data.viewer` `SEED_COMBINE_VIEWER`, rows equal to `sortScores(seedCombineRows('jordan', today))`; `save({ distance: 'u180', score: 512, date: today })` puts a `u180` 512 row first; `remove` of it takes it out. `seedCombineRows` has three `u100` rows and one `u150` row, none on `u125` or `u180`.
- `the card`: live, `useCombineCard({})` resolves the athleteId from `fetchCurrentUser().athleteId` and returns `{ athleteId: 'jordan', summary }`; `useCombineCard({ practice: true })` returns `data: null` and calls nothing.

- [ ] **Step 2: Run the tests to verify they fail**
Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/hooks/combineLive.test.js src/portal/hooks/combine.test.js`
Expected: FAIL, "Cannot find module './combineLive'".

- [ ] **Step 3: Implement `hooks/combineLive.js`** (`collection`, `doc`, `getDocs`, `addDoc`, `deleteDoc`, `serverTimestamp`; every SDK error through `wrap`; writes call `requireUser()` first and `bump(COMBINE_KEY)` after) **and `hooks/combine.js`**: live source = `fetchCurrentUser()`, then `Promise.all([fetchAthlete(id).catch(() => null), fetchCombineScores(id)])`, then the `CombineView`; deps `['combine', athleteId, gen]` with `gen = useInvalidation(COMBINE_KEY)`. Keep the last view in a `useRef` and return it while `loading` for the same `athlete.id`. Seed mode keeps a module `Map` of rows per athlete, starting from `seedCombineRows`, and bumps `COMBINE_KEY` on every write. `seedCombineRows(athleteId, today)`: `u100` 612 (today minus 40, coach), 655 (minus 20, athlete), 640 (minus 6, coach); `u150` 480 (minus 6, parent); `enteredBy` `coach-luke`, `athlete-jordan` or `parent-dana`.

- [ ] **Step 4: Run the tests to verify they pass**
Run: the Step 2 command. Expected: PASS. Lint the four files (no output).

- [ ] **Step 5: CRLF and commit**
```bash
git add frontend/src/portal/hooks/combineLive.js frontend/src/portal/hooks/combineLive.test.js frontend/src/portal/hooks/combine.js frontend/src/portal/hooks/combine.test.js
git commit -m "feat(combine): Firestore adapter and hooks for combine scores" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The Combine screen

LANE B. Depends on: Task 4.

**Files:**
- Create: `frontend/src/portal/screens/Combine.js`, `frontend/src/portal/components/combine/CombineDistanceBlock.js`, `frontend/src/portal/components/combine/CombineHistory.js`
- Test: `frontend/src/portal/screens/Combine.test.js`

**Interfaces:**
- Consumes: `useCombine` (Task 4); `COMBINE_KEY` and `bump` for the retry; from `../data/combine`: `COMBINE_DISTANCES, parseScore, combineDateProblem, combineDateFloor, shortDay, formatScore, roleWord, canDeleteScore, distanceLabel` and the copy constants; `PhoneFrame`, `Button`, `StatusBadge`, `BackLink, Body, Card, ErrorNotice, ScreenTitle, SectionLabel` from Primitives.
- Produces: `Combine({ bare, athleteId, fallbackName, onBack })`; `CombineDistanceBlock({ distance, best, latest, canEnter, today, onSave })` where `onSave(distanceId, score, date) -> Promise`; `CombineHistory({ rows, best, viewer, onDelete })` where `onDelete(id) -> Promise`.

What the screen shows (spec §4): header `‹ Back`, the athlete's name as the title (`data.athlete.name ?? fallbackName ?? 'This athlete'`) and "Combine" beneath. Four blocks in `COMBINE_DISTANCES` order, each with "Best 655 · Nov 5" and "Latest 600 · Nov 10" (or `NO_SCORE`); for a viewer with `canEnter`: a score input (`inputMode="numeric"`, `aria-label` `"<label> score"`), a date input (`type="date"`, `aria-label` `"<label> date"`, default `data.today`, `min` `combineDateFloor(today)`, `max` today) and a button with text Save and `aria-label` `"Save <label>"`. Validation copy appears under the block and nothing is saved; while a save runs the button reads "Saving…" and is disabled; success clears the score field and keeps the date; failure shows `COMBINE_SAVE_ERROR`. A viewer without `canEnter` sees `COMBINE_READ_ONLY_NOTE` instead of the fields. History below, newest first: each row carries `data-score-id`, shows `shortDay(date)`, the distance label, `formatScore(score)`, `roleWord(enteredRole)` and a `Best` StatusBadge when its id is in `data.best`; rows `canDeleteScore` allows show a button with text Delete and `aria-label` `"Delete <score> · <label> · <Nov 5>"`, which opens an inline `DELETE_PROMPT` with buttons Delete (`aria-label` "Delete this score") and Keep; never `window.confirm`. Empty history shows `COMBINE_EMPTY`. The blocks render whenever `data` is present, `loading` or not; "Loading…" only when there is no `data`; `ErrorNotice` with `COMBINE_LOAD_ERROR` and a retry that bumps `COMBINE_KEY` when there is no `data` and an `error`.

- [ ] **Step 1: Write the failing tests** in `screens/Combine.test.js`, mocking `../hooks/combine` with `useCombine: () => mockState` and `save`/`remove` as `jest.fn()`; `mockState.data` built from Task 1's `ROWS` with `combineSummary`/`bestIds`, viewer `{ uid: 'u-luke', role: 'coach' }`, `canEnter: true`, `today: '2026-11-12'`, `athlete: { id: 'jordan', name: 'Jordan Whitfield' }`:
- `the header and four blocks`: text contains `Jordan Whitfield`, `Combine`, the four labels, `Best 655 · Nov 5`, `Latest 600 · Nov 10`, and `No score yet` twice.
- `a score out of range is refused with the spec's copy`: fill `Under 100 yd score` with `1001`, click `Save Under 100 yd`: text contains `Enter a whole number from 0 to 1000.`; `save` not called. Same for `742.5`.
- `a date after today is refused`: score `742`, date `2026-11-13`: `Pick a date no later than today.`; `save` not called.
- `a valid score saves once with today's date`: score `742`, Save: `save` called once with `{ distance: 'u100', score: 742, date: '2026-11-12' }`; after it resolves the field is empty.
- `a double tap saves once` (Review Focus 1): `save` returns a pending promise; click Save twice: one call, the button reads `Saving…`.
- `a draft in another block survives a save` (Review Focus 2): fill `Under 125 yd score` with `700`; save `u100`; rerender with `{ ...mockState, loading: true, data: { ...data, rows: [newRow, ...data.rows] } }`: the `Under 125 yd score` input still holds `700`.
- `history: newest first, role words, one Best per distance`: the `[data-score-id]` elements in order are `d, e, c, b, a`; row `e` contains `1000` (no comma), `Parent`, `Under 150 yd`; the rows containing `Best` are exactly `b` and `e`.
- `delete asks inline, Keep keeps`: the coach sees three Delete buttons (rows `a`, `c`, `d`); click `Delete 600 · Under 100 yd · Nov 10`: text contains `Delete this score?`; Keep: `remove` not called; again then `Delete this score`: `remove('d')`; `window.confirm` (spied) never called.
- `ops reads only`: viewer `{ uid: 'u-ops', role: 'ops' }`, `canEnter: false`: no input with `aria-label` ending in `score`, no Save, text contains `Coaches, athletes and parents enter combine scores.`, no Delete. Owner viewer: five Delete buttons.
- `a failed load says so`: `{ data: null, loading: false, error: new Error('x') }`: text contains `The combine scores didn't load.` and a `Try again` button.

- [ ] **Step 2: Run the tests to verify they fail**
Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/screens/Combine.test.js`
Expected: FAIL, "Cannot find module './Combine'".

- [ ] **Step 3: Implement** the screen and the two components to the description above. Each block owns its own score, date, busy and error state, keyed by distance id, so a reload never resets it.

- [ ] **Step 4: Run the tests to verify they pass**
Run: the Step 2 command. Expected: PASS. Lint the four files. `wc -l` each is under 500.

- [ ] **Step 5: CRLF and commit**
```bash
git add frontend/src/portal/screens/Combine.js frontend/src/portal/screens/Combine.test.js frontend/src/portal/components/combine/CombineDistanceBlock.js frontend/src/portal/components/combine/CombineHistory.js
git commit -m "feat(combine): the Combine screen - four distances, history, inline delete" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Combine cards on the athlete home and the athlete page

LANE B. Depends on: Task 4.

**Files:**
- Create: `frontend/src/portal/components/combine/CombineCard.js`
- Test: `frontend/src/portal/components/combine/CombineCard.test.js`
- Modify: `frontend/src/portal/screens/AthleteDashboard.js` (one import, one element; 508 -> 510)
- Modify: `frontend/src/portal/screens/AthleteDetail.js` (one import, one element)
- Modify: `frontend/src/portal/screens/AthleteDashboard.test.js`, `frontend/src/portal/screens/AthleteDetail.test.js` (one test each)

**Interfaces:**
- Consumes: `useCombineCard` (Task 4); `COMBINE_DISTANCES, shortDay, formatScore, NO_SCORE, COMBINE_LOAD_ERROR` from `data/combine`.
- Produces: `CombineCard({ athleteId = null, practice = false, to })`.

The card: nothing in `practice` or while loading. Otherwise a `Card` with `SectionLabel` "Combine" and, on the right of it, a text button "Combine ›" that calls `navigate(to)` (the `Membership ›` button in AthleteDashboard is the style). Four lines, one per distance: the label and `"<score> · <Nov 5>"` of the latest score, or `NO_SCORE`. On an error: the label, `COMBINE_LOAD_ERROR` and the same link.

- [ ] **Step 1: Write the failing tests.**
`CombineCard.test.js` (mock `../../hooks/combine` `useCombineCard`; `renderScreen` gives the router):
- `latest per distance and the link`: summary from Task 1's `ROWS`: text contains `Under 100 yd`, `600 · Nov 10`, `Under 150 yd`, `1000 · Nov 10`, and `No score yet` twice; click `Combine ›`: `r.location().pathname === '/portal/combine'` (with `to="/portal/combine"`).
- `practice and loading render nothing`: `container.textContent === ''` for `practice` and for `{ data: null, loading: true }`.
- `an error still links`: text contains `The combine scores didn't load.`; `Combine ›` present.
`AthleteDetail.test.js`, new test `the Combine card opens this athlete's scores`: render `<AthleteDetail bare athleteId="a1" role="parent" />` (seed mode, the real `useCombineCard`), click `Combine ›`, `r.location().pathname === '/portal/combine/a1'`.
`AthleteDashboard.test.js`, new test `the athlete home links to their combine scores`: the populated home (the file's existing setup) shows `Combine ›`; clicking it goes to `/portal/combine`.

- [ ] **Step 2: Run the tests to verify they fail**
Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/components/combine/CombineCard.test.js src/portal/screens/AthleteDetail.test.js src/portal/screens/AthleteDashboard.test.js`
Expected: CombineCard FAIL ("Cannot find module"); the two new screen tests FAIL (no `Combine ›`); every existing test still passes.

- [ ] **Step 3: Implement `CombineCard.js` and mount it** with `crlf-edit.mjs`:
  - `AthleteDashboard.js`: `after` `import ConsentAthleteHomeLine from '../components/consent/ConsentAthleteHomeLine';\n` insert `import CombineCard from '../components/combine/CombineCard';\n`; `after` `        <ConsentAthleteHomeLine practice={practice} />\n` insert `        <CombineCard practice={practice} to="/portal/combine" />\n`.
  - `AthleteDetail.js`: `after` `import ConsentDetailCard from '../components/consent/ConsentDetailCard';\n` insert `import CombineCard from '../components/combine/CombineCard';\n`; `after` `        <ConsentDetailCard athleteId={athleteId} role={role} demoPaperOpen={demoPaperOpen} />\n` insert `        <CombineCard athleteId={athleteId} to={\`/portal/combine/${athleteId}\`} />\n`.

- [ ] **Step 4: Run the tests to verify they pass**
Run: the Step 2 command plus `src/portal/screens/AthleteDashboard.single.test.js src/portal/screens/OnboardingFlow.test.js src/portal/screens/OnboardingSteps.test.js`.
Expected: PASS. `wc -l frontend/src/portal/screens/AthleteDashboard.js` prints `510`. Lint the changed files.

- [ ] **Step 5: Commit**
```bash
git add frontend/src/portal/components/combine/CombineCard.js frontend/src/portal/components/combine/CombineCard.test.js frontend/src/portal/screens/AthleteDashboard.js frontend/src/portal/screens/AthleteDetail.js frontend/src/portal/screens/AthleteDashboard.test.js frontend/src/portal/screens/AthleteDetail.test.js
git commit -m "feat(combine): Combine cards on the athlete home and the athlete page" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Combine routes and the attendance props

LANE B. Depends on: Task 5.

**Files:**
- Create: `frontend/src/portal/CombineRoutes.js`
- Modify: `frontend/src/portal/PortalRoutes.js` (one import, one chunk entry, two routes, two props; ends at 1182 or fewer)
- Test: `frontend/src/portal/PortalRoutes.combine.test.js`

**Interfaces:**
- Consumes: `screens/Combine` (Task 5), `useAuthSession` (default export), `isLive`, `SEED_COMBINE_ATHLETE_ID`.
- Produces: `loadCombine`, `CombineRoute`; `SessionAttendance` receives `showIntake` and `onOpenCombine` (Lane C reads them).

`CombineRoute()`: `athleteId` = the `:athleteId` param, else the signed-in user's `athleteId` (live) or `SEED_COMBINE_ATHLETE_ID` (seed); waits while the live session is loading; no id: `<Navigate to="/portal" replace />`. `fallbackName` = navigation state `name`. Back: `navigate(-1)` when `useLocation().key !== 'default'` (opened from inside the app: the attendance screen, the card), else a fixed target: `/portal/home` on `/portal/combine`, `/portal/athlete/<id>` for a live parent, `/portal` for everyone else. (`window.history.state.idx`, used by `AssessmentRoutes.js`, is absent under `MemoryRouter`, so the test could not prove Back.)

- [ ] **Step 1: Write the failing tests** in `PortalRoutes.combine.test.js`. Copy `PortalRoutes.test.js` lines 1-99 (its mocks, `mockLive`/`mockUser`/`mockDeferred` and the mount helper), drop its `./screens/Roster` mock, and add `./screens/AthleteDetail` default `() => 'ATHLETE PAGE'` plus: `./screens/Combine` default `({ athleteId, fallbackName, onBack }) => createElement('button', { type: 'button', onClick: onBack }, \`COMBINE ${athleteId} ${fallbackName ?? '-'}\`)` and `./screens/Roster` with `SessionAttendance: ({ showIntake, onOpenCombine }) => createElement('button', { type: 'button', onClick: () => onOpenCombine('a1', 'Jordan Whitfield') }, \`ATTENDANCE intake=${showIntake}\`)`.
- `an athlete opens their own scores`: live, user `{ uid: 'u-a', role: 'athlete', athleteId: 'jordan' }`, `/portal/combine`: text `COMBINE jordan -`.
- `staff and parents open one athlete's scores`: for each of parent, coach, mental, ops, owner at `/portal/combine/a1`: text `COMBINE a1 -`.
- `each route keeps out the other roles`: the athlete at `/portal/combine/a1` lands on `/portal/home`; a parent at `/portal/combine` lands on `/portal/family`.
- `the attendance row opens Combine and Back returns to the session`: coach at `{ pathname: '/portal/attendance', state: { sessionId: 's1', block: { date: '2026-11-09', time: '4:00 PM', type: 'training', name: null, meta: null } } }`: text `ATTENDANCE intake=true`; click: pathname `/portal/combine/a1`, `state().name === 'Jordan Whitfield'`, text `COMBINE a1 Jordan Whitfield`; click (Back): pathname `/portal/attendance`, `state().sessionId === 's1'`.
- `Back from a deep link`: parent at `/portal/combine/a1`, click: `/portal/athlete/a1`; athlete at `/portal/combine`, click: `/portal/home`.
- `seed mode`: live false, `/portal/combine`: text `COMBINE jordan -`.

- [ ] **Step 2: Run the tests to verify they fail**
Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/PortalRoutes.combine.test.js`
Expected: FAIL (`/portal/combine` falls through to the index; `intake=undefined`).

- [ ] **Step 3: Implement `CombineRoutes.js`** (`export const loadCombine = () => import('./screens/Combine');`, `lazy(loadCombine)`, `CombineRoute` as above) **and wire `PortalRoutes.js`** with `crlf-edit.mjs`:
  - `after` `import { attendanceReadOnlyFor } from './data/specialists';\n` insert `import { CombineRoute, loadCombine } from './CombineRoutes';\n`
  - `after` `  assessments: [loadAssessmentList],\n` insert `  combine: [loadCombine],\n`
  - `before` `      {/* Hidden until closer to launch (owner, 2026-09-30): a stale link` insert:
    ```
          {/* Combine scores (2026-11-11 spec 4): an athlete's own; one athlete's for parents and staff. */}
          <Route path="combine" element={<RequireRole roles={['athlete']}><CombineRoute /></RequireRole>} />
          <Route path="combine/:athleteId" element={<RequireRole roles={['parent', 'coach', 'mental', 'ops', 'owner']}><CombineRoute /></RequireRole>} />
    ```
  - `after` `      onOpenClubhead={!live || assessmentAccess(user) ? (athleteId, name) => navigate(\`/portal/assessments/golf/${athleteId}\`, { state: { name } }) : undefined}\n` insert `      showIntake\n      onOpenCombine={(athleteId, name) => navigate(\`/portal/combine/${athleteId}\`, { state: { name } })}\n`

- [ ] **Step 4: Run the tests to verify they pass**
Run: the Step 2 command, then `src/portal/PortalRoutes.test.js src/portal/PortalRoutes.warm.test.js`.
Expected: PASS, all three. `wc -l frontend/src/portal/PortalRoutes.js` is 1182 or fewer. Lint `src/portal/CombineRoutes.js src/portal/PortalRoutes.js src/portal/PortalRoutes.combine.test.js`.

- [ ] **Step 5: Run Lane B's whole suite and build**
Run: `cd frontend && CI=true npx react-scripts test --watchAll=false` then `cd frontend && CI=true npm run build`.
Expected: every suite passes; the build exits 0.

- [ ] **Step 6: Commit**
```bash
git add frontend/src/portal/CombineRoutes.js frontend/src/portal/PortalRoutes.js frontend/src/portal/PortalRoutes.combine.test.js
git commit -m "feat(combine): /portal/combine routes; the attendance route opens Combine and shows intake ticks" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Parallax intake adapter and hook

LANE C. Depends on: Task 2.

**Files:**
- Create: `frontend/src/portal/hooks/parallaxLive.js`, `frontend/src/portal/hooks/parallax.js`
- Test: `frontend/src/portal/hooks/parallaxLive.test.js`, `frontend/src/portal/hooks/parallax.test.js`

**Interfaces:**
- Consumes: `ERR, LiveDataError, wrap, requireUser, isLive, fetchCurrentUser` from `./live`; `auth` from `../../firebase`; `useSeedResource`; `INTAKE_DOC_ID, intakeDoc, intakeByName` from `../data/combine`.
- Produces: the Lane C hook names in the Shared contract.

- [ ] **Step 1: Write the failing tests.**
`parallaxLive.test.js` (mocks as in `mentalConsentLive.test.js`: `doc` returns `{ path }`, `getDoc`, `setDoc`, `deleteDoc`, `serverTimestamp: () => 'NOW'`):
- `one get per athlete; missing is null`: `fetchIntake('a1')` reads `athletes/a1/milestones/parallaxIntake`; `exists: () => false` gives `null`; an existing doc gives its data.
- `create is a setDoc of the body`: `createIntake('a1', body)` calls `setDoc({ path: 'athletes/a1/milestones/parallaxIntake' }, body)` and resolves `{ status: 'done' }`.
- `a tick that is already there answers 'already'` (Review Focus 4): `setDoc` rejects `{ code: 'permission-denied' }` and the re-read finds `{ by: 'u-sam', byName: 'Sam', ... }`: resolves `{ status: 'already', milestone: <that> }`; when the re-read finds nothing it rejects with `code: ERR.PERMISSION`.
- `undo deletes by path`: `deleteIntake('a1')` deletes `athletes/a1/milestones/parallaxIntake`; a refusal rejects with `code: ERR.PERMISSION`.
- `athleteId is required`: each function rejects `ERR.INVALID` without one.

`parallax.test.js` mocks `./live` (requireActual plus `isLive`, `fetchCurrentUser`), `./parallaxLive` (requireActual plus `fetchIntake`, `createIntake`, `deleteIntake`, `intakeStamp: () => 'NOW'`) and `../../firebase` (`{ auth: { currentUser: { displayName: null } }, db: {} }`); `clearIntakeCache()` in `beforeEach`; the `mountHook` helper. `M = { athleteId: 'a1', at: new Date('2026-11-05T21:00:00Z'), by: 'u-luke', byName: 'Luke' }`.
- `disabled reads nothing`: `useParallaxIntakes(['a1'], { enabled: false })`: `data` null, `loading` false, `fetchCurrentUser` and `fetchIntake` not called.
- `one read per athlete and the viewer`: live, `fetchCurrentUser` -> `{ uid: 'u-luke', role: 'coach', displayName: 'Luke Smith' }`, `fetchIntake` -> `M` for `a1`, null for `a2`: `data.byAthlete` `{ a1: M, a2: null }`, `data.viewer` `{ uid: 'u-luke', role: 'coach', byName: 'Luke' }`.
- `cached per athlete`: unmount, mount `['a1', 'a2', 'a3']`: `fetchIntake` called once more, for `a3` only.
- `tick writes the four keys and shows at once`: `tick('a2')` calls `createIntake('a2', { athleteId: 'a2', at: 'NOW', by: 'u-luke', byName: 'Luke' })`, resolves `'done'`; `data.byAthlete.a2.by === 'u-luke'` and `data.byAthlete.a2.at instanceof Date`, with no further `fetchIntake`.
- `a tick that lost the race shows the first one`: `createIntake` resolves `{ status: 'already', milestone: { ...M, athleteId: 'a2', by: 'u-sam', byName: 'Sam' } }`: `tick` resolves `'already'`; `byAthlete.a2.byName === 'Sam'`.
- `undo clears`: `undo('a1')` calls `deleteIntake('a1')`; `byAthlete.a1` null.
- `an owner with no name on file`: `fetchCurrentUser` -> `{ uid: 'owner', role: 'owner', displayName: null }`: `viewer.byName === 'Owner'`.
- `a failed read is not cached`: `fetchIntake` rejects for `a1`: `error.code === ERR.PERMISSION`; the next mount calls `fetchIntake('a1')` again.
- `seed: r1 and r4 ticked`: `isLive` false, ids `['r1', 'r2', 'r4']`: `r1` and `r4` by `coach-luke`/`Luke`, `r2` null; `tick('r2')` makes `r2` ticked with `byName 'Luke'`.

- [ ] **Step 2: Run the tests to verify they fail**
Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/hooks/parallaxLive.test.js src/portal/hooks/parallax.test.js`
Expected: FAIL, "Cannot find module './parallaxLive'".

- [ ] **Step 3: Implement.** `parallaxLive.js`: `createIntake` re-reads through `fetchIntake` on a permission-denied refusal (the `createConsent` pattern in `mentalConsentLive.js`). `parallax.js`: a module `Map` cache `athleteId -> milestone|null` filled only by successful reads; the live source runs `fetchCurrentUser()` and `fetchIntake` for the ids not yet cached, deps `['parallax-intake', enabled, <sorted unique ids joined>]`; `byName = intakeByName({ displayName: user.displayName, authName: auth.currentUser?.displayName, role: user.role })`. A component-state override map (`useState`) carries the result of `tick`/`undo` over the loaded data (and the cache is updated), so a tick shows at once and no reload blanks the roster's ticks. Seed: a module `Map` from the contract's seed and the seed viewer.

- [ ] **Step 4: Run the tests to verify they pass**
Run: the Step 2 command. Expected: PASS. Lint the four files.

- [ ] **Step 5: CRLF and commit**
```bash
git add frontend/src/portal/hooks/parallaxLive.js frontend/src/portal/hooks/parallaxLive.test.js frontend/src/portal/hooks/parallax.js frontend/src/portal/hooks/parallax.test.js
git commit -m "feat(combine): Parallax intake swings adapter and the cached per-athlete hook" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Attendance row pieces

LANE C. Depends on: Task 8.

**Files:**
- Create: `frontend/src/portal/components/combine/ParallaxTick.js`, `frontend/src/portal/components/combine/CombineButton.js`, `frontend/src/portal/components/combine/TrainingRowExtras.js`
- Test: `frontend/src/portal/components/combine/ParallaxTick.test.js`, `frontend/src/portal/components/combine/TrainingRowExtras.test.js`

**Interfaces:**
- Consumes: from `../../data/combine`: `INTAKE_LABEL, INTAKE_SAVE_ERROR, INTAKE_UNDO_LATE, INTAKE_LOAD_ERROR, intakeDoneLine, intakeUndo, canTickIntake`; `ERR` from `../../hooks/live`; `Tick, Body` from `../Primitives`; the `useParallaxIntakes` result shape (Task 8).
- Produces: `ParallaxTick({ name, milestone, viewer, canTick, onTick, onUndo, loadError = false, now = Date.now })`; `CombineButton({ name, onOpen })`; `TrainingRowExtras({ athleteId, name, intakes, role, readOnly, onOpenCombine })`.

`ParallaxTick`: `milestone === undefined` renders nothing (or `INTAKE_LOAD_ERROR` when `loadError`), so a row never reads "not done" before its read lands. Otherwise one `<button role="checkbox">`, `aria-checked` = ticked, `aria-label` `"Parallax intake swings: <name>"`, at least 44 px tall (the `CheckinToggle` precedent: the round 26 px tick inside a 44 px target; `Checkbox.js` is 26 px with no `disabled` and stays untouched), showing `INTAKE_LABEL` and, when ticked, `intakeDoneLine(milestone)`. Enabled when unticked and `canTick`, or ticked and `canTick` and `intakeUndo(milestone, viewer, now())` is not null; `disabled` otherwise and while a write runs. A tap on an unticked box calls `onTick`; on a ticked one: `'undo'` calls `onUndo`, `'owner-clear'` opens an inline "Clear Parallax intake swings for <name>?" with buttons Clear (`aria-label` `"Clear Parallax intake swings: <name>"`) and Keep, and a null re-check at tap time shows `INTAKE_UNDO_LATE`. A rejected `onTick` shows `INTAKE_SAVE_ERROR`; a rejected `onUndo` shows `INTAKE_UNDO_LATE` for `code === ERR.PERMISSION`, else `INTAKE_SAVE_ERROR`. Every click calls `e.stopPropagation()` (the `ClubheadChip` precedent). `CombineButton`: a pill like `ClubheadChip` (min height 36), text "Combine", `aria-label` `"Combine: <name>"`. `TrainingRowExtras`: a `ParallaxTick` when `intakes` is not null (`milestone` = `byAthlete[athleteId]` when that key is present, else `undefined`; `viewer` = `intakes.data?.viewer ?? null`; `canTick` = `canTickIntake(role, readOnly)`; `loadError` = `Boolean(intakes.error)`; `onTick`/`onUndo` call `intakes.tick(athleteId)`/`intakes.undo(athleteId)`), and a `CombineButton` when `onOpenCombine` is set and not `readOnly`, calling `onOpenCombine(athleteId, name)`.

- [ ] **Step 1: Write the failing tests** (`renderScreen`; `T = Date.parse('2026-11-12T22:00:00Z')`; `now = () => T + 3 * 60000` unless stated; `M = { athleteId: 'a1', at: new Date(T), by: 'u-luke', byName: 'Luke' }`; `checkbox(r)` = the `[role="checkbox"]` element).
`ParallaxTick.test.js`:
- `not done: the label, and a tap ticks`: `milestone: null, canTick: true`: `aria-checked="false"`, text `Parallax intake swings`; click: `onTick` called once; while it is pending the box is `disabled`.
- `done: the Chicago date and the first name`: `milestone: M`: `aria-checked="true"`, text contains `done Nov 12 · Luke`.
- `the one who ticked undoes it inside ten minutes`: viewer `{ uid: 'u-luke', role: 'coach' }`: enabled; click: `onUndo` called once.
- `after ten minutes the coach cannot`: `now = () => T + 11 * 60000`: `disabled`.
- `another coach cannot`: viewer `{ uid: 'u-sam', role: 'coach' }`: `disabled`.
- `the owner clears with a confirm` (Review Focus 5): viewer `{ uid: 'owner', role: 'owner' }`, `now = () => T + 86400000`: click: text contains `Clear Parallax intake swings for Jordan Whitfield?`; Keep: `onUndo` not called, still ticked; click again, then `Clear Parallax intake swings: Jordan Whitfield`: `onUndo` called once.
- `a late undo says why` (Review Focus 5): viewer `u-luke`, `onUndo` rejects `{ code: ERR.PERMISSION }`: text contains `Ten minutes have passed. Ask the owner to clear it.`
- `a failed tick says so`: `onTick` rejects `new Error('offline')`: text contains `Not saved. Tap to try again.`
- `read-only shows the state, disabled`: `canTick: false` with `milestone: null` and with `M`: `disabled` both times; the done line still shows.
- `nothing before the read lands`: `milestone: undefined`: no checkbox; with `loadError`: text `Parallax intake swings didn't load.`
`TrainingRowExtras.test.js`:
- `a coach row: tick and Combine`: `intakes = { data: { byAthlete: { a1: null }, viewer: { uid: 'u-luke', role: 'coach', byName: 'Luke' } }, error: null, tick: jest.fn(async () => 'done'), undo: jest.fn() }`, role coach: click the checkbox: `tick('a1')`; click `Combine: Jordan Whitfield`: `onOpenCombine('a1', 'Jordan Whitfield')`.
- `read-only: disabled tick, no Combine`: `readOnly`, role mental: checkbox `disabled`; no `Combine: Jordan Whitfield` button.
- `no intakes: no tick`: `intakes: null`: no checkbox; Combine still shown.
- `an athlete not in the loaded ids shows nothing yet`: `byAthlete: {}`: no checkbox.

- [ ] **Step 2: Run the tests to verify they fail**
Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/components/combine/ParallaxTick.test.js src/portal/components/combine/TrainingRowExtras.test.js`
Expected: FAIL, "Cannot find module".

- [ ] **Step 3: Implement** the three components to the description above.

- [ ] **Step 4: Run the tests to verify they pass**
Run: the Step 2 command. Expected: PASS. Lint the five files.

- [ ] **Step 5: CRLF and commit**
```bash
git add frontend/src/portal/components/combine/ParallaxTick.js frontend/src/portal/components/combine/CombineButton.js frontend/src/portal/components/combine/TrainingRowExtras.js frontend/src/portal/components/combine/ParallaxTick.test.js frontend/src/portal/components/combine/TrainingRowExtras.test.js
git commit -m "feat(combine): the Parallax intake swings tick and the Combine button for attendance rows" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Mount the row pieces in the attendance screen

LANE C. Depends on: Task 9.

**Files:**
- Modify: `frontend/src/portal/screens/Roster.js` (two imports, the signature line, two JSDoc lines, the hook call, three JSX lines; ends at 966 or fewer)
- Test: `frontend/src/portal/screens/Roster.combine.test.js`

**Interfaces:**
- Consumes: `useParallaxIntakes` (Task 8), `TrainingRowExtras` (Task 9); the props `showIntake` and `onOpenCombine` that Task 7 passes.
- Produces: the attendance rows of a training session show the tick and the Combine button.

- [ ] **Step 1: Write the failing test** `screens/Roster.combine.test.js`. Mocks: `../hooks` as in `Roster.clubhead.test.js` but `sessionStatus` from a variable `mockStatus`; `../hooks/live` with `isLive: () => true`; `../hooks/assessments` (no open windows); `../hooks/parallax` with `useParallaxIntakes: (ids, opts) => { mockCalls.push({ ids, ...opts }); return mockIntakes; }` where `mockIntakes = { data: { byAthlete: { a1: { athleteId: 'a1', at: new Date('2026-11-05T21:00:00Z'), by: 'u-luke', byName: 'Luke' }, a2: null }, viewer: { uid: 'u-sam', role: 'coach', byName: 'Sam' } }, loading: false, error: null, tick: jest.fn(async () => 'done'), undo: jest.fn() }`. Roster rows `a1` Jordan Whitfield, `a2` Sam Lee. `roster(type, props)` renders `SessionAttendance` with `sessionId="2026-11-05-0"` and a block of that type.
- `a training session: one read for the rows, a tick and Combine per row`: `roster('training', { showIntake: true, onOpenCombine })`: the last `mockCalls` entry is `{ ids: ['a1', 'a2'], enabled: true }`; `Parallax intake swings: Jordan Whitfield` has `aria-checked="true"` and the text contains `done Nov 5 · Luke`; click `Parallax intake swings: Sam Lee`: `tick('a2')`; click `Combine: Sam Lee`: `onOpenCombine('a2', 'Sam Lee')`.
- `a Tour event shows neither and reads nothing`: `roster('tournament', { showIntake: true, onOpenCombine })`: `enabled: false`; no checkbox, no `Combine:` button.
- `read-only (Yannick, ops): the tick is shown disabled, no Combine`: `{ showIntake: true, onOpenCombine, readOnly: true, role: 'mental' }`: both checkboxes `disabled`; no `Combine:` button.
- `ops on a writable roster still cannot tick`: `{ showIntake: true, role: 'ops' }`: both checkboxes `disabled`.
- `without showIntake: no tick and no read; Combine still offered`: `{ onOpenCombine }`: `enabled: false`; no checkbox; `Combine: Jordan Whitfield` present.
- `a cancelled session shows neither`: `mockStatus = 'cancelled'`: no checkbox, no `Combine:` button.

- [ ] **Step 2: Run the test to verify it fails**
Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/screens/Roster.combine.test.js`
Expected: FAIL (no checkbox; `mockCalls` empty).

- [ ] **Step 3: Edit `Roster.js`** with `crlf-edit.mjs`:
  - `after` `import ClubheadChip from '../components/assessments/ClubheadChip';\n` insert `import TrainingRowExtras from '../components/combine/TrainingRowExtras';\n`
  - `after` `import { useOpenAssessmentWindows } from '../hooks/assessments';\n` insert `import { useParallaxIntakes } from '../hooks/parallax';\n`
  - `before` ` * @param {boolean} [readOnly]  2026-11-03 (owner ruling): a viewer the rules` insert ` * @param {boolean} [showIntake]  2026-11-11: training rows show the Parallax intake swings tick (one read per row athlete).\n * @param {function} [onOpenCombine]  (athleteId, name) => void - the row's Combine button; hidden when read-only.\n`
  - `find` `readOnly = false, onOpenClubhead }) {` `replace` `readOnly = false, onOpenClubhead, onOpenCombine, showIntake = false }) {`
  - `after` `    : demoRoster;\n` insert `  const intakes = useParallaxIntakes(roster.map((a) => a.id), { enabled: showIntake && session?.type === 'training' });\n`
  - `before` `              </AthleteRow>\n` insert:
    ```
                    {session?.type === 'training' && !sessionCancelled ? (
                      <TrainingRowExtras athleteId={athlete.id} name={shownName(athlete)} intakes={showIntake ? intakes : null} role={role} readOnly={readOnly} onOpenCombine={onOpenCombine} />
                    ) : null}
    ```
  The hook call sits above the `view === 'results'` early return, so it runs on every render.

- [ ] **Step 4: Run the tests to verify they pass**
Run: the Step 2 command, then `src/portal/screens/Roster.clubhead.test.js src/portal/screens/Roster.readonly.test.js src/portal/screens/Roster.reserved.test.js`.
Expected: PASS, all four (the existing three pass neither new prop, so the hook stays disabled and reads nothing). `wc -l frontend/src/portal/screens/Roster.js` is 966 or fewer; `file` shows CRLF; `git diff --stat` shows only Roster.js lines added plus one changed. Lint `src/portal/screens/Roster.js src/portal/screens/Roster.combine.test.js`.

- [ ] **Step 5: Run Lane C's whole suite and build**
Run: `cd frontend && CI=true npx react-scripts test --watchAll=false` then `cd frontend && CI=true npm run build`.
Expected: every suite passes; the build exits 0.

- [ ] **Step 6: Commit**
```bash
git add frontend/src/portal/screens/Roster.js frontend/src/portal/screens/Roster.combine.test.js
git commit -m "feat(combine): training attendance rows show Parallax intake swings and Combine" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Integration and gates

LANE lead, in `wt-combine` on `feat/parallax-combine`. Depends on: Tasks 3, 7, 10.

**Files:** none new. Merges only.

- [ ] **Step 1: Merge B, then C**
```bash
git merge --no-ff feat/parallax-combine-ui -m "Merge feat/parallax-combine-ui: Combine screen, cards and routes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git merge --no-ff feat/parallax-combine-roster -m "Merge feat/parallax-combine-roster: Parallax intake swings and Combine on attendance rows" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Expected: no conflicts (no file is shared). A conflict means a lane strayed outside its files: stop and report it.

- [ ] **Step 2: Full gates**
- `cd frontend && CI=true npx react-scripts test --watchAll=false`: every suite passes.
- `cd frontend && npx eslint src/portal --max-warnings=0`: no output.
- `cd frontend && CI=true npm run build`: exit 0.
- With the lane emulator up (Task 3 Step 2's start command): `FIRESTORE_EMULATOR_HOST=127.0.0.1:8084 node --env-file=scripts/emulator.env scripts/verify-rules.mjs`: last line `ALL PASS (both passes)`.
- `git diff 94d7e4d -- firestore.rules | grep -c '^-[^-]'`: `0`.
- `wc -l frontend/src/portal/screens/Roster.js frontend/src/portal/PortalRoutes.js frontend/src/portal/screens/AthleteDashboard.js`: at most 966, at most 1182, exactly 510; `git diff --stat 94d7e4d -- frontend/src/portal/hooks/index.js frontend/src/portal/hooks/live.js`: empty; every other changed or new file under 500 lines (`git diff --name-only 94d7e4d | xargs wc -l`).
- `git diff --name-only 94d7e4d | xargs file | grep -v CRLF`: only the spec (`00-spec.md`, written LF before this plan) may appear.
- No real names and no phone numbers: write `<scratchpad>/combine-names.txt` (outside the repo) with one surname per line of the production families in memory, then `git log -p 94d7e4d..HEAD | grep -icwFf <scratchpad>/combine-names.txt` prints `0`, and `git diff 94d7e4d | grep -cE '[0-9]{3}[-. )]+[0-9]{3}[-. ][0-9]{4}'` prints `0`.
- `git status --short`: nothing but `?? firebase.combine.json`.

- [ ] **Step 3: Hand over the release order** (text for the owner's final message; run nothing of it): the rules deploy first (`npx firebase-tools deploy --only firestore:rules --project rypacad`), then `feat/parallax-combine` into develop, staging check at rypacad.ryptest.com (it reads production), then `git push origin develop:main`.

---

### Task 12: Browser QA on the emulator

LANE lead, in `wt-combine` after Task 11. Depends on: Task 11.

- [ ] **Step 1: Start the sandbox** (each in the background; stop any Task 3 emulator first, its PID only):
- emulator: `npx firebase-tools emulators:start --only auth,firestore --project rypacad --config firebase.combine.json` (the app's project id, so it sees the seed)
- seed: `FIRESTORE_EMULATOR_HOST=127.0.0.1:8084 node --env-file=scripts/emulator.env scripts/seed-firestore.mjs` (it refuses a non-local host)
- app: `cd frontend && PORT=3006 BROWSER=none REACT_APP_USE_EMULATORS=true REACT_APP_AUTH_EMULATOR_PORT=9103 REACT_APP_FIRESTORE_EMULATOR_PORT=8084 REACT_APP_FUNCTIONS_EMULATOR_PORT=5005 npx react-scripts start` (never port 3000 or 3001)
- open `http://localhost:3006/portal/signin` in the Browser pane; switch accounts with `await window.__rypTestAuth.signInAs('<uid>')` (emulator-only test hook; no passwords), then navigate.

- [ ] **Step 2: Walk the checklist.** Record pass/fail per line; a failure goes back to the owning lane's task.

Coach `coach-luke`:
- [ ] Today, calendar Mon Nov 9, block 2 (Training, Jordan booked): the row shows an unticked "Parallax intake swings" and a "Combine" pill beside the existing chips.
- [ ] Tick: "done <today's Chicago date, e.g. Nov 11> · Luke". Leave and reopen the block: still ticked.
- [ ] Tap it again within ten minutes: unticked. Tick it again.
- [ ] Age the tick: `curl -X PATCH "http://127.0.0.1:8084/v1/projects/rypacad/databases/(default)/documents/athletes/jordan/milestones/parallaxIntake?updateMask.fieldPaths=at" -H "Authorization: Bearer owner" -H "Content-Type: application/json" -d "{\"fields\":{\"at\":{\"timestampValue\":\"<now minus 11 min, ISO>\"}}}"`; reopen: the box is disabled for Luke.
- [ ] Sat Nov 14, block 1 (RYP Tour): no tick, no Combine.
- [ ] Combine on Jordan's row: `/portal/combine/jordan`, title "Jordan Whitfield", "Combine", four blocks. `1001`: "Enter a whole number from 0 to 1000."; tomorrow's date: "Pick a date no later than today."; `742` today: one history row, "Coach", "Best". Double-tap Save on another score: one row.
- [ ] Type `700` in Under 125 yd, save an Under 100 yd score: the 700 is still there.
- [ ] Delete your own row: "Delete this score?", Keep keeps it, Delete removes it. Back: the Nov 9 block 2 attendance screen.

Owner `owner`:
- [ ] Same block: Jordan's aged tick is enabled; tap: "Clear Parallax intake swings for Jordan Whitfield?"; Keep, then Clear; re-tick: "done <today> · Owner".
- [ ] Combine: a Delete on every row; delete the athlete's row (after the athlete step below).

`mental` and `ops`:
- [ ] Same block: "View only"; the tick shows its state, disabled; no Combine pill.
- [ ] `/portal/combine/jordan` by URL: history and best/latest, no fields, "Coaches, athletes and parents enter combine scores.", no Delete.

`phil`: [ ] the Nov 9 block: Phil can tick (role coach).

Athlete `athlete-jordan`:
- [ ] Home: the Combine card, latest per distance, "Combine ›" to `/portal/combine`; enter a score: history says "Athlete"; delete it; no Delete on Luke's row.

Parent `parent-dana`:
- [ ] Family, Jordan: the Combine card on the athlete page; "Combine ›"; enter a score: "Parent"; Back: the athlete page.
- [ ] `/portal/combine/quinn-parker` (another household): the "didn't load" notice with Try again, not a blank page.

Every account:
- [ ] `read_console_messages` with `onlyErrors`: none from the new screens.
- [ ] Mobile width (`resize_window` preset mobile): the attendance rows, the Combine screen and both cards have no horizontal scroll and nothing clipped; reset to desktop after.

- [ ] **Step 3: Tear down** the app server and the emulator by their own PIDs (never `taskkill /IM node.exe`). After the owner's review, remove each lane's `node_modules` junction first (`Remove-Item` on the junction path only), then `git worktree remove` the two lane worktrees.

## Decided here

1. **The Parallax hook lives in Lane C, not B.** The task brief put every hook in Lane B, but only the attendance rows read intake ticks; keeping `hooks/parallax*.js` with the rows that use them leaves Lane C with no dependency on Lane B's files. Lane B owns the combine hooks.
2. **`byName` fallback.** Users docs may carry no `displayName` (the seeded owner has `null`), and the rules want 1 to 40 characters: first name from the users doc, else from the Firebase Auth profile, else "Owner" or "Coach".
3. **Date copy beyond 60 days.** The spec gives only "Pick a date no later than today."; an older date reads "Pick a date in the last 60 days.", an empty or invalid one "Pick a date." (the AssessmentGolf wording).
4. **The rules' date window is UTC with slack.** Rules cannot compute a Chicago date: they accept a date whose UTC midnight has passed and that is less than 62 days old (the `recentDate` pattern). So the rules may accept a Chicago-tomorrow date late in the evening, or a 61-day-old one; the client is exact and never sends either.
5. **The read-only box is its own 44 px control.** `Checkbox.js` has no `disabled` and is 26 px, under the touch floor for a coach on the floor; `ParallaxTick` follows `mental/CheckinToggle.js`. `Checkbox.js` is untouched.
6. **The owner clearing a tick confirms inline.** One-tap undo is for the person who ticked, inside ten minutes. The owner clearing anyone else's tick, or their own after ten minutes, gets "Clear Parallax intake swings for <name>?" first, because owners mark golf blocks on the floor too.
7. **Nothing shows before a tick's read lands.** An empty box during the load would read as "not done".
8. **`showIntake` is opt-in.** The route passes it; the harness and the existing Roster tests do not, so they read nothing new.
9. **Ops and Yannick on the Combine screen** read everything, enter nothing, delete nothing (spec: they do not enter scores; delete is the enterer's or the owner's).
10. **Back from Combine** uses `location.key !== 'default'` to decide between `navigate(-1)` (back to the session) and a fixed target, so the route test can prove it under `MemoryRouter`.
11. **Leaving the attendance screen resets its local "In progress" state** (marks and notes are saved; the Start session state is local). The Clubhead chip already does this; not changed here.
12. **No `firestore.indexes.json` change, no seed change.** Reads are unfiltered and sorted on the client; QA ticks and scores are made in the app, and the one aged tick is patched over the emulator's admin REST.
