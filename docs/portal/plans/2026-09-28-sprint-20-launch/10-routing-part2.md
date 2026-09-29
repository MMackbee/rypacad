# Routing lane - Sprint 20 Implementation Plan (part 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Continues `10-routing.md` (header, Execution order, Global Constraints, Tasks 1-5
live there and apply here unchanged). Tasks 7-11 consume Task 1's
`bookingOpen`/`BOOKING_OPENS_LABEL`, Task 2's `calendlyUrlFor`, Task 6's
`callClaimInvite`. Tasks 12, 12b and 13 are in `10-routing-part3.md`. Execution
order (part 1): 1, 2, 3, **6, 9** first, then 4/5, then 7, 8, 10, 11, 12, 12b, 13.

**Spec:** docs/portal/SPRINT-20-LAUNCH.md sections 2.2, 3.2, 4.4, 5, 6.1, 9 (K03/K04).
**Interfaces:** docs/portal/plans/2026-09-28-sprint-20-launch/01-interfaces.md sections 1.1, 3.6, 4.1, 4.3, 4.4.
**GitHub issues:** #3 (Tasks 6, 7), #2 (Task 9), #6 (Tasks 8, 10, 11).

Test command: `cd frontend && CI=true npx react-scripts test --watchAll=false <path>`.
Compile check for hook files: `cd frontend && npx esbuild src/portal/hooks/<file>.js --bundle --platform=browser --outfile=/dev/null --log-level=error`.

---

### Task 6: Functions client plumbing - `firebase.js` + `hooks/callables.js` (closes #3)

**Files:**
- Modify: `frontend/src/firebase.js` (imports :1-10; export beside :62; emulator block :78-80)
- Create: `frontend/src/portal/hooks/callables.js`
- Create: `frontend/src/portal/hooks/callables.test.js`

**Interfaces:** Produces `functions` (firebase.js), `callCreateFamily(payload)`, `callAddAthletes(payload)`, `callClaimInvite()`, `callCreateCheckoutSession(payload)`, `wrapCallable(err, context)` (contract 1.1). Consumes `ERR`, `LiveDataError` (live.js:44-77). The functions lane's callables are named `createFamily`, `addAthletes`, `claimInvite`, `createCheckoutSession` in `us-central1`. Reasons the functions lane may return beyond contract 1.2-1.5 (D7): `athlete-name-required` (createFamily/addAthletes), `invalid-product` (createCheckoutSession, right after `signed-out`), `already-active` also for product `'facility'`, `child-email-duplicate` also against an existing open OR claimed invite; `claimInvite` returns `householdId`/`athleteId` only on `'claimed'` (null otherwise). All ride through `wrapCallable` unchanged - screens branch on `reason`.

- [ ] Write the failing test `callables.test.js` (mocks keep Firebase out of jest):

```js
/**
 * Callable clients (Sprint 20, contract 1.1): every rejection becomes a
 * LiveDataError with the function's own plain-language message and the
 * stable `details.reason`, so screens branch on `reason` like they do for
 * the booking gate.
 */
jest.mock('../../firebase', () => ({ functions: {} }));
jest.mock('firebase/functions', () => ({ httpsCallable: jest.fn(() => jest.fn()) }));
jest.mock('firebase/firestore', () => ({}));

import { ERR, LiveDataError } from './live';
import { wrapCallable } from './callables';

const httpsErr = (code, message, details) => Object.assign(new Error(message), { code, details });

describe('wrapCallable', () => {
  test('maps HttpsError codes incl. the two wrap() lacks', () => {
    expect(wrapCallable(httpsErr('functions/already-exists', 'Already set up', { reason: 'already-provisioned' }), 'createFamily'))
      .toMatchObject({ code: ERR.INVALID, reason: 'already-provisioned', message: 'Already set up' });
    expect(wrapCallable(httpsErr('functions/failed-precondition', 'Verify first', { reason: 'email-unverified' }), 'x').code).toBe(ERR.INVALID);
    expect(wrapCallable(httpsErr('functions/unauthenticated', 'Sign in', { reason: 'signed-out' }), 'x').code).toBe(ERR.UNAUTHENTICATED);
    expect(wrapCallable(httpsErr('functions/permission-denied', 'No', { reason: 'not-owner' }), 'x').code).toBe(ERR.PERMISSION);
    expect(wrapCallable(httpsErr('functions/not-found', 'Gone', { reason: 'athlete-not-found' }), 'x').code).toBe(ERR.NOT_FOUND);
    expect(wrapCallable(httpsErr('functions/unavailable', 'Checkout is unavailable right now. Try again in a minute.', { reason: 'stripe-error' }), 'x').code).toBe(ERR.UNAVAILABLE);
    expect(wrapCallable(httpsErr('functions/internal', 'Sign-up could not be saved. Try again.', { reason: 'write-failed' }), 'x').code).toBe(ERR.UNKNOWN);
    // D7 additions pass through as plain reasons - no client-side enum.
    expect(wrapCallable(httpsErr('functions/invalid-argument', 'Product must be tier or facility.', { reason: 'invalid-product' }), 'x').reason).toBe('invalid-product');
    expect(wrapCallable(httpsErr('functions/invalid-argument', 'Every athlete needs a name.', { reason: 'athlete-name-required' }), 'x').reason).toBe('athlete-name-required');
  });
  test('a bare code (no functions/ prefix) and a missing details map both work', () => {
    const e = wrapCallable(httpsErr('invalid-argument', 'Bad', undefined), 'x');
    expect(e).toBeInstanceOf(LiveDataError);
    expect(e).toMatchObject({ code: ERR.INVALID, reason: null, message: 'Bad' });
  });
  test('a LiveDataError passes through unchanged; a non-Error gets a context message', () => {
    const own = new LiveDataError(ERR.INVALID, 'mine', null, 'r');
    expect(wrapCallable(own, 'x')).toBe(own);
    expect(wrapCallable('boom', 'claimInvite').message).toBe('claimInvite failed.');
  });
});
```

- [ ] Run `... src/portal/hooks/callables.test.js` - expect FAIL: cannot find module `./callables`.
- [ ] `firebase.js`: add `import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';` after the firestore import (:9); after `export const db = getFirestore(app);` (:62) add:

```js
// Cloud Functions callables (Sprint 20): createFamily, addAthletes,
// claimInvite, createCheckoutSession - all deployed to us-central1.
export const functions = getFunctions(app, 'us-central1');
```
  and inside the emulator block after `connectFirestoreEmulator(db, '127.0.0.1', 8080);` (:80): `connectFunctionsEmulator(functions, '127.0.0.1', 5001); // firebase.json emulators.functions.port`.
