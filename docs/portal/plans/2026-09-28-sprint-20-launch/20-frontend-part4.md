# Frontend - Sprint 20 Implementation Plan (part 4 of 6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**This is part 4.** Header, Global Constraints, the Day-2 sequencing note and the list of names not in the contract live in `20-frontend.md`; every constraint there applies here. Part 4 consumes `renderScreen` (Task 1), `reasonCopy` (Task 1), `bookingOpen`/`BOOKING_OPENS_LABEL` (contract 3.1, routing Task 1) and the `SpecialistBooking` in-app branch as Task 11 leaves it.

---

### Task 14: Launch fixes - catch-all route, email copy, 375px pass (closes part of #12)

**Files:**
- Modify: `frontend/src/portal/PortalRoutes.js:768`, `frontend/src/portal/screens/BookSession.js:774-778`
- Test: `frontend/src/portal/PortalRoutes.test.js`

**Interfaces:**
- Consumes: `Navigate` (react-router).
- Produces: `path="*"` -> `/portal` (PortalIndex decides sign-in vs landing). NOT here (D2): the attendance `block` navigation state's `durationMinutes` (`PortalRoutes.js:336-348,386-404`) is routing Task 11's edit; this task never touches those lines, so the two lanes cannot conflict on them.

- [ ] **Step 1: Write the failing test**

`frontend/src/portal/PortalRoutes.test.js`:
```js
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import PortalRoutes from './PortalRoutes';

jest.mock('./StatesHarness', () => ({ __esModule: true, default: () => 'HARNESS' }));

function Spy({ onLoc }) { onLoc(useLocation()); return null; }

test('an unknown portal path lands on the index (K18)', async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let loc = null;
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/portal/does-not-exist']}>
        <Spy onLoc={(l) => { loc = l; }} />
        <Routes><Route path="/portal/*" element={<PortalRoutes />} /></Routes>
      </MemoryRouter>
    );
  });
  expect(loc.pathname).toBe('/portal');
  expect(container.textContent).toContain('HARNESS');
  await act(async () => { root.unmount(); });
});
```
(If the import graph of every screen trips jsdom on a library that expects a browser global, mock that one screen module with `jest.mock('./screens/<Name>', () => ({ __esModule: true, default: () => null }))` and say which in the sprint report; the route tree, not the screens, is under test.)

- [ ] **Step 2: Run it** - Expected: FAIL (no route matches; `loc.pathname` stays `/portal/does-not-exist`).

- [ ] **Step 3: Implement**

`PortalRoutes.js`, last route before `</Routes>`:
```js
      {/* K18: an unknown path lands on the index, which sends a signed-in
          account home and everyone else to sign-in. */}
      <Route path="*" element={<Navigate to="/portal" replace />} />
```
`BookSession.js:774-778` (K30 - after the functions deploy `onBookingCreated` emails the guardian through `sendNotice`, so the promise is kept true rather than removed):
```js
          {c.email ? (
            <Body size={13} style={{ marginTop: 8 }}>
              A confirmation is on its way to {c.email} - it also appears under your notices.
            </Body>
          ) : null}
```
Registration's success copy (Task 6) and NotProvisioned (Task 7) already state what sends.

- [ ] **Step 4: Run** - `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/PortalRoutes.test.js` then the whole suite `cd frontend && CI=true npx react-scripts test --watchAll=false` - Expected: PASS. `cd frontend && npx eslint src/portal` - clean. `cd frontend && npm run build` - succeeds (this is the Railway build; `REACT_APP_*` are absent locally, which is fine for a compile check).

