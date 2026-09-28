# Routing lane - Sprint 20 Implementation Plan (part 2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Continues `10-routing.md` (header, Global Constraints, Tasks 1-6 live there and
apply here unchanged). Tasks 7-13 consume Task 1's `bookingOpen`/`BOOKING_OPENS_LABEL`,
Task 2's `calendlyUrlFor`, Task 6's `callClaimInvite`.

**Spec:** docs/portal/SPRINT-20-LAUNCH.md sections 3.2, 4.4, 5, 6.1, 7, 9 (K03/K04).
**Interfaces:** docs/portal/plans/2026-09-28-sprint-20-launch/01-interfaces.md sections 3.6, 4.1-4.4.
**GitHub issues:** #2 (Task 9), #3 (Task 7), #6 (Tasks 8, 10-13).

Test command: `cd frontend && CI=true npx react-scripts test --watchAll=false <path>`.
Compile check for hook files: `cd frontend && npx esbuild src/portal/hooks/<file>.js --bundle --platform=browser --outfile=/dev/null --log-level=error`.

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

**Interfaces:** Consumes `callClaimInvite` (Task 6). Produces hook members `user.emailVerified`, `createLogin(email, password)`, `refresh()`, `claimState`, `checkInvite()`, `resendVerification()` (contract 4.1); exported pure helpers `claimStateOf(result)`, `createLoginError(err)`, `resendError(err)`, `verifyContinueUrl()` (new, not in contract - test seams).

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
import { claimStateOf, createLoginError, resendError, verifyContinueUrl } from './useAuthSession';

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
- [ ] Emulator check (Auth emulator on :9099 has Email/Password enabled by default): on :3003, `/portal/signin` -> create a login with a throwaway email; the Auth emulator UI (localhost:4000) lists the account and logs the verification link; with no `loginInvites` doc for that email `claimState` resolves `'none'` (React DevTools on the NotProvisioned route); after the db lane seeds an open invite for that email and the account is marked verified in the emulator UI, "Check again" (`checkInvite()`) resolves `'claimed'` and `provisioned` flips true without a reload.
- [ ] Commit:
```
git add frontend/src/portal/hooks/useAuthSession.js frontend/src/portal/hooks/useAuthSession.test.js
git commit -m "Sprint 20: useAuthSession createLogin, refresh, claimInvite on sign-in, checkInvite with token refresh, resendVerification

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Specialist slots - durations, Calendly mode, gates, K04 month (closes #6) (MAY SLIP - Oct 10)

**Files:**
- Modify: `frontend/src/portal/hooks/index.js` (imports :157-168 / :188; `coachingFor` :393-401; `seedSpecialistDays` :1219-1258; `liveSpecialistDays` :1288-1292; `liveSpecialistSlots` :1327-1349; `useSpecialistSlots` seed branch :1413-1417)
- Create: `frontend/src/portal/hooks/index.test.js`

**Interfaces:** Consumes `calendlyUrlFor` (Task 2), `bookingOpen` (Task 1), `SPECIALISTS[].durationMinutes/bookingMode` (Task 2). Produces `useSpecialistSlots().data` gaining `bookingMode`, `calendlyUrl`, `billingStatus`, `bookingOpen`, `athlete`, `guardian` (contract 4.3), `days[].slots[].durationMinutes`, `days[].capReached` (new, not in contract: K04 per slot month), and `coachingFor(bookings, today, pkg, monthISO)`.

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

import { coachingFor } from './index';

const mental = (date) => ({ id: date, type: 'mental', status: 'confirmed', date });

test('coachingFor judges the given month, defaulting to today\'s', () => {
  const bookings = [mental('2026-10-14'), mental('2026-11-03')];
  expect(coachingFor(bookings, '2026-10-20')).toEqual({ used: 1, limit: 1, capReached: true });
  expect(coachingFor(bookings, '2026-10-20', null, '2026-11')).toEqual({ used: 1, limit: 1, capReached: true });
  expect(coachingFor(bookings, '2026-10-20', null, '2026-12')).toEqual({ used: 0, limit: 1, capReached: false });
  expect(coachingFor(bookings, '2026-10-20', { kind: 'elite' }, '2026-10')).toEqual({ used: 1, limit: 2, capReached: false });
});
```