- [ ] Create `callables.js`:

```js
/**
 * Callable clients (Sprint 20, contract 1.1) - the browser side of the
 * functions lane's onCall handlers. New code stays out of the grandfathered
 * live.js (the grace.js/waitlist.js precedent). Each call unwraps
 * `result.data`; each rejection becomes a LiveDataError whose `reason` is
 * the function's stable `details.reason` and whose `message` is the
 * function's own plain-language copy, surfaced verbatim.
 */
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import { ERR, LiveDataError } from './live';

// wrap()'s own map (live.js:89-96) plus the two HttpsError codes it lacks.
const CODE_MAP = {
  'permission-denied': ERR.PERMISSION,
  'not-found': ERR.NOT_FOUND,
  unavailable: ERR.UNAVAILABLE,
  'deadline-exceeded': ERR.UNAVAILABLE,
  unauthenticated: ERR.UNAUTHENTICATED,
  'invalid-argument': ERR.INVALID,
  'already-exists': ERR.INVALID,
  'failed-precondition': ERR.INVALID,
};

export function wrapCallable(err, context) {
  if (err instanceof LiveDataError) return err;
  const raw = String((err && err.code) || '').replace(/^functions\//, '');
  const code = CODE_MAP[raw] || ERR.UNKNOWN;
  const reason = err && err.details && typeof err.details.reason === 'string' ? err.details.reason : null;
  const message = err && err.message ? String(err.message) : `${context} failed.`;
  return new LiveDataError(code, message, err, reason);
}

function callable(name) {
  const fn = httpsCallable(functions, name);
  return async (payload = {}) => {
    try {
      const result = await fn(payload);
      return result.data;
    } catch (err) {
      throw wrapCallable(err, name);
    }
  };
}

/** `{ householdId, athleteIds }` (contract 1.2). */
export const callCreateFamily = callable('createFamily');
/** `{ householdId, athleteIds }` (contract 1.3). */
export const callAddAthletes = callable('addAthletes');
/** `{ url }` (contract 1.5). */
export const callCreateCheckoutSession = callable('createCheckoutSession');
const claimInvite = callable('claimInvite');
/** `{ state, householdId, athleteId }` - ids only on 'claimed' (D7); never throws for an expected state (contract 1.4). */
export const callClaimInvite = () => claimInvite({});
```

- [ ] Run `... src/portal/hooks/callables.test.js` - expect PASS. Run the esbuild check on `src/firebase.js` - expect no errors (`firebase/functions` ships with `firebase ^9.22.0`).
- [ ] Commit:
```
git add frontend/src/firebase.js frontend/src/portal/hooks/callables.js frontend/src/portal/hooks/callables.test.js
git commit -m "Sprint 20: functions client + callable wrappers (createFamily, addAthletes, claimInvite, createCheckoutSession)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: `live.js` gates - billing, opens-at, Calendly cancel, next-period copy (closes #3)

**Files:**
- Modify: `frontend/src/portal/hooks/live.js` (imports :34-36; reason comment :55-61; `joinWaitlist` :448-478; `assertPeriodTokensLeft` :600-620; `createBooking` after `const isElite` (:650) and the `SESSION_FULL` fallback (:815-829); `cancelBooking` after the status check (:862-867))
- Create: `frontend/src/portal/hooks/live.test.js`

**Interfaces:** Consumes `bookingOpen`, `BOOKING_OPENS_LABEL`, `todayISO` (calendar.js). Produces exported `assertAthleteBillingActive(athlete)`, `assertBookingOpen(pkg, now)`, `assertWithinBookingWindow(pkg, date)`, `assertPeriodTokensLeft(pkg, bookings, periodKey, issuedGrant, waitlist, currentPeriodKey)` (exports new, not in contract - Task 8 and the tests need them); reasons `billing-pending`, `booking-not-open`, `calendly-managed` (contract 3.6); `joinWaitlist(entry, { athlete, pkg })` second arg (new, not in contract).

- [ ] Write the failing test `live.test.js`:

```js
/**
 * The client-side booking gates (Sprint 20, spec 4.4 + 5): pure asserts
 * exported from the adapter so the order and copy are pinned without a
 * Firestore round trip. Firebase is mocked out entirely.
 */
jest.mock('../../firebase', () => ({ auth: { currentUser: null }, db: {} }));
jest.mock('firebase/firestore', () => ({}));

import { ERR, assertAthleteBillingActive, assertBookingOpen, assertPeriodTokensLeft } from './live';
import { BOOKING_OPENS_AT } from '../data/calendar';

const reasonOf = (fn) => {
  try { fn(); } catch (e) { return [e.code, e.reason, e.message]; }
  return null;
};

describe('assertAthleteBillingActive', () => {
  test('absent and active pass; pending/past_due/lapsed throw billing-pending', () => {
    expect(reasonOf(() => assertAthleteBillingActive({}))).toBeNull();
    expect(reasonOf(() => assertAthleteBillingActive({ billing: { status: 'active' } }))).toBeNull();
    for (const status of ['pending', 'past_due', 'lapsed']) {
      expect(reasonOf(() => assertAthleteBillingActive({ billing: { status } })))
        .toEqual([ERR.INVALID, 'billing-pending', 'Payment pending - finish checkout to start booking']);
    }
  });
});

describe('assertBookingOpen', () => {
  test('token package before the gate throws booking-not-open with the label', () => {
    expect(reasonOf(() => assertBookingOpen({ kind: 'tokens' }, BOOKING_OPENS_AT - 1)))
      .toEqual([ERR.INVALID, 'booking-not-open', 'Booking opens Fri, Oct 10 at 7 AM']);
    expect(reasonOf(() => assertBookingOpen({ kind: 'tokens' }, BOOKING_OPENS_AT))).toBeNull();
    expect(reasonOf(() => assertBookingOpen({ kind: 'elite' }, 0))).toBeNull();
  });
});

