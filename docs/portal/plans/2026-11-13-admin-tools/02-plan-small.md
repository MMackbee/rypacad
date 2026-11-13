# Yannick's contract off + Outstanding card folds: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the Commitment Contract out of Yannick's view, and make the admin screen's "Outstanding · N" card fold to one remembered line.

**Architecture:** Both changes are frontend only, in two lanes that touch separate files.
- **Lane A** (Yannick) deletes the mental-side contract tab, board, card and reads. It leaves a static redirect for the old URL.
- **Lane B** (admin) adds a tiny localStorage-backed `useRememberedOpen` hook in its own module, and a toggle on `OutstandingCard`.

**Tech Stack:** CRA React 18, react-router-dom 6, jest + the repo's `testRender` helpers.

**Spec:** `docs/portal/plans/2026-11-13-admin-tools/00-spec-small.md`

## Global Constraints

**Repo:**
- Repo files are CRLF. Edit them with a normalize/restore script, never `sed -i`.
- Files stay under 500 lines.
- Public repo: no real family names in code, tests or commits.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Hands off:**
- No change to `firestore.rules`, `functions/`, `data/contractBoard.js`, `data/contractRule.js` or the family-side `contractEnabled()` gates.
- Never run anything against production or localhost:3000, and never `taskkill /F /IM node.exe`.

**Commands:**
- Tests: `cd frontend && CI=true npx react-scripts test --watchAll=false <paths>`.
- Lint: `npx eslint src`. Its only allowed failure is the pre-existing `src/setupTests.js:18 'globalThis'`.
- Build: `npm run build`.

**Exact strings:**
- Storage key: `ryp.admin.outstandingOpen`, with values `'1'` (open) and `'0'` (closed).
- The closed-line summary uses each row's existing `tag`, in the order Enrollment, Attendance, Contract, Assessment. Each tag with rows reads `<Tag> <count>`, joined with ` · `. Example: `Enrollment 1 · Attendance 4 · Assessment 28`.

## Review Focus

1. **Old contract link.** A bookmarked or emailed `/portal/mental/contract` must land on the viewer's home, never on "This athlete was not found." (Task A, Step 1.)
2. **Storage that throws** (private browsing, blocked storage): the card still renders closed and the toggle still opens and closes it in memory. (Task B, Step 1.)
3. **A garbage stored value** (anything but `'1'`) reads as closed. (Task B, Step 1.)
4. **Zero Outstanding rows:** the card shows `Outstanding · 0` as today, with no toggle and no summary. (Task B, Step 1.)
5. **Yannick's athlete page:** it never reads `contractLogs` or `contractCheckins` any more, so a refused contract read can no longer blank the page. (Task A, Step 1.)

---

### Task A: Contract out of Yannick's view

**Files (all under `frontend/src/portal`):**

Modify:
- `components/BottomTabBar.js:122-126`: drop the `mental-contract` entry and its comment.
- `PortalRoutes.js`:
  - drop the MentalContract lazy loader (:68, :96), the warm-up entry (:114) and `MentalContractRoute` (:571-585);
  - replace the `mental/contract` route (:909) with `<Route path="mental/contract" element={<Navigate to="/portal" replace />} />`, declared before `mental/:athleteId`;
  - fix the comment at :904-907.
- `screens/MentalAthlete.js`:
  - drop the Contract card (:160-172), the "N min a day" header part (:67), `required` (:50), the `WEEKDAY_COUNT` import (:16) and `contract` (:103);
  - keep the `dateOf` import (noteDay uses it).
- `hooks/mental.js`:
  - drop `required` and `contract` from `athletePayload` (:83-99);
  - drop the contractLogs and contractCheckins reads in `liveMentalAthlete` (:125-138) and the seed path (:114);
  - delete `useContractBoard` (:298-453).
- `hooks/index.js:227`: drop the `useContractBoard` export.
- `StatesHarness.js:45, :366-370`: drop entry `MC`.

Delete:
- `screens/MentalContract.js` and its test.
- `components/mental/BoardRow.js` and its test.
- `components/mental/CheckinToggle.js` and `components/mental/WeekDots.js`, if nothing else imports them (grep first).

Tests to update:
- `components/BottomTabBar.test.js:78-86, :96, :139, :142`
- `PortalRoutes.mental.test.js:13-22`
- `screens/MentalAthlete.test.js`
- `hooks/mental.test.js`
- `hooks/mental.live.test.js` (drop the board block :165-395, and the contract mocks at :392-393 and :425-426)

**Interfaces:** Produces nothing other tasks use. `data/contractBoard.js` and `data/contractRule.js` keep every export.

- [ ] **Step 1: Write the failing tests**

`PortalRoutes.mental.test.js`: replace the "clicks Contract" test.

```js
test('a mental login has no Contract tab', ...)
// renders the mental tab bar; expect(queryByText('Contract')).toBeNull()

test('/portal/mental/contract goes home, never to an athlete called "contract"', ...)
// signed in as role 'mental', start at /portal/mental/contract
// expect location to end at the mental landing (landingFor), and the text 'This athlete was not found' to be absent
```

`components/BottomTabBar.test.js`:

```js
expect(TABS.mental.map((t) => t.key)).not.toContain('mental-contract')
```

Update the label lists so they no longer contain `'Contract'`.

