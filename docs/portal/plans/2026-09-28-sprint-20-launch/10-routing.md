# Routing lane - Sprint 20 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**This plan is split in three files.** Tasks 1-5 are here; Tasks 6-11 are in
`10-routing-part2.md`; Tasks 12, 12b and 13 are in `10-routing-part3.md` (same
directory). Follow the execution order below, not the file order.

**Goal:** Ship the rules, data constants, gates, callable clients, auth-session
claim flow and hook plumbing that make instant sign-up, per-athlete paid status,
the Oct 10 gate and Calendly-sourced sessions real on the client side.

**Architecture:** Pure constants and view-model math live in `frontend/src/portal/data/`
(unit-tested with jest, no Firebase import). Firestore reads/writes stay in the
hook adapters (`hooks/live.js` for existing functions, new files `hooks/callables.js`
and `hooks/signups.js` for new surface per the `grace.js`/`waitlist.js` precedent).
`firestore.rules` is the server-side boundary, verified against the emulator with a
dependency-free REST probe (`scripts/verify-rules.mjs`). Every gate the client
enforces (billing status, opens-at) is enforced again in rules.

**Tech Stack:** React 18 (CRA, JS), firebase ^9.22 (`firebase/auth`, `firebase/firestore`,
`firebase/functions`), date-fns, jest via react-scripts; Firestore rules v2; Node 22 ESM for scripts.

**Spec:** docs/portal/SPRINT-20-LAUNCH.md - sections 2.2 (client side of `createFamily`),
3.2 (claim flow, rules), 4.4 (paid gate), 5 (windows + Oct 10 gate), 6.1 (portal side of
Calendly), 7 (`useSignups`), 11 (verification), 13 (cut line).
**Interfaces:** docs/portal/plans/2026-09-28-sprint-20-launch/01-interfaces.md
**GitHub issues:** #1 #2 #3 #4 #5 #6. Assumed mapping (verify titles on GitHub before
closing): #1 rules, #2 `useAuthSession`, #3 `live.js` gates + callable clients,
#4 data constants (`calendar.js`/`packages.js`/`season.js`/`calendly.js`),
#5 `billingHub.statusFor('pending')` + `hooks/billing.js`, #6 `hooks/index.js` plumbing + `useSignups`.

## Execution order

**Tasks 1, 2, 3, 6, 9 first**, then **4 and 5** (rules), then **7, 8, 10, 11, 12,
12b, 13**. Why: 1/2/3/6/9 produce the seams every frontend screen imports
(`bookingOpen`/`BOOKING_OPENS_LABEL`, `calendlyLinkFor`, `hubMemberFor(...).billing`,
`callCreateFamily`/`callClaimInvite`, `useAuthSession().createLogin/refresh/claimState`),
and the frontend lane's Day-2 rule is that every screen importing a routing seam
keeps its jest virtual mock AND, on a day-1 route, guards the import at runtime
with the namespace-import + inert-fallback pattern (`Registration.js:27-35`,
`useEnrollmentFallback`) so `/portal/admin` never crashes before Task 13 merges -
landing the seams first shortens the window in which that fallback is what runs.
The rules (4/5) import nothing and are exercised only on the emulator, so they
sit between; the `hooks/index.js` plumbing (7-13) builds on everything before it.

## Global Constraints

- Token window is **30 days** on t-6/t-12/t-16/single, Elite stays 45 (spec 0.5, 5).
- `BOOKING_OPENS_AT = 1791633600000` (2026-10-10T12:00:00Z = 07:00 America/Chicago); Elite is exempt (spec 5).
- Charging never branches on session type; the mental cadence and Elite daily caps remain the only named exceptions (spec 6.1, `packages.js:81-87`).
- Tokens are derived, never stored (spec 4.4, 6.2 step 4; `packages.js:144-156`).
- Rules keep closed `hasAll`/`hasOnly` field lists; `billing`, `facilityBilling`, `source`, `calendlyInviteeUri`, `flag` never enter a client `hasOnly` (contract section 2).
- **Null-safe rule spellings (contract section 5).** Rules read every optional field null-safe: `!('billing' in a) || a.billing.status == 'active'`, `a.get('packageId', null) == 'elite'`, `resource.data.get('source', null) != 'calendly'`, `h.get('membership', null)`, `request.auth.token.get('email_verified', false) == true` and `request.auth.token.get('email', '').lower()`. Contract section 5 spells the same clauses as `a.packageId == 'elite'` and `request.auth.token.email_verified == true`; the `get(key, default)` / `'key' in map` forms in Tasks 4-5 are what ships. In the rules language a missing key is an evaluation error and an error denies the WHOLE request - an emulator custom-token user has no `email` claim at all, and every athlete provisioned before this sprint has no `billing` map.
- Files stay under 500 lines; new code goes in new files (`callables.js`, `signups.js`, `calendly.js`), never into the grandfathered `live.js`/`index.js` beyond the edits named here.
- No secrets in source; env names only (contract section 8).
- Repo files are CRLF: edit with the Edit tool (preserves endings); never `sed -i`.
- Every commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Agents never push or deploy; never run `npm install`; never open localhost:3000.

Test commands used throughout:
`cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/data/<file>.test.js`.

---

### Task 1: Window 30, the Oct 10 gate, season start (closes #4)

**Files:**
- Modify: `frontend/src/portal/data/calendar.js` (:333, :340; append after :342)
- Modify: `frontend/src/portal/data/packages.js` (:41-43, :60, :70, :107)
- Modify: `frontend/src/portal/data/season.js` (:70)
- Modify: `frontend/src/portal/hooks/index.js` (:1219 default `32 -> 30`; :605-606 comment)
- Create: `frontend/src/portal/data/calendar.test.js`
- Test: `frontend/src/portal/data/packages.test.js` (extend)

**Interfaces:** Produces `BOOKING_OPENS_AT`, `BOOKING_OPENS_LABEL`, `bookingOpen(now, pkg)` (contract 3.1); `PRICES_RELEASED = true`; `windowDaysFor` fallback 30; `SEASON_BOUNDS.start = '2026-11-03'`.

- [ ] Write the failing test `frontend/src/portal/data/calendar.test.js`:

```js
/**
 * The Oct 10 gate (Sprint 20, spec 5) and the 30-day window defaults - the
 * constants every banner, gate and rules clause agree on.
 */
import { BOOKING_OPENS_AT, BOOKING_OPENS_LABEL, bookingOpen, openThrough, windowOpensOn } from './calendar';

describe('bookingOpen', () => {
  const before = BOOKING_OPENS_AT - 1;
  const at = BOOKING_OPENS_AT;
  test('the gate is 07:00 America/Chicago on Oct 10 2026', () => {
    expect(BOOKING_OPENS_AT).toBe(1791633600000);
    expect(new Date(BOOKING_OPENS_AT).toISOString()).toBe('2026-10-10T12:00:00.000Z');
    expect(BOOKING_OPENS_LABEL).toBe('Sat, Oct 10 at 7 AM');
  });
  test('closed before, open at and after, for a token package', () => {
    const t6 = { id: 't-6', kind: 'tokens' };
    expect(bookingOpen(before, t6)).toBe(false);
    expect(bookingOpen(at, t6)).toBe(true);
    expect(bookingOpen(at + 1, t6)).toBe(true);
  });
  test('Elite is open at any time; no package is gated like a token package', () => {
    expect(bookingOpen(before, { id: 'elite', kind: 'elite' })).toBe(true);
    expect(bookingOpen(before, null)).toBe(false);
    expect(bookingOpen(before, undefined)).toBe(false);
  });
  test('accepts a Date as well as millis', () => {
    expect(bookingOpen(new Date(before), { kind: 'tokens' })).toBe(false);
    expect(bookingOpen(new Date(at), { kind: 'tokens' })).toBe(true);
  });
});

describe('window defaults are 30 days', () => {
  test('windowOpensOn defaults to 30', () => {
    expect(windowOpensOn('2026-11-09')).toBe('2026-10-10');
  });
  test('openThrough defaults to 30 (anchor rolls at 7 AM Chicago)', () => {
    // 2026-10-10 12:00Z is 07:00 Chicago -> anchor is Oct 10 -> +30 = Nov 9.
    expect(openThrough(new Date(BOOKING_OPENS_AT))).toBe('2026-11-09');
    expect(openThrough(new Date(BOOKING_OPENS_AT - 60000))).toBe('2026-11-08');
  });
});
```

- [ ] Run `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/data/calendar.test.js` - expect FAIL: `BOOKING_OPENS_AT` undefined / `windowOpensOn` returns `2026-10-08`.
- [ ] Append to `calendar.js` after `windowOpensOn` (:340-342) and change both defaults `32 -> 30` at :333 and :340:

```js
/* ------------------------------------------------------------------------- *
 * The Oct 10 gate (Sprint 20, spec 5): booking opens for token members at
 * 07:00 America/Chicago on 2026-10-10; Elite books as soon as it is paid.
 * ONE constant, read by createBooking/joinWaitlist/bookRecurring (live.js),
 * the specialist screen's Calendly button and every banner; firestore.rules
 * carries the same millisecond value in bookingOpenOk(). Retire after launch
 * (GitHub #26).
 * ------------------------------------------------------------------------- */
export const BOOKING_OPENS_AT = 1791633600000; // 2026-10-10T12:00:00Z = 07:00 America/Chicago
export const BOOKING_OPENS_LABEL = 'Sat, Oct 10 at 7 AM';
export function bookingOpen(now = Date.now(), pkg = null) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  return pkg?.kind === 'elite' || t >= BOOKING_OPENS_AT;
}
```

- [ ] In `packages.js`: `windowDays: 32 -> 30` on the three `TOKEN_PACKAGES` entries (:41-43) and `SINGLE_TOKEN` (:60); `PRICES_RELEASED = false -> true` (:70); `windowDaysFor` fallback `32 -> 30` (:107, and its doc comment "32 when there is no package" -> 30). In `season.js:70`: `start: '2026-11-02' -> '2026-11-03'` and add to the comment above it: `// Nov 2 is set-up day (owner ruling 2026-09-28); sessions start Nov 3.` In `hooks/index.js:1219`: `windowDays = 32` -> `windowDays = 30`; at :606 change "(32 days, 45 for Elite)" to "(30 days, 45 for Elite)".
- [ ] Extend `packages.test.js` (append a describe):

```js
describe('the catalogue after Sprint 20', () => {
  test('token packages and single roll a 30-day window; Elite keeps 45', () => {
    expect(TOKEN_PACKAGES.map((p) => p.windowDays)).toEqual([30, 30, 30]);
    expect(SINGLE_TOKEN.windowDays).toBe(30);
    expect(ELITE.windowDays).toBe(45);
    expect(windowDaysFor(null)).toBe(30);
  });
  test('prices are released and the catalogue carries no Stripe ids', () => {
    expect(PRICES_RELEASED).toBe(true);
    for (const p of ALL_PACKAGES) expect(p).not.toHaveProperty('stripePriceId');
  });
  test('the season starts Nov 3', () => {
    expect(SEASON_BOUNDS.start).toBe('2026-11-03');
  });
});
```
  Add to the test's imports: `ALL_PACKAGES, PRICES_RELEASED, SINGLE_TOKEN, windowDaysFor` from `./packages` and `import { SEASON_BOUNDS } from './season';`.
- [ ] Run `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/data` - expect PASS (also re-runs `duration.test.js`, which generates 2026-11-02 explicitly and is unaffected).
- [ ] Commit:
```
git add frontend/src/portal/data/calendar.js frontend/src/portal/data/calendar.test.js frontend/src/portal/data/packages.js frontend/src/portal/data/packages.test.js frontend/src/portal/data/season.js frontend/src/portal/hooks/index.js
git commit -m "Sprint 20: 30-day window, BOOKING_OPENS_AT gate, prices released, season Nov 3

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Calendly link builder and the specialist registry (closes #4)

**Files:**
- Create: `frontend/src/portal/data/calendly.js`
- Create: `frontend/src/portal/data/calendly.test.js`
- Modify: `frontend/src/portal/data/specialists.js` (:40-58)

**Interfaces:** Produces `CALENDLY_MENTAL_URL`, `CALENDLY_MENTAL_ELITE_URL`, `calendlyUrlFor(pkg)`, `calendlyLinkFor({url, athleteId, athleteName, householdId, name, email})`, `CALENDLY_NOTE` (contract 3.4); `SPECIALISTS.mental.bookingMode === 'calendly'`, `SPECIALISTS[].durationMinutes` (30 mental, 45 phil) (contract 4.3).

- [ ] Write the failing test `calendly.test.js`:

```js
/**
 * The Calendly hand-off (Sprint 20, spec 6.1): the link the Yannick card
 * opens, built with URLSearchParams so names with apostrophes, plus-addresses
 * and ampersands survive the trip.
 */
import { CALENDLY_NOTE, calendlyLinkFor, calendlyUrlFor } from './calendly';
import { SPECIALISTS } from './specialists';

const args = {
  url: 'https://calendly.com/ryp/mental-30',
  athleteId: 'ath1',
  athleteName: "Ava O'Neil",
  householdId: 'hh1',
  name: 'Dana & Sam',
  email: 'dana+ryp@example.com',
};