describe('assertPeriodTokensLeft names the period it means', () => {
  const t6 = { id: 't-6', tokens: 6 };
  const spent = (key) => Array.from({ length: 6 }, (_, i) => ({ id: `b${i}`, status: 'confirmed', periodKey: key }));
  test('this period', () => {
    expect(reasonOf(() => assertPeriodTokensLeft(t6, spent('2026-11-01'), '2026-11-01', undefined, [], '2026-11-01')))
      .toEqual([ERR.INVALID, 'no-tokens-left', "This period's tokens are already fully booked (6 of 6)."]);
  });
  test('next period (borrowed tokens, spec 5)', () => {
    expect(reasonOf(() => assertPeriodTokensLeft(t6, spent('2026-12-01'), '2026-12-01', undefined, [], '2026-11-01')))
      .toEqual([ERR.INVALID, 'no-tokens-left', "Next period's tokens are already fully booked (6 of 6)."]);
  });
  test('a waitlist hold is named; Elite never throws', () => {
    expect(reasonOf(() => assertPeriodTokensLeft(t6, spent('2026-11-01').slice(0, 5), '2026-11-01', undefined, [{ periodKey: '2026-11-01' }], '2026-11-01'))[2])
      .toBe("This period's tokens are already fully booked (5 of 6, 1 held on a waitlist).");
    expect(reasonOf(() => assertPeriodTokensLeft({ id: 'elite', tokens: null }, spent('2026-11-01'), '2026-11-01', undefined, [], '2026-11-01'))).toBeNull();
  });
});
```

- [ ] Run `... src/portal/hooks/live.test.js` - expect FAIL: `assertAthleteBillingActive` is not a function.
- [ ] `live.js` imports (:35): `import { BOOKING_OPENS_LABEL, bookingOpen, openThrough, todayISO, windowOpensOn } from '../data/calendar';`. Extend the reason list comment (:55-61) with: `Sprint 20 adds 'billing-pending' (athlete not paid), 'booking-not-open' (before the Oct 10 gate) and 'calendly-managed' (a Calendly-sourced booking is cancelled from Calendly, not here).`
- [ ] Add the two gates right after `selectGraceToken` (:491-499), exported:

```js
/**
 * Per-athlete paid status (Sprint 20, spec 4.4): absent == active for every
 * athlete provisioned before this sprint; anything else blocks booking with
 * the pending copy. firestore.rules' athleteBillingOk() is the server half.
 */
export function assertAthleteBillingActive(athlete) {
  const status = athlete?.billing?.status ?? 'active';
  if (status === 'active') return;
  throw new LiveDataError(ERR.INVALID, 'Payment pending - finish checkout to start booking', null, 'billing-pending');
}

/**
 * The Oct 10 gate (Sprint 20, spec 5): token members book from
 * BOOKING_OPENS_AT, Elite at once. `now` is injectable for tests.
 */
export function assertBookingOpen(pkg, now = Date.now()) {
  if (bookingOpen(now, pkg)) return;
  throw new LiveDataError(ERR.INVALID, `Booking opens ${BOOKING_OPENS_LABEL}`, null, 'booking-not-open');
}
```
  Make `assertWithinBookingWindow` (:524) and `assertPeriodTokensLeft` (:600) `export function`s.
- [ ] `assertPeriodTokensLeft`: signature `(pkg, bookings, periodKey, issuedGrant, waitlist = [], currentPeriodKey = null)`; replace the message expression with:

```js
        granted === 0
          ? 'This package has no tokens to spend — ask the academy to assign one.'
          : `${currentPeriodKey && periodKey > currentPeriodKey ? "Next period's" : "This period's"} tokens are already fully booked (${used} of ${granted}${reserved ? `, ${reserved} held on a waitlist` : ''}).`,
```
- [ ] `createBooking`: after `const isElite = Boolean(pkg) && pkg.tokens === null;` (:650) insert:

```js
  // Sprint 20 (spec 4.4, then 5): paid status and the Oct 10 gate, before
  // the window/cadence/cap checks - both are free (no extra read) and run
  // for every caller, bookRecurring's skipCapCheck instances included.
  assertAthleteBillingActive(athlete);
  assertBookingOpen(pkg);
  const currentPeriodKey = periodFor(todayISO(), anchorDay).periodKey;
```
  and change the cap call to `assertPeriodTokensLeft(pkg, bookings, periodKey, issuedGrant, waitlist, currentPeriodKey);`. In the `SESSION_FULL` catch, pass the docs already in hand: `joinWaitlist({ sessionId, athleteId, householdId, date, periodKey, attendee }, { athlete, pkg })`.
- [ ] `joinWaitlist` (:448): signature `joinWaitlist({ sessionId, athleteId, householdId, date, periodKey, attendee }, { athlete = null, pkg = null } = {})`; after `const user = requireUser();` insert:

```js
  // Sprint 20 (spec 4.4, 5): the same two gates createBooking runs. Its
  // full-session fallback passes the docs it already read; useWaitlist's
  // own join() lands here cold and pays the two reads.
  const a = athlete ?? (await fetchAthlete(athleteId));
  assertAthleteBillingActive(a);
  const p = pkg ?? (a.packageId ? await fetchPackage(a.packageId) : null);
  assertBookingOpen(p);
```
- [ ] `cancelBooking`: after the `booking.status !== 'confirmed'` throw (:862-867) insert:

```js
      // Sprint 20 (spec 6.1): a Calendly-sourced booking is cancelled from
      // Calendly's email; the webhook writes the cancel. Rules refuse it too.
      if (booking.source === 'calendly') {
        throw new LiveDataError(ERR.INVALID, "Cancel or reschedule from Calendly's email", null, 'calendly-managed');
      }