- [ ] Run `... src/portal/hooks/index.test.js` - expect FAIL: `capReached` true for `'2026-12'` (the 4th arg is ignored today).
- [ ] `coachingFor` (:393-401): signature `function coachingFor(bookings, today, pkg = null, monthISO = today.slice(0, 7))` and `const month = monthISO;`. Update its comment: "the given month (K04: the slot's, default today's)".
- [ ] Imports: add `bookingOpen,` to the `../data/calendar` import list (:157-168) and `import { calendlyUrlFor } from '../data/calendly';` after the specialists import (:188).
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
      bookingOpen: bookingOpen(Date.now(), null), athlete: null, guardian: null,
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
  };
}
```
  `useSpecialistSlots` seed branch (:1413-1417) gains the same keys: `bookingMode: 'in-app', calendlyUrl: null, billingStatus: 'active', bookingOpen: true, athlete: specialistId ? seedSpecialistAthlete(athleteId) : null, guardian: null` with, beside `seedSpecialistTokens`: `function seedSpecialistAthlete(athleteId) { const c = seedChildById(athleteId || SEED_ATHLETE_ID); return c ? { id: c.id, name: c.name, loginEmail: null } : null; }` and `days: specialistId ? seedSpecialistDays(...).map((d) => ({ ...d, capReached: seedSpecialistCapReached(specialistId, athleteId, today) })) : []`.
- [ ] Run `... src/portal/hooks/index.test.js` - expect PASS; esbuild check on `index.js` - no errors. If jest cannot load `./index` because of a further Firebase import, add that module to the mock list at the top of the test (the five above cover every `firebase/*` import in `hooks/` as of today: `live.js`, `push.js`, `callables.js`, `useAuthSession.js`).
- [ ] Commit:
```
git add frontend/src/portal/hooks/index.js frontend/src/portal/hooks/index.test.js
git commit -m "Sprint 20: specialist slots carry durations, Calendly mode, billing/opens-at gates and K04 per-month cadence

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Rows carry `source` + real durations; Calendly rows not cancellable; attendance block duration (closes #6) (MAY SLIP - Oct 10)

**Files:**
- Modify: `frontend/src/portal/hooks/index.js` (`resolveWaitlistRows` :466; `liveSchedule` resolve :509-536; `liveSpecialistSessions` :1451-1483; `reservationRow` :2104-2134; caller :2175; `seedReservationMember` :2218)
- Modify: `frontend/src/portal/PortalRoutes.js` (`SpecialistDayRoute` onOpenSession :336-348; `CoachDashboardRoute` block :386-404)

**Interfaces:** Produces rows with `source: 'portal'|'calendly'`, `cancellable` false for Calendly rows, `durationMinutes` from the session doc else the specialist's registry length (contract 4.4); `useSpecialistSessions` rows gain `type`, `durationMinutes` (new, not in contract) so the attendance `block` can carry `durationMinutes`.

- [ ] `reservationRow` (:2104-2134): add `const source = b.source ?? 'portal';` after `periodKey`; set `cancellable: b.status === 'confirmed' && s.date > today && source !== 'calendly',`; add `source,` after `athleteId: b.athleteId,`; replace the duration line with `durationMinutes: s.durationMinutes ?? (specialist ? specialist.durationMinutes : DEFAULT_DURATION_MINUTES),`. The caller (:2175) adds `source: b.source` to the second argument.
- [ ] `liveSchedule` resolve (:509-536): add `const source = b.source ?? 'portal';` beside `periodKey`, `source,` after `status: b.status,`, and `cancellable: b.status === 'confirmed' && b.date > today && source !== 'calendly',`. Comment: `// Sprint 20 (spec 6.1): a Calendly-sourced booking is cancelled from Calendly's email, never here (My Schedule shows the note instead of Cancel).`
- [ ] `resolveWaitlistRows` (:466): `durationMinutes: s.durationMinutes ?? (specialist ? specialist.durationMinutes : DEFAULT_DURATION_MINUTES),` and add `source: 'portal',` beside `cancellable: false,`. `seedReservationMember` (:2218): the same expression with `SPECIALIST_BY_ID.get(s.type)?.durationMinutes ?? DEFAULT_DURATION_MINUTES` in place of the literal 45.
- [ ] `liveSpecialistSessions` (:1451-1483): the row gains `type: s.type,` and `durationMinutes: s.durationMinutes ?? (SPECIALIST_BY_ID.get(s.type)?.durationMinutes ?? DEFAULT_DURATION_MINUTES),` after `capacity: s.capacity ?? 1,`; the seed rows in `seedSpecialistDaySessions` (:1428-1449) gain `type: specialistId` and the slot's `durationMinutes` (Task 10 put it on the seed slot).
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

### Task 12: Home and membership hooks expose the athlete's paid status (closes #6)

**Files:**
- Modify: `frontend/src/portal/hooks/index.js` (`liveChildCard` return :1580-1590; `useHousehold` seed :1638-1640; `liveHouseholdAthletes` :1679-1685; `useHouseholdAthletes` seed :1707-1713; `liveMemberEntry` :1868-1901; `seedMemberEntry` :1829; `liveAthleteDashboard.athlete` :2718-2726)

**Interfaces:** Produces `billingStatus: 'pending'|'active'|'past_due'|'lapsed'` (absent == `'active'`) on `useHousehold().data.children[]`, `useHouseholdAthletes().data[]`, `useMembership().data.members[]` and `useAthleteDashboard().data.athlete` (new, not in contract - the frontend lane's pending banners and Pay buttons read it; the hub's own `members[].billing` comes from Task 3).

- [ ] Add `billingStatus: a.billing?.status ?? 'active',` to the `liveChildCard` return (after `packageId`), to the `liveHouseholdAthletes` row (after `packageName`), to the `liveMemberEntry` return (after `name`), and `billingStatus: ctx.athlete.billing?.status ?? 'active',` to `liveAthleteDashboard`'s `athlete` object (after `date`). Comment once, on `liveChildCard`: `// Sprint 20 (spec 4.4): the parent home banner and Pay button key off this; absent == active.`
- [ ] Seed parity: `useHousehold`'s seed children and `useHouseholdAthletes`' `seedRows` map gain `billingStatus: c.billingStatus ?? 'active'`; `seedMemberEntry` (:1829) returns `billingStatus: child.billingStatus ?? 'active'`; the athlete dashboard seed branch's `athlete` object gains `billingStatus: 'active'`.
- [ ] Verify: esbuild check on `index.js`; `... src/portal/hooks` PASS; on :3003 as the seeded parent the family home renders (React DevTools: `children[].billingStatus` is `'pending'` for the db lane's pending child, `'active'` for the rest).
- [ ] Commit:
```
git add frontend/src/portal/hooks/index.js
git commit -m "Sprint 20: home, household-athletes, membership and athlete dashboard carry billingStatus

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: `useSignups` + the admin `pending` bucket (closes #6) (MAY SLIP - Oct 10)

**Files:**
- Create: `frontend/src/portal/data/signups.js`, `frontend/src/portal/data/signups.test.js`
- Create: `frontend/src/portal/hooks/signups.js`
- Modify: `frontend/src/portal/hooks/index.js` (imports :93-96; re-export :200; `liveAdminDashboard` :3402-3410; seed membership :3567)

**Interfaces:** Consumes `packageById`. Produces `buildSignupRows({ households, athletes, invites, flaggedBookings, calendlyEvents, now })` (new, not in contract - the pure half of `useSignups`), `useSignups()` (contract 4.2) whose `data` also carries `unresolved: [{ id, outcome, receivedAt }]` and `counts.unresolved` (new, not in contract: an unresolved Calendly event has no household to hang off), `useAdminDashboard().data.membership.pending`.

- [ ] Write the failing test `signups.test.js`:

```js
/**
 * The admin sign-ups report's row builder (Sprint 20, spec 7) - pure, so the
 * login/payment/flag columns are pinned without Firestore.
 */