describe('calendlyLinkFor', () => {
  test('encodes every parameter and the utm fields', () => {
    const link = calendlyLinkFor(args);
    const u = new URL(link);
    expect(u.origin + u.pathname).toBe('https://calendly.com/ryp/mental-30');
    expect(u.searchParams.get('name')).toBe('Dana & Sam');
    expect(u.searchParams.get('email')).toBe('dana+ryp@example.com');
    expect(u.searchParams.get('a1')).toBe("Ava O'Neil");
    expect(u.searchParams.get('utm_source')).toBe('ryp-portal');
    expect(u.searchParams.get('utm_medium')).toBe('portal');
    expect(u.searchParams.get('utm_content')).toBe('ath1');
    expect(u.searchParams.get('utm_campaign')).toBe('hh1');
    expect(link).toContain('email=dana%2Bryp%40example.com');
  });
  test('appends with & when the URL already has a query', () => {
    const link = calendlyLinkFor({ ...args, url: 'https://calendly.com/ryp/x?month=2026-10' });
    expect(link.startsWith('https://calendly.com/ryp/x?month=2026-10&name=')).toBe(true);
  });
  test('no URL means no link', () => {
    expect(calendlyLinkFor({ ...args, url: null })).toBeNull();
  });
});

describe('calendlyUrlFor / registry', () => {
  test('without env both URLs are null, so the in-app slot list stays', () => {
    expect(calendlyUrlFor({ kind: 'elite' })).toBeNull();
    expect(calendlyUrlFor({ kind: 'tokens' })).toBeNull();
  });
  test('the note names Calendly and the token', () => {
    expect(CALENDLY_NOTE).toBe("Yannick's confirmation, reminders and cancellations come from Calendly. The session appears on My Schedule within a minute and spends one token.");
  });
  test('mental is Calendly-booked at 30 minutes; Phil in-app at 45', () => {
    const mental = SPECIALISTS.find((s) => s.id === 'mental');
    const phil = SPECIALISTS.find((s) => s.id === 'phil');
    expect(mental).toMatchObject({ bookingMode: 'calendly', durationMinutes: 30 });
    expect(phil.durationMinutes).toBe(45);
    expect(phil.bookingMode).toBeUndefined();
  });
});
```

- [ ] Run `... src/portal/data/calendly.test.js` - expect FAIL: cannot find module `./calendly`.
- [ ] Create `frontend/src/portal/data/calendly.js`:

```js
/**
 * Yannick via Calendly (Sprint 20, spec 6.1). The portal builds ONE link per
 * athlete and opens it in a new tab; Calendly's webhook (functions lane)
 * writes the session, the booking and the token spend back. No URL in the
 * env means the in-app slot list stays, so seed/emulator keep working.
 * PURE: no React, no Firebase.
 */
export const CALENDLY_MENTAL_URL = process.env.REACT_APP_CALENDLY_MENTAL_URL || null;
export const CALENDLY_MENTAL_ELITE_URL = process.env.REACT_APP_CALENDLY_MENTAL_ELITE_URL || null;

/** Elite gets the 45-day event type when one exists, else the standard link. */
export function calendlyUrlFor(pkg) {
  return (pkg?.kind === 'elite' && CALENDLY_MENTAL_ELITE_URL) || CALENDLY_MENTAL_URL;
}

/**
 * The prefilled link. `name`/`email` are the ATTENDEE's (the guardian's when
 * "A parent" is picked, else the athlete's login email or the guardian's);
 * `a1` is Calendly's first invitee question (athlete name); utm_content /
 * utm_campaign carry the ids the webhook resolves the booking by.
 */
export function calendlyLinkFor({ url, athleteId, athleteName, householdId, name, email }) {
  if (!url) return null;
  const q = new URLSearchParams({
    name: name ?? '',
    email: email ?? '',
    a1: athleteName ?? '',
    utm_source: 'ryp-portal',
    utm_medium: 'portal',
    utm_content: athleteId ?? '',
    utm_campaign: householdId ?? '',
  });
  return `${url}${url.includes('?') ? '&' : '?'}${q}`;
}

export const CALENDLY_NOTE =
  "Yannick's confirmation, reminders and cancellations come from Calendly. The session appears on My Schedule within a minute and spends one token.";
