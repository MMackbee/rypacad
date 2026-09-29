# Frontend - Sprint 20 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**This plan is split in six files** (each under 900 lines). Execute in order; every later part consumes names an earlier part produces.

| File | Tasks |
|---|---|
| `20-frontend.md` (this file) | header, Global Constraints, Day-2 sequencing, Tasks 1-2 (test scaffolding, sign-up helpers) |
| `20-frontend-part1b.md` | Tasks 3-4 (SignUp/SignIn, Registration steps) |
| `20-frontend-part1c.md` | Tasks 5-7 (Registration state machine, PayButton + Success, NotProvisioned) |
| `20-frontend-part2.md` | Tasks 8-10 (pending banners + pay + `?paid=`, facility add-on, billing hub + athlete login line) |
| `20-frontend-part3.md` | Tasks 11-13 (Calendly branch, non-cancellable rows, AdminSignups report) |
| `20-frontend-part4.md` | Tasks 14-15 (launch fixes, the proactive Oct 10 gate UI), self-review |

**Goal:** Ship the launch screens - instant sign-up, per-athlete payment state, Calendly for Yannick, the admin sign-ups report and the section-9 fixes - on top of the hooks and callables the routing lane produces.

**Architecture:** Screens stay thin: every decision a test needs to pin lives in a pure `data/*.js` helper (payload builder, gate reasons, copy tables) and every network call goes through the contract's hooks/callables (`hooks/callables.js`, `hooks/billing.js`, `useAuthSession`, `useSignups`). Screens are rendered in jest with a small `react-dom/client` + `MemoryRouter` helper and the contract modules mocked at the module boundary; `src/firebase.js` is mocked globally so nothing initialises Firebase under test. Registration.js is split into three files (state/submit, step components, success) to stay under 500 lines.

