# Frontend - Sprint 20 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**This plan is split in two files.** Part 1 (this file): Tasks 1-7 (test scaffolding, sign-up helpers, SignUp/SignIn, Registration, NotProvisioned). Part 2 (`20-frontend-part2.md`): Tasks 8-14 (pending banners + pay + `?paid=`, facility add-on, Calendly, AdminSignups, launch fixes, 375px checks). Execute in order; part 2 consumes names part 1 produces.

**Goal:** Ship the launch screens - instant sign-up, per-athlete payment state, Calendly for Yannick, the admin sign-ups report and the section-9 fixes - on top of the hooks and callables the routing lane produces.

**Architecture:** Screens stay thin: every decision a test needs to pin lives in a pure `data/*.js` helper (payload builder, gate reasons, copy tables) and every network call goes through the contract's hooks/callables (`hooks/callables.js`, `hooks/billing.js`, `useAuthSession`, `useSignups`). Screens are rendered in jest with a small `react-dom/client` + `MemoryRouter` helper and the contract modules mocked at the module boundary; `src/firebase.js` is mocked globally so nothing initialises Firebase under test. Registration.js is split into three files (state/submit, step components, success) to stay under 500 lines.

**Tech Stack:** React 18.3 (CRA 5, JS), react-router-dom 6.30 (`useSearchParams`, `useLocation` state), firebase JS SDK 9 (via routing's hooks only), jest (react-scripts) + jsdom, `react-dom/client` + `React.act` for screen tests.

**Spec:** docs/portal/SPRINT-20-LAUNCH.md - sections 2.1, 2.4, 3.1, 3.2 (client states), 4.2 (Success/`?paid=`), 4.4 (pending copy), 4.5, 6.1 (portal side), 7, 9, 11 (frontend unit rows), 13 (cut line).
**Interfaces:** docs/portal/plans/2026-09-28-sprint-20-launch/01-interfaces.md
**GitHub issues:** #7 #8 #9 #10 #11 #12 (part 1 closes #7, #8; part 2 closes #9, #10, #11, #12).

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

**Names this plan introduces that are not in the contract** (each is marked `(new, not in contract)` where defined): `src/setupTests.js`, `screens/testRender.js#renderScreen`, `data/signup.js` (`ageOnDate`, `isAdultOnDate`, `normalizeHandicap`, `validateAthleteEntry`, `buildCreateFamilyPayload`, `buildAddAthletesPayload`, `newAthleteEntry`, `TIER_MINUTES`, `CHILD_LOGIN_ENABLED`, `U13_HELPER`), `data/authCopy.js` (`VERIFY_EMAIL_SENDER`, `verifyBody`, `notProvisionedView`, copy constants), `data/billingCopy.js`, `data/specialistGate.js`, `data/signups.js`, `components/PayButton.js` (`PayButton`, `startCheckout`), `components/PendingBanner.js`, `components/PaymentConfirming.js`, `components/FacilityCard.js`, `screens/SignUp.js`, `screens/RegistrationSteps.js`, `screens/RegistrationSuccess.js`, `screens/AdminSignups.js`, `PortalRoutes.js#RegistrationRoute`/`SignupsRoute`, `Registration` props `mode`/`account`/`onRefresh`, `Field` `aria-label`, `useAthleteDetail` payload fields `loginEmail`/`login` (handoff to routing), `hubMemberFor` field `facilityAccessConsent` (handoff to routing).

---

### Task 1: Test scaffolding, Field labels, shared reason copy, 90-minute tier (closes part of #8, #10, #12)

**Files:**
- Create: `frontend/src/setupTests.js`, `frontend/src/portal/screens/testRender.js`
- Modify: `frontend/src/portal/components/Field.js:53-69,132-153` (aria-label), `frontend/src/portal/components/BookingReasons.js:25-34`, `frontend/src/portal/screens/AthleteDetail.js:37`, `frontend/src/portal/screens/Registration.js:504`
- Test: `frontend/src/portal/components/BookingReasons.test.js`, `frontend/src/portal/screens/testRender.test.js`

**Interfaces:**
- Consumes: `BOOKING_OPENS_LABEL` from `data/calendar.js` (contract 3.1, routing lane). Until it lands, import fails - see step 3's fallback line.
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
If `BOOKING_OPENS_LABEL` is not yet exported by `data/calendar.js` in this worktree (routing lane), add it there exactly as contract 3.1 defines it - `export const BOOKING_OPENS_LABEL = 'Fri, Oct 10 at 7 AM';` after `windowOpensOn` - and note it in the sprint report as an integration-time duplicate to reconcile.

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
  const button = (label) =>
    [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === label) || null;
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

### Task 3: SignUp screen, SignIn "Create a login", footer to /portal/signup (closes #7)

**Files:**
- Create: `frontend/src/portal/data/authCopy.js`, `frontend/src/portal/screens/SignUp.js`
- Modify: `frontend/src/portal/screens/SignIn.js:42-49,55-57,120-246,430-450`, `frontend/src/portal/PortalRoutes.js:497-500`
- Test: `frontend/src/portal/data/authCopy.test.js`, `frontend/src/portal/screens/SignUp.test.js`

**Interfaces:**
- Consumes: `useAuthSession()` members `user`, `provisioned`, `loading`, `error`, `signIn()`, `createLogin(email, password) -> Promise<{sent}>` (throws `LiveDataError` with `reason` `'email-in-use'` | `'weak-password'`), `claimState` (contract 4.1); `LANDING_BY_ROLE`, `BrandHeader` (`SignIn.js:42,383`).
- Produces (new, not in contract): `data/authCopy.js` exports `VERIFY_EMAIL_SENDER`, `VERIFY_TITLE`, `verifyBody(email)`, `RESEND`, `VERIFIED`, `STRANGER_PARENT_CTA`, `STRANGER_CHILD_CTA`, `STRANGER_CHILD_HINT`, `CHECK_AGAIN`, `LEGACY_CTA`, `ALREADY_CLAIMED`, `EMAIL_IN_USE`, `FAMILY_LINK_FAIL`, `USE_PARENT_EMAIL`, `notProvisionedView({ claimState, legacyStatus }) -> 'checking'|'verify'|'already-claimed'|'legacy'|'stranger'`; `SignUp({ bare, onSignIn })` default export; `LANDING_BY_ROLE.mental` becomes `'/portal/my-sessions'` (admin hidden from mental, #11).

- [ ] **Step 1: Write the failing copy test**

`frontend/src/portal/data/authCopy.test.js`:
```js
import { EMAIL_IN_USE, VERIFY_EMAIL_SENDER, notProvisionedView, verifyBody } from './authCopy';

test('verify copy names the sender (contract 9.4)', () => {
  expect(VERIFY_EMAIL_SENDER).toMatch(/^noreply@.+\.firebaseapp\.com$/);
  expect(verifyBody('kid@email.com')).toBe(`We sent a link to kid@email.com from ${VERIFY_EMAIL_SENDER}. Open it, then tap I've verified.`);
  expect(EMAIL_IN_USE).toBe('This email already has a login - sign in instead');
});

test('the claim-state table (spec 3.2)', () => {
  expect(notProvisionedView({ claimState: 'checking', legacyStatus: 'none' })).toBe('checking');
  expect(notProvisionedView({ claimState: 'none', legacyStatus: null })).toBe('checking');
  expect(notProvisionedView({ claimState: 'needs-verification', legacyStatus: 'none' })).toBe('verify');
  expect(notProvisionedView({ claimState: 'already-claimed', legacyStatus: 'none' })).toBe('already-claimed');
  expect(notProvisionedView({ claimState: 'none', legacyStatus: 'pending' })).toBe('legacy');
  expect(notProvisionedView({ claimState: 'none', legacyStatus: 'declined' })).toBe('legacy');
  expect(notProvisionedView({ claimState: 'none', legacyStatus: 'none' })).toBe('stranger');
  expect(notProvisionedView({ claimState: 'error', legacyStatus: 'none' })).toBe('stranger');
  expect(notProvisionedView({ claimState: 'idle', legacyStatus: 'none' })).toBe('stranger');
});
```

- [ ] **Step 2: Run it** - `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/data/authCopy.test.js` - Expected: FAIL, module not found.

- [ ] **Step 3: Implement `data/authCopy.js`**

```js
/**
 * Auth-flow copy (Sprint 20, contract 9.4/9.6) in one place: SignUp, SignIn,
 * NotProvisioned and the pay gate all render these strings, so they cannot
 * drift. Firebase's default verification template is sent by Firebase itself
 * from noreply@<authDomain> (spec 12.1: templates stay default), which is
 * why the sender is derived from the existing REACT_APP_FIREBASE_AUTH_DOMAIN
 * and not from the SMTP sender the functions use for notices.
 */