```

- [ ] In `specialists.js` add to the phil entry (:41-49) `durationMinutes: 45,` after `capacity: 6,`; to the mental entry (:50-57) `durationMinutes: 30,` and `bookingMode: 'calendly',` after `capacity: 1,`. Add above `SPECIALISTS` a comment: `// Sprint 20 (spec 6.1): durationMinutes is the slot length when a session doc carries none; bookingMode 'calendly' hands Yannick's booking to Calendly when REACT_APP_CALENDLY_MENTAL_URL is set (data/calendly.js), else the in-app list.`
- [ ] Run `... src/portal/data/calendly.test.js` - expect PASS.
- [ ] Commit:
```
git add frontend/src/portal/data/calendly.js frontend/src/portal/data/calendly.test.js frontend/src/portal/data/specialists.js
git commit -m "Sprint 20: Calendly link builder, specialist durations and bookingMode

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `statusFor('pending')`, per-athlete billing in the hub, `usePaymentConfirmation`, the portal-URL warning (closes #5)

**Files:**
- Modify: `frontend/src/portal/data/billingHub.js` (`hubMemberFor` return :142-186; `statusFor` :202-257)
- Modify: `frontend/src/portal/data/billingHub.test.js` (append)
- Modify: `frontend/src/portal/hooks/billing.js` (imports :19-42; `STRIPE_PORTAL_URL` :45; `liveHub` :110-122; `liveMyTokens` :134-150; append hook)
- Create: `frontend/src/portal/hooks/billing.test.js`

**Interfaces:** Consumes `hubMemberFor`, `statusFor` (billingHub.js). Produces `hubMemberFor(...).billing = { status, facility }` and `hubMemberFor(...).facilityAccessConsent: boolean` (D9), `statusFor(membership, { pendingAthletes })` pending branch (contract 3.5), `usePaymentConfirmation(athleteId) -> { state, billingStatus }` (contract 4.5), `warnMissingPortalUrl({ live, url }) -> boolean` (new, not in contract - the one-shot console warning for a live build without `REACT_APP_STRIPE_PORTAL_URL`, spec 4.4 "required").

- [ ] Append to `billingHub.test.js`:

```js
describe('per-athlete billing (Sprint 20, spec 4.4)', () => {
  test('hubMemberFor carries billing status, absent == active, and the facility add-on state', () => {
    expect(hubMemberFor(fixture()).billing).toEqual({ status: 'active', facility: null });
    const pending = hubMemberFor({ ...fixture(), athlete: { ...athlete, billing: { status: 'pending' } } });
    expect(pending.billing).toEqual({ status: 'pending', facility: null });
    const add = hubMemberFor({ ...fixture(), athlete: { ...athlete, billing: { status: 'active' }, facilityBilling: { status: 'active' } } });
    expect(add.billing).toEqual({ status: 'active', facility: 'active' });
  });

  test('hubMemberFor carries the facility waiver as a boolean (spec 4.5: "paid - waiver pending" vs "active")', () => {
    expect(hubMemberFor(fixture()).facilityAccessConsent).toBe(false);
    const nulled = hubMemberFor({ ...fixture(), athlete: { ...athlete, facilityAccessConsent: null } });
    expect(nulled.facilityAccessConsent).toBe(false);
    const signed = hubMemberFor({ ...fixture(), athlete: { ...athlete, facilityAccessConsent: { signedAt: '2026-09-01', byUid: 'p1' } } });
    expect(signed.facilityAccessConsent).toBe(true);
  });

  test('statusFor pending: after past_due, before lapsed and active; lapsed athletes pay again', () => {
    const back = statusFor({ status: 'lapsed' }, { pendingAthletes: [{ athleteId: 'a', name: 'Ava', status: 'lapsed' }] });
    expect(back).toMatchObject({ status: 'pending', cta: 'Pay now', badge: { tone: 'yellow', label: 'Payment needed' }, title: 'Membership ended - pay to book again' });
    expect(statusFor({ status: 'lapsed' }, { pendingAthletes: [] }).status).toBe('lapsed');
    const s = statusFor(null, { resetsOn: '2026-10-01', anchorDay: 1, pendingAthletes: [{ athleteId: 'a', name: 'Ava' }] });
    expect(s).toMatchObject({ status: 'pending', tone: 'yellow', badge: { tone: 'yellow', label: 'Payment pending' }, ladder: null, ladderAt: null, cta: 'Pay now', paused: false });
    expect(s.title).toBe('Payment pending - finish checkout to start booking');
    expect(s.body).toBe("Ava can book as soon as checkout is complete. Billed monthly from the 1st once you've paid.");
    expect(s.pendingAthletes).toEqual([{ athleteId: 'a', name: 'Ava' }]);
    const two = statusFor(null, { pendingAthletes: [{ athleteId: 'a', name: 'Ava' }, { athleteId: 'b', name: 'Ben' }] });
    expect(two.body.startsWith('Ava and Ben can book')).toBe(true);
    const three = statusFor(null, { pendingAthletes: [{ athleteId: 'a', name: 'Ava' }, { athleteId: 'b', name: 'Ben' }, { athleteId: 'c', name: 'Cy' }] });
    expect(three.body.startsWith('Ava, Ben and Cy can book')).toBe(true);
    expect(statusFor({ status: 'past_due' }, { pendingAthletes: [{ athleteId: 'a', name: 'Ava' }] }).status).toBe('past_due');
    expect(statusFor(null, { pendingAthletes: [] }).status).toBe('active');
    expect(statusFor(null, { resetsOn: '2026-10-01', anchorDay: 1 }).pendingAthletes).toBeUndefined();
  });
});
```

- [ ] Run `... src/portal/data/billingHub.test.js` - expect FAIL: `billing` undefined; `facilityAccessConsent` undefined; status `'lapsed'` (the lapsed case runs first) / `'active'`.
- [ ] In `hubMemberFor`'s return (after `facilityAccess: Boolean(athlete.facilityAccess),` :185) add:

```js
    // Sprint 20 (spec 4.5): the signed waiver (`{ signedAt, byUid } | null`
    // on the doc, DATA-MODEL:79, ops-verified) as a boolean, so the hub card
    // can read "Facility access: paid - waiver pending" (facility billing
    // active, consent absent) versus "active" (both).
    facilityAccessConsent: Boolean(athlete.facilityAccessConsent),
    // Sprint 20 (spec 4.4): the per-athlete paid state that gates booking.
    // Absent == active for every athlete provisioned before this sprint;
    // `facility` is the add-on subscription's own state (null == no add-on).
    billing: {
      status: athlete.billing?.status ?? 'active',
      facility: athlete.facilityBilling?.status ?? null,
    },
```

- [ ] In `statusFor` (:202): read `const pendingAthletes = Array.isArray(opts.pendingAthletes) ? opts.pendingAthletes : [];` beside `resetsOn`; insert between the `past_due` block and the `lapsed` block, i.e. directly above `if (status === 'lapsed') {` (:229):

```js
  // Sprint 20 (spec 4.4): an athlete who needs a checkout - never paid, or
  // whose tier subscription ENDED (billing.status 'lapsed'). Ranked after
  // past_due (a failing card is fixed in the portal; a second checkout would
  // double-subscribe) but BEFORE the household lapsed block: when the last
  // tier subscription ends the household lapses too, and the only way back
  // is a new checkout per lapsed athlete - the customer portal cannot resume
  // a cancelled subscription (review 2026-09-28). Copy is the contract's,
  // shared with the home banners.
  if (pendingAthletes.length > 0) {
    const names = listNames(pendingAthletes.map((a) => a.name));
    const ended = pendingAthletes.some((a) => a.status === 'lapsed');
    return {
      status: 'pending',
      tone: 'yellow',
      badge: { tone: 'yellow', label: ended ? 'Payment needed' : 'Payment pending' },
      title: ended ? 'Membership ended - pay to book again' : 'Payment pending - finish checkout to start booking',
      body: `${names} can book as soon as checkout is complete. Billed monthly from the 1st once you've paid.`,
      ladder: null,
      ladderAt: null,
      cta: 'Pay now',
      paused: false,
      pendingAthletes,
    };
  }
```
  and add beside `attemptOf` (:190):

```js
/** "Ava", "Ava and Ben", "Ava, Ben and Cy". */
function listNames(names) {
  const list = names.filter(Boolean);
  if (list.length <= 1) return list[0] ?? '';
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}
```

- [ ] Run `... src/portal/data/billingHub.test.js` - expect PASS.
- [ ] Write the failing test `frontend/src/portal/hooks/billing.test.js` (the same five mocks Task 10's `index.test.js` uses - `billing.js` imports `./index` for `coachingFor`):

```js
/**
 * hooks/billing.js' Sprint 20 guard (spec 4.4: REACT_APP_STRIPE_PORTAL_URL
 * is REQUIRED in production): a live build without it warns ONCE per page
 * load; seed mode and a set URL never warn. Firebase is mocked out.
 */
jest.mock('../../firebase', () => ({ __esModule: true, default: {}, auth: { currentUser: null }, db: {}, functions: {}, storage: {} }));
jest.mock('firebase/firestore', () => ({}));
jest.mock('firebase/auth', () => ({}));
jest.mock('firebase/functions', () => ({ httpsCallable: jest.fn(() => jest.fn()) }));
jest.mock('firebase/messaging', () => ({ isSupported: jest.fn(async () => false) }));

import { warnMissingPortalUrl } from './billing';

test('warnMissingPortalUrl fires once, only live, only when the URL is missing', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  expect(warnMissingPortalUrl({ live: false, url: null })).toBe(false);
  expect(warnMissingPortalUrl({ live: true, url: 'https://billing.stripe.com/p/login/test_x' })).toBe(false);
  expect(warn).not.toHaveBeenCalled();
  expect(warnMissingPortalUrl({ live: true, url: null })).toBe(true);
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn.mock.calls[0][0]).toContain('REACT_APP_STRIPE_PORTAL_URL');
  expect(warnMissingPortalUrl({ live: true, url: null })).toBe(false); // once per page load
  expect(warn).toHaveBeenCalledTimes(1);
  warn.mockRestore();
});
```

- [ ] Run `... src/portal/hooks/billing.test.js` - expect FAIL: `warnMissingPortalUrl` is not a function.
- [ ] `hooks/billing.js`: add `import { useEffect, useState } from 'react';` at the top and `bump` to the `./invalidate` import (:23 -> `import { bump, useInvalidation } from './invalidate';`). Replace the `STRIPE_PORTAL_URL` block (:44-45) with:

```js
/**
 * The Stripe no-code customer portal login link. Sprint 20 (spec 4.4): no
 * longer optional - without it a failed card has no self-serve fix. The app
 * still renders (the hub omits the link), but a LIVE build without it says
 * so in the console once per page load; seed mode and jest never carry the
 * var and never warn. `live`/`url` are injectable for the unit test.
 */