**Tech Stack:** React 18.3 (CRA 5, JS), react-router-dom 6.30 (`useSearchParams`, `useLocation` state), firebase JS SDK 9 (via routing's hooks only), jest (react-scripts) + jsdom, `react-dom/client` + `React.act` for screen tests.

**Spec:** docs/portal/SPRINT-20-LAUNCH.md - sections 2.1, 2.4, 3.1, 3.2 (client states), 4.2 (Success/`?paid=`), 4.4 (pending copy), 4.5, 6.1 (portal side), 7, 9, 11 (frontend unit rows), 13 (cut line).
**Interfaces:** docs/portal/plans/2026-09-28-sprint-20-launch/01-interfaces.md
**GitHub issues:** #7 #8 #9 #10 #11 #12 (Tasks 1-7 close #7, #8; Tasks 8-15 close #9, #10, #11, #12 - Task 15 closes the rest of #12).

## Global Constraints

- Token window is **30** days (`windowDays: 30`, `windowDaysFor` fallback 30, `calendar.js` defaults 30); Elite stays 45. Routing owns the constants; screens never restate a number.
- `BOOKING_OPENS_AT = 1791633600000` (2026-10-10T12:00:00Z = 07:00 America/Chicago); screens read `bookingOpen()` / `BOOKING_OPENS_LABEL` from `data/calendar.js`, never the epoch.
- Charging never branches on session type (the only named exceptions are Yannick's cadence and Elite's daily caps, both pre-existing).
- Tokens are derived, never stored; no screen counts anything.
- `firestore.rules` field lists are closed (`hasAll`/`hasOnly`); `billing`, `facilityBilling`, `source`, `calendlyInviteeUri`, `flag` are server-written and never enter a client write.
- Every file stays under 500 lines (split when a task would push one past it).
- No secrets in source; env values are read by NAME only (`REACT_APP_*`), never printed.
- Every commit message ends with the line `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Agents never push or deploy; the owner runs those.
- Colour/typography from `frontend/src/portal/tokens.js`; primitives from `components/Primitives.js`; live data only through hooks.
- Test command: `cd frontend && CI=true npx react-scripts test --watchAll=false <path>`.
- Exact copy from contract section 9 is used verbatim (hyphen `-`, not em dash, except the payment-received notice which the functions lane owns).

**Names this plan introduces that are not in the contract** (each is marked `(new, not in contract)` where defined): `src/setupTests.js`, `screens/testRender.js#renderScreen`, `data/signup.js` (`ageOnDate`, `isAdultOnDate`, `normalizeHandicap`, `validateAthleteEntry`, `buildCreateFamilyPayload`, `buildAddAthletesPayload`, `newAthleteEntry`, `TIER_MINUTES`, `CHILD_LOGIN_ENABLED`, `U13_HELPER`), `data/authCopy.js` (`VERIFY_EMAIL_SENDER`, `verifyBody`, `notProvisionedView`, copy constants), `data/billingCopy.js`, `data/specialistGate.js`, `data/signupsReport.js` (D1 - the report's row COPY; routing owns `data/signups.js` = `buildSignupRows`), `components/PayButton.js` (`PayButton`, `startCheckout`), `components/PendingBanner.js`, `components/PaymentConfirming.js`, `components/FacilityCard.js`, `components/CalendlyPanel.js`, `components/BookingOpensBanner.js` (Task 15), `screens/SignUp.js`, `screens/RegistrationSteps.js`, `screens/RegistrationSuccess.js`, `screens/AdminSignups.js`, `PortalRoutes.js#RegistrationRoute`/`SignupsRoute`, `Registration` props `mode`/`account`/`onRefresh`, `Field` `aria-label`, `PackageCard` `aria-label={pkg.name}`, `AdminDashboard.js#useSignupsFallback` / `Registration.js#notWired` (the D14 guards below), `AdminSignups` "Unmatched Calendly bookings" list (D16). Fields this plan reads that D9 ADDED to the contract (no longer handoffs): `useAthleteDetail` / `liveChildCard` `loginEmail` + `login { state, claimedAt }`, `hubMemberFor` `facilityAccessConsent`, `useSpecialistSlots().data.householdId`, `useSignups().data.unresolved` + `counts.unresolved`.

## Day-2 sequencing (D14)

Both lanes build on Day 2 in parallel worktrees; integration is Day 3. The routing lane merges in this order: **Tasks 1, 2, 3, 6, 9 first** (`data/calendar.js` gate + `BOOKING_OPENS_LABEL`, `data/calendly.js` + the specialist registry, `billingHub.statusFor('pending')` + `hooks/billing.js` `usePaymentConfirmation`, `firebase.js` functions + `hooks/callables.js`, `useAuthSession` create-login / `refresh()` / claim), **then 4/5** (rules), **then 7, 8, 10, 11, 12, 13** (`live.js` gates, `bookRecurring` gates, specialist slots `bookingMode`/`bookingOpen`/`householdId`/durations, row `source` + durations, home `billingStatus`/`loginEmail`/`login`, `useSignups` + admin `pending`). The frontend worktree is rebased onto main after the first group merges and BEFORE Task 5 runs - check with `ls frontend/src/portal/hooks/callables.js` and `grep -n "BOOKING_OPENS_LABEL" frontend/src/portal/data/calendar.js`; both must succeed.

Two rules for every screen in this plan that imports a routing seam:

1. **Jest**: the screen test mocks the seam at the module boundary - `jest.mock('../hooks', ...)`, `jest.mock('../hooks/billing', ...)`, `jest.mock('../hooks/useAuthSession', ...)`, and `{ virtual: true }` for a module routing CREATES (`../hooks/callables`, `../data/calendly`), so the test is green whether or not the file exists in this worktree yet. The virtual mocks are never removed at integration.
2. **Runtime, day-1 routes**: a screen mounted on a route the Oct 1 email can reach (`/portal/signin`, `/portal/signup`, `/portal/register`, `/portal/not-provisioned`, `/portal/family`, `/portal/home`, `/portal/billing`, `/portal/membership`, `/portal/book`, `/portal/coaching`, `/portal/admin`) must not crash when a routing export from the LATER groups (7-13) is absent. A missing NAMED export is `undefined` under webpack (a compile warning, not an error), so the guard is the namespace-import + inert-fallback pattern already at `Registration.js:27-35` (`useEnrollmentFallback`): import the namespace, `||` a local fallback of the same shape, call it unconditionally (rules of hooks). A missing MODULE is a compile error no runtime guard covers - that is why the first group (1, 2, 3, 6, 9) merges before the frontend rebases, and why nothing in this plan creates a stub for a routing file (it would be an add/add conflict at integration).

| Frontend task / screen | Routing seam it imports | Routing task | Guard |
|---|---|---|---|
| 1 `BookingReasons` | `BOOKING_OPENS_LABEL` | 1 (first group) | none - merged before Task 1 integrates |
| 3 `SignUp`, `SignIn` | `useAuthSession().createLogin`, `claimState` | 9 (first) | `SignIn` renders `CreateLoginSection` only when `typeof createLogin === 'function'` |
| 5 `Registration` | `hooks/callables.js` | 6 (first) | namespace + `notWired` fallback (below) |
| 6 `PayButton` | `callCreateCheckoutSession`, `resendVerification`, `auth.currentUser` (`firebase.js`) | 6, 9 (first) | same `notWired` guard; `if (fbUser)` / `if (resendVerification)` |
| 7 `NotProvisioned` | `claimState`, `checkInvite`, `resendVerification` | 9 (first) | `notProvisionedView({ claimState: undefined })` is `'stranger'` |
| 8 `ParentDashboard` | `useBillingHub().data.status.pendingAthletes`, `usePaymentConfirmation` | 3 (first) | `?.` reads |
| 8 `ChildCard` | `children[].loginEmail`, `login` | 12 (later) | `'loginEmail' in child` - renders nothing until it lands |
| 9/10 `Membership`, `AthleteDashboard`, `Billing` | `useMyTokens().data.status`, `members[].billing` | 3 (first) | `?.` reads |
| 10 `AthleteDetail` | `athlete.loginEmail`, `login` | 12 (later) | `'loginEmail' in athlete` |
| 11 `SpecialistBooking` | `data.bookingMode`, `calendlyUrl`, `bookingOpen`, `householdId`, `slots[].durationMinutes`; `data/calendly.js` | 10 (later); 2 (first) | `?.` reads fall to the in-app branch; `formatDuration(undefined)` is falsy; `bookingOpen ?? true` |
| 12 `MySchedule`, `Reservations` | `rows[].source` | 11 (later) | `s.source === 'calendly'` is simply false |
| 13 `AdminDashboard`, `AdminSignups` | `useSignups`, `membership.pending` | 13 (later, LAST) | namespace + `useSignupsFallback` (below); `membership.pending ?? 0` |
| 15 `BookSession` | `bookingOpen(Date.now(), pkg)` | 1 (first) | none - merged before |

The two guards this plan writes out (the executor copies them exactly):

`AdminDashboard.js` - Task 13 Step 8 KEEPS the existing `import * as hooks from '../hooks';` (line 4) and replaces the deleted `useEnrollmentQueueFallback` block (lines 13-33) with:
```js
/**
 * Sprint 20 (spec 7, D14): useSignups() lands with routing Task 13, the LAST
 * routing merge. /portal/admin is a day-1 route, so until that export exists
 * the Sign-ups card renders an honest empty count instead of crashing the
 * whole dashboard. Namespace-import + inert-fallback (Registration.js:27-35);
 * the hook call in SignupsCard stays unconditional (rules of hooks).
 */
function useSignupsFallback() {
  return {
    data: { rows: [], counts: { all: 0, unpaid: 0, flagged: 0, unresolved: 0 }, unresolved: [] },
    loading: false,
    error: null,
  };
}
const useSignups = hooks.useSignups || useSignupsFallback;
```
`SignupsCard` then calls `const { data, loading, error } = useSignups();` exactly as Task 13 writes it. `AdminSignups.js` carries its own copy of the same three-line guard (`import * as hooks from '../hooks';` + `useSignupsFallback` + `const useSignups = ...`) - a screen never imports a private name from the dashboard.

`Registration.js` - Task 5 Step 3 uses this in place of a plain named import of `callAddAthletes` / `callCreateFamily`:
```js
import * as callables from '../hooks/callables';

/**
 * Sprint 20 (D14): hooks/callables.js is routing Task 6 (first merge group),
 * so the module is on disk; this guards a partial export while the two lanes
 * integrate. The fallback rejects the way the real client would on a dead
 * function, so the form shows a plain error rather than a stack trace.
 */
function notWired(name) {
  return async () => {
    const err = new Error(`${name} is not available yet. Try again in a minute.`);
    err.reason = 'not-wired';
    throw err;
  };
}
const callCreateFamily = callables.callCreateFamily || notWired('createFamily');
const callAddAthletes = callables.callAddAthletes || notWired('addAthletes');
```
`PayButton.js` (Task 6) guards `callCreateCheckoutSession` the same way: `import * as callables from '../hooks/callables';` and `const callCreateCheckoutSession = callables.callCreateCheckoutSession || notWired('createCheckoutSession');` with its own copy of `notWired`. The jest virtual mocks in Tasks 5 and 6 return plain objects, which a namespace import reads exactly like named imports.

---

### Task 1: Test scaffolding, Field labels, shared reason copy, 90-minute tier (closes part of #8, #10, #12)

**Files:**
- Create: `frontend/src/setupTests.js`, `frontend/src/portal/screens/testRender.js`
- Modify: `frontend/src/portal/components/Field.js:53-69,132-153` (aria-label), `frontend/src/portal/components/BookingReasons.js:25-34`, `frontend/src/portal/screens/AthleteDetail.js:37`, `frontend/src/portal/screens/Registration.js:504`
- Test: `frontend/src/portal/components/BookingReasons.test.js`, `frontend/src/portal/screens/testRender.test.js`

**Interfaces:**
- Consumes: `BOOKING_OPENS_LABEL` from `data/calendar.js` (contract 3.1, routing Task 1 - the first routing merge per D14; it is on disk before this task integrates, see "Day-2 sequencing").
- Produces: `renderScreen(element, { path }) -> { container, text(), button(label), click(label), fill(ariaLabel, value), flush(), location(), unmount() }` (new, not in contract); `reasonCopy('billing-pending' | 'booking-not-open' | 'calendly-managed')` per contract 3.6; `CALENDLY_MANAGED_COPY` (new, not in contract) = `reasonCopy('calendly-managed')`.

- [ ] **Step 1: Write the failing reason-copy test**

`frontend/src/portal/components/BookingReasons.test.js`:
```js
import { CALENDLY_MANAGED_COPY, reasonCopy } from './BookingReasons';

describe('Sprint 20 booking reasons (contract 3.6)', () => {
  test('billing pending', () => {
    expect(reasonCopy('billing-pending')).toBe('Payment pending - finish checkout to start booking');
  });
  test('booking not open names the gate', () => {
    expect(reasonCopy('booking-not-open')).toBe('Booking opens Fri, Oct 10 at 7 AM');
  });
  test('calendly rows are managed by Calendly', () => {
    expect(reasonCopy('calendly-managed')).toBe("Cancel or reschedule from Calendly's email");
    expect(CALENDLY_MANAGED_COPY).toBe(reasonCopy('calendly-managed'));
  });
  test('unknown reasons stay null', () => {
    expect(reasonCopy('nope')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it** - `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/components/BookingReasons.test.js` - Expected: FAIL, `CALENDLY_MANAGED_COPY` undefined / `reasonCopy('billing-pending')` is null.

- [ ] **Step 3: Add the three reasons**

In `BookingReasons.js` replace the import line 4 with
```js
import { BOOKING_OPENS_LABEL, longDayLabel, nextMonthFirstShort, todayISO, windowOpensOn } from '../data/calendar';
```
and insert before `if (reason === 'full')` (line 31):
```js
  // Sprint 20 (contract 3.6): the per-athlete paid gate, the Oct 10 gate and
  // Calendly-managed rows. Copy is section 9's, verbatim.
  if (reason === 'billing-pending') return 'Payment pending - finish checkout to start booking';
  if (reason === 'booking-not-open') return `Booking opens ${BOOKING_OPENS_LABEL}`;
  if (reason === 'calendly-managed') return "Cancel or reschedule from Calendly's email";
```
and after `reasonCopy` add
```js
/** The non-cancellable Calendly row's action copy (MySchedule, Reservations). */
export const CALENDLY_MANAGED_COPY = reasonCopy('calendly-managed');
```
`BookingReasons` imports `BOOKING_OPENS_LABEL` from `'../data/calendar'` and nothing else: routing Task 1 (window 30, the Oct 10 gate, `BOOKING_OPENS_LABEL`) is the first routing merge (D14) and lands before this task integrates. Do NOT add the constant to `data/calendar.js` from this lane. In a worktree that predates that merge the test's second case reads `Booking opens undefined` and fails - rebase, do not patch.

- [ ] **Step 4: Run it** - same command - Expected: PASS (4 tests).

- [ ] **Step 5: 95 -> 90 in both tier pickers**

`AthleteDetail.js:37`: `const TIER_MINUTES = [20, 45, 90];` and `Registration.js:504`: `const TIER_MINUTES = [20, 45, 90];` (the `[20, 45, 95]` comment lines above each change `95` to `90`). Verify: `grep -n "45, 95" frontend/src/portal/screens/*.js` prints nothing.

- [ ] **Step 6: Field aria-labels + global firebase mock + render helper**

`Field.js`: on the `<input` (line 53) add `aria-label={label}`; on the `<select` (line 132) add `aria-label={label}`.

`frontend/src/setupTests.js` (new, not in contract; CRA loads it via `setupFilesAfterEach`):
```js
// Firebase never initialises under jest: src/firebase.js throws on a missing
// API key (firebase.js:35-42, getAuth), and no test needs a real app. Hooks
// keep importing the same names; screens run in seed mode (isLive() false).
jest.mock('./firebase', () => ({
  __esModule: true,
  default: {},
  auth: { currentUser: null },
  provider: {},
  db: {},
  storage: {},
}));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
```

`frontend/src/portal/screens/testRender.js` (new, not in contract):
```js
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

function LocationSpy({ onChange }) {
  const loc = useLocation();
  onChange(loc);
  return null;
}

/** Mounts a screen under a MemoryRouter; every action is wrapped in act(). */
export async function renderScreen(element, { path = '/' } = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const loc = { current: null };
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <LocationSpy onChange={(l) => { loc.current = l; }} />
        <Routes>
          <Route path="*" element={element} />
        </Routes>
      </MemoryRouter>
    );
  });
  // A real <button> by its visible text, or ANY button-like element by its
  // aria-label: Toggle (role="switch", no text), PackageCard and the
  // AdminSignups row (role="button" divs) are all tap targets the screens
  // tests click by name.
  const button = (label) =>
    [...container.querySelectorAll('button, [role="button"], [role="switch"]')].find(
      (b) => b.textContent.trim() === label || b.getAttribute('aria-label') === label
    ) || null;
  const valueSetter = (el) => {
    const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype
      : el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    return Object.getOwnPropertyDescriptor(proto, 'value').set;
  };
  return {
    container,
    text: () => container.textContent,
    button,
    click: async (label) => {
      const b = button(label);
      if (!b) throw new Error(`no button "${label}"`);
      await act(async () => { b.click(); });
    },
    fill: async (ariaLabel, value) => {
      const el = container.querySelector(`[aria-label="${ariaLabel}"]`);
      if (!el) throw new Error(`no field "${ariaLabel}"`);
      valueSetter(el).call(el, value);
      await act(async () => {
        el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
      });
    },
    flush: () => act(async () => {}),
    location: () => loc.current,
    unmount: async () => { await act(async () => { root.unmount(); }); container.remove(); },
  };
}
```

- [ ] **Step 7: Prove the helper on an existing screen**

`frontend/src/portal/screens/testRender.test.js`:
```js
import React from 'react';
import { renderScreen } from './testRender';
import Field from '../components/Field';