import { buildSignupRows } from './signups';

const now = new Date('2026-10-05T15:00:00');
const households = [
  { id: 'h1', name: 'Kim family', signup: { at: new Date('2026-10-01T09:30:00'), mode: 'parent' }, guardian: { name: 'Dana', email: 'dana@x.com', phone: '555' } },
  { id: 'legacy', name: 'Whitfield family', guardian: { name: 'W' } },
  { id: 'h2', name: 'Solo', signup: { at: new Date('2026-10-03T08:00:00'), mode: 'athlete' }, guardian: { name: 'Sam', email: 's@x.com', phone: '1' } },
];
const athletes = [
  { id: 'a1', householdId: 'h1', name: 'Ava', dob: '2012-06-17', packageId: 't-6', handicap: 20, loginEmail: 'ava@x.com', billing: { status: 'pending' } },
  { id: 'a2', householdId: 'h1', name: 'Ben', dob: null, packageId: 'elite', handicap: null, loginEmail: 'ben@x.com', billing: { status: 'active' }, facilityBilling: { status: 'active' } },
  { id: 'a3', householdId: 'h2', name: 'Sam', dob: '2005-01-01', packageId: 'single', loginEmail: null },
  { id: 'w', householdId: 'legacy', name: 'Jordan', packageId: 't-12' },
];
const invites = [
  { id: 'ava@x.com', athleteId: 'a1', householdId: 'h1', status: 'open', createdAt: new Date('2026-09-20T00:00:00') },
  { id: 'ben@x.com', athleteId: 'a2', householdId: 'h1', status: 'claimed', claimedAt: new Date('2026-10-02T10:00:00') },
];
const flaggedBookings = [{ id: 'a3_cal-1', athleteId: 'a3', flag: 'before-open', date: '2026-10-08' }];
const calendlyEvents = [{ id: 'ev-1', outcome: 'unresolved', receivedAt: new Date('2026-10-04T12:00:00'), householdId: null }];