export const STRIPE_PORTAL_URL = process.env.REACT_APP_STRIPE_PORTAL_URL || null;
let portalUrlWarned = false;
export function warnMissingPortalUrl({ live = isLive(), url = STRIPE_PORTAL_URL } = {}) {
  if (portalUrlWarned || !live || url) return false;
  portalUrlWarned = true;
  console.warn(
    'REACT_APP_STRIPE_PORTAL_URL is not set: the billing hub cannot offer the Stripe customer portal, so a failed card has no self-serve fix (Sprint 20, spec 4.4 - required in production).'
  );
  return true;
}
```
  In `liveHub` (:110-122) add `warnMissingPortalUrl();` as the first statement and replace `status: statusFor(membership, { resetsOn, anchorDay }),` with:

```js
    status: statusFor(membership, { resetsOn, anchorDay, pendingAthletes: pendingOf(members) }),
```
  In `liveMyTokens` (:134-150) add `warnMissingPortalUrl();` as the first statement and replace the `status:` line with `status: statusFor(membership, { resetsOn, anchorDay, pendingAthletes: pendingOf([member]) }),`. Add above `liveHub`:

```js
/** The members who need a checkout (Sprint 20, spec 4.4): never paid, or whose tier subscription ended - drives statusFor's pending branch. A lapsed athlete re-subscribes through the same createCheckoutSession; the customer portal cannot resume a cancelled subscription. */
function pendingOf(members) {
  return members
    .filter((m) => m.billing?.status === 'pending' || m.billing?.status === 'lapsed')
    .map((m) => ({ athleteId: m.athleteId, name: m.name, status: m.billing.status }));
}
```
  Seed mode too (`seedBillingHub` :199-209, `seedMyTokens` :211-220): hoist `const members = HOUSEHOLD.children.map((child) => seedMember(child, today, anchorDay));` / `const member = seedMember(HOUSEHOLD.children[0], today, anchorDay);` above the `return` and pass `pendingAthletes: pendingOf(members)` / `pendingOf([member])` to their `statusFor` calls, so the seed's pending athlete (`athletes/nico`, db Task 4) drives the banner in seed mode as well.
  Append at the end of the file:

```js
/**
 * The `?paid=<athleteId>` return from Stripe Checkout (Sprint 20, spec 4.2):
 * `{ state: 'idle'|'confirming'|'confirmed'|'timeout', billingStatus }`. Polls
 * the athlete every 5 s, 24 attempts (2 min); on `billing.status === 'active'`
 * bumps athletes + billing (every hub/home hook re-reads) and strips the
 * query from the address bar so a refresh does not poll again. The screen
 * passes the id it read from useSearchParams; null means nothing to confirm.
 */