function Probe() {
  const [v, setV] = React.useState('');
  return (
    <div>
      <Field label="Email" value={v} onChange={setV} />
      <span data-probe>{v}</span>
    </div>
  );
}

test('renderScreen fills labelled fields and reads text', async () => {
  const r = await renderScreen(<Probe />, { path: '/portal/x' });
  await r.fill('Email', 'dana@email.com');
  expect(r.container.querySelector('[data-probe]').textContent).toBe('dana@email.com');
  expect(r.location().pathname).toBe('/portal/x');
  await r.unmount();
});
```
Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/screens/testRender.test.js` - Expected: PASS.

- [ ] **Step 8: Run the whole suite once** - `cd frontend && CI=true npx react-scripts test --watchAll=false` - Expected: every existing `data/*.test.js` still passes.

- [ ] **Step 9: Commit**
```bash
git add frontend/src/setupTests.js frontend/src/portal/screens/testRender.js frontend/src/portal/screens/testRender.test.js frontend/src/portal/components/Field.js frontend/src/portal/components/BookingReasons.js frontend/src/portal/components/BookingReasons.test.js frontend/src/portal/screens/AthleteDetail.js frontend/src/portal/screens/Registration.js
git commit -m "test: screen render helper, firebase test mock; reason copy for billing/gate/calendly; 90-min tier" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Sign-up form helpers - age, validation, createFamily payload (closes part of #8)

**Files:**
- Create: `frontend/src/portal/data/signup.js`
- Test: `frontend/src/portal/data/signup.test.js`

**Interfaces:**
- Consumes: `ALL_PACKAGES` (`data/packages.js:62`).
- Produces (new, not in contract): `EMAIL_RE`, `TIER_MINUTES = [20, 45, 90]`, `ADULT_AGE = 18`, `CHILD_LOGIN_ENABLED`, `U13_HELPER`, `newAthleteEntry() -> { key, name, dob, packageId, contractMinutes, handicap: '', ownLogin: false, loginEmail: '' }`, `ageOnDate(dobISO, todayISO) -> int | null`, `isAdultOnDate(dobISO, todayISO) -> boolean`, `normalizeHandicap(raw) -> int | null | undefined` (undefined == invalid), `validateAthleteEntry(entry, { todayISO, guardianEmail, siblings, mode }) -> { name?, dob?, packageId?, contractMinutes?, handicap?, loginEmail? }`, `buildCreateFamilyPayload(form)` and `buildAddAthletesPayload(form)` returning exactly contract 1.2 / 1.3 request bodies. `form` is `{ mode, contact: { name, email, phone, relationship }, athletes: [entry], emergencyContact, medical, consents, signatureName }`.

- [ ] **Step 1: Write the failing test**

`frontend/src/portal/data/signup.test.js`:
```js
import {
  ageOnDate, buildAddAthletesPayload, buildCreateFamilyPayload, isAdultOnDate,
  newAthleteEntry, normalizeHandicap, validateAthleteEntry,
} from './signup';

