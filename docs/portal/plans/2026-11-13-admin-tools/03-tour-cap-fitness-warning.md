# Tour events capped at 20, "Fitness with no golf" warning row (owner 2026-11-13)

Short design and plan in one file (two small changes). Owner, 2026-11-13:
- "Go ahead on tour cap, and yes add a warning row for fitness no golf."
- Earlier the same day: "dont cancel both sessions at once". So there is NO "cancel the golf block and its fitness session together" feature.
- Nothing here cancels or hides a session.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

## Design

**Why**
- Tour events (sessions `type 'tournament'`, two each Saturday) should take at most 20 kids. Today the cap is 25. The busiest upcoming event has 19 booked (read-only probe, 2026-11-13), so nobody is over 20.
- A fitness session (`type 'phil'`) whose golf time is gone costs the academy a trainer for a workout with no golf around it.
  - On 2026-11-13 there were six: the Mon/Wed 6 PM Phil sessions beside the 6 PM golf blocks hidden on 2026-11-05 (Nov 25, Dec 2, 9, 16, 21, 23).
  - Five of them have kids booked.
  - The owner wants them flagged on the admin screen, not cancelled automatically.

**Tour cap**
- The calendar sync gives a new Tour event capacity 20 (`scripts/sync-calendar-sessions.mjs` `CAPACITY`). The sync rewrites capacity on every matched doc (`SYNCED_FIELDS`), so a data fix alone would be undone.
- The generator/seed default (`frontend/src/portal/data/schedule.js` `CAPACITY_BY_TYPE`) becomes 20 too.
- A one-time script, `scripts/cap-tour-sessions.mjs`, sets `capacity: 20` on every Tour event from today to the season's end:
  - masked to `capacity`, with an `updateTime` precondition;
  - `--dry-run` / `--yes`; Claude runs only `--dry-run`, the owner runs `--yes`.
- It never touches bookings, `booked`, status or hidden.
- An event already over 20 keeps everyone and is reported "kept: N booked > 20". The rules then refuse new bookings until it drops below 20.
- Not used: re-running the sync over the season. It also rewrites `status` to 'scheduled' and would reopen a session cancelled in the app.