export function usePaymentConfirmation(athleteId) {
  const [state, setState] = useState({ state: 'idle', billingStatus: null });
  useEffect(() => {
    if (!athleteId || !isLive()) return undefined;
    let alive = true;
    let attempts = 0;
    let timer = null;
    setState({ state: 'confirming', billingStatus: null });
    const tick = async () => {
      if (!alive) return;
      attempts += 1;
      let status = null;
      try {
        const a = await fetchAthlete(athleteId);
        status = a.billing?.status ?? 'active';
      } catch (err) {
        status = null; // a transient read error is just another attempt
      }
      if (!alive) return;
      if (status === 'active') {
        bump('athletes');
        bump('billing');
        try {
          window.history.replaceState(null, '', window.location.pathname);
        } catch (err) {
          /* a locked history is not a failure */
        }
        setState({ state: 'confirmed', billingStatus: status });
        return;
      }
      if (attempts >= 24) {
        setState({ state: 'timeout', billingStatus: status });
        return;
      }
      setState({ state: 'confirming', billingStatus: status });
      timer = setTimeout(tick, 5000);
    };
    timer = setTimeout(tick, 0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [athleteId]);
  return state;
}
```

- [ ] Run `cd frontend && npx esbuild src/portal/hooks/billing.js --bundle --platform=browser --outfile=/dev/null --log-level=error 2>&1 | head` (the repo's compile check; `esbuild` is under `frontend/node_modules/.bin`) - expect no output. Then `... src/portal/data` and `... src/portal/hooks/billing.test.js` - expect PASS.
- [ ] Commit:
```
git add frontend/src/portal/data/billingHub.js frontend/src/portal/data/billingHub.test.js frontend/src/portal/hooks/billing.js frontend/src/portal/hooks/billing.test.js
git commit -m "Sprint 20: billing hub pending state, per-athlete billing + waiver flag, usePaymentConfirmation, portal-URL warning

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Rules - athlete shape, per-athlete billing gate, Oct 10 gate (closes #1)

**Files:**
- Modify: `firestore.rules` (helpers :48-50; athletes create :153-162; bookings create :524-539; waitlist create :1244-1254)
- Create: `scripts/verify-rules.mjs` (emulator probe, ESM, dependency-free)

**Interfaces:** Produces rules helpers `athleteBillingOk(a)`, `bookingOpenOk(a)`, `bookingAthleteOk()`, `waitlistAthleteOk()` (contract 5). `scripts/verify-rules.mjs` (new, not in contract) is this lane's emulator harness; Task 5 extends it. The probe's grace-token booking is the spec 11 "parent+grace booking before Oct 10 stays under the read cap" check.

- [ ] Add after `athleteData` (:48-50):

```
    // Sprint 20 (spec 4.4): per-athlete paid status gates booking. Absent
    // `billing` == active (every athlete provisioned before this sprint).
    function athleteBillingOk(a) {
      return !('billing' in a) || a.billing.status == 'active';
    }

    // Sprint 20 (spec 5): booking opens 07:00 America/Chicago on 2026-10-10
    // (1791633600000 - the SAME value as data/calendar.js BOOKING_OPENS_AT);
    // a paid Elite books at once (the webhook corrects packageId to the paid
    // price, so 'elite' here means paid Elite). Retire after launch (#26).
    function bookingOpenOk(a) {
      return request.time >= timestamp.value(1791633600000)
        || a.get('packageId', null) == 'elite';
    }
```

- [ ] Athletes create shape (:153-161): keep `hasAll` and add three clauses before the closing `;`:

```
          && d.coachId == null
          // Sprint 20 (spec 2.2): handicap int 0..54 or null; loginEmail string
          // or null; billing/facilityBilling are server-written ONLY.
          && (!d.keys().hasAny(['handicap']) || d.handicap == null
              || (d.handicap is int && d.handicap >= 0 && d.handicap <= 54))
          && (!d.keys().hasAny(['loginEmail']) || d.loginEmail == null || d.loginEmail is string)
          && !d.keys().hasAny(['billing', 'facilityBilling']);
```

- [ ] Bookings: add inside the `bookings` match beside `bookingHouseholdOk` (:484-487):

```
      // Sprint 20 (spec 4.4 + 5): the athlete doc this create already read
      // for the household check, hoisted into ONE let so the billing and
      // opens-at gates cost no extra document read (the parent + grace path
      // sits at 5 unique docs of the 10-doc cap).
      function bookingAthleteOk() {
        let a = athleteData(request.resource.data.athleteId);
        return request.resource.data.householdId == a.householdId
          && athleteBillingOk(a)
          && bookingOpenOk(a);
      }
```
  and in `allow create` (:524-539) replace the two lines
  `&& request.resource.data.householdId\n             == athleteData(request.resource.data.athleteId).householdId`
  with `&& bookingAthleteOk()`.
- [ ] Waitlist: add beside `waitlistHouseholdOk` (:1239-1242) the same shape:

```
      // Sprint 20 (spec 4.4 + 5): identical to bookings' bookingAthleteOk.
      function waitlistAthleteOk() {
        let a = athleteData(request.resource.data.athleteId);
        return request.resource.data.householdId == a.householdId
          && athleteBillingOk(a)
          && bookingOpenOk(a);
      }
```
  and in `allow create` (:1244-1254) replace the `householdId == athleteData(...)` pair with `&& waitlistAthleteOk()`.
- [ ] Create `scripts/verify-rules.mjs` (dependency-free; the Firestore emulator decodes an UNSIGNED `Bearer` JWT as `request.auth`, and `Bearer owner` bypasses rules - the same trick `frontend/src/firebase.js:82-96` uses for the auth emulator). Uses a throwaway project id so the `rypacad` seed is never touched (memory: emulator-admin-probe). The `graceTokens/grace-probe` doc follows DATA-MODEL "graceTokens (contract v2.1, Part 2)" (`{ athleteId, householdId, expiresAt 'YYYY-MM-DD', reason, sourceSessionId, createdBy, createdAt }`); `bookingGraceOk` (`firestore.rules:470-478`) checks `athleteId == d.athleteId` and `expiresAt >= d.date`:

```js
/**
 * Sprint 20 rules probe - runs against the LOCAL Firestore emulator only
 * (FIRESTORE_EMULATOR_HOST from scripts/emulator.env) under a throwaway
 * project id, so seeded data is untouched. Seeds via `Bearer owner` (bypasses
 * rules), then exercises each new rules clause as a real user via an
 * unsigned JWT (the emulator accepts alg:none). Exit 1 on any FAIL.
 *   node --env-file=scripts/emulator.env scripts/verify-rules.mjs
 */
import { fsFields, localEmulatorHost } from './lib/firestore-rest.mjs';

const HOST = localEmulatorHost({ required: true });
const PROJECT = 'demo-rules-probe';
const BASE = `http://${HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
const GATE_MS = 1791633600000;
const beforeGate = Date.now() < GATE_MS;
let failures = 0;

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function token(uid, claims = {}) {
  const now = Math.floor(Date.now() / 1000);
  const body = { iss: 'https://securetoken.google.com/' + PROJECT, aud: PROJECT, sub: uid, user_id: uid,
    iat: now, exp: now + 3600, firebase: { sign_in_provider: claims.provider || 'password', identities: {} }, ...claims };
  delete body.provider;
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64(body)}.`;
}
async function call(method, path, body, auth) {
  const res = await fetch(`${BASE}${path}`, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${auth}` }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const seed = (col, id, fields) => call('PATCH', `/${col}/${id}`, { fields: fsFields(fields) }, 'owner');
const del = (col, id) => call('DELETE', `/${col}/${id}`, null, 'owner');
async function createAs(auth, col, id, fields, serverTime = ['createdAt']) {
  // One `commit` write: a create (currentDocument.exists false) plus REQUEST_TIME transforms.
  const name = `projects/${PROJECT}/databases/(default)/documents/${col}/${id}`;
  const res = await fetch(`http://${HOST}/v1/projects/${PROJECT}/databases/(default)/documents:commit`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${auth}` },
    body: JSON.stringify({ writes: [{ update: { name, fields: fsFields(fields) }, currentDocument: { exists: false },
      updateTransforms: serverTime.map((fieldPath) => ({ fieldPath, setToServerValue: 'REQUEST_TIME' })) }] }),
  });
  return res.status;
}
function expect(label, actual, wanted) {
  const ok = actual === wanted;
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label} -> ${actual} (wanted ${wanted})`);
}

const uid = { parent: 'p-probe', athlete: 'a-probe', ops: 'ops-probe', kid: 'kid-probe', stranger: 's-probe' };
const t = {
  parent: token(uid.parent, { email: 'dana@example.com', email_verified: true }),
  athlete: token(uid.athlete, { email: 'ava@example.com', email_verified: true }),
  ops: token(uid.ops, { email: 'ops@example.com', email_verified: true }),
  kidVerified: token(uid.kid, { email: 'Kid@Example.com', email_verified: true }),
  kidUnverified: token(uid.kid, { email: 'Kid@Example.com', email_verified: false }),
  stranger: token(uid.stranger, { email: 'x@example.com', email_verified: true }),
};

async function setup() {
  await seed('users', uid.parent, { role: 'parent', householdId: 'hh', athleteId: null });
  await seed('users', uid.athlete, { role: 'athlete', athleteId: 'ath-active', householdId: 'hh' });
  await seed('users', uid.ops, { role: 'ops' });
  await seed('households', 'hh', { name: 'Probe family', periodAnchorDay: 1 });
  for (const [id, extra] of [
    ['ath-active', { packageId: 't-6', billing: { status: 'active' } }],
    ['ath-absent', { packageId: 't-6' }],
    ['ath-pending', { packageId: 't-6', billing: { status: 'pending' } }],
    ['ath-elite', { packageId: 'elite', billing: { status: 'active' } }],
    ['ath-elite-pending', { packageId: 'elite', billing: { status: 'pending' } }],
  ]) await seed('athletes', id, { name: id, householdId: 'hh', contractMinutes: null, coachId: null, ...extra });
  await seed('sessions', 's1', { date: '2026-11-04', time: '4:00 PM', type: 'training', capacity: 15, booked: 0, status: 'scheduled' });
  await seed('sessions', 's2', { date: '2026-11-05', time: '4:00 PM', type: 'training', capacity: 15, booked: 0, status: 'scheduled' });
  await seed('sessions', 's-full', { date: '2026-11-04', time: '5:00 PM', type: 'training', capacity: 1, booked: 1, status: 'scheduled' });
  // Sprint 20 read-cap check (spec 11): a grace-charged booking by the PARENT
  // walks the longest create path - me() + sessions + graceTokens (x2, one
  // doc) + households + athletes = 5 unique docs of the 10-doc cap. Held by
  // ath-elite so the expectation is 200 before AND after the Oct 10 gate.
  await seed('graceTokens', 'grace-probe', { athleteId: 'ath-elite', householdId: 'hh', expiresAt: '2026-12-31', reason: 'session-cancelled',
    sourceSessionId: 's-cancelled', createdBy: uid.ops, createdAt: new Date() });
}
const booking = (athleteId) => ({ athleteId, sessionId: 's1', date: '2026-11-04', type: 'training', periodKey: '2026-11-01',
  status: 'confirmed', householdId: 'hh', createdBy: uid.parent, chargedFrom: 'period' });
const entry = (athleteId) => ({ sessionId: 's-full', athleteId, householdId: 'hh', date: '2026-11-04', periodKey: '2026-11-01', createdBy: uid.parent });

export async function task4() {
  console.log('Task 4: athlete shape, billing gate, opens-at gate' + (beforeGate ? ' (before Oct 10)' : ' (after Oct 10)'));
  const shape = { name: 'N', householdId: 'hh', contractMinutes: null, coachId: null };
  expect('ops creates athlete with handicap 12 + loginEmail', await createAs(t.ops, 'athletes', 'new-1', { ...shape, handicap: 12, loginEmail: 'kid@example.com' }, []), 200);
  expect('handicap 55 refused', await createAs(t.ops, 'athletes', 'new-2', { ...shape, handicap: 55 }, []), 403);
  expect('client-written billing refused', await createAs(t.ops, 'athletes', 'new-3', { ...shape, billing: { status: 'active' } }, []), 403);
  expect('parent cannot create an athlete', await createAs(t.parent, 'athletes', 'new-4', shape, []), 403);
  expect('booking: billing active', await createAs(t.parent, 'bookings', 'ath-active_s1', booking('ath-active')), beforeGate ? 403 : 200);
  expect('booking: billing absent', await createAs(t.parent, 'bookings', 'ath-absent_s1', booking('ath-absent')), beforeGate ? 403 : 200);
  expect('booking: billing pending refused', await createAs(t.parent, 'bookings', 'ath-pending_s1', booking('ath-pending')), 403);
  expect('booking: paid Elite books before the gate', await createAs(t.parent, 'bookings', 'ath-elite_s1', booking('ath-elite')), 200);
  expect('booking: unpaid Elite refused', await createAs(t.parent, 'bookings', 'ath-elite-pending_s1', booking('ath-elite-pending')), 403);
  expect('booking: parent + grace token stays under the read cap (paid Elite: open before the gate too)',
    await createAs(t.parent, 'bookings', 'ath-elite_s2', { ...booking('ath-elite'), sessionId: 's2', date: '2026-11-05', chargedFrom: 'grace', graceTokenId: 'grace-probe' }), 200);
  expect('waitlist: pending refused', await createAs(t.parent, 'waitlist', 's-full_ath-pending', entry('ath-pending'), ['joinedAt']), 403);
  expect('waitlist: paid Elite allowed', await createAs(t.parent, 'waitlist', 's-full_ath-elite', entry('ath-elite'), ['joinedAt']), 200);
  expect('waitlist: active token athlete', await createAs(t.parent, 'waitlist', 's-full_ath-active', entry('ath-active'), ['joinedAt']), beforeGate ? 403 : 200);
}

async function teardown() {
  for (const [c, ids] of Object.entries({ users: Object.values(uid), households: ['hh'], sessions: ['s1', 's2', 's-full'],
    athletes: ['ath-active', 'ath-absent', 'ath-pending', 'ath-elite', 'ath-elite-pending', 'new-1', 'new-2', 'new-3', 'new-4'],
    bookings: ['ath-active_s1', 'ath-absent_s1', 'ath-pending_s1', 'ath-elite_s1', 'ath-elite-pending_s1', 'ath-elite_s2'],
    graceTokens: ['grace-probe'],
    waitlist: ['s-full_ath-pending', 's-full_ath-elite', 's-full_ath-active'] })) for (const id of ids) await del(c, id);
}

export { setup, teardown, seed, del, call, createAs, expect, token, t, uid, BASE };
if (process.argv[1] && process.argv[1].endsWith('verify-rules.mjs')) {
  await setup();
  try { await task4(); } finally { await teardown(); }
  console.log(failures ? `${failures} FAILED` : 'ALL PASS');
  process.exit(failures ? 1 : 0);
}
```

- [ ] Start the shared emulator from this worktree (rules hot-reload on save): `npx firebase-tools emulators:start --only firestore,auth --project rypacad` in its own terminal (leave running; stop it by PID from `netstat -ano | findstr :8080`, never `taskkill /IM node.exe`). Run `node --env-file=scripts/emulator.env scripts/verify-rules.mjs` - expect every line PASS and `ALL PASS`. If the grace line alone FAILs with 403 while `ath-elite_s1` passes, the rules evaluation blew the read cap: re-check that `bookingAthleteOk()` is the ONLY `athleteData()` call on the create path (the hoisted `let`) before touching anything else. If the emulator reports a rules compile error on save, fix the rules before re-running (a `let` is only legal inside a function body; `'billing' in a` needs `a` to be a map).
- [ ] Commit:
```
git add firestore.rules scripts/verify-rules.mjs
git commit -m "Sprint 20 rules: athlete shape (handicap/loginEmail), per-athlete billing gate, Oct 10 gate + emulator probe

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Rules - Calendly cancel guard, `loginInvites`/`calendlyEvents` reads, parent household exclusions (closes #1)

**Files:**
- Modify: `firestore.rules` (memberBookingUpdateOk :667-679; households update :862-870; new matches before `stripeEvents` :1315)
- Modify: `scripts/verify-rules.mjs` (add `task5`)

**Interfaces:** Consumes Task 4's probe helpers. Produces rules matches `/loginInvites/{email}` (read only), `/calendlyEvents/{id}` (read only); member cancel refuses `source == 'calendly'`; parent household updates cannot touch `membership`, `stripeCustomerIds`, `signup`, `createdBy` (K10 fix folded in).

- [ ] `memberBookingUpdateOk` (:667-679): in the confirmed->cancelled arm add, after `&& after.cancelReason == 'member'`:

```
            // Sprint 20 (spec 6.1): a Calendly-sourced booking is cancelled
            // from Calendly's email, never in-app (the webhook writes the
            // cancel). Absent source == 'portal'.
            && resource.data.get('source', null) != 'calendly')
```
  (the closing paren replaces the one that ended the arm).
- [ ] Households parent branch (:866-869): replace the `hasAny([...])` list with
  `.hasAny(['stripeCustomerId', 'stripeSubscriptionId', 'periodAnchorDay', 'membership', 'stripeCustomerIds', 'signup', 'createdBy'])`
  and the ops branch (:863-865) with `.hasAny(['periodAnchorDay', 'stripeCustomerId', 'stripeSubscriptionId', 'stripeCustomerIds', 'signup', 'createdBy'])`. Add above the block: `// Sprint 20: membership (K10 - a parent could un-freeze themselves), stripeCustomerIds, signup and createdBy are server-written; the parent branch excludes all of them.`
- [ ] Insert before `// ---- stripeEvents` (:1315):

```
    // ---- loginInvites -----------------------------------------------------
    // Sprint 20 (spec 2.2, 3.2). Doc id == the child's login email, lower-
    // cased; written ONLY by createFamily/addAthletes/claimInvite (Admin
    // SDK). Read by the email's owner once VERIFIED (no enumeration by an
    // unverified account), by the household's parent, or ops/owner. The
    // token map is read null-safe: an emulator custom-token user has no
    // email claim at all. No client write clause: deny-by-default.
    match /loginInvites/{email} {
      allow read: if signedIn() && (
        (request.auth.token.get('email_verified', false) == true
          && request.auth.token.get('email', '').lower() == email)
        || (me().role == 'parent' && resource.data.householdId == me().householdId)
        || me().role in ['ops', 'owner']
      );
    }

    // ---- calendlyEvents --------------------------------------------------
    // Sprint 20 (spec 6.2, 7): the Calendly webhook's idempotency ledger,
    // Admin-SDK-written; ops/owner read it for the sign-ups report's flags.
    match /calendlyEvents/{eventId} {
      allow read: if signedIn() && me().role in ['ops', 'owner'];
    }

```

- [ ] Add to `verify-rules.mjs` (before the `export {` line) and call it from the runner after `task4()`:

```js
export async function task5() {
  console.log('Task 5: calendly cancel guard, loginInvites/calendlyEvents reads, household exclusions');
  await seed('bookings', 'ath-active_cal-1', { athleteId: 'ath-active', sessionId: 'cal-1', date: '2026-11-10', type: 'mental', periodKey: '2026-11-01',
    status: 'confirmed', householdId: 'hh', createdBy: 'system', createdAt: new Date(), chargedFrom: 'period', source: 'calendly', calendlyInviteeUri: 'https://api.calendly.com/x' });
  await seed('bookings', 'ath-active_s-portal', { athleteId: 'ath-active', sessionId: 's1', date: '2026-11-04', type: 'training', periodKey: '2026-11-01',
    status: 'confirmed', householdId: 'hh', createdBy: uid.parent, createdAt: new Date(), chargedFrom: 'period' });
  const cancel = (id, auth) => call('PATCH', `/bookings/${id}?updateMask.fieldPaths=status&updateMask.fieldPaths=cancelledBy&updateMask.fieldPaths=cancelReason`,
    { fields: fsFields({ status: 'cancelled', cancelledBy: uid.parent, cancelReason: 'member' }) }, auth).then((r) => r.status);
  expect('member cancel of a portal booking', await cancel('ath-active_s-portal', t.parent), 200);
  expect('member cancel of a calendly booking refused', await cancel('ath-active_cal-1', t.parent), 403);
  await seed('loginInvites', 'kid@example.com', { email: 'kid@example.com', householdId: 'hh', athleteId: 'ath-active', athleteName: 'Kid', requestedBy: 'guardian',
    createdBy: uid.parent, createdAt: new Date(), status: 'open', claimedBy: null, claimedAt: null });
  const read = (auth) => call('GET', '/loginInvites/kid@example.com', null, auth).then((r) => r.status);
  expect('invite read by the verified owner (mixed-case token email, .lower())', await read(t.kidVerified), 200);
  expect('invite read refused while unverified', await read(t.kidUnverified), 403);
  expect('invite read by the household parent', await read(t.parent), 200);
  expect('invite read by ops', await read(t.ops), 200);
  expect('invite read refused for a stranger', await read(t.stranger), 403);
  expect('client cannot create an invite', await createAs(t.parent, 'loginInvites', 'new@example.com', { email: 'new@example.com', householdId: 'hh', athleteId: 'ath-active', athleteName: 'N', requestedBy: 'guardian', createdBy: uid.parent, status: 'open', claimedBy: null, claimedAt: null }), 403);
  expect('client cannot create a household', await createAs(t.parent, 'households', 'hh-new', { name: 'X' }, []), 403);
  expect('client cannot create a users doc', await createAs(t.stranger, 'users', uid.stranger, { role: 'parent', householdId: 'hh' }, []), 403);
  await seed('calendlyEvents', 'ev-1', { event: 'invitee.created', outcome: 'unresolved', receivedAt: new Date() });
  expect('calendlyEvents read by ops', (await call('GET', '/calendlyEvents/ev-1', null, t.ops)).status, 200);
  expect('calendlyEvents read refused for a parent', (await call('GET', '/calendlyEvents/ev-1', null, t.parent)).status, 403);
  const patchHh = (fields) => call('PATCH', `/households/hh?${Object.keys(fields).map((k) => `updateMask.fieldPaths=${k}`).join('&')}`, { fields: fsFields(fields) }, t.parent).then((r) => r.status);
  expect('parent edits their own contact', await patchHh({ emergencyContact: '555' }), 200);
  expect('parent cannot write membership', await patchHh({ membership: { status: 'active' } }), 403);
  expect('parent cannot write stripeCustomerIds', await patchHh({ stripeCustomerIds: ['cus_x'] }), 403);
  for (const [c, id] of [['bookings', 'ath-active_cal-1'], ['bookings', 'ath-active_s-portal'], ['loginInvites', 'kid@example.com'], ['calendlyEvents', 'ev-1']]) await del(c, id);
}
```

- [ ] Run `node --env-file=scripts/emulator.env scripts/verify-rules.mjs` - expect `ALL PASS` (Task 4 and 5 lines).
- [ ] Commit:
```
git add firestore.rules scripts/verify-rules.mjs
git commit -m "Sprint 20 rules: Calendly cancel guard, loginInvites + calendlyEvents reads, parent household exclusions

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

Continue with `10-routing-part2.md` (Tasks 6-11) and `10-routing-part3.md` (Tasks 12, 12b, 13).