const today = '2026-10-01';
const entry = (over) => ({ ...newAthleteEntry(), name: 'Jordan', dob: '2012-06-17', packageId: 't-12', ...over });

describe('age', () => {
  test('whole years as of a date, birthday not yet reached', () => {
    expect(ageOnDate('2008-10-02', today)).toBe(17);
    expect(ageOnDate('2008-10-01', today)).toBe(18);
    expect(ageOnDate('', today)).toBeNull();
    expect(ageOnDate('2012-6-1', today)).toBeNull();
  });
  test('18+ boundary', () => {
    expect(isAdultOnDate('2008-10-01', today)).toBe(true);
    expect(isAdultOnDate('2008-10-02', today)).toBe(false);
  });
});

describe('handicap', () => {
  test('blank is null, 0..54 integers pass, anything else is invalid', () => {
    expect(normalizeHandicap('')).toBeNull();
    expect(normalizeHandicap('0')).toBe(0);
    expect(normalizeHandicap('54')).toBe(54);
    expect(normalizeHandicap('55')).toBeUndefined();
    expect(normalizeHandicap('12.5')).toBeUndefined();
    expect(normalizeHandicap('-1')).toBeUndefined();
  });
});

describe('validateAthleteEntry', () => {
  test('a clean parent-mode entry has no errors', () => {
    expect(validateAthleteEntry(entry(), { todayISO: today })).toEqual({});
  });
  test('athlete mode requires 18+', () => {
    const e = validateAthleteEntry(entry(), { todayISO: today, mode: 'athlete' });
    expect(e.dob).toBe('Student sign-up is 18+. A parent or guardian needs to complete this for you.');
    expect(validateAthleteEntry(entry({ dob: '2000-01-01' }), { todayISO: today, mode: 'athlete' })).toEqual({});
  });
  test('future dob and bad handicap', () => {
    const e = validateAthleteEntry(entry({ dob: '2027-01-01', handicap: '99' }), { todayISO: today });
    expect(e.dob).toMatch(/Date of birth is required/);
    expect(e.handicap).toBe('Handicap is a whole number from 0 to 54, or leave it blank.');
  });
  test('own login: required, not the guardian, not a sibling', () => {
    const a = entry({ ownLogin: true, loginEmail: '' });
    expect(validateAthleteEntry(a, { todayISO: today }).loginEmail).toBe('Enter the email the athlete will sign in with.');
    const b = entry({ ownLogin: true, loginEmail: 'Dana@Email.com' });
    expect(validateAthleteEntry(b, { todayISO: today, guardianEmail: 'dana@email.com' }).loginEmail)
      .toBe("Use a different email from the guardian's.");
    const c = entry({ ownLogin: true, loginEmail: 'kid@email.com' });
    const d = entry({ ownLogin: true, loginEmail: 'KID@email.com' });
    expect(validateAthleteEntry(d, { todayISO: today, siblings: [c, d] }).loginEmail).toBe('Each athlete needs their own email.');
    expect(validateAthleteEntry(c, { todayISO: today, siblings: [c] })).toEqual({});
  });
});