export const VERIFY_EMAIL_SENDER = `noreply@${process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || 'rypacad.firebaseapp.com'}`;
export const VERIFY_TITLE = 'Verify your email to finish';
export function verifyBody(email) {
  return `We sent a link to ${email} from ${VERIFY_EMAIL_SENDER}. Open it, then tap I've verified.`;
}
export const RESEND = 'Resend';
export const VERIFIED = "I've verified";
export const STRANGER_PARENT_CTA = "I'm a parent - start sign-up";
export const STRANGER_CHILD_CTA = 'My parent enrolled me';
export const STRANGER_CHILD_HINT = 'Use the email they entered, then tap Check again.';
export const CHECK_AGAIN = 'Check again';
export const LEGACY_CTA = 'Sign-up is now instant - start here';
export const ALREADY_CLAIMED = 'This login is already set up - sign in with it';
export const EMAIL_IN_USE = 'This email already has a login - sign in instead';
export const USE_PARENT_EMAIL = 'Use the email your parent entered.';
export const FAMILY_LINK_FAIL =
  'Ask your parent to allow sign-in for this app in Family Link, or create a password login below.';

/** Which NotProvisioned body renders (spec 3.2 + 2.4's legacy states). */
export function notProvisionedView({ claimState, legacyStatus }) {
  if (claimState === 'checking' || legacyStatus == null) return 'checking';
  if (claimState === 'needs-verification') return 'verify';
  if (claimState === 'already-claimed') return 'already-claimed';
  if (legacyStatus === 'pending' || legacyStatus === 'declined') return 'legacy';
  return 'stranger';
}
```

- [ ] **Step 4: Run it** - Expected: PASS.

- [ ] **Step 5: Write the failing SignUp screen test**

`frontend/src/portal/screens/SignUp.test.js`:
```js
import React from 'react';
import { renderScreen } from './testRender';
import SignUp from './SignUp';

let mockSession;
jest.mock('../hooks/useAuthSession', () => ({ __esModule: true, default: () => mockSession }));

beforeEach(() => {
  mockSession = {
    user: null, provisioned: false, loading: false, error: null, claimState: 'idle',
    signIn: async () => {},
    createLogin: async (email) => {
      if (email === 'taken@email.com') {
        const err = new Error('This email already has a login - sign in instead');
        err.reason = 'email-in-use';
        throw err;
      }
      return { sent: true };
    },
  };
});

test('creates a login and shows the verification-sent note', async () => {
  const r = await renderScreen(<SignUp bare />, { path: '/portal/signup' });
  expect(r.button('Create login').disabled).toBe(true);
  await r.fill('Email', 'dana@email.com');
  await r.fill('Password', 'correct-horse-9');
  await r.click('Create login');
  expect(r.text()).toContain('We sent a link to dana@email.com from noreply@');
  expect(r.button('Continue to sign-up')).not.toBeNull();
  await r.unmount();
});

test('email already in use points at sign in', async () => {
  const r = await renderScreen(<SignUp bare />, { path: '/portal/signup' });
  await r.fill('Email', 'taken@email.com');
  await r.fill('Password', 'correct-horse-9');
  await r.click('Create login');
  expect(r.text()).toContain('This email already has a login - sign in instead');
  await r.unmount();
});

test('a signed-in unprovisioned stranger goes to /portal/register', async () => {
  mockSession.user = { uid: 'u1', email: 'dana@email.com', role: null };
  mockSession.claimState = 'none';
  const r = await renderScreen(<SignUp bare />, { path: '/portal/signup' });
  expect(r.location().pathname).toBe('/portal/register');
  await r.unmount();
});
```

- [ ] **Step 6: Run it** - Expected: FAIL, cannot find `./SignUp`.

- [ ] **Step 7: Implement `screens/SignUp.js`**

```js
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { color, font } from '../tokens';
import Button from '../components/Button';
import Field from '../components/Field';
import PhoneFrame from '../components/PhoneFrame';
import { AlertGlyph, Banner, Body } from '../components/Primitives';
import useAuthSession from '../hooks/useAuthSession';
import { EMAIL_RE } from '../data/signup';
import { EMAIL_IN_USE, VERIFY_EMAIL_SENDER } from '../data/authCopy';
import { BrandHeader, LANDING_BY_ROLE } from './SignIn';

/**
 * 00 · Sign up (Sprint 20, spec 2.1 step 0) - public. Create a login (email
 * + password, or Google), then continue to /portal/register. Verification is
 * sent at once but is not required to finish sign-up (it is required to pay
 * and to claim a child login). A provisioned account lands on its home; an
 * invited child (claimState other than none) lands on NotProvisioned.
 */
export default function SignUp({ bare = false, onSignIn }) {
  const { user, provisioned, loading, error, signIn, createLogin, claimState } = useAuthSession();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [failure, setFailure] = useState(null); // { message, inUse }
  const [sent, setSent] = useState(null); // the email the link went to

  useEffect(() => {
    if (!user || loading || sent) return;
    if (provisioned) {
      navigate(user.specialistId ? '/portal/my-sessions' : LANDING_BY_ROLE[user.role] ?? '/portal/not-provisioned', { replace: true });
      return;
    }
    if (claimState === 'checking') return;
    navigate(claimState === 'none' || claimState === 'idle' || claimState == null ? '/portal/register' : '/portal/not-provisioned', { replace: true });
  }, [user, provisioned, loading, sent, claimState, navigate]);

  const canSubmit = EMAIL_RE.test(email.trim()) && password.length >= 6 && !creating && !loading;
  const submit = async () => {
    if (!canSubmit) return;
    setCreating(true);
    setFailure(null);
    try {
      await createLogin(email.trim(), password);
      setSent(email.trim());
    } catch (err) {
      const inUse = err && err.reason === 'email-in-use';
      setFailure({ inUse, message: inUse ? EMAIL_IN_USE : (err && err.message) || 'The login could not be created. Try again.' });
    } finally {
      setCreating(false);
    }
  };
  const goSignIn = () => (onSignIn ? onSignIn() : navigate('/portal/signin'));

  return (
    <PhoneFrame bare={bare}>
      <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <BrandHeader />
        {sent ? (
          <>
            <Banner tone="green" title="Verification sent">
              We sent a link to {sent} from {VERIFY_EMAIL_SENDER}. You can finish sign-up now; verify before you pay.
            </Banner>
            <Button style={{ marginTop: 14 }} onClick={() => navigate('/portal/register', { replace: true })}>
              Continue to sign-up
            </Button>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}>
              <Field label="Email" type="email" value={email} onChange={setEmail} dimmed={creating} />
              <Field label="Password" type="password" value={password} onChange={setPassword} dimmed={creating} hint="At least 6 characters." />
            </div>
            {failure || error ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
                <AlertGlyph />
                <span style={{ font: `400 12px ${font.body}`, color: color.error }}>
                  {failure ? failure.message : error.message}
                  {failure && failure.inUse ? (
                    <> <button type="button" onClick={goSignIn} style={{ background: 'none', border: 'none', padding: 0, font: `600 12px ${font.body}`, color: color.primary, cursor: 'pointer' }}>Sign in</button></>
                  ) : null}
                </span>
              </div>
            ) : null}
            <div style={{ marginTop: 26, display: 'flex', flexDirection: 'column', gap: 13 }}>
              <Button loading={creating} disabled={!canSubmit} onClick={submit}>{creating ? 'Creating login' : 'Create login'}</Button>
              <Button variant="outline" disabled={creating || loading} onClick={() => signIn()} style={{ boxShadow: 'none' }}>Continue with Google</Button>
            </div>
          </>
        )}
        <div style={{ flex: 1, minHeight: 20 }} />
        <Body size={13} style={{ textAlign: 'center', paddingTop: 20 }}>
          Already have a login?{' '}
          <button type="button" onClick={goSignIn} style={{ background: 'none', border: 'none', padding: 0, font: `600 13px ${font.body}`, color: color.primary, cursor: 'pointer' }}>Sign in</button>
        </Body>
      </div>
    </PhoneFrame>
  );
}
```

- [ ] **Step 8: Run it** - `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/screens/SignUp.test.js` - Expected: PASS (3 tests).

- [ ] **Step 9: SignIn changes**

In `SignIn.js`:
1. `LANDING_BY_ROLE.mental` -> `'/portal/my-sessions'` (line 46) with the comment `// Sprint 20: admin is ops/owner only; Yannick lands on his sessions.`
2. Destructure `createLogin` from `auth` (line 57): `const { user, provisioned, loading, error, signIn, signInWithEmail, createLogin } = auth;`
3. Track which action errored: add `const [lastAction, setLastAction] = useState(null);` after line 72; in `submitEmail` call `setLastAction('email')` before `signInWithEmail`, and change the Google button's `onClick` to `() => { setLastAction('google'); signIn(); }`.
4. Under the existing error block (after line 210) add:
```js
        {error && lastAction === 'google' ? (
          <Body size={12} style={{ marginTop: 8 }}>{FAMILY_LINK_FAIL}</Body>
        ) : null}
```
5. After the Google `<Button>` (line 237) insert `<CreateLoginSection createLogin={createLogin} disabled={loading} />` and add this component before `DemoSignIn`:
```js
/**
 * Sprint 20 (spec 3.1): a child claiming the login their parent entered, or
 * anyone who prefers a password. The same createLogin the SignUp screen uses;
 * success lands via onAuthStateChanged like every other sign-in here.
 */
function CreateLoginSection({ createLogin, disabled }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const [sent, setSent] = useState(null);
  const canSubmit = /^\S+@\S+\.\S+$/.test(email.trim()) && password.length >= 6 && !busy && !disabled;
  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setFailure(null);
    try {
      await createLogin(email.trim(), password);
      setSent(email.trim());
    } catch (err) {
      setFailure(err && err.reason === 'email-in-use' ? EMAIL_IN_USE : (err && err.message) || 'The login could not be created. Try again.');
    } finally {
      setBusy(false);
    }
  };
  if (!open) {
    return (
      <Button variant="outline" disabled={disabled} onClick={() => setOpen(true)} style={{ boxShadow: 'none' }}>
        Create a login
      </Button>
    );
  }
  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 10 }}>Create a login</SectionLabel>
      <Body size={12} style={{ marginBottom: 12 }}>{USE_PARENT_EMAIL} {U13_HELPER}</Body>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="New login email" type="email" value={email} onChange={setEmail} />
        <Field label="New password" type="password" value={password} onChange={setPassword} />
      </div>
      {failure ? <Body size={12} tone={color.error} style={{ marginTop: 10 }}>{failure}</Body> : null}
      {sent ? <Body size={12} tone={color.primary} style={{ marginTop: 10 }}>{verifyBody(sent)}</Body> : null}
      <Button height={46} loading={busy} disabled={!canSubmit} onClick={submit} style={{ marginTop: 12 }}>
        {busy ? 'Creating login' : 'Create login'}
      </Button>
    </Card>
  );
}
```
Imports to add at the top of SignIn.js: `import { Card, SectionLabel } from '../components/Primitives';` (merge into the existing Primitives import: `{ AlertGlyph, Body, Card, SectionLabel }`), `import { U13_HELPER } from '../data/signup';`, `import { EMAIL_IN_USE, FAMILY_LINK_FAIL, USE_PARENT_EMAIL, verifyBody } from '../data/authCopy';`.
6. `EnrollmentFooter` (line 441-447): text `New family?{' '}` + span `Start sign-up`.
7. `PortalRoutes.js:499`: `element={<SignIn bare onStartEnrollment={go('/portal/signup')} />}` and add the route right after it:
```js
      <Route path="signup" element={<SignUp bare onSignIn={go('/portal/signin')} />} />
```
with `import SignUp from './screens/SignUp';` beside the SignIn import.