```
- [ ] Run `... src/portal/hooks/live.test.js` - expect PASS. Run the esbuild check on `live.js` - no errors.
- [ ] Commit:
```
git add frontend/src/portal/hooks/live.js frontend/src/portal/hooks/live.test.js
git commit -m "Sprint 20: client gates - athlete billing, Oct 10 opens-at, Calendly cancel refusal, next-period token copy

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: `bookRecurring` gates once before its loop (K03) (closes #6)

**Files:**
- Modify: `frontend/src/portal/hooks/index.js` (`./live` import list :37-92; `bookRecurring` after the `household`/`anchorDay` lines (:965-968) and the week loop (:1018-1030))

**Interfaces:** Consumes `assertAthleteBillingActive`, `assertBookingOpen` (Task 7), `openThrough`, `windowDaysFor` (already imported at :157-168 / :135). Produces skipped rows `{ date, reason: 'not open yet' }` (new reason string, not in contract).

- [ ] Add `assertAthleteBillingActive,` and `assertBookingOpen,` to the `from './live'` import list (alphabetical, before `cancelBooking`).
- [ ] After `const anchorDay = normalizeAnchorDay(household?.periodAnchorDay);` in `bookRecurring` (:968) insert:

```js
    // Sprint 20 (K03 + spec 4.4/5): the gates a single booking runs, ONCE
    // before the loop - paid status, the Oct 10 gate, and the package's
    // booking window as the loop's outer bound (weeks past it are reported
    // 'not open yet' and never attempted; today this loop skipped the
    // window check entirely).
    assertAthleteBillingActive(athlete);
    assertBookingOpen(pkg);
    const windowEnd = openThrough(new Date(), windowDaysFor(pkg));
```
  In the loop, as the FIRST check inside `for (let date = firstDate; ...)` (:1020):

```js
      if (date > windowEnd) {
        skipped.push({ date, reason: 'not open yet' });
        continue;
      }
```
- [ ] Verify: esbuild check on `index.js` - no errors; `... src/portal/hooks` - the Task 7 and Task 6 tests still PASS. Emulator check (routing dev server `PORT=3003 REACT_APP_USE_EMULATORS=true npm start` from `frontend/`, emulator seeded by the db lane): signed in as the seeded athlete (`window.__rypTestAuth.signInAs(<seed athlete uid>)`), Book a Session -> Repeat weekly -> rest of season: the result lists weeks past `openThrough(now, 30)` as "not open yet"; before Oct 10 the action itself is refused with "Booking opens Fri, Oct 10 at 7 AM" (the BookSession screen surfaces `error.reason === 'booking-not-open'` - frontend lane wires the copy).
- [ ] Commit:
```
git add frontend/src/portal/hooks/index.js
git commit -m "Sprint 20 (K03): bookRecurring runs billing, opens-at and window gates before its loop

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: `useAuthSession` - create login, refresh, claim on sign-in, verification (closes #2) (MAY SLIP - Oct 10 for the claim parts; `createLogin`/`refresh` are cut-line)

**Files:**
- Modify: `frontend/src/portal/hooks/useAuthSession.js` (imports :1-10; `toUser` :54-63; effect :101-155; return :270-279)
- Create: `frontend/src/portal/hooks/useAuthSession.test.js`

**Interfaces:** Consumes `callClaimInvite` (Task 6). Produces hook members `user.emailVerified`, `createLogin(email, password)`, `refresh()`, `claimState`, `checkInvite()`, `resendVerification()` (contract 4.1); exported pure helpers `claimStateOf(result)`, `createLoginError(err)`, `resendError(err)`, `verifyContinueUrl()`, `verificationSender()` (new, not in contract - test seams). The verification email's sender is Firebase's own, `noreply@<REACT_APP_FIREBASE_AUTH_DOMAIN>` (default `rypacad.firebaseapp.com`), NOT `SMTP_FROM` (D5) - `verificationSender()` is the one string NotProvisioned's "Verify your email to finish" body names.

- [ ] Write the failing test `useAuthSession.test.js`:

```js
/**
 * The auth session's Sprint 20 additions (spec 2.1, 3.2): the pure mapping
 * from Firebase Auth / claimInvite outcomes to the states screens branch on.
 */
jest.mock('../../firebase', () => ({ auth: { currentUser: null }, provider: {}, functions: {} }));
jest.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: jest.fn(), onAuthStateChanged: jest.fn(), sendEmailVerification: jest.fn(),
  sendPasswordResetEmail: jest.fn(), signInWithEmailAndPassword: jest.fn(), signInWithPopup: jest.fn(), signOut: jest.fn(),
}));
jest.mock('firebase/firestore', () => ({}));
jest.mock('firebase/functions', () => ({ httpsCallable: jest.fn(() => jest.fn()) }));

import { ERR } from './live';
import { claimStateOf, createLoginError, resendError, verificationSender, verifyContinueUrl } from './useAuthSession';

describe('claimStateOf', () => {
  test('the four contract states pass through; anything else is error', () => {
    for (const s of ['claimed', 'needs-verification', 'already-claimed', 'none']) expect(claimStateOf({ state: s })).toBe(s);
    expect(claimStateOf({ state: 'weird' })).toBe('error');
    expect(claimStateOf(null)).toBe('error');
  });
});

describe('createLoginError', () => {
  test('email-in-use is the pinned copy with a stable reason', () => {
    const e = createLoginError({ code: 'auth/email-already-in-use' });
    expect(e).toMatchObject({ code: ERR.INVALID, reason: 'email-in-use', message: 'This email already has a login - sign in instead' });
  });
  test('weak password, bad email, throttling, disabled provider, unknown', () => {
    expect(createLoginError({ code: 'auth/weak-password' })).toMatchObject({ code: ERR.INVALID, reason: 'weak-password' });
    expect(createLoginError({ code: 'auth/invalid-email' })).toMatchObject({ code: ERR.INVALID, reason: 'invalid-email' });
    expect(createLoginError({ code: 'auth/too-many-requests' }).code).toBe(ERR.UNAVAILABLE);
    expect(createLoginError({ code: 'auth/operation-not-allowed' }).message).toBe('Email sign-in is not enabled yet — use Continue with Google.');
    expect(createLoginError(new Error('x'))).toMatchObject({ code: ERR.UNAVAILABLE, reason: null });
  });
});

test('resendError: throttled is UNAVAILABLE, anything else UNKNOWN', () => {
  expect(resendError({ code: 'auth/too-many-requests' }).code).toBe(ERR.UNAVAILABLE);
  expect(resendError({ code: 'auth/network-request-failed' })).toMatchObject({ code: ERR.UNKNOWN, message: 'Could not send the verification email. Please try again.' });
});

test('the verification link returns to this origin\'s sign-in page', () => {
  expect(verifyContinueUrl()).toBe(`${window.location.origin}/portal/signin`);
});

test('the verification sender is Firebase\'s own noreply@<auth domain> (D5), never SMTP_FROM', () => {
  // jest carries no REACT_APP_FIREBASE_AUTH_DOMAIN -> the project default.
  expect(verificationSender()).toBe('noreply@rypacad.firebaseapp.com');
});
```

- [ ] Run `... src/portal/hooks/useAuthSession.test.js` - expect FAIL: `claimStateOf` is not a function.
- [ ] Imports: add `createUserWithEmailAndPassword,` and `sendEmailVerification,` to the `firebase/auth` list (:2-8); add `import { callClaimInvite } from './callables';` after the `./live` import (:10). Replace `toUser` (:54-63) and add the helpers:

```js
function toUser(profile, fbUser) {
  return {
    uid: profile.uid,
    email: profile.email != null ? profile.email : null,
    role: profile.role != null ? profile.role : null,
    athleteId: profile.athleteId != null ? profile.athleteId : null,
    householdId: profile.householdId != null ? profile.householdId : null,
    specialistId: profile.specialistId != null ? profile.specialistId : null,
    // Sprint 20 (spec 4.2): paying and claiming need a verified email.
    emailVerified: Boolean(fbUser && fbUser.emailVerified),
  };
}

/** The signed-in-but-unprovisioned user (no users/{uid} doc yet). */
function unprovisionedUser(fbUser) {
  return { uid: fbUser.uid, email: fbUser.email != null ? fbUser.email : null, role: null, athleteId: null, householdId: null, emailVerified: Boolean(fbUser.emailVerified) };
}