describe('payloads (contract 1.2 / 1.3)', () => {
  const form = {
    mode: 'parent',
    contact: { name: ' Dana Whitfield ', email: 'dana@email.com', phone: '(612) 555-0148', relationship: 'Mother' },
    athletes: [
      entry({ handicap: '12', contractMinutes: 45, ownLogin: true, loginEmail: ' Jordan@Email.com ' }),
      entry({ name: 'Reese', dob: '2014-03-02', packageId: 't-6', handicap: '' }),
    ],
    emergencyContact: '  ',
    medical: 'Peanut allergy',
    consents: { dataCollection: true, videoCapture: true, mediaRelease: false, facilityAccess: false },
    signatureName: 'Dana Whitfield',
  };
  test('createFamily body is exactly the contract shape', () => {
    expect(buildCreateFamilyPayload(form)).toEqual({
      mode: 'parent',
      contact: { name: 'Dana Whitfield', email: 'dana@email.com', phone: '(612) 555-0148', relationship: 'Mother' },
      athletes: [
        { name: 'Jordan', dob: '2012-06-17', packageId: 't-12', contractMinutes: 45, handicap: 12, loginEmail: 'jordan@email.com' },
        { name: 'Reese', dob: '2014-03-02', packageId: 't-6', contractMinutes: null, handicap: null, loginEmail: null },
      ],
      emergencyContact: null,
      medical: 'Peanut allergy',
      consents: { dataCollection: true, videoCapture: true, mediaRelease: false, facilityAccess: false },
      signatureName: 'Dana Whitfield',
    });
  });
  test('athlete mode: relationship null, loginEmail null', () => {
    const p = buildCreateFamilyPayload({ ...form, mode: 'athlete', athletes: [form.athletes[0]] });
    expect(p.contact.relationship).toBeNull();
    expect(p.athletes[0].loginEmail).toBeNull();
  });
  test('addAthletes body', () => {
    expect(buildAddAthletesPayload({ ...form, athletes: [form.athletes[1]] })).toEqual({
      athletes: [{ name: 'Reese', dob: '2014-03-02', packageId: 't-6', contractMinutes: null, handicap: null, loginEmail: null }],
      medical: 'Peanut allergy',
    });
  });
});
```

- [ ] **Step 2: Run it** - `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/data/signup.test.js` - Expected: FAIL, cannot find module `./signup`.

- [ ] **Step 3: Implement `data/signup.js`**

```js
/**
 * Sign-up form rules (Sprint 20, spec 2.1/2.2) - PURE. The function
 * re-checks everything; this is the client's first pass so the form can say
 * what is wrong before the round trip. Payload shapes are contract 1.2/1.3.
 */