- [ ] **Step 10: Verify** - `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal` (all portal tests pass) and `cd frontend && npx eslint src/portal/screens/SignIn.js src/portal/screens/SignUp.js src/portal/PortalRoutes.js` (no errors).

- [ ] **Step 11: Commit**
```bash
git add frontend/src/portal/data/authCopy.js frontend/src/portal/data/authCopy.test.js frontend/src/portal/screens/SignUp.js frontend/src/portal/screens/SignUp.test.js frontend/src/portal/screens/SignIn.js frontend/src/portal/PortalRoutes.js
git commit -m "feat(auth): /portal/signup, SignIn create-a-login, Family Link copy, footer to sign-up (#7)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Registration steps - who-are-you, contact prefill, handicap, own-login, adult copy (closes part of #8)

**Files:**
- Create: `frontend/src/portal/screens/RegistrationSteps.js`
- Modify: `frontend/src/portal/screens/Registration.js` (move `GuardianStep`/`AthleteStep`/`PackageStep`/`ContractTierChoice`/`ConsentStep`/`CONSENT_INFO`/`ConsentInfoSheet`/`Checkbox`/`SubmittingOverlay` lines 261-760 out; the file keeps the state machine only - Task 5 rewrites it)
- Test: `frontend/src/portal/screens/RegistrationSteps.test.js`

**Interfaces:**
- Consumes: `newAthleteEntry`, `validateAthleteEntry`, `ageOnDate`, `TIER_MINUTES`, `CHILD_LOGIN_ENABLED`, `U13_HELPER`, `ADULT_REQUIRED` (Task 2); `useEnrollmentForm()` (`hooks/index.js:2284`); `ALL_PACKAGES`; `PackageCard`, `Field`, `SelectField`, `Toggle`, `Card`, `SectionLabel`, `Body`.
- Produces (new, not in contract): `RegistrationSteps.js` exports `WhoStep({ mode, onChange })`, `ContactStep({ mode, contact, onChange, showErrors })`, `AthleteStep({ mode, athletes, onUpdate, onAdd, onRemove, emergencyContact, onEmergencyContact, medical, onMedical, showErrors, todayISO, guardianEmail, onSwitchToParent })`, `PackageStep({ athletes, onUpdate, showErrors })`, `ConsentStep({ mode, consents, onChange, signatureName, onSignatureChange, onOpenInfo, showErrors })`, `ConsentInfoSheet`, `SubmittingOverlay({ mode })`.

- [ ] **Step 1: Write the failing test**

`frontend/src/portal/screens/RegistrationSteps.test.js`:
```js
import React from 'react';
import { renderScreen } from './testRender';
import { AthleteStep, ConsentStep, WhoStep } from './RegistrationSteps';
import { newAthleteEntry } from '../data/signup';

function Harness({ mode = 'parent', athlete = {} }) {
  const [athletes, setAthletes] = React.useState([{ ...newAthleteEntry(), ...athlete }]);
  const onUpdate = (key, patch) => setAthletes((prev) => prev.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  return (
    <AthleteStep mode={mode} athletes={athletes} onUpdate={onUpdate} onAdd={() => {}} onRemove={() => {}}
      emergencyContact="" onEmergencyContact={() => {}} medical="" onMedical={() => {}}
      showErrors todayISO="2026-10-01" guardianEmail="dana@email.com" onSwitchToParent={() => {}} />
  );
}

test('who-are-you offers the two modes', async () => {
  const picked = [];
  const r = await renderScreen(<WhoStep mode={null} onChange={(m) => picked.push(m)} />);
  await r.click("I'm the athlete (18+)");
  await r.click('Parent or guardian');
  expect(picked).toEqual(['athlete', 'parent']);
  await r.unmount();
});

test('own login asks for a child email, shows the U13 helper, rejects the guardian email', async () => {
  const r = await renderScreen(<Harness athlete={{ name: 'Nico', dob: '2017-05-05' }} />);
  expect(r.container.querySelector('[aria-label="Login email"]')).toBeNull();
  await r.click('Own login?');
  expect(r.text()).toContain('Under 13? A Google account needs Family Link permission');
  await r.fill('Login email', 'dana@email.com');
  expect(r.text()).toContain("Use a different email from the guardian's.");
  await r.fill('Handicap', '60');
  expect(r.text()).toContain('Handicap is a whole number from 0 to 54');
  await r.unmount();
});

test('athlete mode: a minor is told a guardian must complete it', async () => {
  const r = await renderScreen(<Harness mode="athlete" athlete={{ name: 'Sam', dob: '2010-01-01' }} />);
  expect(r.text()).toContain('Student sign-up is 18+.');
  expect(r.button("I'm a parent or guardian")).not.toBeNull();
  expect(r.button('Own login?')).toBeNull();
  await r.unmount();
});

test('consent copy switches to the adult variant', async () => {
  const props = { consents: { dataCollection: true, videoCapture: true }, onChange: () => {}, signatureName: '', onSignatureChange: () => {}, onOpenInfo: () => {}, showErrors: false };
  const p = await renderScreen(<ConsentStep mode="parent" {...props} />);
  expect(p.text()).toContain('Each athlete is a minor.');
  await p.unmount();
  const a = await renderScreen(<ConsentStep mode="athlete" {...props} />);
  expect(a.text()).toContain('You are signing for yourself.');
  await a.unmount();
});
```

- [ ] **Step 2: Run it** - Expected: FAIL, cannot find `./RegistrationSteps`.

- [ ] **Step 3: Create `RegistrationSteps.js`** by moving lines 261-760 of `Registration.js` into it verbatim (imports: `React, { useState }`, `color, font, radius, tint` from tokens, `Button, { Spinner }`, `Field, { SelectField }`, `PackageCard`, `{ Body, Card, ScreenTitle, SectionLabel, Tick }`, `useEnrollmentForm` from `../hooks`, `ALL_PACKAGES`, `{ Toggle }` from `../components/Toggle`, and from `../data/signup`: `ADULT_REQUIRED, CHILD_LOGIN_ENABLED, TIER_MINUTES, U13_HELPER, ageOnDate, validateAthleteEntry`), delete the local `const TIER_MINUTES` (line 504) and `EMAIL_RE` use, export every step component, then make these changes:

`WhoStep` (new):
```js
export function WhoStep({ mode, onChange }) {
  const options = [
    ['parent', 'Parent or guardian', 'You enroll one or more athletes and manage their account.'],
    ['athlete', "I'm the athlete (18+)", 'You sign up for yourself. Under 18? A parent or guardian enrolls you.'],
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {options.map(([value, title, blurb]) => {
        const on = mode === value;
        return (
          <button key={value} type="button" aria-pressed={on} onClick={() => onChange(value)}
            style={{ textAlign: 'left', borderRadius: radius.cardLarge, padding: 17, cursor: 'pointer',
              border: `1px solid ${on ? color.primary : color.border}`, background: on ? tint.green : color.surface }}>
            <div style={{ font: `600 15px ${font.body}`, color: color.text }}>{title}</div>
            <Body size={12} style={{ marginTop: 5 }}>{blurb}</Body>
          </button>
        );
      })}
    </div>
  );
}
```

`GuardianStep` -> `ContactStep({ mode, contact, onChange, showErrors })`: fields `Name` (label `Your name`), `Email`, `Mobile`, and `SelectField "Relationship to athlete"` only when `mode === 'parent'`; field keys are `name`, `email`, `phone`.

`AthleteStep`: signature per the Interfaces block. Per athlete card, after the DOB field:
```js
            {errors.dob === ADULT_REQUIRED ? (
              <Button variant="outline" height={44} onClick={onSwitchToParent} style={{ boxShadow: 'none' }}>
                I'm a parent or guardian
              </Button>
            ) : null}
            <Field label="Handicap" type="number" value={athlete.handicap} placeholder="none yet"
              onChange={(v) => onUpdate(athlete.key, { handicap: v })}
              error={showErrors && errors.handicap ? errors.handicap : undefined}
              hint="Current handicap, 0-54. Leave blank for none yet." />
            {mode === 'parent' && CHILD_LOGIN_ENABLED ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ font: `600 13px ${font.body}`, color: color.text }}>Own login?</div>
                  <Body size={11} tone={color.textTertiary}>Off: your account runs {athlete.name.trim() || 'this athlete'}. On: they sign in with their own email.</Body>
                </div>
                <Toggle checked={athlete.ownLogin} onChange={(v) => onUpdate(athlete.key, { ownLogin: v })} label="Own login?" />
              </div>
            ) : null}
            {athlete.ownLogin ? (
              <>
                <Field label="Login email" type="email" value={athlete.loginEmail}
                  onChange={(v) => onUpdate(athlete.key, { loginEmail: v })}
                  error={errors.loginEmail} />
                {age != null && age < 13 ? <Body size={11} tone={color.textTertiary}>{U13_HELPER}</Body> : null}
              </>
            ) : null}