/** claimInvite's `state` (contract 1.4), or 'error' for anything else. */
export function claimStateOf(result) {
  const s = result && result.state;
  return s === 'claimed' || s === 'needs-verification' || s === 'already-claimed' || s === 'none' ? s : 'error';
}

/**
 * Where the verification email's link returns to (spec 12.1): this build's
 * own origin - rypacad.ryptest.com in production, localhost on the emulator
 * (both authorized domains). Firebase's own action handler completes the
 * verification first, then continues here.
 */
export function verifyContinueUrl() {
  return `${window.location.origin}/portal/signin`;
}

/**
 * Who the verification email comes FROM (D5, spec 12.1: templates stay
 * DEFAULT, so Firebase Auth sends it) - noreply@<auth domain>, never the
 * functions' SMTP_FROM. NotProvisioned's "We sent a link to {email} from
 * {sender}" names this.
 */
export function verificationSender() {
  return `noreply@${process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || 'rypacad.firebaseapp.com'}`;
}

export function createLoginError(err) {
  const code = err && err.code;
  if (code === 'auth/email-already-in-use') return new LiveDataError(ERR.INVALID, 'This email already has a login - sign in instead', err, 'email-in-use');
  if (code === 'auth/weak-password') return new LiveDataError(ERR.INVALID, 'Choose a longer password - at least 6 characters.', err, 'weak-password');
  if (code === 'auth/invalid-email') return new LiveDataError(ERR.INVALID, 'Enter a valid email address.', err, 'invalid-email');
  if (code === 'auth/too-many-requests') return new LiveDataError(ERR.UNAVAILABLE, 'Too many attempts — wait a few minutes, then try again.', err);
  if (code === 'auth/operation-not-allowed') return new LiveDataError(ERR.UNAVAILABLE, 'Email sign-in is not enabled yet — use Continue with Google.', err);
  return new LiveDataError(ERR.UNAVAILABLE, 'Could not create the login. Please try again.', err);
}

export function resendError(err) {
  const throttled = err && err.code === 'auth/too-many-requests';
  return new LiveDataError(
    throttled ? ERR.UNAVAILABLE : ERR.UNKNOWN,
    throttled ? 'Too many attempts — wait a few minutes, then try again.' : 'Could not send the verification email. Please try again.',
    err
  );
}
```

- [ ] Inside the hook, after `const seqRef = useRef(0);` (:99) add the claim state and the shared resolver, then REPLACE the body of the `onAuthStateChanged` callback (:104-149) so both the effect and `refresh()` use one resolver:

```js
  const [claimState, setClaimState] = useState('idle');
  const claimRef = useRef(null); // latest runClaim; the auth effect never re-subscribes

  // Resolve users/{uid} for one emission or refresh; only the latest `seq`
  // may land. Returns 'provisioned' | 'not-found' | 'error' | 'stale'.
  const resolveProfile = useCallback(async (seq, fbUser) => {
    try {
      const profile = await fetchCurrentUser();
      if (seq !== seqRef.current) return 'stale';
      setSession({ user: toUser(profile, fbUser), provisioned: true, loading: false, error: null });
      return 'provisioned';
    } catch (err) {
      if (seq !== seqRef.current) return 'stale';
      if (err instanceof LiveDataError && err.code === ERR.NOT_FOUND) {
        // Exactly the unprovisioned case: a real account with no users/{uid}
        // doc yet. Defined state, not an error.
        setSession({ user: unprovisionedUser(fbUser), provisioned: false, loading: false, error: null });
        return 'not-found';
      }
      setSession({
        user: null, provisioned: false, loading: false,
        error: err instanceof LiveDataError ? err : new LiveDataError(ERR.UNKNOWN, 'Could not load your account. Please try again.', err),
      });
      return 'error';
    }
  }, []);

  useEffect(() => {
    if (demo) return undefined; // demo bypasses real auth entirely
    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
      const seq = ++seqRef.current;
      if (!fbUser) {
        setSession(SIGNED_OUT);
        setClaimState('idle');
        return;
      }
      setSession((s) => ({ ...s, loading: true }));
      resolveProfile(seq, fbUser).then((outcome) => {
        // Sprint 20 (spec 3.2): every NOT_FOUND emission with an email asks
        // claimInvite; an emulator custom-token user has no email -> 'none'.
        if (outcome !== 'not-found') return;
        if (!fbUser.email) { setClaimState('none'); return; }
        claimRef.current(seq, fbUser);
      });
    });
    return () => {
      seqRef.current += 1; // invalidate any in-flight resolution
      unsubscribe();
    };
  }, [demo, resolveProfile]);

  /** Re-run the users/{uid} read under the current sequence (spec 2.2: `provisioned` flips without a reload). */
  const refresh = useCallback(async () => {
    const fbUser = auth.currentUser;
    if (!fbUser) { setSession(SIGNED_OUT); return; }
    try { await fbUser.reload(); } catch (err) { /* offline reload: the cached user still resolves */ }
    setSession((s) => ({ ...s, loading: true }));
    await resolveProfile(seqRef.current, fbUser);
  }, [resolveProfile]);

  const runClaim = useCallback(async (seq, fbUser) => {
    setClaimState('checking');
    try {
      const result = await callClaimInvite();
      if (seq !== seqRef.current) return 'error';
      const state = claimStateOf(result);
      setClaimState(state);
      if (state === 'claimed') await refresh();
      return state;
    } catch (err) {
      if (seq === seqRef.current) setClaimState('error');
      return 'error';
    }
  }, [refresh]);
  claimRef.current = runClaim;

  /** "I've verified" / "Check again": a fresh token first (spec 3.2), then the lookup, no sign-out. */
  const checkInvite = useCallback(async () => {
    const fbUser = auth.currentUser;
    if (!fbUser || !fbUser.email) { setClaimState('none'); return 'none'; }
    await fbUser.reload();
    await fbUser.getIdToken(true);
    setSession((s) => (s.user ? { ...s, user: { ...s.user, emailVerified: Boolean(fbUser.emailVerified) } } : s));
    return runClaim(seqRef.current, fbUser);
  }, [runClaim]);

  /** Step 0 of sign-up and the sign-in page's "Create a login" (spec 2.1, 3.1). */
  const createLogin = useCallback(async (email, password) => {
    setSession((s) => (s.error ? { ...s, error: null } : s));
    let cred;
    try {
      cred = await createUserWithEmailAndPassword(auth, email, password);
    } catch (err) {
      throw createLoginError(err);
    }
    // Verification is not required to finish sign-up (it is to pay/claim);
    // a failed send is reported, never fatal. Success lands via onAuthStateChanged.
    try {
      await sendEmailVerification(cred.user, { url: verifyContinueUrl() });
      return { sent: true };
    } catch (err) {
      return { sent: false };
    }
  }, []);

  const resendVerification = useCallback(async () => {
    const fbUser = auth.currentUser;
    if (!fbUser) throw new LiveDataError(ERR.UNAUTHENTICATED, 'Sign in first, then resend.');
    try {
      await sendEmailVerification(fbUser, { url: verifyContinueUrl() });
      return { sent: true };
    } catch (err) {
      throw resendError(err);
    }
  }, []);