test('rows, columns and counts', () => {
  const { rows, counts, unresolved } = buildSignupRows({ households, athletes, invites, flaggedBookings, calendlyEvents, now });
  expect(rows.map((r) => r.householdId)).toEqual(['h1', 'h2']); // legacy (no signup) excluded, input order kept
  const h1 = rows[0];
  expect(h1).toMatchObject({ name: 'Kim family', signedUpAt: '2026-10-01T09:30', mode: 'parent', parent: { name: 'Dana', email: 'dana@x.com', phone: '555' }, unpaid: true, flagged: false });
  expect(h1.athletes[0]).toEqual({ athleteId: 'a1', name: 'Ava', age: 14, packageId: 't-6', packageName: '6 tokens', handicap: 20, billing: 'pending', facility: null, login: 'invited-stale', loginEmail: 'ava@x.com', loginClaimedAt: null });
  expect(h1.athletes[1]).toMatchObject({ age: null, packageName: 'Elite', handicap: null, billing: 'active', facility: 'active', login: 'claimed', loginClaimedAt: '2026-10-02T10:00' });
  const h2 = rows[1];
  expect(h2.athletes[0]).toMatchObject({ billing: 'active', login: 'none', loginEmail: null });
  expect(h2.flags).toEqual([{ kind: 'booking', id: 'a3_cal-1', flag: 'before-open', date: '2026-10-08' }]);
  expect(h2).toMatchObject({ unpaid: false, flagged: true });
  expect(counts).toEqual({ all: 2, unpaid: 1, flagged: 1, unresolved: 1 });
  expect(unresolved).toEqual([{ id: 'ev-1', outcome: 'unresolved', receivedAt: '2026-10-04T12:00' }]);
});

test('an open invite younger than 7 days is invited; orphaned reads none', () => {
  const fresh = [{ id: 'ava@x.com', athleteId: 'a1', status: 'open', createdAt: new Date('2026-10-01T00:00:00') }];
  expect(buildSignupRows({ households, athletes, invites: fresh, now }).rows[0].athletes[0].login).toBe('invited');
  const orphan = [{ id: 'ava@x.com', athleteId: 'a1', status: 'orphaned', createdAt: new Date('2026-10-01T00:00:00') }];
  expect(buildSignupRows({ households, athletes, invites: orphan, now }).rows[0].athletes[0].login).toBe('none');
});
```

- [ ] Run `... src/portal/data/signups.test.js` - expect FAIL: cannot find module `./signups`.
- [ ] Create `data/signups.js`:

```js
/**
 * The admin sign-ups report (Sprint 20, spec 7) - PURE row builder over the
 * documents hooks/signups.js fetches. One row per self-signed-up household
 * (`signup` present; legacy provisioned households are not sign-ups).
 */
import { differenceInYears, format, parseISO } from 'date-fns';
import { packageById } from './packages';

const STALE_INVITE_DAYS = 7;