```
where, at the top of the per-athlete map, `const age = ageOnDate(athlete.dob, todayISO);` and `const errors = validateAthleteEntry(athlete, { todayISO, guardianEmail, siblings: athletes, mode });`; the name/dob `error` props read `showErrors && errors.name` / `errors.dob` (the adult message shows without `showErrors`, so the switch button appears as soon as a minor's DOB is typed: `error={errors.dob === ADULT_REQUIRED || showErrors ? errors.dob : undefined}`). `loginEmail` errors also render without `showErrors` (the test types the guardian's email and expects the message). The `Toggle`'s hit area is the `aria-label="Own login?"` button, so `click('Own login?')` matches the switch, not the heading (the heading is a div). The card title in athlete mode is `Your details`; `+ Add another athlete` renders only for `mode === 'parent'`.

`ConsentStep({ mode, ... })`: the first `<Body>` becomes
```js
      <Body size={13}>
        {mode === 'athlete'
          ? 'You are signing for yourself. Each of these is a separate decision — none is bundled into the others.'
          : 'Each athlete is a minor. Each of these is a separate decision — none is bundled into the others.'}
      </Body>
```
`SubmittingOverlay({ mode })`: title `Creating the account`, body `Do not close this. Your family and consents are written together in one step.` (the old "before the account exists" sentence is no longer true - the callable writes one transaction).

- [ ] **Step 4: Run it** - `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/screens/RegistrationSteps.test.js` - Expected: PASS (4 tests). `wc -l frontend/src/portal/screens/RegistrationSteps.js` must print under 500.

- [ ] **Step 5: Commit** (Registration.js is mid-refactor; Task 5 finishes it - commit both files together at the end of Task 5). Run `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal` to confirm nothing else broke, then continue.

---

### Task 5: Registration state machine - createFamily / addAthletes, provisioned redirect, link mode (closes part of #8, part of #12)

**Files:**
- Modify: `frontend/src/portal/screens/Registration.js` (rewrite; target under 300 lines), `frontend/src/portal/PortalRoutes.js:501-515,688-697`
- Test: `frontend/src/portal/screens/Registration.test.js`

**Interfaces:**
- Consumes: `callCreateFamily(payload) -> Promise<{ householdId, athleteIds }>`, `callAddAthletes(payload)` from `hooks/callables.js` (contract 1.1-1.3; rejections are `LiveDataError` with `reason`); `useAuthSession().refresh()` (contract 4.1); step components (Task 4); builders (Task 2); `RegistrationSuccess` (Task 6 - until it exists, the `success` phase renders `null`; Task 6 wires it).
- Produces (new, not in contract): `Registration({ variant, bare, mode: 'signup'|'link', account: { email, emailVerified } | null, onRefresh, onBack, onFinish(path) })`; `PortalRoutes.js#RegistrationRoute`; `/portal/settings` "Link another athlete" navigates `('/portal/register', { state: { link: true } })`.

- [ ] **Step 1: Write the failing test**