- [ ] **Step 5: 375px layout pass** (spec issue #7/#9/#11 "375px layout check")

Run `cd frontend && PORT=3001 npm start` (seed mode: no `REACT_APP_PORTAL_LIVE_DATA`; `frontend/.env` must carry the `REACT_APP_FIREBASE_*` names for `src/firebase.js` to load - values are never printed). In the browser at 375x812 (devtools device toolbar), walk and screenshot: `/portal/signup`; `/portal` harness cards `02 Registration` (guardian, athlete, tier, consent, success) and `NP Not provisioned`; `/portal/family` and `/portal/billing` (seed shows no pending banner - confirm the layout of `PendingBanner` by temporarily mounting `<PendingBanner pendingAthletes={[{athleteId:'x',name:'A very long athlete name'}]} />` in the harness, then revert); `/portal/coaching` with `REACT_APP_CALENDLY_MENTAL_URL` set in `.env` to any https URL (the `CalendlyPanel` renders when the routing lane's hook flags `bookingMode: 'calendly'`); `/portal/admin/signups` (seed rows come from routing's seed branch). Pass criteria: no horizontal scroll, every button at least 44px tall, the Pay now column (132px) never wraps the athlete name below it. Fix any overflow in the component that owns it and re-run the affected test file.

- [ ] **Step 6: Commit**
```bash
git add frontend/src/portal/PortalRoutes.js frontend/src/portal/PortalRoutes.test.js frontend/src/portal/screens/BookSession.js
git commit -m "fix(portal): catch-all route, confirmation copy matches what sends (#12)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 15: Proactive Oct 10 gate UI - BookSession banner + inert Reserve, SpecialistBooking's in-app branch (closes rest of #12)

**Files:**
- Create: `frontend/src/portal/components/BookingOpensBanner.js`
- Modify: `frontend/src/portal/screens/BookSession.js:24,158-164,206-234,349-356,412-421`, `frontend/src/portal/screens/SpecialistBooking.js:226-233` and the in-app `<>` fragment Task 11 Step 8 wrote
- Test: `frontend/src/portal/screens/BookSession.test.js`, `frontend/src/portal/screens/SpecialistBooking.test.js` (two tests added)

**Interfaces:**
- Consumes: `bookingOpen(now, pkg)` and `BOOKING_OPENS_LABEL` from `data/calendar.js` (contract 3.1: `pkg?.kind === 'elite' || now >= BOOKING_OPENS_AT`); `useMembership().data.members[].package` (BookSession already reads it for the window at `:158-163`); `useSpecialistSlots().data.bookingOpen` (contract 4.3 - the hook computes `bookingOpen(Date.now(), pkg)`); `Banner` (`components/Primitives`).
- Produces (new, not in contract): `BookingOpensBanner({ style })` - the one banner both screens render (contract 9.2 copy "Booking opens Fri, Oct 10 at 7 AM"); `BookSession` gate `gateOpen` (Reserve/Join waitlist inert and `confirmBooking` a no-op while closed); `SpecialistBooking` `gateOpen = data.bookingOpen ?? true` folded into `blocked`. The live rules and `createBooking` (routing Tasks 4, 7) still refuse independently - this is the proactive UI spec 5 asks for ("schedule visible, Reserve disabled, banner"), so nobody learns about the gate from an error.

- [ ] **Step 1: Write the failing BookSession test** (jest 27 modern fake timers under react-scripts 5: `jest.useFakeTimers('modern')` + `jest.setSystemTime` fake `Date`; React's `act` flushes through `require('timers').setImmediate`, which the fake does not patch, so `await act()` still resolves - if a test hangs, swap to `jest.spyOn(Date, 'now').mockReturnValue(...)` and say so in the sprint report)

`frontend/src/portal/screens/BookSession.test.js`:
```js
import React, { act } from 'react';
import { renderScreen } from './testRender';
import BookSession from './BookSession';

const BEFORE = new Date('2026-10-09T12:00:00Z'); // Fri Oct 9, 07:00 Chicago - the day before
const AT_OPEN = new Date('2026-10-10T12:00:00Z'); // BOOKING_OPENS_AT exactly
const session = { id: 's1', date: '2026-10-12', time: '4:00 PM', type: 'training', label: 'Training block', capacity: 6, booked: 2 };
let mockPackage;
let mockBooked;
jest.mock('../hooks', () => ({
  useBooking: () => ({
    data: { slots: [{ date: '2026-10-12' }], tokens: { left: 6, unlimited: false, grace: [] }, confirmation: { email: null, note: 'See you there.' }, seasonNote: null },
    loading: false, error: null,
    book: async (s) => { mockBooked.push(s.id); return {}; },
    bookRecurring: async () => ({}),
    bookingFor: null,
  }),
  useHouseholdAthletes: () => ({ data: [], loading: false }),
  useMembership: () => ({ data: { members: [{ athleteId: 'a1', package: mockPackage }] } }),
  useMonthSessions: () => ({ data: { days: [{ date: '2026-10-12', sessions: [session] }] }, loading: false, error: null }),
}));

/** The tapped day's session card: tappable cards carry cursor: pointer (SessionCard sets it from onClick). */
const sessionCard = (r) =>
  [...r.container.querySelectorAll('div')].find((el) => el.textContent.startsWith('4:00') && el.textContent.includes('Training block')) || null;

beforeEach(() => {
  mockBooked = [];
  mockPackage = { id: 't-12', kind: 'tokens', windowDays: 30 };
  jest.useFakeTimers('modern');
});
afterEach(() => { jest.useRealTimers(); });

test('before Oct 10 a token athlete sees the banner and cannot reserve', async () => {
  jest.setSystemTime(BEFORE);
  const r = await renderScreen(<BookSession bare demoSelectedDate="2026-10-12" />);
  expect(r.text()).toContain('Booking opens Fri, Oct 10 at 7 AM');
  const card = sessionCard(r);
  expect(card).not.toBeNull();
  expect(card.style.cursor).toBe('default');
  await act(async () => { card.click(); });
  expect(mockBooked).toEqual([]);
  expect(r.text()).not.toContain('Slot reserved');
  await r.unmount();
});

test('at 07:00 Chicago on Oct 10 the banner is gone and a tap reserves', async () => {
  jest.setSystemTime(AT_OPEN);
  const r = await renderScreen(<BookSession bare demoSelectedDate="2026-10-12" />);
  expect(r.text()).not.toContain('Booking opens Fri, Oct 10 at 7 AM');
  const card = sessionCard(r);
  expect(card.style.cursor).toBe('pointer');
  await act(async () => { card.click(); });
  expect(mockBooked).toEqual(['s1']);
  expect(r.text()).toContain('Slot reserved');
  await r.unmount();
});

test('Elite books before the gate (the paid package, spec 4.3)', async () => {
  jest.setSystemTime(BEFORE);
  mockPackage = { id: 'elite', kind: 'elite', windowDays: 45 };
  const r = await renderScreen(<BookSession bare demoSelectedDate="2026-10-12" />);
  expect(r.text()).not.toContain('Booking opens Fri, Oct 10 at 7 AM');
  expect(sessionCard(r).style.cursor).toBe('pointer');
  await r.unmount();
});
```

- [ ] **Step 2: Run it** - `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/screens/BookSession.test.js` - Expected: FAIL (no banner; the first test reserves).

- [ ] **Step 3: Implement**

`frontend/src/portal/components/BookingOpensBanner.js`:
```js
import React from 'react';
import { Banner } from './Primitives';
import { BOOKING_OPENS_LABEL } from '../data/calendar';

/**
 * Spec 5 / contract 9.2: before the Oct 10 gate a token family sees the
 * schedule with Reserve inert and this line; Elite never sees it. One
 * component so BookSession and SpecialistBooking cannot word it differently.
 */
export default function BookingOpensBanner({ style }) {
  return (
    <Banner tone="yellow" title="Not open yet" style={style}>
      Booking opens {BOOKING_OPENS_LABEL}
    </Banner>
  );
}
```

`BookSession.js`:
1. Line 24 becomes `import { addDaysISO, bookingOpen, monthLabel, openThrough, parseTimeToMinutes, todayISO } from '../data/calendar';` and add `import BookingOpensBanner from '../components/BookingOpensBanner';` after line 15.
2. After line 164 (`const openThroughDate = openThrough(new Date(), windowDays);`):
```js
  // Sprint 20 (spec 5, D16): the Oct 10 gate, proactively. Elite - the PAID
  // package, since the webhook corrects packageId to the paid price (spec
  // 4.3) - books at once; everyone else sees the schedule with Reserve inert
  // and the banner until 07:00 America/Chicago on Oct 10. Read once per
  // render off the same package the window comes from. The rules and
  // createBooking refuse independently; this only stops the attempt.
  const gateOpen = bookingOpen(Date.now(), selfMember?.package ?? null);
```
3. In `confirmBooking` (line 206-234), after the parent guard `if (isParent && !selectedAthleteId) return;` add:
```js
    // Closed gate: the card is inert already (DaySessionList `disabled`);
    // this covers a stale closure firing at the boundary.
    if (!gateOpen) return;
```
4. In the loaded branch, the tokens block (lines 349-356) becomes:
```js
            <div style={{ padding: '0 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {!gateOpen ? <BookingOpensBanner /> : null}
              <TokensBanner tokens={tokens} />
              {data?.seasonNote ? (
                <Banner tone="green" title="Season">
                  {data.seasonNote}
                </Banner>
              ) : null}
            </div>
```
5. `DaySessionList` (lines 412-421): `disabled={isParent && !selectedAthleteId}` becomes `disabled={(isParent && !selectedAthleteId) || !gateOpen}` and the comment above it becomes `// A parent with nothing selected has no athlete to spend a token for yet, and before the Oct 10 gate nobody but Elite reserves - sessions stay visible but inert either way.` `DaySessionList` itself is unchanged: `tappable` already includes `!disabled`, and `JoinWaitlistButton` already takes `disabled`, so a full session's waitlist join is gated too (rules refuse `waitlist` create before the gate, spec 5).

`SpecialistBooking.js` (`:226-233`, after Task 11): the `blocked` line becomes
```js
  // Sprint 20 (spec 5, D16): the hook computes bookingOpen(Date.now(), pkg)
  // (contract 4.3); absent (routing Task 10 not merged yet) reads as open so
  // the in-app list never locks on a missing field - the rules still refuse.
  const gateOpen = slotsState.data?.bookingOpen ?? true;
  const blocked = tokensSpent || capReached || !gateOpen;
```
and inside the in-app `<>` fragment of the loaded branch (Task 11 Step 8), directly above the `DayStrip` div:
```js
                {!gateOpen ? (
                  <div style={{ padding: '0 22px' }}>
                    <BookingOpensBanner />
                  </div>
                ) : null}
```
with `import BookingOpensBanner from '../components/BookingOpensBanner';` beside the other component imports. `SlotList` (`disabled={disabledForNoAthlete || blocked}`) then renders every card without `onClick`, and `DetailSheet`'s Reserve / Join waitlist is disabled for the same reason. The Calendly branch needs nothing: `calendlyBlockReason` (Task 11) already returns `'booking-not-open'` from `data.bookingOpen`.

- [ ] **Step 4: Add the two SpecialistBooking tests** to `SpecialistBooking.test.js` (Task 11's file; same mocks - the gate is the hook's flag, so no fake timers here):
```js
test('in-app branch before the gate: banner, inert cards, Reserve unreachable', async () => {
  mockSlots.data = { ...mockSlots.data, bookingMode: 'in-app', calendlyUrl: null, bookingOpen: false,
    days: [{ date: '2026-10-12', dayLabel: 'Mon, Oct 12', slots: [{ sessionId: 's1', time: '4:00 PM', open: true, capacity: 1, booked: 0, durationMinutes: 30 }] }] };
  const r = await renderScreen(<SpecialistBooking bare initialSpecialist="mental" />);
  expect(r.text()).toContain('Booking opens Fri, Oct 10 at 7 AM');
  const card = [...r.container.querySelectorAll('div')].find((el) => el.textContent.startsWith('4:00') && el.textContent.includes('Mental'));
  expect(card.style.cursor).toBe('default');
  expect(r.button('Reserve')).toBeNull();
  await r.unmount();
});

test('in-app branch after the gate: no banner, a tap opens the sheet with Reserve enabled', async () => {
  mockSlots.data = { ...mockSlots.data, bookingMode: 'in-app', calendlyUrl: null, bookingOpen: true,
    days: [{ date: '2026-10-12', dayLabel: 'Mon, Oct 12', slots: [{ sessionId: 's1', time: '4:00 PM', open: true, capacity: 1, booked: 0, durationMinutes: 30 }] }] };
  const r = await renderScreen(<SpecialistBooking bare initialSpecialist="mental" />);
  expect(r.text()).not.toContain('Booking opens Fri, Oct 10 at 7 AM');
  const card = [...r.container.querySelectorAll('div')].find((el) => el.textContent.startsWith('4:00') && el.textContent.includes('Mental'));
  expect(card.style.cursor).toBe('pointer');
  await act(async () => { card.click(); });
  expect(r.button('Reserve')).not.toBeNull();
  expect(r.button('Reserve').disabled).toBe(false);
  await r.unmount();
});
```
(`act` comes from `import React, { act } from 'react';` at the top of that file - extend the existing `import React from 'react';`. The card's text starts with the time gutter `4:00PM`... - `SessionCard` renders `{time}` then `{meridiem}` in separate divs, so `textContent.startsWith('4:00')` holds; `specialist.sessionNoun` for mental contains "Mental".)

- [ ] **Step 5: Run** - `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/screens/BookSession.test.js src/portal/screens/SpecialistBooking.test.js` - Expected: PASS (3 + 5 tests). Then the whole suite `cd frontend && CI=true npx react-scripts test --watchAll=false` - PASS; `cd frontend && npx eslint src/portal` - clean. Manual (seed mode, :3001, the 375px pass of Task 14 Step 5 if not yet done): `/portal/book` as the seeded athlete shows the yellow banner above the tokens banner and no session card has a pointer cursor; temporarily set the system clock past Oct 10 (or edit `BOOKING_OPENS_AT` locally and REVERT) to see the banner drop.

- [ ] **Step 6: Commit**
```bash
git add frontend/src/portal/components/BookingOpensBanner.js frontend/src/portal/screens/BookSession.js frontend/src/portal/screens/BookSession.test.js frontend/src/portal/screens/SpecialistBooking.js frontend/src/portal/screens/SpecialistBooking.test.js
git commit -m "feat(booking): proactive Oct 10 gate - banner + inert Reserve on BookSession and the in-app specialist list (#12)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Self-review against the spec (done while writing; the executor re-runs it at the end)

- 2.1 step 0 / 3.1: Task 3. 2.1 register/steps/Success: Tasks 4-6. 2.3 link mode: Task 5. 2.4 legacy states + Approve removed: Tasks 7, 13. 3.2 client states + Check again + login line: Tasks 7, 10. 4.2 Success pay buttons + `?paid=`: Tasks 6, 8, 9. 4.4 pending copy on every reader: Tasks 8-10. 4.5 facility card: Tasks 9, 10. 5 gate UI (schedule visible, Reserve disabled, banner; the specialist screen obeys it): Task 15, plus `calendlyBlockReason` in Task 11. 6.1 Calendly button/gates/note/non-cancellable rows/durations: Tasks 11, 12 (the attendance block duration is routing Task 11 - D2). 7 report + dashboard card + unmatched Calendly list (D16): Task 13. 9: catch-all (14), email copy (6, 7, 14), 95->90 (1), admin hidden from mental (3, 13), walkthrough loop (5, 6), Link another athlete (5). 11 frontend unit rows: claim-state table (Task 3), payload builder (Task 2); `bookingOpen`, window 30, link builder, K04, `statusFor('pending')` are routing-lane tests.
- Every hook/callable/field name used is from the contract as amended by D9 (`loginEmail`/`login` on `liveChildCard` and `liveAthleteDetail`, `hubMemberFor` `facilityAccessConsent`, `useSpecialistSlots` `householdId`, `useSignups` `unresolved`/`counts.unresolved`); `BOOKING_OPENS_LABEL` is routing Task 1 (first merge). No handoffs remain. D14: the jest virtual mocks stay; `/portal/admin`, `/portal/signin`, `/portal/register` carry the written-out runtime guards (`20-frontend.md` "Day-2 sequencing"). D1: this lane's module is `data/signupsReport.js`; routing's is `data/signups.js`. D2: no `PortalRoutes` `durationMinutes` edit here.