import { ALL_PACKAGES } from './packages';

export const EMAIL_RE = /^\S+@\S+\.\S+$/;
export const TIER_MINUTES = [20, 45, 90];
export const ADULT_AGE = 18;
export const HANDICAP_MIN = 0;
export const HANDICAP_MAX = 54;
/** Spec 13 cut line: flip to false to hide the own-login toggle if claimInvite slips. */
export const CHILD_LOGIN_ENABLED = true;
export const U13_HELPER =
  'Under 13? A Google account needs Family Link permission for third-party sign-in; a new password login works either way.';
export const ADULT_REQUIRED = 'Student sign-up is 18+. A parent or guardian needs to complete this for you.';
const DOB_REQUIRED = 'Date of birth is required — it determines U13 vs U18 eligibility.';

let seq = 0;
export function newAthleteEntry() {
  seq += 1;
  return { key: `new-${seq}`, name: '', dob: '', packageId: null, contractMinutes: null, handicap: '', ownLogin: false, loginEmail: '' };
}

/** Whole years old on `todayISO`; null for anything but 'yyyy-MM-dd'. No Date.now(). */
export function ageOnDate(dob, todayISO) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob || '') || !/^\d{4}-\d{2}-\d{2}$/.test(todayISO || '')) return null;
  const [y, m, d] = dob.split('-').map(Number);
  const [ty, tm, td] = todayISO.split('-').map(Number);
  let age = ty - y;
  if (tm < m || (tm === m && td < d)) age -= 1;
  return age;
}