`frontend/src/portal/screens/Registration.test.js`:
```js
import React from 'react';
import { renderScreen } from './testRender';
import Registration from './Registration';

const mockCalls = [];
jest.mock('../hooks/callables', () => ({
  callCreateFamily: async (payload) => { mockCalls.push(['createFamily', payload]); return { householdId: 'h1', athleteIds: ['a1'] }; },
  callAddAthletes: async (payload) => { mockCalls.push(['addAthletes', payload]); return { householdId: 'h1', athleteIds: ['a2'] }; },
  callCreateCheckoutSession: async () => ({ url: 'https://checkout.stripe.test/x' }),
}), { virtual: true });
jest.mock('./RegistrationSuccess', () => ({ __esModule: true, default: ({ result }) => `SUCCESS ${result.athleteIds.join(',')}` }));

beforeEach(() => { mockCalls.length = 0; });

async function fillParentToConsent(r) {
  await r.click('Parent or guardian');
  await r.click('Continue');
  expect(r.container.querySelector('[aria-label="Email"]').value).toBe('dana@email.com'); // prefilled from auth
  await r.fill('Your name', 'Dana Whitfield');
  await r.fill('Mobile', '(612) 555-0148');
  await r.fill('Relationship to athlete', 'Mother');
  await r.click('Continue');
  await r.fill('Athlete name', 'Jordan');
  await r.fill('Date of birth', '2012-06-17');
  await r.fill('Handicap', '12');
  await r.click('Continue');
  await r.click('12 tokens');
  await r.click('Continue');
  await r.fill('Type your full legal name', 'Dana Whitfield');
}

test('parent sign-up calls createFamily with the contract payload, refreshes, shows success', async () => {
  const refreshed = [];
  const r = await renderScreen(
    <Registration bare mode="signup" account={{ email: 'dana@email.com', emailVerified: false }} onRefresh={async () => refreshed.push(1)} />
  );
  expect(r.text()).toContain('Step 1 of 5');
  await fillParentToConsent(r);
  await r.click('Sign and submit');
  expect(mockCalls[0][0]).toBe('createFamily');
  expect(mockCalls[0][1]).toMatchObject({
    mode: 'parent',
    contact: { name: 'Dana Whitfield', email: 'dana@email.com', phone: '(612) 555-0148', relationship: 'Mother' },
    athletes: [{ name: 'Jordan', dob: '2012-06-17', packageId: 't-12', handicap: 12, loginEmail: null, contractMinutes: null }],
    signatureName: 'Dana Whitfield',
  });
  expect(refreshed).toHaveLength(1);
  expect(r.text()).toContain('SUCCESS a1');
  await r.unmount();
});

test('link mode skips to athletes and calls addAthletes', async () => {
  const r = await renderScreen(<Registration bare mode="link" account={{ email: 'dana@email.com' }} />);
  expect(r.text()).toContain('Step 1 of 2');
  await r.fill('Athlete name', 'Reese');
  await r.fill('Date of birth', '2014-03-02');
  await r.click('Continue');
  await r.click('6 tokens');
  await r.click('Add athlete');
  expect(mockCalls[0][0]).toBe('addAthletes');
  expect(mockCalls[0][1]).toEqual({ athletes: [{ name: 'Reese', dob: '2014-03-02', packageId: 't-6', contractMinutes: null, handicap: null, loginEmail: null }], medical: null });
  await r.unmount();
});
```
(The package buttons are `PackageCard`s; confirm `PackageCard` renders the package `name` inside a `<button>` - `grep -n "<button" frontend/src/portal/components/PackageCard.js`. If it is a `Card onClick` div instead, replace the two `r.click('12 tokens')`/`r.click('6 tokens')` lines with a click on the element whose text starts with the name: `await act(async () => { [...r.container.querySelectorAll('[role="button"],div')].find((el) => el.textContent.startsWith('12 tokens') && el.onclick).click(); })` - or, simpler, add `role="button"` and `aria-label={pkg.name}` to PackageCard's clickable root and keep `click()`; do the latter.)

- [ ] **Step 2: Run it** - Expected: FAIL (`Step 1 of 5` not found; `mode` prop unknown).

- [ ] **Step 3: Rewrite `Registration.js`**

```js
import React, { useEffect, useState } from 'react';
import { color, font } from '../tokens';
import Button from '../components/Button';
import PhoneFrame from '../components/PhoneFrame';
import { BackLink, Body, ScreenTitle } from '../components/Primitives';
import { callAddAthletes, callCreateFamily } from '../hooks/callables';
import { todayISO } from '../data/calendar';
import { EMAIL_RE, buildAddAthletesPayload, buildCreateFamilyPayload, newAthleteEntry, validateAthleteEntry } from '../data/signup';
import { AthleteStep, ConsentStep, ConsentInfoSheet, ContactStep, PackageStep, SubmittingOverlay, WhoStep } from './RegistrationSteps';
import RegistrationSuccess from './RegistrationSuccess';

/**
 * 02 · Registration (Sprint 20, spec 2.1) - signed-in, instant. Two modes:
 * 'signup' (who-are-you -> contact -> athletes -> package -> consent ->
 * createFamily) and 'link' (a provisioned parent adding athletes: athletes
 * -> package -> addAthletes). No approval queue: the callable writes the
 * family in one transaction and `onRefresh` (useAuthSession().refresh) flips
 * `provisioned` without a reload. `variant` remains the harness deep-link.
 */
const STEPS = {
  signup: [['who', 'Who are you'], ['contact', 'Contact'], ['athletes', 'Athletes'], ['package', 'Choose a package'], ['consent', 'Consent and waiver']],
  link: [['athletes', 'Athletes'], ['package', 'Choose a package']],
};
const VARIANT_STEP = { guardian: 1, athlete: 2, tier: 3, consent: 4, submitting: 4, success: 4 };

export default function Registration({ variant, bare = false, mode = 'signup', account = null, onRefresh, onBack, onFinish }) {
  const demo = variant != null;
  const steps = STEPS[mode] || STEPS.signup;
  const today = todayISO();
  const [step, setStep] = useState(demo ? VARIANT_STEP[variant] ?? 0 : 0);
  const [phase, setPhase] = useState(demo && (variant === 'submitting' || variant === 'success') ? variant : 'form');
  const [form, setForm] = useState(() => ({
    mode: demo ? 'parent' : mode === 'link' ? 'parent' : null,
    contact: { name: demo ? 'Dana Whitfield' : '', email: demo ? 'dana@email.com' : account?.email ?? '', phone: demo ? '(612) 555-0148' : '', relationship: '' },
    athletes: [demo ? { ...newAthleteEntry(), key: 'demo-1', name: 'Jordan Whitfield' } : newAthleteEntry()],
    emergencyContact: '',
    medical: '',
    consents: { dataCollection: true, videoCapture: true, mediaRelease: false, facilityAccess: false },
    signatureName: '',
  }));
  const [showErrors, setShowErrors] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [infoSheet, setInfoSheet] = useState(null);
  const [result, setResult] = useState(demo ? { householdId: 'demo', athleteIds: ['demo-1'] } : null);

  // The auth email arrives after mount on a restored session: prefill once, never overwrite typing.
  useEffect(() => {
    if (account?.email && form.contact.email === '') setForm((f) => ({ ...f, contact: { ...f.contact, email: account.email } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.email]);

  const patch = (p) => setForm((f) => ({ ...f, ...p }));
  const setContact = (fn) => setForm((f) => ({ ...f, contact: typeof fn === 'function' ? fn(f.contact) : fn }));
  const setConsents = (fn) => setForm((f) => ({ ...f, consents: typeof fn === 'function' ? fn(f.consents) : fn }));
  const updateAthlete = (key, p) => setForm((f) => ({ ...f, athletes: f.athletes.map((a) => (a.key === key ? { ...a, ...p } : a)) }));
  const addAthlete = () => setForm((f) => ({ ...f, athletes: [...f.athletes, newAthleteEntry()] }));
  const removeAthlete = (key) => setForm((f) => ({ ...f, athletes: f.athletes.length > 1 ? f.athletes.filter((a) => a.key !== key) : f.athletes }));
  const switchToParent = () => { patch({ mode: 'parent' }); setStep(0); setShowErrors(false); };
  const setMode = (m) => setForm((f) => ({ ...f, mode: m, athletes: m === 'athlete' ? f.athletes.slice(0, 1) : f.athletes }));

  const stepId = steps[step][0];
  const athleteErrors = form.athletes.map((a) =>
    validateAthleteEntry(a, { todayISO: today, guardianEmail: form.contact.email, siblings: form.athletes, mode: form.mode || 'parent' })
  );
  const valid = {
    who: form.mode != null,
    contact: form.contact.name.trim() !== '' && EMAIL_RE.test(form.contact.email.trim()) && form.contact.phone.trim() !== '',
    athletes: athleteErrors.every((e) => !e.name && !e.dob && !e.handicap && !e.loginEmail),
    package: form.athletes.every((a) => a.packageId != null) && athleteErrors.every((e) => !e.packageId && !e.contractMinutes),
    consent: form.consents.dataCollection && form.consents.videoCapture && form.signatureName.trim() !== '',
  }[stepId];

  const goBack = () => {
    if (step === 0) { if (onBack) onBack(); return; }
    setShowErrors(false);
    setStep((s) => s - 1);
  };
  const handleContinue = () => {
    if (!valid) { setShowErrors(true); return; }
    setShowErrors(false);
    if (step < steps.length - 1) { setStep((s) => s + 1); return; }
    handleSubmit();
  };
  const handleSubmit = async () => {
    setSubmitError(null);
    setPhase('submitting');
    try {
      const res = mode === 'link'
        ? await callAddAthletes(buildAddAthletesPayload(form))
        : await callCreateFamily(buildCreateFamilyPayload(form));
      if (onRefresh) await onRefresh();
      setResult(res);
      setPhase('success');
    } catch (err) {
      setPhase('form');
      setSubmitError(err && typeof err.message === 'string' && err.message ? err.message : 'Sign-up could not be saved. Try again.');
    }
  };

  if (phase === 'success') {
    return <RegistrationSuccess bare={bare} mode={mode} form={form} result={result} account={account} onFinish={onFinish} />;
  }

  const label = phase === 'submitting' ? (mode === 'link' ? 'Adding athlete' : 'Creating your account')
    : step < steps.length - 1 ? 'Continue' : mode === 'link' ? 'Add athlete' : 'Sign and submit';
  return (
    <PhoneFrame
      bare={bare}
      header={<StepHeader step={step} steps={steps} onBack={goBack} />}
      footer={
        <div style={{ borderTop: `1px solid ${color.frameRule}`, padding: '14px 22px 22px' }}>
          {submitError ? <Body size={12} tone={color.error} style={{ marginBottom: 10, textAlign: 'center' }}>{submitError}</Body> : null}
          <Button loading={phase === 'submitting'} disabled={phase === 'submitting' || !valid} onClick={handleContinue}>{label}</Button>
        </div>
      }
    >
      <div style={{ padding: '20px 22px 24px', position: 'relative' }}>
        {stepId === 'who' ? <WhoStep mode={form.mode} onChange={setMode} /> : null}
        {stepId === 'contact' ? <ContactStep mode={form.mode} contact={form.contact} onChange={setContact} showErrors={showErrors} /> : null}
        {stepId === 'athletes' ? (
          <AthleteStep mode={form.mode || 'parent'} athletes={form.athletes} onUpdate={updateAthlete} onAdd={addAthlete} onRemove={removeAthlete}
            emergencyContact={form.emergencyContact} onEmergencyContact={(v) => patch({ emergencyContact: v })}
            medical={form.medical} onMedical={(v) => patch({ medical: v })} showErrors={showErrors}
            todayISO={today} guardianEmail={form.contact.email} onSwitchToParent={switchToParent} />
        ) : null}
        {stepId === 'package' ? <PackageStep athletes={form.athletes} onUpdate={updateAthlete} showErrors={showErrors} /> : null}
        {stepId === 'consent' ? (
          <ConsentStep mode={form.mode} consents={form.consents} onChange={setConsents} signatureName={form.signatureName}
            onSignatureChange={(v) => patch({ signatureName: v })} onOpenInfo={setInfoSheet} showErrors={showErrors} />
        ) : null}
      </div>
      {phase === 'submitting' ? <SubmittingOverlay mode={mode} /> : null}
      {infoSheet ? <ConsentInfoSheet id={infoSheet} onClose={() => setInfoSheet(null)} /> : null}
    </PhoneFrame>
  );
}

function StepHeader({ step, steps, onBack }) {
  return (
    <div style={{ padding: '12px 22px 14px', borderBottom: `1px solid ${color.frameRule}` }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <BackLink onClick={onBack}>‹ Back</BackLink>
        <div style={{ flex: 1 }} />
        <span style={{ font: `400 12px ${font.body}`, color: color.textTertiary }}>Step {step + 1} of {steps.length}</span>
      </div>
      <div style={{ display: 'flex', gap: 5, marginTop: 13 }}>
        {steps.map(([id], i) => <div key={id} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? color.primary : color.rule }} />)}
      </div>
      <ScreenTitle size={24} style={{ marginTop: 12 }}>{steps[step][1]}</ScreenTitle>
    </div>
  );
}
```
Until Task 6 creates `RegistrationSuccess.js`, create it as a placeholder that Task 6 replaces: `export default function RegistrationSuccess() { return null; }`.

- [ ] **Step 4: Run it** - `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/screens/Registration.test.js` - Expected: PASS (2 tests).

- [ ] **Step 5: PortalRoutes - RegistrationRoute and the link-mode entry**

Replace the `register` route element (`PortalRoutes.js:501-515`) with `element={<RegistrationRoute />}` and add, beside `MembershipRoute`:
```js
/**
 * Sprint 20 (spec 2.1): /portal/register is instant and signed-in. A
 * provisioned account is redirected to its landing - except a parent who
 * arrived from Settings' "Link another athlete" (navigation state `link`),
 * who gets the athletes-only flow that calls addAthletes.
 */
function RegistrationRoute() {
  const live = isLive();
  const { user, provisioned, loading, refresh } = useAuthSession(live ? undefined : { variant: 'idle' });
  const { state } = useLocation();
  const navigate = useNavigate();
  const linkMode = Boolean(state?.link);
  if (live && loading) return null;
  if (live && !user) return <Navigate to="/portal/signin" replace />;
  if (live && provisioned && !(linkMode && user.role === 'parent')) return <Navigate to={landingFor(user)} replace />;
  return (
    <Registration
      bare
      mode={linkMode ? 'link' : 'signup'}
      account={live ? user : null}
      onRefresh={live ? refresh : undefined}
      onBack={() => navigate(linkMode ? '/portal/settings' : '/portal/signin')}
      onFinish={(path) => navigate(path, { replace: true })}
    />
  );
}
```
Delete `RequireSignedIn` (`:104-111`, its only caller is gone). Settings route (`:694`): `onLinkAthlete={() => navigate('/portal/register', { state: { link: true } })}`. The harness (`StatesHarness.js:102`) keeps mounting `Registration` with `variant` - unchanged.

- [ ] **Step 6: Verify** - `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal` (PASS) and `cd frontend && npx eslint src/portal/screens/Registration.js src/portal/screens/RegistrationSteps.js src/portal/PortalRoutes.js` (clean). `wc -l frontend/src/portal/screens/Registration.js` under 300.

- [ ] **Step 7: Commit**
```bash
git add frontend/src/portal/screens/Registration.js frontend/src/portal/screens/Registration.test.js frontend/src/portal/screens/RegistrationSteps.js frontend/src/portal/screens/RegistrationSteps.test.js frontend/src/portal/screens/RegistrationSuccess.js frontend/src/portal/PortalRoutes.js frontend/src/portal/components/PackageCard.js
git commit -m "feat(registration): who-are-you, contact prefill, handicap + own login, createFamily/addAthletes, link mode route (#8)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: PayButton + Registration Success with per-athlete pay buttons (closes part of #8, part of #12)

**Files:**
- Create: `frontend/src/portal/components/PayButton.js`
- Modify: `frontend/src/portal/screens/RegistrationSuccess.js` (replace the Task 5 placeholder)
- Test: `frontend/src/portal/components/PayButton.test.js`, `frontend/src/portal/screens/RegistrationSuccess.test.js`

**Interfaces:**
- Consumes: `callCreateCheckoutSession({ athleteId, product }) -> Promise<{ url }>` (contract 1.5; `reason` `'email-unverified'` | `'already-active'` | `'price-missing'` | `'stripe-error'` ...); `useAuthSession().resendVerification()`, `refresh()` (contract 4.1); `bookingOpen`, `BOOKING_OPENS_LABEL` (contract 3.1); `packageById` (`packages.js:101`); `VERIFY_TITLE`, `verifyBody`, `RESEND`, `VERIFIED` (Task 3).
- Produces (new, not in contract): `startCheckout({ athleteId, product, go }) -> Promise<void>` (calls the callable then `go(url)`; default `go` is `window.location.assign`); `PayButton({ athleteId, product = 'tier', label, height, variant, email, style })` - renders the button; on `email-unverified` swaps to the verify state (title, body naming the sender, Resend, I've verified -> `refresh()` then retries); any other rejection shows `err.message`. `RegistrationSuccess({ bare, mode, form, result, account, onFinish })`.

- [ ] **Step 1: Write the failing PayButton test**

`frontend/src/portal/components/PayButton.test.js`:
```js
import React from 'react';
import { renderScreen } from '../screens/testRender';
import PayButton, { startCheckout } from './PayButton';

let mockReject = null;
jest.mock('../hooks/callables', () => ({
  callCreateCheckoutSession: async (payload) => {
    if (mockReject) { const e = new Error(mockReject.message); e.reason = mockReject.reason; throw e; }
    return { url: `https://checkout.stripe.test/${payload.athleteId}/${payload.product}` };
  },
}), { virtual: true });
let mockSession;
jest.mock('../hooks/useAuthSession', () => ({ __esModule: true, default: () => mockSession }));
beforeEach(() => {
  mockReject = null;
  mockSession = { resendVerification: async () => ({ sent: true }), refresh: async () => {} };
});

test('startCheckout hands the Stripe url to go()', async () => {
  const gone = [];
  await startCheckout({ athleteId: 'a1', product: 'facility', go: (u) => gone.push(u) });
  expect(gone).toEqual(['https://checkout.stripe.test/a1/facility']);
});

test('the button navigates; an unverified password account gets the verify state', async () => {
  const gone = [];
  const r = await renderScreen(<PayButton athleteId="a1" label="Pay now" email="dana@email.com" go={(u) => gone.push(u)} />);
  await r.click('Pay now');
  expect(gone).toEqual(['https://checkout.stripe.test/a1/tier']);
  mockReject = { reason: 'email-unverified', message: 'Verify your email first.' };
  await r.click('Pay now');
  expect(r.text()).toContain('Verify your email to finish');
  expect(r.text()).toContain('We sent a link to dana@email.com from noreply@');
  mockReject = null;
  await r.click("I've verified");
  expect(gone).toHaveLength(2);
  await r.unmount();
});

test('other failures show the message', async () => {
  mockReject = { reason: 'stripe-error', message: 'Checkout is unavailable right now. Try again in a minute.' };
  const r = await renderScreen(<PayButton athleteId="a1" label="Pay now" go={() => {}} />);
  await r.click('Pay now');
  expect(r.text()).toContain('Checkout is unavailable right now. Try again in a minute.');
  await r.unmount();
});
```

- [ ] **Step 2: Run it** - Expected: FAIL, module not found.

- [ ] **Step 3: Implement `components/PayButton.js`**

```js
import React, { useState } from 'react';
import { color } from '../tokens';
import Button from './Button';
import { Body, Card, SectionLabel } from './Primitives';
import { callCreateCheckoutSession } from '../hooks/callables';
import useAuthSession from '../hooks/useAuthSession';
import { RESEND, VERIFIED, VERIFY_TITLE, verifyBody } from '../data/authCopy';

/**
 * The one way the portal starts a Stripe Checkout Session (Sprint 20, spec
 * 4.2/4.5): createCheckoutSession -> the browser navigates to `url`. Stripe
 * returns the family to /portal/family?paid=<athleteId> (or /portal/home).
 * A password account that has not verified its email is refused by the
 * function (reason 'email-unverified'); this renders the verify state (9.4)
 * with Resend / I've verified and retries after a token refresh.
 */
export async function startCheckout({ athleteId, product = 'tier', go = (url) => window.location.assign(url) }) {
  const { url } = await callCreateCheckoutSession({ athleteId, product });
  go(url);
}

export default function PayButton({ athleteId, product = 'tier', label = 'Pay now', height = 50, variant = 'primary', email = null, go, style }) {
  const { resendVerification, refresh } = useAuthSession();
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState(null); // null | { verify: true } | { error }
  const [resent, setResent] = useState(false);

  const run = async () => {
    setBusy(true);
    setState(null);
    try {
      await startCheckout({ athleteId, product, go });
    } catch (err) {
      if (err && err.reason === 'email-unverified') setState({ verify: true });
      else setState({ error: (err && err.message) || 'Checkout is unavailable right now. Try again in a minute.' });
    } finally {
      setBusy(false);
    }
  };
  const verified = async () => {
    if (refresh) await refresh();
    await run();
  };
  const resend = async () => {
    try { await resendVerification(); setResent(true); } catch (err) { setState({ error: (err && err.message) || 'Could not resend. Try again in a minute.' }); }
  };

  if (state && state.verify) {
    return (
      <Card tone="yellow" large style={style}>
        <SectionLabel tone={color.secondary} style={{ marginBottom: 8 }}>{VERIFY_TITLE}</SectionLabel>
        <Body size={12}>{verifyBody(email || 'your email')}</Body>
        {resent ? <Body size={11} tone={color.primary} style={{ marginTop: 6 }}>Sent again.</Body> : null}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <Button variant="outline" height={44} onClick={resend} style={{ flex: 1, boxShadow: 'none' }}>{RESEND}</Button>
          <Button height={44} loading={busy} onClick={verified} style={{ flex: 1 }}>{VERIFIED}</Button>
        </div>
      </Card>
    );
  }
  return (
    <div style={style}>
      <Button variant={variant} height={height} loading={busy} onClick={run}>{busy ? 'Opening checkout' : label}</Button>
      {state && state.error ? <Body size={12} tone={color.error} style={{ marginTop: 8 }}>{state.error}</Body> : null}
    </div>
  );
}
```

- [ ] **Step 4: Run it** - Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing Success test**

`frontend/src/portal/screens/RegistrationSuccess.test.js`:
```js
import React from 'react';
import { renderScreen } from './testRender';
import RegistrationSuccess from './RegistrationSuccess';
import { newAthleteEntry } from '../data/signup';

jest.mock('../components/PayButton', () => ({ __esModule: true, default: ({ athleteId, label }) => <button type="button">{label}|{athleteId}</button>, startCheckout: async () => {} }));

const form = (over) => ({
  mode: 'parent', contact: { name: 'Dana', email: 'dana@email.com', phone: '1', relationship: 'Mother' },
  athletes: [{ ...newAthleteEntry(), name: 'Jordan', dob: '2012-06-17', packageId: 't-12' }, { ...newAthleteEntry(), name: 'Reese', dob: '2014-03-02', packageId: 'elite', ownLogin: true, loginEmail: 'reese@email.com' }],
  emergencyContact: '', medical: '', consents: {}, signatureName: 'Dana', ...over,
});

test('one pay button per athlete, the next steps, child-login instructions, no walkthrough', async () => {
  const finished = [];
  const r = await renderScreen(
    <RegistrationSuccess bare mode="signup" form={form()} result={{ householdId: 'h1', athleteIds: ['a1', 'a2'] }} account={{ email: 'dana@email.com' }} onFinish={(p) => finished.push(p)} />
  );
  expect(r.text()).toContain("You're in");
  expect(r.button("Pay for Jordan's 12 tokens|a1")).not.toBeNull();
  expect(r.button("Pay for Reese's Elite|a2")).not.toBeNull();
  expect(r.text()).toContain('Booking opens Fri, Oct 10 at 7 AM');
  expect(r.text()).toContain('Elite books right away once paid');
  expect(r.text()).toContain('you will be brought back here');
  expect(r.text()).toContain('reese@email.com');
  expect(r.text()).toContain("There's no welcome email");
  expect(r.button('Start the walkthrough')).toBeNull();
  await r.click('Go to your family');
  expect(finished).toEqual(['/portal/family']);
  await r.unmount();
});

test('athlete mode goes home', async () => {
  const finished = [];
  const r = await renderScreen(
    <RegistrationSuccess bare mode="signup" form={form({ mode: 'athlete', athletes: [form().athletes[0]] })} result={{ householdId: 'h1', athleteIds: ['a1'] }} account={{ email: 'j@email.com' }} onFinish={(p) => finished.push(p)} />
  );
  await r.click('Go to your home');
  expect(finished).toEqual(['/portal/home']);
  await r.unmount();
});
```

- [ ] **Step 6: Run it** - Expected: FAIL (placeholder renders nothing).

- [ ] **Step 7: Implement `RegistrationSuccess.js`**

```js
import React from 'react';
import { color, font, tint } from '../tokens';
import Button from '../components/Button';
import PayButton from '../components/PayButton';
import PhoneFrame from '../components/PhoneFrame';
import { Body, Card, ScreenTitle, SectionLabel, Tick } from '../components/Primitives';
import { BOOKING_OPENS_LABEL, bookingOpen } from '../data/calendar';
import { packageById } from '../data/packages';

/**
 * "You're in" (Sprint 20, spec 2.1 Success): the receipt, one Pay button per
 * athlete (createCheckoutSession), what happens next, and the role's home.
 * No walkthrough hop (spec 9: Success -> walkthrough -> NotProvisioned loop).
 */
export default function RegistrationSuccess({ bare = false, mode = 'signup', form, result, account, onFinish }) {
  const athleteMode = form.mode === 'athlete';
  const rows = form.athletes.map((a, i) => ({ ...a, athleteId: result?.athleteIds?.[i] ?? null, pkg: packageById(a.packageId) }));
  const anyToken = rows.some((r) => r.pkg && r.pkg.kind !== 'elite');
  const anyElite = rows.some((r) => r.pkg && r.pkg.kind === 'elite');
  const logins = rows.filter((r) => r.loginEmail && r.ownLogin);
  const home = athleteMode ? '/portal/home' : '/portal/family';
  const next = [
    ...(anyToken && !bookingOpen(Date.now()) ? [`Booking opens ${BOOKING_OPENS_LABEL} for token packages.`] : []),
    ...(anyElite ? ['Elite books right away once paid.'] : []),
    `After you pay, Stripe brings you back - you will be brought back here and see "Confirming your payment..." until it clears.`,
    ...logins.map((r) => `${r.name.trim()} signs in at /portal/signin with ${r.loginEmail.trim().toLowerCase()} - Continue with Google, or Create a login with that email - then taps Check again.`),
    "There's no welcome email - this screen is your receipt.",
  ];
  return (
    <PhoneFrame
      bare={bare}
      footer={
        <div style={{ borderTop: `1px solid ${color.frameRule}`, padding: '14px 22px 22px' }}>
          <Button variant="secondary" onClick={() => onFinish && onFinish(home)}>{athleteMode ? 'Go to your home' : 'Go to your family'}</Button>
        </div>
      }
    >
      <div style={{ padding: '40px 22px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: tint.green, border: `2px solid ${color.primary}`, display: 'grid', placeItems: 'center' }}>
          <Tick size={26} color={color.primary} thickness={3} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <ScreenTitle size={26}>You're in</ScreenTitle>
          <Body size={13} style={{ marginTop: 10 }}>{mode === 'link' ? 'Added to your family. Pay to start booking.' : 'Your account is ready. Pay to start booking.'}</Body>
        </div>
        <Card large style={{ width: '100%' }}>
          <SectionLabel style={{ marginBottom: 12 }}>Pay</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rows.map((r) => (
              <PayButton key={r.key} athleteId={r.athleteId} email={account?.email ?? null}
                label={`Pay for ${r.name.trim()}'s ${r.pkg ? r.pkg.name : 'package'}`} />
            ))}
          </div>
        </Card>
        <Card large style={{ width: '100%' }}>
          <SectionLabel style={{ marginBottom: 14 }}>What happens next</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            {next.map((label, i) => (
              <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span style={{ width: 22, height: 22, flex: 'none', borderRadius: '50%', border: `1px solid ${color.controlBorder}`, display: 'grid', placeItems: 'center', font: `600 11px ${font.body}`, color: color.textTertiary }}>{i + 1}</span>
                <span style={{ font: `400 13px ${font.body}`, color: color.textSecondary }}>{label}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </PhoneFrame>
  );
}
```

- [ ] **Step 8: Run it** - `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/screens/RegistrationSuccess.test.js src/portal/screens/Registration.test.js` - Expected: PASS.

- [ ] **Step 9: Commit**
```bash
git add frontend/src/portal/components/PayButton.js frontend/src/portal/components/PayButton.test.js frontend/src/portal/screens/RegistrationSuccess.js frontend/src/portal/screens/RegistrationSuccess.test.js
git commit -m "feat(signup): PayButton via createCheckoutSession with verify-email gate; You're in success with per-athlete pay (#8)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: NotProvisioned - verify-email, stranger, already-claimed, legacy states (closes part of #9, part of #12)

**Files:**
- Modify: `frontend/src/portal/screens/NotProvisioned.js:61-90,116-284`, `frontend/src/portal/PortalRoutes.js:526-529`
- Test: `frontend/src/portal/screens/NotProvisioned.test.js`

**Interfaces:**
- Consumes: `useAuthSession()` -> `user.email`, `user.emailVerified`, `provisioned`, `claimState`, `checkInvite() -> Promise<claimState>`, `resendVerification()`, `signOut()` (contract 4.1); `useEnrollment().data.status` (`hooks/index.js:2306`, legacy pending/declined); `notProvisionedView`, copy constants (Task 3); `LANDING_BY_ROLE`.
- Produces: `NotProvisioned({ bare, variant, onStartEnrollment })` unchanged signature; demo variants gain `'verify' | 'stranger' | 'already-claimed'` beside the legacy `'pending' | 'declined'`.

- [ ] **Step 1: Write the failing test**

`frontend/src/portal/screens/NotProvisioned.test.js`:
```js
import React from 'react';
import { renderScreen } from './testRender';
import NotProvisioned from './NotProvisioned';

let mockSession;
let mockLegacy;
jest.mock('../hooks/useAuthSession', () => ({ __esModule: true, default: () => mockSession }));
jest.mock('../hooks', () => ({ useEnrollment: () => mockLegacy }));

beforeEach(() => {
  mockLegacy = { data: { status: 'none', request: null }, loading: false, error: null, submit: async () => {} };
  mockSession = {
    user: { uid: 'u1', email: 'kid@email.com', emailVerified: false, role: null }, provisioned: false, loading: false,
    claimState: 'none', checkInvite: async () => 'none', resendVerification: async () => ({ sent: true }), signOut: async () => {},
  };
});

test('stranger: two CTAs and Check again re-runs the claim', async () => {
  const checks = [];
  mockSession.checkInvite = async () => { checks.push(1); return 'none'; };
  const started = [];
  const r = await renderScreen(<NotProvisioned bare onStartEnrollment={() => started.push(1)} />);
  await r.click("I'm a parent - start sign-up");
  expect(started).toEqual([1]);
  await r.click('My parent enrolled me');
  expect(r.text()).toContain('Use the email they entered, then tap Check again.');
  await r.click('Check again');
  expect(checks).toEqual([1]);
  await r.unmount();
});

test('needs-verification names the sender and offers Resend / I\'ve verified', async () => {
  mockSession.claimState = 'needs-verification';
  const resent = []; const checks = [];
  mockSession.resendVerification = async () => { resent.push(1); return { sent: true }; };
  mockSession.checkInvite = async () => { checks.push(1); return 'needs-verification'; };
  const r = await renderScreen(<NotProvisioned bare />);
  expect(r.text()).toContain('Verify your email to finish');
  expect(r.text()).toContain('We sent a link to kid@email.com from noreply@');
  await r.click('Resend');
  await r.click("I've verified");
  expect(resent).toEqual([1]);
  expect(checks).toEqual([1]);
  await r.unmount();
});

test('already claimed and legacy pending', async () => {
  mockSession.claimState = 'already-claimed';
  const a = await renderScreen(<NotProvisioned bare />);
  expect(a.text()).toContain('This login is already set up - sign in with it');
  await a.unmount();
  mockSession.claimState = 'none';
  mockLegacy.data = { status: 'pending', request: { guardian: { name: 'Dana' }, athletes: [] } };
  const started = [];
  const l = await renderScreen(<NotProvisioned bare onStartEnrollment={() => started.push(1)} />);
  await l.click('Sign-up is now instant - start here');
  expect(started).toEqual([1]);
  expect(l.text()).not.toContain("you'll get an email");
  await l.unmount();
});

test('a claimed account is sent to its home', async () => {
  mockSession.provisioned = true;
  mockSession.user = { ...mockSession.user, role: 'athlete' };
  const r = await renderScreen(<NotProvisioned bare />, { path: '/portal/not-provisioned' });
  expect(r.location().pathname).toBe('/portal/home');
  await r.unmount();
});
```

- [ ] **Step 2: Run it** - Expected: FAIL (old copy, no CTAs).

- [ ] **Step 3: Rewrite the live body**

Replace `LiveNotProvisioned` (`:61-90`) with:
```js
function LiveNotProvisioned({ bare = false, onStartEnrollment }) {
  const { user, provisioned, signOut, claimState, checkInvite, resendVerification } = useAuthSession();
  const enrollment = useEnrollment();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  // A claim that succeeded (or any provisioned account landing here) goes home.
  useEffect(() => {
    if (provisioned && user) navigate(user.specialistId ? '/portal/my-sessions' : LANDING_BY_ROLE[user.role] ?? '/portal/not-provisioned', { replace: true });
  }, [provisioned, user, navigate]);

  const handleSignOut = async () => {
    setSigningOut(true);
    try { await signOut(); navigate('/portal/signin', { replace: true }); } catch (e) { setSigningOut(false); }
  };
  return (
    <NotProvisionedBody
      bare={bare}
      email={user?.email ?? null}
      view={notProvisionedView({ claimState, legacyStatus: enrollment.loading ? null : enrollment.data?.status ?? 'none' })}
      onStartEnrollment={onStartEnrollment}
      onCheckAgain={checkInvite}
      onResend={resendVerification}
      onSignOut={handleSignOut}
      signingOut={signingOut}
    />
  );
}
```
Imports: `useEffect` from react; `import { LANDING_BY_ROLE, BrandHeader } from './SignIn';`; `import { ALREADY_CLAIMED, CHECK_AGAIN, LEGACY_CTA, RESEND, STRANGER_CHILD_CTA, STRANGER_CHILD_HINT, STRANGER_PARENT_CTA, VERIFIED, VERIFY_TITLE, notProvisionedView, verifyBody } from '../data/authCopy';`.

`DemoNotProvisioned`: `view` = `variant === 'pending' || variant === 'declined' ? 'legacy' : ['verify', 'already-claimed', 'stranger'].includes(variant) ? variant : 'stranger'`; passes no-op `onCheckAgain`/`onResend`.

`NotProvisionedBody({ bare, email, view, onStartEnrollment, onCheckAgain, onResend, onSignOut, signingOut })`: title/body by view - `verify`: `VERIFY_TITLE` / `verifyBody(email)`; `already-claimed`: `'Already set up'` / `ALREADY_CLAIMED`; `legacy`: `'Sign-up changed'` / `'Approval is no longer needed - sign-up creates the account instantly.'`; `stranger`/`checking`: `'Account not linked yet'` / `"You're signed in, but this login isn't linked to an academy family or staff role yet."`. Then the "Signed in as" card, then:
```js
        {view === 'checking' ? (
          <Card><Body size={12}>Checking your account…</Body></Card>
        ) : view === 'verify' ? (
          <VerifyState onResend={onResend} onVerified={onCheckAgain} />
        ) : view === 'already-claimed' ? (
          <Banner tone="yellow" title="Already set up">{ALREADY_CLAIMED}</Banner>
        ) : view === 'legacy' ? (
          <Button onClick={onStartEnrollment}>{LEGACY_CTA}</Button>
        ) : (
          <StrangerState onStartEnrollment={onStartEnrollment} onCheckAgain={onCheckAgain} />
        )}
```
Delete `PendingState` and `DeclinedState` (spec 2.4: the approve/resubmit actions are retired; the two historical docs render only the legacy CTA) and `DEMO_REQUEST`. Add:
```js
function VerifyState({ onResend, onVerified }) {
  const [busy, setBusy] = useState(null); // 'resend' | 'verify'
  const [note, setNote] = useState(null);
  const run = async (kind, fn) => {
    setBusy(kind); setNote(null);
    try {
      const out = await fn();
      if (kind === 'resend') setNote('Sent again.');
      else if (out === 'needs-verification') setNote("Not verified yet - open the link in the email, then tap I've verified.");
    } catch (err) { setNote((err && err.message) || 'That did not work. Try again in a minute.'); } finally { setBusy(null); }
  };
  return (
    <Card large>
      {note ? <Body size={12} style={{ marginBottom: 10 }}>{note}</Body> : null}
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="outline" height={46} loading={busy === 'resend'} onClick={() => run('resend', onResend)} style={{ flex: 1, boxShadow: 'none' }}>{RESEND}</Button>
        <Button height={46} loading={busy === 'verify'} onClick={() => run('verify', onVerified)} style={{ flex: 1 }}>{VERIFIED}</Button>
      </div>
    </Card>
  );
}

function StrangerState({ onStartEnrollment, onCheckAgain }) {
  const [child, setChild] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const check = async () => {
    setBusy(true); setNote(null);
    try {
      const out = await onCheckAgain();
      if (out === 'none') setNote('No invite for this email yet. Check the email your parent entered, or ask them to add your login.');
    } catch (err) { setNote((err && err.message) || 'Could not check. Try again in a minute.'); } finally { setBusy(false); }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {onStartEnrollment ? <Button onClick={onStartEnrollment}>{STRANGER_PARENT_CTA}</Button> : null}
      <Button variant="outline" onClick={() => setChild(true)} style={{ boxShadow: 'none' }}>{STRANGER_CHILD_CTA}</Button>
      {child ? (
        <Card large>
          <Body size={12}>{STRANGER_CHILD_HINT}</Body>
          {note ? <Body size={12} tone={color.secondary} style={{ marginTop: 8 }}>{note}</Body> : null}
          <Button height={46} loading={busy} onClick={check} style={{ marginTop: 12 }}>{CHECK_AGAIN}</Button>
        </Card>
      ) : null}
    </div>
  );
}
```
`PortalRoutes.js:528`: `onStartEnrollment={go('/portal/register')}` stays (the stranger's parent CTA and the legacy CTA both start the instant flow; `RegistrationRoute` redirects a provisioned account).

- [ ] **Step 4: Run it** - `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/screens/NotProvisioned.test.js` - Expected: PASS (4 tests). `wc -l` under 300.

- [ ] **Step 5: Commit**
```bash
git add frontend/src/portal/screens/NotProvisioned.js frontend/src/portal/screens/NotProvisioned.test.js frontend/src/portal/PortalRoutes.js
git commit -m "feat(auth): NotProvisioned verify / stranger / already-claimed / legacy states with Check again (#9, #12)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Continue with `20-frontend-part2.md` (Tasks 8-14).