**Warning row**
- The Outstanding card gains one row per orphaned fitness session in the next 28 days (builder's call, Claude: four weeks covers staffing; reading the whole season on every admin load is wasteful). A fitness session is orphaned when:
  - it is `type 'phil'`, not cancelled and not hidden; and
  - no golf session overlaps it in time on the same date. Golf is `type 'training'` or `'tournament'`, not cancelled and not hidden.
- Overlap means `G.start < P.end && P.start < G.end`, with `start` = the time parsed to minutes and `end` = start + `durationMinutes` (default 60). Saturday's fitness hours overlap the Tour events, so they are not orphans.
- Row copy:
  - who: `Fitness with no golf · Wed Nov 25, 6:00 PM`
  - why, by reason:
    - golf at that time is hidden: `<n> booked · the golf block at this time is hidden`
    - golf at that time is cancelled: `<n> booked · the golf block at this time is cancelled`
    - no golf at that time at all: `<n> booked · no golf at this time`
  - with nobody booked, `<n> booked` reads `Nobody booked yet`.
- Tag `Fitness`. Tone `red` when booked > 0, else `yellow`. `athleteId: null`, `packageIds: null` (shown under every tier filter). Sorted by date and time.
- The fold summary's tag order becomes Enrollment, Attendance, Fitness, Contract, Assessment.
- A failed read drops only these rows, never the dashboard.
- Owner and ops both see it (same card).

**Non-goals**
- No auto-cancel or auto-hide, and no change to the Roster cancel.
- No change to the sync's status handling.
- No rules or functions change.
- No family-facing change.

## Global Constraints

**Editing and limits:**
- Repo files are CRLF: edit through a normalize/restore script, never `sed -i`.
- Files stay under 500 lines.

**Production, ports and processes:**
- Never run a script with `--prod --yes`, never use localhost:3000, never `taskkill /F /IM node.exe`.
- Claude may run `--prod --dry-run`.

**Repo hygiene:**
- No real family names in code, tests or commits.
- Commit trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Commands:**
- Frontend tests: `cd frontend && CI=true npx react-scripts test --watchAll=false <paths>`.
- Lint: `npx eslint src`. The only allowed failure is `src/setupTests.js:18`.
- Script tests: `node --test scripts/test/*.test.mjs` from the repo root.

## Review Focus

1. A Tour event already over 20: the script keeps everyone and only reports it (Task T, Step 1).
2. A fitness session overlapping a 2-hour Tour event that starts earlier (Sat 11 AM vs a 10 AM Tour) is NOT an orphan (Task W, Step 1).
3. Golf partly gone: one overlapping golf block hidden and another live means NOT an orphan (Task W, Step 1).
4. A time that can't be parsed (`''`, `'TBD'`) never throws and never flags (Task W, Step 1).
5. A hidden or cancelled fitness session is never flagged (Task W, Step 1).

---

### Task T: Tour cap 20

**Files:**
- Modify `scripts/sync-calendar-sessions.mjs` (`CAPACITY` ~:108, comments ~:27, ~:91-93).
- Modify `frontend/src/portal/data/schedule.js` (`CAPACITY_BY_TYPE` ~:91, comments ~:97-98) and the `season.js` comment ~:223.
- Update `frontend/src/portal/data/amendments.test.js` (~:73-86 pin 25) and any script test that pins 25.
- Create `scripts/cap-tour-sessions.mjs` and `scripts/test/cap-tour-sessions.test.mjs`, modelled on `scripts/hide-sessions.mjs` and its test: `resolveTarget`, emulator without `--prod`, the `invokedDirectly` guard, exported pure helpers.

**Interfaces** (exported):
- `parseArgs(argv)` -> `{prod, from, to, dryRun, yes} | {error}`.
  - `from` defaults to today (America/Chicago), `to` to `'2027-02-27'`.
  - It requires exactly one of `--dry-run` / `--yes`.
- `planCaps(sessions, cap = 20)` -> `{change: [{id, date, time, from, booked, over}], same: [ids]}`.
  - Tour only. `over` is true when `booked > cap`.

- [ ] **Step 1: Failing tests.**
  - `planCaps`:
    - changes a 25 to 20;
    - skips one already at 20;
    - ignores training, phil and mental;
    - flags `over` for booked 23 and still changes it.
  - `parseArgs`: defaults and errors.
  - The writes: masked to `['capacity']` with `currentDocument.updateTime`.
  - `amendments.test.js`: expects 20.
- [ ] **Step 2: Run the tests and see them fail.**
- [ ] **Step 3: Implement.**
  - The script prints one line per session: `date time  booked/old -> 20`, with `  kept: N booked > 20` when over.
  - It prints totals.
  - With `--yes` it commits in batches and reads each doc back.
- [ ] **Step 4: Run the tests.** Script tests and the frontend `amendments` and `schedule` tests are green.
- [ ] **Step 5: Commit.** `feat(sessions): Tour events take at most 20 (owner 2026-11-13)`.

### Task W: "Fitness with no golf" row

**Files:**
- Create `frontend/src/portal/data/orphanFitness.js` and its test.
- Modify `frontend/src/portal/hooks/index.js` `liveAdminDashboard`:
  - add a parallel read of today..today+27 with `.catch(() => null)`;
  - append the rows to `outstanding`;
  - add the seed path equivalent if the seed admin dashboard builds outstanding rows.
  - Verify that the sessions fetcher returns hidden and cancelled sessions to staff; if it filters them, read with a staff variant.
- Modify `frontend/src/portal/components/OutstandingCard.js` (`TAG_ORDER`).
- Tests next to `hooks/index.assessments.test.js` and `AdminDashboard.test.js`.

**Interfaces:**
- `orphanFitness(sessions: Array<session>, {from: 'YYYY-MM-DD', to: 'YYYY-MM-DD'})` -> `Array<{id, date, time, booked, reason: 'hidden'|'cancelled'|'none'}>`, sorted by date then start.
  - `reason` is `'hidden'` when any overlapping golf is hidden; else `'cancelled'` when any is cancelled; else `'none'`.
- `fitnessRow(o)` -> an outstanding row `{id: 'fitness-<id>', kind: 'fitness', athleteId: null, who, why, tag: 'Fitness', tone, packageIds: null}` with the copy above.

- [ ] **Step 1: Failing tests.**
  - `orphanFitness`, with the Review Focus items 2-5 as named tests, plus:
    - the six-session production shape: a 6 PM phil with a hidden 6 PM training → `reason 'hidden'`;
    - a phil with no golf at all → `'none'`.
  - `fitnessRow` copy: exact strings for booked 2/hidden, booked 0/none, cancelled.
  - The hook appends the rows and a rejected read drops only them.
  - `OutstandingCard` summary order puts `Fitness` after `Attendance`.
- [ ] **Step 2: Run the tests and see them fail.**
- [ ] **Step 3: Implement.** Reuse the existing time parser (`data/calendar.js` `parseTimeToMinutes`) and date label helpers. No new parser.
- [ ] **Step 4: Run the tests.** Then the whole suite and eslint.
- [ ] **Step 5: Commit.** `feat(admin): flag fitness sessions with no golf beside them (owner 2026-11-13)`.

### Task I: Integrate and release

**Gate:**
- Merge T and W, then run the whole jest suite, eslint, `npm run build` and `node --test scripts/test/*.test.mjs`.
- Seed-harness check of the row.
- Claude runs `node scripts/cap-tour-sessions.mjs --prod --dry-run`.

**Release (owner):**
1. Push develop, then `develop:main`. Frontend only.
2. Run `node scripts/cap-tour-sessions.mjs --prod --yes`.