export function isAdultOnDate(dob, todayISO) {
  const age = ageOnDate(dob, todayISO);
  return age != null && age >= ADULT_AGE;
}

/** '' -> null; an integer 0..54 -> itself; anything else -> undefined (invalid). */
export function normalizeHandicap(raw) {
  if (raw === '' || raw == null) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= HANDICAP_MIN && n <= HANDICAP_MAX && String(raw).trim() !== '' ? n : undefined;
}

const lower = (s) => (s || '').trim().toLowerCase();

export function validateAthleteEntry(a, { todayISO, guardianEmail = '', siblings = [], mode = 'parent' } = {}) {
  const errors = {};
  if (!a.name || a.name.trim() === '') errors.name = 'Athlete name is required.';
  const age = ageOnDate(a.dob, todayISO);
  if (age == null || a.dob > todayISO) errors.dob = DOB_REQUIRED;
  else if (mode === 'athlete' && age < ADULT_AGE) errors.dob = ADULT_REQUIRED;
  if (a.packageId != null && !ALL_PACKAGES.some((p) => p.id === a.packageId)) errors.packageId = 'Pick a package from the list.';
  if (a.contractMinutes != null && !TIER_MINUTES.includes(a.contractMinutes)) errors.contractMinutes = 'Pick 20, 45 or 90 minutes.';
  if (normalizeHandicap(a.handicap) === undefined) errors.handicap = 'Handicap is a whole number from 0 to 54, or leave it blank.';
  if (a.ownLogin) {
    const email = lower(a.loginEmail);
    if (!EMAIL_RE.test(email)) errors.loginEmail = 'Enter the email the athlete will sign in with.';
    else if (email === lower(guardianEmail)) errors.loginEmail = "Use a different email from the guardian's.";
    else if (siblings.some((s) => s !== a && s.ownLogin && lower(s.loginEmail) === email)) errors.loginEmail = 'Each athlete needs their own email.';
  }
  return errors;
}