function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v.toDate === 'function') return v.toDate();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
const stamp = (v) => {
  const d = toDate(v);
  return d ? format(d, "yyyy-MM-dd'T'HH:mm") : null;
};

/** none | invited | invited-stale (open > 7 days) | claimed. */
function loginFor(athlete, invite, now) {
  const loginEmail = athlete.loginEmail ?? null;
  if (!loginEmail || !invite || invite.status === 'orphaned') return { login: 'none', loginEmail, loginClaimedAt: null };
  if (invite.status === 'claimed') return { login: 'claimed', loginEmail, loginClaimedAt: stamp(invite.claimedAt) };
  const created = toDate(invite.createdAt);
  const stale = created ? now.getTime() - created.getTime() > STALE_INVITE_DAYS * 86400000 : false;
  return { login: stale ? 'invited-stale' : 'invited', loginEmail, loginClaimedAt: null };
}

export function buildSignupRows({ households = [], athletes = [], invites = [], flaggedBookings = [], calendlyEvents = [], now = new Date() }) {
  const today = format(now, 'yyyy-MM-dd');
  const inviteByAthlete = new Map(invites.map((i) => [i.athleteId, i]));
  const byHousehold = new Map();
  for (const a of athletes) {
    if (!a.householdId) continue;
    if (!byHousehold.has(a.householdId)) byHousehold.set(a.householdId, []);
    byHousehold.get(a.householdId).push(a);
  }
  const rows = households
    .filter((h) => h && h.signup)
    .map((h) => {
      const kids = byHousehold.get(h.id) ?? [];
      const kidIds = new Set(kids.map((a) => a.id));
      const rowAthletes = kids.map((a) => ({
        athleteId: a.id,
        name: a.name ?? a.id,
        age: a.dob ? differenceInYears(parseISO(today), parseISO(a.dob)) : null,
        packageId: a.packageId ?? null,
        packageName: packageById(a.packageId)?.name ?? null,
        handicap: Number.isInteger(a.handicap) ? a.handicap : null,
        billing: a.billing?.status ?? 'active',
        facility: a.facilityBilling?.status ?? null,
        ...loginFor(a, inviteByAthlete.get(a.id), now),
      }));
      const flags = [
        ...flaggedBookings.filter((b) => b.flag && kidIds.has(b.athleteId)).map((b) => ({ kind: 'booking', id: b.id, flag: b.flag, date: b.date ?? null })),
        ...calendlyEvents.filter((e) => e.householdId && e.householdId === h.id).map((e) => ({ kind: 'calendly', id: e.id, outcome: e.outcome, receivedAt: stamp(e.receivedAt) })),
      ];
      return {
        householdId: h.id,
        name: h.name ?? null,
        signedUpAt: stamp(h.signup.at),
        mode: h.signup.mode ?? null,
        parent: { name: h.guardian?.name ?? null, email: h.guardian?.email ?? null, phone: h.guardian?.phone ?? null },
        athletes: rowAthletes,
        flags,
        unpaid: rowAthletes.some((a) => a.billing === 'pending'),
        flagged: flags.length > 0,
      };
    });
  // An unresolved Calendly booking has no household to hang off; it is its own list.
  const unresolved = calendlyEvents.filter((e) => e.outcome === 'unresolved' && !e.householdId).map((e) => ({ id: e.id, outcome: e.outcome, receivedAt: stamp(e.receivedAt) }));
  return {
    rows,
    counts: { all: rows.length, unpaid: rows.filter((r) => r.unpaid).length, flagged: rows.filter((r) => r.flagged).length, unresolved: unresolved.length },
    unresolved,
  };
}
```

- [ ] Run `... src/portal/data/signups.test.js` - expect PASS.
- [ ] Create `hooks/signups.js`:

```js
/**
 * The admin sign-ups report's data (Sprint 20, spec 7) - ops/owner only;
 * every query below is provable under the staff clauses (households,
 * athletes, loginInvites, bookings, calendlyEvents all grant ops/owner
 * unconditionally). New surface, kept out of live.js/index.js.
 */
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useInvalidation } from './invalidate';
import useSeedResource from './useSeedResource';
import { fetchAllAthletes, isLive, wrap } from './live';
import { buildSignupRows } from '../data/signups';

const rowsOf = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