```
  Delete the old effect body it replaces (the `onAuthStateChanged` block :101-155 is now the one above). In the real-mode return (:270-279) add `createLogin, refresh, claimState, checkInvite, resendVerification,` after `requestPasswordReset,`. Update the doc comment at :18-19 to list the new members.
- [ ] Run `... src/portal/hooks/useAuthSession.test.js` - expect PASS; esbuild check on `useAuthSession.js` - no errors; `wc -l` under 500.
- [ ] Emulator check, routing alone (Auth emulator on :9099 has Email/Password enabled by default; the shared emulator runs `--only firestore,auth`, so `claimInvite` is NOT reachable from this worktree): on :3003, `/portal/signin` -> create a login with a throwaway email; the Auth emulator UI (localhost:4000) lists the account and logs the verification link; the claim call fails (ECONNREFUSED :5001) and `claimState` resolves `'error'` -> NotProvisioned renders the stranger view, which is the documented degraded state: `provisioned` stays false and nothing is written. Do not chase the `'claimed'` path here.
- [ ] **Integration check (PM gate, after the functions lane's Task 11 - `index.js` exports `claimInvite`, `.env.local` / `.secret.local` written - and this task are both merged; review finding 12):** from the integrated worktree, with `functions/` installed, start ONE emulator for all three: `npx firebase-tools emulators:start --only firestore,auth,functions --project rypacad` (Firestore 8080 + Auth 9099 + functions 5001 from `firebase.json`; `firebase.js` connects the callables to 5001 under the emulator flag - Task 6), seed with the db lane's `npm run seed:emulator` from the repo root (= `node --env-file=scripts/emulator.env scripts/seed-firestore.mjs`; the script refuses to run without `FIRESTORE_EMULATOR_HOST`; it writes the open invite `loginInvites/reese.whitfield@example.com`), then on :3003 create a login as `reese.whitfield@example.com`, open the verification link the Auth emulator logs to its terminal (it returns to `/portal/signin`), and "Check again" (`checkInvite()`) must resolve `'claimed'` with `provisioned` flipping true without a reload (`users/{uid}` written by the callable, `loginInvites/reese.whitfield@example.com` -> `claimed`). This is the only place the claim flow runs end to end before production.
- [ ] Commit:
```
git add frontend/src/portal/hooks/useAuthSession.js frontend/src/portal/hooks/useAuthSession.test.js
git commit -m "Sprint 20: useAuthSession createLogin, refresh, claimInvite on sign-in, checkInvite with token refresh, resendVerification

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Specialist slots - durations, Calendly mode, gates, K04 month (closes #6) (MAY SLIP - Oct 10)

**Files:**
- Modify: `frontend/src/portal/hooks/index.js` (imports :157-168 / :188; `coachingFor` :393-401; `SEED_ATHLETE_ID` :677; `MENTAL_TIMES` :1217 + comment :1201; `seedSpecialistDays` :1219-1258; `liveSpecialistDays` :1288-1292; `liveSpecialistSlots` :1327-1349; `seedSpecialistCapReached` :1357-1360; `useSpecialistSlots` :1381-1415)
- Create: `frontend/src/portal/hooks/index.test.js`

**Interfaces:** Consumes `calendlyUrlFor` (Task 2), `bookingOpen` (Task 1), `SPECIALISTS[].durationMinutes/bookingMode` (Task 2). Produces `useSpecialistSlots().data` gaining `bookingMode`, `calendlyUrl`, `billingStatus`, `bookingOpen`, `athlete`, `guardian` (contract 4.3) and `householdId` (D9 - the Calendly link's `utm_campaign`), `days[].slots[].durationMinutes`, `days[].capReached` (new, not in contract: K04 per slot month), and `coachingFor(bookings, today, pkg, monthISO)`.

- [ ] Write the failing test `index.test.js`:

```js
/**
 * K04 (Sprint 20, spec 6.1): Yannick's monthly cadence is judged for the
 * SLOT's month, not today's. The rest of hooks/index.js is exercised in the
 * emulator; Firebase is mocked out here.
 */
jest.mock('../../firebase', () => ({ __esModule: true, default: {}, auth: { currentUser: null }, db: {}, functions: {}, storage: {} }));
jest.mock('firebase/firestore', () => ({}));
jest.mock('firebase/auth', () => ({}));
jest.mock('firebase/functions', () => ({ httpsCallable: jest.fn(() => jest.fn()) }));
jest.mock('firebase/messaging', () => ({ isSupported: jest.fn(async () => false) }));

import { coachingFor, seedSpecialistDays } from './index';

const mental = (date) => ({ id: date, type: 'mental', status: 'confirmed', date });

test('coachingFor judges the given month, defaulting to today\'s', () => {
  const bookings = [mental('2026-10-14'), mental('2026-11-03')];
  expect(coachingFor(bookings, '2026-10-20')).toEqual({ used: 1, limit: 1, capReached: true });
  expect(coachingFor(bookings, '2026-10-20', null, '2026-11')).toEqual({ used: 1, limit: 1, capReached: true });
  expect(coachingFor(bookings, '2026-10-20', null, '2026-12')).toEqual({ used: 0, limit: 1, capReached: false });
  expect(coachingFor(bookings, '2026-10-20', { kind: 'elite' }, '2026-10')).toEqual({ used: 1, limit: 2, capReached: false });
});

test('seed mental slots are the three 30-minute Yannick times; Phil slots are 45', () => {
  const mentalDay = seedSpecialistDays('mental', '2026-10-06', 30).find((d) => d.slots.length); // Tue
  expect(mentalDay.slots.map((s) => [s.time, s.durationMinutes])).toEqual([['4:00 PM', 30], ['4:30 PM', 30], ['5:00 PM', 30]]);
  const philDay = seedSpecialistDays('phil', '2026-10-05', 30).find((d) => d.slots.length); // Mon
  expect(philDay.slots.every((s) => s.durationMinutes === 45)).toBe(true);
});
```

- [ ] Run `... src/portal/hooks/index.test.js` - expect FAIL: `capReached` true for `'2026-12'` (the 4th arg is ignored today); mental times are `4:30 PM`/`5:15 PM` with no `durationMinutes`.
- [ ] `coachingFor` (:393-401): signature `function coachingFor(bookings, today, pkg = null, monthISO = today.slice(0, 7))` and `const month = monthISO;`. Update its comment: "the given month (K04: the slot's, default today's)".
- [ ] Imports: add `bookingOpen,` to the `../data/calendar` import list (:157-168) and `import { calendlyUrlFor } from '../data/calendly';` after the specialists import (:188). Beside `const SEED_ATHLETE_ID = 'jordan';` (:677) add `const SEED_HOUSEHOLD_ID = 'whitfield'; // the seed household's id (hooks/billing.js seedBillingHub, :1966)`.
- [ ] `MENTAL_TIMES` (:1217) - the seed's Yannick slots become the three 30-minute times `scripts/seed-firestore.mjs:320-323` writes (spec 6.1); the doc comment at :1201 "both 45-minute sessions" becomes "Phil 45-minute, Yannick 30-minute sessions":

```diff
 const PHIL_TIMES = ['3:00 PM', '3:45 PM'];
-const MENTAL_TIMES = ['4:30 PM', '5:15 PM'];
+// Sprint 20 (spec 6.1): Yannick's sessions are 30 minutes at 4:00 / 4:30 /
+// 5:00 PM - the same three times seed-firestore.mjs writes.
+const MENTAL_TIMES = ['4:00 PM', '4:30 PM', '5:00 PM'];
```
- [ ] `seedSpecialistDays` (:1219): after `const capacity = ...` add `const durationMinutes = SPECIALISTS.find((s) => s.id === specialistId)?.durationMinutes ?? DEFAULT_DURATION_MINUTES;` and add `durationMinutes,` to the slot object (:1243). `liveSpecialistDays` slot (:1288-1292): return `{ sessionId: s.id, time: s.time, booked, capacity, open: booked < capacity, durationMinutes: s.durationMinutes ?? (SPECIALIST_BY_ID.get(specialistId)?.durationMinutes ?? DEFAULT_DURATION_MINUTES) }`.
- [ ] Replace `liveSpecialistSlots` (:1327-1349):

```js
async function liveSpecialistSlots(specialistId, athleteIdOverride, today) {
  const specialist = SPECIALIST_BY_ID.get(specialistId);
  const athleteId = await resolveSpecialistAthleteId(athleteIdOverride);
  if (!athleteId) {
    return {
      days: await liveSpecialistDays(specialistId, today, MAX_WINDOW_DAYS),
      tokens: null, capReached: false,
      bookingMode: 'in-app', calendlyUrl: null, billingStatus: 'active',
      bookingOpen: bookingOpen(Date.now(), null), athlete: null, guardian: null, householdId: null,
    };
  }
  const athlete = await fetchAthlete(athleteId);
  const pkg = athlete.packageId ? await fetchPackage(athlete.packageId) : null;
  const [bookings, household] = await Promise.all([
    fetchBookings(athleteId, { householdId: athlete.householdId }),
    athlete.householdId ? fetchHousehold(athlete.householdId) : Promise.resolve(null),
  ]);
  const anchorDay = normalizeAnchorDay(household?.periodAnchorDay);
  const windowDays = windowDaysFor(pkg);
  const rawDays = await liveSpecialistDays(specialistId, today, windowDays);
  // K04: the cadence is judged for each SLOT's month; the top-level
  // capReached keeps today's month for the summary line.
  const days = rawDays.map((d) => ({
    ...d,
    capReached: specialistId === 'mental' && coachingFor(bookings, today, pkg, d.date.slice(0, 7)).capReached,
  }));
  const tokens = tokensWithNextPeriod(pkg, bookings, anchorDay, today);
  const capReached = specialistId === 'mental' && coachingFor(bookings, today, pkg).capReached;
  // Sprint 20 (spec 6.1): Calendly only when the registry says so AND a URL
  // is configured; otherwise the in-app list, so seed/emulator keep working.
  const calendlyUrl = specialist?.bookingMode === 'calendly' ? calendlyUrlFor(pkg) : null;
  return {
    days, tokens, capReached,
    bookingMode: calendlyUrl ? 'calendly' : 'in-app',
    calendlyUrl,
    billingStatus: athlete.billing?.status ?? 'active',
    bookingOpen: bookingOpen(Date.now(), pkg),
    athlete: { id: athlete.id, name: athlete.name ?? null, loginEmail: athlete.loginEmail ?? null },
    guardian: { name: household?.guardian?.name ?? null, email: household?.guardian?.email ?? null },
    // D9: the link builder's utm_campaign (calendlyLinkFor, data/calendly.js).
    householdId: athlete?.householdId ?? null,
  };
}
```

- [ ] Seed parity. Replace `seedSpecialistCapReached` (:1357-1360) and add `seedSpecialistAthlete` beside `seedSpecialistTokens`:

```js
/** K04 in seed too: judged for `monthISO` (a slot's month), default today's. */
function seedSpecialistCapReached(specialistId, athleteId, today, monthISO = today.slice(0, 7)) {
  const child = seedChildById(athleteId || SEED_ATHLETE_ID);
  return (
    specialistId === 'mental' &&
    Boolean(child) &&
    coachingFor(seedMemberBookingRows(child, today), today, packageById(child.packageId), monthISO).capReached
  );
}

/** Sprint 20: the seed child as the slot payload's `athlete` (no child logins in seed). */
function seedSpecialistAthlete(athleteId) {
  const c = seedChildById(athleteId || SEED_ATHLETE_ID);
  return c ? { id: c.id, name: c.name, loginEmail: null } : null;
}
```
  Then replace the whole `return useSeedResource(...)` of `useSpecialistSlots` (:1400-1414) with the seed branch carrying every live key:

```js
  return useSeedResource(
    live && specialistId
      ? null
      : {
          days: specialistId
            ? seedSpecialistDays(specialistId, today, windowDaysFor(ATHLETE_PACKAGE)).map((d) => ({
                ...d,
                capReached: seedSpecialistCapReached(specialistId, athleteId, today, d.date.slice(0, 7)),
              }))
            : [],
          tokens: specialistId ? seedSpecialistTokens(specialistId, athleteId, today) : null,
          capReached: specialistId ? seedSpecialistCapReached(specialistId, athleteId, today) : false,
          // Sprint 20 (contract 4.3, D9): seed is always the in-app list (no
          // Calendly URL in a jest/harness env), paid, open, one seed child of
          // the one seed household; the same keys the live branch returns.
          bookingMode: 'in-app',
          calendlyUrl: null,
          billingStatus: 'active',
          bookingOpen: true,
          athlete: specialistId ? seedSpecialistAthlete(athleteId) : null,
          guardian: null,
          householdId: SEED_HOUSEHOLD_ID,
        },
    live && specialistId
      ? {
          source: () => liveSpecialistSlots(specialistId, athleteId, today),
          deps: ['specialist-slots', specialistId, athleteId, today, sessionsGen, bookingsGen, athletesGen],
        }
      : undefined
  );
```
- [ ] Run `... src/portal/hooks/index.test.js` - expect PASS; esbuild check on `index.js` - no errors. If jest cannot load `./index` because of a further Firebase import, add that module to the mock list at the top of the test (the five above cover every `firebase/*` import in `hooks/` as of today: `live.js`, `push.js`, `callables.js`, `useAuthSession.js`).
- [ ] Commit:
```
git add frontend/src/portal/hooks/index.js frontend/src/portal/hooks/index.test.js
git commit -m "Sprint 20: specialist slots carry durations, Calendly mode, billing/opens-at gates, householdId and K04 per-month cadence

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Rows carry `source` + real durations; Calendly rows not cancellable; attendance block duration (closes #6) (MAY SLIP - Oct 10)

**Files:**
- Modify: `frontend/src/portal/hooks/index.js` (`resolveWaitlistRows` :466; `liveSchedule` resolve :509-536; `seedSpecialistDaySessions` :1428-1441; `liveSpecialistSessions` :1451-1483; `reservationRow` :2104-2134; caller :2175; `seedReservationMember` :2218)
- Modify: `frontend/src/portal/PortalRoutes.js` (`SpecialistDayRoute` onOpenSession :336-348; `CoachDashboardRoute` block :386-404) - **routing-owned (D2)**: the frontend plan's Task 14 does NOT touch these two `block` edits.

**Interfaces:** Produces rows with `source: 'portal'|'calendly'`, `cancellable` false for Calendly rows, `durationMinutes` from the session doc else the specialist's registry length (contract 4.4); `useSpecialistSessions` rows gain `type`, `durationMinutes` (new, not in contract) so the attendance `block` can carry `durationMinutes`.

- [ ] `reservationRow` (:2104-2134): add `const source = b.source ?? 'portal';` after `periodKey`; set `cancellable: b.status === 'confirmed' && s.date > today && source !== 'calendly',`; add `source,` after `athleteId: b.athleteId,`; replace the duration line with `durationMinutes: s.durationMinutes ?? (specialist ? specialist.durationMinutes : DEFAULT_DURATION_MINUTES),`. The caller (:2175) adds `source: b.source` to the second argument.
- [ ] `liveSchedule` resolve (:509-536): add `const source = b.source ?? 'portal';` beside `periodKey`, `source,` after `status: b.status,`, and `cancellable: b.status === 'confirmed' && b.date > today && source !== 'calendly',`. Comment: `// Sprint 20 (spec 6.1): a Calendly-sourced booking is cancelled from Calendly's email, never here (My Schedule shows the note instead of Cancel).`
- [ ] `resolveWaitlistRows` (:466): `durationMinutes: s.durationMinutes ?? (specialist ? specialist.durationMinutes : DEFAULT_DURATION_MINUTES),` and add `source: 'portal',` beside `cancellable: false,`. `seedReservationMember` (:2218): the same expression with `SPECIALIST_BY_ID.get(s.type)?.durationMinutes ?? DEFAULT_DURATION_MINUTES` in place of the literal 45.
- [ ] `liveSpecialistSessions` (:1451-1483): the row gains `type: s.type,` and `durationMinutes: s.durationMinutes ?? (SPECIALIST_BY_ID.get(s.type)?.durationMinutes ?? DEFAULT_DURATION_MINUTES),` after `capacity: s.capacity ?? 1,`. Replace `seedSpecialistDaySessions` (:1428-1441) with (Task 10 put `durationMinutes` on every seed slot):

```js
function seedSpecialistDaySessions(specialistId, today) {
  return seedSpecialistDays(specialistId, today, MAX_WINDOW_DAYS)
    .flatMap((d) =>
      d.slots.map((s) => ({
        sessionId: s.sessionId,
        date: d.date,
        dayLabel: d.dayLabel,
        time: s.time,
        booked: s.booked,
        capacity: s.capacity,
        // Sprint 20 (spec 6.1): the attendance `block` carries the length;
        // `type` is the specialist id, which doubles as sessions.type.
        type: specialistId,
        durationMinutes: s.durationMinutes,
        athletes: [],
      }))
    );
}
```
- [ ] `PortalRoutes.js`: in `SpecialistDayRoute`'s `block` (:340-346) add `durationMinutes: s.durationMinutes ?? null,`; in `CoachDashboardRoute`'s `block` (:394-401) add `durationMinutes: block.durationMinutes ?? null,`. (SessionAttendance renders it - frontend lane.)
- [ ] Verify: esbuild check on `index.js` and `PortalRoutes.js` - no errors; `... src/portal/hooks` - PASS. Emulator check: seed one Calendly-sourced booking for the seeded parent's child with the admin bypass, e.g. from the scratchpad
  `node -e "fetch('http://127.0.0.1:8080/v1/projects/rypacad/databases/(default)/documents/bookings/<athleteId>_cal-probe',{method:'PATCH',headers:{'content-type':'application/json',authorization:'Bearer owner'},body:JSON.stringify({fields:{athleteId:{stringValue:'<athleteId>'},sessionId:{stringValue:'cal-probe'},date:{stringValue:'2026-11-10'},type:{stringValue:'mental'},periodKey:{stringValue:'2026-11-01'},status:{stringValue:'confirmed'},householdId:{stringValue:'<householdId>'},createdBy:{stringValue:'system'},createdAt:{timestampValue:new Date().toISOString()},chargedFrom:{stringValue:'period'},source:{stringValue:'calendly'}}})}).then(r=>console.log(r.status))"`
  plus a matching `sessions/cal-probe` doc (`date 2026-11-10, time '4:00 PM', type 'mental', capacity 1, booked 1, durationMinutes 30, bookable false`); Reservations and My Schedule show the row with no Cancel and "30 min"; delete both probe docs afterwards (DELETE with `Bearer owner`).
- [ ] Commit:
```
git add frontend/src/portal/hooks/index.js frontend/src/portal/PortalRoutes.js
git commit -m "Sprint 20: booking rows carry source and real durations; Calendly rows not cancellable; attendance block duration

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

Continue with `10-routing-part3.md` (Tasks 12, 12b, 13 and "Done when").