function athleteBody(a) {
  return {
    name: a.name.trim(),
    dob: a.dob,
    packageId: a.packageId,
    contractMinutes: a.contractMinutes ?? null,
    handicap: normalizeHandicap(a.handicap) ?? null,
    loginEmail: a.ownLogin && a.loginEmail ? lower(a.loginEmail) : null,
  };
}

/** Contract 1.2 request body. Athlete mode: no relationship, no child login (the caller IS the login). */
export function buildCreateFamilyPayload(form) {
  const parent = form.mode === 'parent';
  return {
    mode: form.mode,
    contact: {
      name: form.contact.name.trim(),
      email: form.contact.email.trim(),
      phone: form.contact.phone.trim(),
      relationship: parent ? form.contact.relationship || null : null,
    },
    athletes: form.athletes.map(athleteBody).map((a) => (parent ? a : { ...a, loginEmail: null })),
    emergencyContact: form.emergencyContact.trim() || null,
    medical: form.medical.trim() || null,
    consents: {
      dataCollection: Boolean(form.consents.dataCollection),
      videoCapture: Boolean(form.consents.videoCapture),
      mediaRelease: Boolean(form.consents.mediaRelease),
      facilityAccess: Boolean(form.consents.facilityAccess),
    },
    signatureName: form.signatureName.trim(),
  };
}

/** Contract 1.3 request body (Settings' "Link another athlete"). */
export function buildAddAthletesPayload(form) {
  return { athletes: form.athletes.map(athleteBody), medical: form.medical.trim() || null };
}
```

- [ ] **Step 4: Run it** - same command - Expected: PASS (9 tests).

- [ ] **Step 5: Commit**
```bash
git add frontend/src/portal/data/signup.js frontend/src/portal/data/signup.test.js
git commit -m "feat(signup): age, handicap and child-login validation; createFamily/addAthletes payload builders" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

Continue with `20-frontend-part1b.md` (Tasks 3-4).