/** Self-signed-up households, newest first; households without `signup` are simply absent from the index. */
export async function fetchSignupHouseholds() {
  try {
    return rowsOf(await getDocs(query(collection(db, 'households'), orderBy('signup.at', 'desc'))));
  } catch (err) {
    throw wrap(err, 'fetchSignupHouseholds');
  }
}

export async function fetchLoginInvites() {
  try {
    return rowsOf(await getDocs(collection(db, 'loginInvites')));
  } catch (err) {
    throw wrap(err, 'fetchLoginInvites');
  }
}

/** The closed flag list (contract section 2) - an `in` query, no composite index. */
export const BOOKING_FLAGS = ['over-cap', 'over-cadence', 'membership-inactive', 'before-open'];
export async function fetchFlaggedBookings() {
  try {
    return rowsOf(await getDocs(query(collection(db, 'bookings'), where('flag', 'in', BOOKING_FLAGS))));
  } catch (err) {
    throw wrap(err, 'fetchFlaggedBookings');
  }
}

export async function fetchUnresolvedCalendlyEvents() {
  try {
    return rowsOf(await getDocs(query(collection(db, 'calendlyEvents'), where('outcome', '==', 'unresolved'))));
  } catch (err) {
    throw wrap(err, 'fetchUnresolvedCalendlyEvents');
  }
}

async function liveSignups() {
  const [households, athletes, invites, flaggedBookings, calendlyEvents] = await Promise.all([
    fetchSignupHouseholds(), fetchAllAthletes(), fetchLoginInvites(), fetchFlaggedBookings(), fetchUnresolvedCalendlyEvents(),
  ]);
  return buildSignupRows({ households, athletes, invites, flaggedBookings, calendlyEvents, now: new Date() });
}

const EMPTY = { rows: [], counts: { all: 0, unpaid: 0, flagged: 0, unresolved: 0 }, unresolved: [] };

/** `{ data: { rows, counts, unresolved } | null, loading, error }` - see data/signups.js for the row shape. */
export default function useSignups() {
  const live = isLive();
  const gens = [useInvalidation('households'), useInvalidation('athletes'), useInvalidation('bookings'), useInvalidation('loginInvites')];
  return useSeedResource(live ? null : EMPTY, live ? { source: liveSignups, deps: ['signups', ...gens] } : undefined);
}
```

- [ ] `hooks/index.js`: add `import useSignups from './signups';` after `import usePush from './push';` (:96) and `useSignups,` to the re-export at :200. In `liveAdminDashboard` (:3402): `const membership = { active: 0, pastDue: 0, lapsed: 0, pending: 0, lapsedHouseholds: [] };` and after the households loop: `// Sprint 20 (spec 4.4/7): athletes still on checkout - an ATHLETE count beside the household counts, so the dashboard agrees with the sign-ups report.` `membership.pending = athletes.filter((a) => a.billing?.status === 'pending').length;`. Seed (:3567): `membership: { active: 1, pastDue: 0, lapsed: 0, pending: 0, lapsedHouseholds: [] }`.
- [ ] Verify: esbuild check on `hooks/signups.js` and `index.js`; `... src/portal` - every test PASS. Emulator check on :3003 as the seeded owner: a component calling `useSignups()` (the frontend lane's AdminSignups; until it lands, `window.__rypTestAuth.signInAs(<owner uid>)` then in the console `fetch` is not needed - use React DevTools on `/portal/admin` to read `membership.pending`) shows the db lane's pending seed athlete counted once.
- [ ] Commit:
```
git add frontend/src/portal/data/signups.js frontend/src/portal/data/signups.test.js frontend/src/portal/hooks/signups.js frontend/src/portal/hooks/index.js
git commit -m "Sprint 20: useSignups (admin sign-ups report data) and the admin pending bucket

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Done when

- `cd frontend && CI=true npx react-scripts test --watchAll=false` is green (calendar, packages, billingHub, calendly, signups, callables, live, useAuthSession, index tests).
- `node --env-file=scripts/emulator.env scripts/verify-rules.mjs` prints `ALL PASS` against the shared emulator.
- `wc -l` on every touched file is under 500 except the grandfathered `live.js`/`index.js` (net growth there is limited to the lines named above).
- Every commit carries the trailer; nothing pushed; the owner deploys `firestore:rules` from the runbook (spec 12.3).