`screens/MentalAthlete.test.js`:
- The header reads `'Age 14'` with no ` · 20 min a day`.
- The page contains none of `'This week'`, `'Never checked in'`, `'Last check-in'`, `'min a day'`.
- Delete the contract-only tests (:34, :46-53, :55-61).

`hooks/mental.live.test.js`:

```js
test('the athlete page reads no contract data', ...)
// run liveMentalAthlete; assert no query or read targeted 'contractLogs' or 'contractCheckins'
// and the payload has no `contract` / `required` keys
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `CI=true npx react-scripts test --watchAll=false src/portal/PortalRoutes.mental src/portal/components/BottomTabBar src/portal/screens/MentalAthlete src/portal/hooks/mental`

Expected: FAIL on the tab, the redirect, the header text and the contract reads.

- [ ] **Step 3: Make the code changes listed under Files.**

Delete the board screen, components and hook with their tests. Grep `useContractBoard|MentalContract|BoardRow|CheckinToggle|WeekDots` until the only hits are in `data/contractBoard*`.

- [ ] **Step 4: Run the same tests, then the whole suite**

Expected: PASS. The whole suite (`CI=true npx react-scripts test --watchAll=false`) is green, and `npx eslint src` shows only the setupTests.js:18 error.

- [ ] **Step 5: Commit**

`git commit -m "feat(mental): the Commitment Contract leaves Yannick's view (owner 2026-11-12/13)"`

---

### Task B: Outstanding card folds

**Files (all under `frontend/src/portal`):**
- Create: `hooks/rememberedOpen.js`. It is not re-exported from `hooks/index.js`; see the `hooks/calendarView.js` header for why.
- Create: `hooks/rememberedOpen.test.js`.
- Modify: `screens/AdminDashboard.js` (`OutstandingCard` :257-316, plus a pure `outstandingSummary`).
- Modify: `screens/AdminDashboard.test.js`, `AdminDashboard.scholarships.test.js` and `AdminDashboard.fallback.test.js` where they assert row text. Set `localStorage['ryp.admin.outstandingOpen'] = '1'` in `beforeEach`, and clear it in `afterEach`.

**Interfaces:**
- Produces `useRememberedOpen(storageKey: string, defaultOpen: boolean): [open: boolean, toggle: () => void]`. It reads once on mount: `'1'` means open, `'0'` means closed, anything else means `defaultOpen`. `toggle` flips the state and writes `'1'`/`'0'`. Every storage access is in try/catch.
- Produces `outstandingSummary(items): string`, exported from `AdminDashboard.js` for tests. It follows the Global Constraints format and returns `''` for no items.

- [ ] **Step 1: Write the failing tests**

`hooks/rememberedOpen.test.js`:

```js
test('nothing stored -> defaultOpen; toggle writes "1" then "0"')
test('stored "1" opens, "0" closes, "yes"/"" fall back to defaultOpen')
test('getItem and setItem throwing: starts at defaultOpen, toggle still flips in memory')
```

`screens/AdminDashboard.test.js`, a new `describe('Outstanding folds (owner 2026-11-13)')` with rows of each tag:

```js
test('first visit: closed - heading "Outstanding · 3", summary "Enrollment 1 · Attendance 1 · Assessment 1", no row names; button aria-expanded="false"')
test('tap the heading: rows appear, aria-expanded="true", localStorage "ryp.admin.outstandingOpen" === "1"; tap again -> "0" and rows hidden')
test('stored "1": opens on mount')
test('zero rows: "Outstanding · 0", no button, no summary')
test('ops sees the same fold')   // role="ops"
expect(outstandingSummary([])).toBe('')
```

- [ ] **Step 2: Run them to verify they fail**

Run: `CI=true npx react-scripts test --watchAll=false src/portal/hooks/rememberedOpen src/portal/screens/AdminDashboard`

Expected: FAIL (module missing, rows visible).

- [ ] **Step 3: Implement `useRememberedOpen` and the toggle**

The `OutstandingCard` heading becomes a full-width `<button type="button" aria-expanded aria-controls="outstanding-rows">`, at least 44px tall. It carries the `SectionLabel` text `Outstanding · N` in the error tone, the summary (11px, secondary text) and a ▾/▴ chevron like TokenMeter's `Toggle`. The rows wrapper gets `id="outstanding-rows"` and renders only while open.

With zero items, keep today's markup: a plain label and no button.

The fold uses the filtered `outstanding` rows, so the tier filter and the summary agree.

- [ ] **Step 4: Run the same tests, then the whole suite**

Expected: PASS. The whole suite is green, and eslint shows only the setupTests.js:18 error.

- [ ] **Step 5: Commit**

`git commit -m "feat(admin): the Outstanding card folds to one remembered line (owner 2026-11-13)"`

---

### Task C: Integrate and gate

- [ ] **Step 1:** Merge both lanes into one branch off develop c638528. They share no files. If `StatesHarness.js` conflicts, keep both changes.
- [ ] **Step 2:** Run the whole jest suite, `npx eslint src` (only setupTests.js:18) and `npm run build`. All must pass.
- [ ] **Step 3:** Browser check in seed mode, on a port other than 3000 with `REACT_APP_PORTAL_LIVE_DATA=false`:
  - The mental tab bar has no Contract tab.
  - `/portal/mental/contract` lands home.
  - An athlete page has no contract lines.
  - The admin Outstanding card starts closed, opens, and stays open after a reload.
- [ ] **Step 4:** Merge into local develop. The owner pushes develop (staging) and then `develop:main`. No functions or rules deploy.
