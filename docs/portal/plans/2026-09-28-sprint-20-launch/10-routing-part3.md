# Routing lane - Sprint 20 Implementation Plan (part 3 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Continues `10-routing.md` (header, Execution order, Global Constraints, Tasks 1-5)
and `10-routing-part2.md` (Tasks 6-11); both apply here unchanged. These are the
last three tasks in the execution order: 12, 12b, 13.

**Spec:** docs/portal/SPRINT-20-LAUNCH.md sections 3.2 (login line), 4.4, 7.
**Interfaces:** docs/portal/plans/2026-09-28-sprint-20-launch/01-interfaces.md sections 2, 3.5, 4.2.
**GitHub issues:** #6 (Tasks 12, 12b, 13).

Test command: `cd frontend && CI=true npx react-scripts test --watchAll=false <path>`.
Compile check for hook files: `cd frontend && npx esbuild src/portal/hooks/<file>.js --bundle --platform=browser --outfile=/dev/null --log-level=error`.

---

### Task 12: Home and membership hooks expose the athlete's paid status (closes #6)

**Files:**
- Modify: `frontend/src/portal/hooks/index.js` (`liveChildCard` return :1578-1588; `useHousehold` seed :1635-1636; `liveHouseholdAthletes` :1676-1682; `useHouseholdAthletes` seed :1704-1710; `liveMemberEntry` :1868-1901; `seedMemberEntry` :1829; `liveAthleteDashboard.athlete` :2718-2726)

**Interfaces:** Produces `billingStatus: 'pending'|'active'|'past_due'|'lapsed'` (absent == `'active'`) on `useHousehold().data.children[]`, `useHouseholdAthletes().data[]`, `useMembership().data.members[]` and `useAthleteDashboard().data.athlete` (new, not in contract - the frontend lane's pending banners and Pay buttons read it; the hub's own `members[].billing` comes from Task 3).

- [ ] Add `billingStatus: a.billing?.status ?? 'active',` to the `liveChildCard` return (after `packageId`), to the `liveHouseholdAthletes` row (after `packageName`), to the `liveMemberEntry` return (after `name`), and `billingStatus: ctx.athlete.billing?.status ?? 'active',` to `liveAthleteDashboard`'s `athlete` object (after `date`). Comment once, on `liveChildCard`: `// Sprint 20 (spec 4.4): the parent home banner and Pay button key off this; absent == active.`
- [ ] Seed parity: `useHousehold`'s `children` line (:1635-1636) becomes a map `.map((c) => ({ ...c, billingStatus: c.billingStatus ?? 'active' }))` over the same slice (Task 12b extends this map); `useHouseholdAthletes`' `seedRows` map gains `billingStatus: c.billingStatus ?? 'active'`; `seedMemberEntry` (:1829) returns `billingStatus: child.billingStatus ?? 'active'`; the athlete dashboard seed branch's `athlete` object gains `billingStatus: 'active'`.
- [ ] Verify: esbuild check on `index.js`; `... src/portal/hooks` PASS; on :3003 as the seeded parent the family home renders (React DevTools: `children[].billingStatus` is `'pending'` for the db lane's pending child, `'active'` for the rest).
- [ ] Commit:
```
git add frontend/src/portal/hooks/index.js
git commit -m "Sprint 20: home, household-athletes, membership and athlete dashboard carry billingStatus

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12b: The child-login line - `loginEmail` + `login { state, claimedAt }` on the athlete card and the parent home (closes #6) (MAY SLIP - Oct 10 with claimInvite)

**Files:**
- Create: `frontend/src/portal/data/signups.js` (the pure login-state helper; Task 13 appends `buildSignupRows`)
- Create: `frontend/src/portal/data/signups.test.js` (Task 13 appends the row-builder tests)
- Create: `frontend/src/portal/hooks/signups.js` (`fetchLoginInvite`; Task 13 appends the report queries + `useSignups`)
- Modify: `frontend/src/portal/hooks/index.js` (imports after :96 and :188; `liveChildCard` :1541-1589; `useHousehold` seed `children` (Task 12's map); `liveAthleteDetail` :3096-3170; `useAthleteDetail` seed :3196-3201)

**Interfaces:** Consumes `fetchAthlete`'s doc (`athletes.loginEmail`, contract 2) and `loginInvites/{emailLower}` (read by the household parent / ops / owner, rules Task 5). Produces (D9) `loginEmail: string|null` and `login: { state: 'none'|'invited'|'invited-stale'|'claimed', claimedAt: 'YYYY-MM-DDTHH:mm'|null }` on `useAthleteDetail().data.athlete` (liveAthleteDetail) and on `useHousehold().data.children[]` (liveChildCard); exported pure `loginStateFor(loginEmail, invite, now)` (data/signups.js), `fetchLoginInvite(email)` (hooks/signups.js). The frontend lane's ChildCard renders the line on the parent home; AthleteDetail's card shows "Login: none / not claimed / claimed <date>" (spec 3.2).

- [ ] Write the failing test `frontend/src/portal/data/signups.test.js`:

```js
/**
 * The child-login state derivation (Sprint 20, spec 3.2) - pure, pinned
 * without Firestore. Task 13 appends the sign-ups report's row-builder tests.
 */
import { loginStateFor } from './signups';

const now = new Date('2026-10-05T15:00:00');

describe('loginStateFor', () => {
  test('no loginEmail is none, whatever invite is passed (the parent runs the child)', () => {
    expect(loginStateFor(null, { status: 'open', createdAt: now }, now)).toEqual({ state: 'none', claimedAt: null });
    expect(loginStateFor(undefined, null, now)).toEqual({ state: 'none', claimedAt: null });
  });
  test('open invites are invited, or invited-stale once open for more than 7 days', () => {
    expect(loginStateFor('kid@x.com', { status: 'open', createdAt: new Date('2026-10-01T00:00:00') }, now)).toEqual({ state: 'invited', claimedAt: null });
    expect(loginStateFor('kid@x.com', { status: 'open', createdAt: new Date('2026-09-28T15:00:00') }, now)).toEqual({ state: 'invited', claimedAt: null }); // exactly 7 days: not yet stale
    expect(loginStateFor('kid@x.com', { status: 'open', createdAt: new Date('2026-09-28T14:59:00') }, now)).toEqual({ state: 'invited-stale', claimedAt: null });
    // A Firestore Timestamp (toDate) works too.
    expect(loginStateFor('kid@x.com', { status: 'open', createdAt: { toDate: () => new Date('2026-09-20T00:00:00') } }, now).state).toBe('invited-stale');
  });
  test('claimed carries the stamp; orphaned reads none; a missing/unreadable invite reads invited', () => {
    expect(loginStateFor('kid@x.com', { status: 'claimed', claimedAt: new Date('2026-10-02T10:00:00') }, now)).toEqual({ state: 'claimed', claimedAt: '2026-10-02T10:00' });
    expect(loginStateFor('kid@x.com', { status: 'orphaned', createdAt: now }, now)).toEqual({ state: 'none', claimedAt: null });
    expect(loginStateFor('kid@x.com', null, now)).toEqual({ state: 'invited', claimedAt: null });
  });
});
```

- [ ] Run `... src/portal/data/signups.test.js` - expect FAIL: cannot find module `./signups`.
- [ ] Create `frontend/src/portal/data/signups.js`:

```js
/**
 * Sign-up era view-model helpers (Sprint 20): the child-login line (spec
 * 3.2) here, the admin sign-ups report's row builder appended by Task 13
 * (spec 7). PURE - no React, no Firebase; hooks/signups.js fetches, this
 * file derives. Routing-owned (D1): the frontend lane's report helpers
 * live in data/signupsReport.js, never here.
 */
import { format } from 'date-fns';

/** An open invite older than this is 'invited-stale' - ops fixes the email (spec 3.2, 7). */
export const STALE_INVITE_DAYS = 7;

/** A Date from a Date, a Firestore Timestamp (toDate) or an ISO string; null otherwise. */
export function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v.toDate === 'function') return v.toDate();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 'YYYY-MM-DDTHH:mm' in the browser's zone, or null. */
export function stamp(v) {
  const d = toDate(v);
  return d ? format(d, "yyyy-MM-dd'T'HH:mm") : null;
}

/**
 * The child-login state the parent's family page, the athlete card and the
 * report all show (spec 3.2 "Login: none / not claimed / claimed <date>"):
 *   none          - no loginEmail (the parent's account runs the child), or
 *                   the invite was orphaned by claimInvite (athlete gone)
 *   invited       - an open invite; ALSO a loginEmail whose invite doc is
 *                   missing or unreadable by this viewer (a coach - rules
 *                   grant the read to the household parent and ops/owner)
 *   invited-stale - open for more than STALE_INVITE_DAYS
 *   claimed       - claimInvite flipped it; claimedAt stamped
 * `now` is injectable for tests.
 */
export function loginStateFor(loginEmail, invite, now = new Date()) {
  if (!loginEmail) return { state: 'none', claimedAt: null };
  if (!invite) return { state: 'invited', claimedAt: null };
  if (invite.status === 'orphaned') return { state: 'none', claimedAt: null };
  if (invite.status === 'claimed') return { state: 'claimed', claimedAt: stamp(invite.claimedAt) };
  const created = toDate(invite.createdAt);
  const stale = created ? now.getTime() - created.getTime() > STALE_INVITE_DAYS * 86400000 : false;
  return { state: stale ? 'invited-stale' : 'invited', claimedAt: null };
}
```

- [ ] Run `... src/portal/data/signups.test.js` - expect PASS.
- [ ] Create `frontend/src/portal/hooks/signups.js`:

```js
/**
 * Sign-up era reads (Sprint 20, spec 3.2 + 7): loginInvites here; the
 * admin sign-ups report's queries and useSignups are appended by Task 13.
 * New surface, kept out of live.js/index.js (the grace.js/waitlist.js
 * precedent); imports shared primitives FROM ./live, never the other way.
 */
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { ERR, wrap } from './live';

/**
 * loginInvites/{emailLower}, or null when there is none OR the viewer may
 * not read it. Rules (Task 5) grant the read to the verified owner, the
 * household's parent and ops/owner; a coach opening AthleteDetail is
 * denied, which is not an error here - data/signups.js#loginStateFor
 * renders a null invite behind a loginEmail as 'invited'. Any other
 * failure (offline, unavailable) still throws.
 */
export async function fetchLoginInvite(email) {
  if (!email || typeof email !== 'string') return null;
  try {
    const snap = await getDoc(doc(db, 'loginInvites', email.trim().toLowerCase()));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (err) {
    const wrapped = wrap(err, 'fetchLoginInvite');
    if (wrapped.code === ERR.PERMISSION) return null;
    throw wrapped;
  }
}
```

- [ ] `hooks/index.js` imports: after `import usePush from './push';` (:96) add `import { fetchLoginInvite } from './signups';` (Task 13 widens this to `import useSignups, { fetchLoginInvite } from './signups';`); after the `../data/calendly` import Task 10 added (:188) add `import { loginStateFor } from '../data/signups';`.
- [ ] `liveChildCard` (:1541): after `const age = ageFromDob(a.dob ?? null);` (:1572) insert:

```js
  // Sprint 20 (spec 3.2): the child's own login for the parent home's
  // ChildCard line. A parent may read their own household's invites (rules,
  // Task 5); no loginEmail == the parent's account runs the child.
  const loginEmail = a.loginEmail ?? null;
  const login = loginStateFor(loginEmail, loginEmail ? await fetchLoginInvite(loginEmail) : null);
```
  and add `loginEmail,` and `login,` to its return after `billingStatus` (Task 12).
- [ ] `useHousehold` seed: replace the `children` map Task 12 wrote with the full seed shape (no child logins in seed):

```js
  const children = (variant === 'one' ? HOUSEHOLD.children.slice(0, 1) : HOUSEHOLD.children).map((c) => ({
    ...c,
    billingStatus: c.billingStatus ?? 'active',
    // Sprint 20 (spec 3.2): the seed family has no child logins - state 'none'.
    loginEmail: null,
    login: { state: 'none', claimedAt: null },
  }));
```
- [ ] `liveAthleteDetail` (:3096): after the `upcoming` map (ends :3138) insert:

```js
  // Sprint 20 (spec 3.2): the athlete card's "Login: none / not claimed /
  // claimed <date>" line. The household parent and ops/owner can read the
  // invite; a coach cannot (fetchLoginInvite returns null -> 'invited').
  const loginEmail = athlete.loginEmail ?? null;
  const login = loginStateFor(loginEmail, loginEmail ? await fetchLoginInvite(loginEmail) : null);
```
  and in the returned `athlete: { ... }` add, after `facilityAccessConsent: athlete.facilityAccessConsent ?? null,` (:3160):

```js
      // Sprint 20 (spec 3.2, D9): the child's own login state.
      loginEmail,
      login,
```
- [ ] `useAthleteDetail` seed (:3196-3201): `athlete: { ...ATHLETE_DETAIL, loginEmail: null, login: { state: 'none', claimedAt: null } },` in place of `athlete: ATHLETE_DETAIL,`.
- [ ] Verify: esbuild check on `hooks/signups.js` and `index.js` - no errors; `... src/portal/data/signups.test.js` and `... src/portal/hooks` - PASS. Emulator check on :3003 (db lane's seed carries one open `loginInvites` doc for one Whitfield child): as the seeded parent, React DevTools on the family home shows `children[].login.state === 'invited'` for that child and `'none'` for the others; as the seeded owner, `/portal/athlete/<that child>` shows the same `login`; signed in as the mental coach the same page shows `'invited'` (the invite read is denied and swallowed, nothing crashes). Mark the invite `status: 'claimed', claimedAt: <now>` with `Bearer owner` (PATCH with `updateMask.fieldPaths=status&updateMask.fieldPaths=claimedAt`) -> after an `athletes` bump (any package assignment) the parent home reads `'claimed'` with the stamp; restore the doc afterwards.
- [ ] Commit:
```
git add frontend/src/portal/data/signups.js frontend/src/portal/data/signups.test.js frontend/src/portal/hooks/signups.js frontend/src/portal/hooks/index.js
git commit -m "Sprint 20: child-login line - loginEmail + login state on the athlete card and the parent home, fetchLoginInvite

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: `useSignups` + the admin `pending` bucket (closes #6) (MAY SLIP - Oct 10)

**Files:**
- Modify: `frontend/src/portal/data/signups.js` (append `buildSignupRows`; Task 12b created it), `frontend/src/portal/data/signups.test.js` (append)
- Modify: `frontend/src/portal/hooks/signups.js` (append the report queries + `useSignups`; Task 12b created it)
- Modify: `frontend/src/portal/hooks/index.js` (imports :93-96; re-export :200; `liveAdminDashboard` :3402-3410; seed membership :3567)

**Ownership (D1):** `frontend/src/portal/data/signups.js` stays **routing-owned** - it holds `loginStateFor` (Task 12b) and `buildSignupRows`, the pure half of `useSignups`. The frontend lane's report helpers (row formatting, filter predicates, the "Unmatched Calendly bookings" list rendering) live in `frontend/src/portal/data/signupsReport.js` + `signupsReport.test.js` and import from here - never the other way, and nothing of theirs lands in this file.

**Interfaces:** Consumes `packageById`, `loginStateFor` (Task 12b). Produces `buildSignupRows({ households, athletes, invites, flaggedBookings, calendlyEvents, now })` (new, not in contract - the pure half of `useSignups`), `useSignups()` (contract 4.2) with the D9 data shape confirmed as:

```js
{ data: { rows: [<row, contract 4.2>],
          counts: { all, unpaid, flagged, unresolved },
          unresolved: [{ id, outcome: 'unresolved', receivedAt: 'YYYY-MM-DDTHH:mm' | null }] } | null,
  loading, error }
```

(`unresolved` and `counts.unresolved` are beyond contract 4.2: an unresolved Calendly event has no household to hang off, so it is its own list - AdminSignups renders it as "Unmatched Calendly bookings" and counts it inside the Flagged filter, D16), and `useAdminDashboard().data.membership.pending`.

- [ ] Append to `data/signups.test.js` (and widen its import to `import { buildSignupRows, loginStateFor } from './signups';`):

```js
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

test('an open invite younger than 7 days is invited; orphaned reads none; a loginEmail with no invite reads invited', () => {
  const fresh = [{ id: 'ava@x.com', athleteId: 'a1', status: 'open', createdAt: new Date('2026-10-01T00:00:00') }];
  expect(buildSignupRows({ households, athletes, invites: fresh, now }).rows[0].athletes[0].login).toBe('invited');
  const orphan = [{ id: 'ava@x.com', athleteId: 'a1', status: 'orphaned', createdAt: new Date('2026-10-01T00:00:00') }];
  expect(buildSignupRows({ households, athletes, invites: orphan, now }).rows[0].athletes[0].login).toBe('none');
  expect(buildSignupRows({ households, athletes, invites: [], now }).rows[0].athletes[0].login).toBe('invited');
});
```

- [ ] Run `... src/portal/data/signups.test.js` - expect FAIL: `buildSignupRows` is not a function.
- [ ] Append to `data/signups.js` (and widen its imports to `import { differenceInYears, format, parseISO } from 'date-fns';` plus `import { packageById } from './packages';`):

```js
/** One report athlete's login columns (contract 4.2) from loginStateFor. */
function loginFor(athlete, invite, now) {
  const loginEmail = athlete.loginEmail ?? null;
  const { state, claimedAt } = loginStateFor(loginEmail, invite, now);
  return { login: state, loginEmail, loginClaimedAt: claimedAt };
}

/**
 * The admin sign-ups report (spec 7) - one row per self-signed-up household
 * (`signup` present; legacy provisioned households are not sign-ups), in
 * the input order (hooks/signups.js queries `signup.at desc`). Returns
 * `{ rows, counts: { all, unpaid, flagged, unresolved }, unresolved }` (D9).
 */
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
  // An unresolved Calendly booking has no household to hang off; it is its
  // own list (AdminSignups: "Unmatched Calendly bookings", inside Flagged).
  const unresolved = calendlyEvents.filter((e) => e.outcome === 'unresolved' && !e.householdId).map((e) => ({ id: e.id, outcome: e.outcome, receivedAt: stamp(e.receivedAt) }));
  return {
    rows,
    counts: { all: rows.length, unpaid: rows.filter((r) => r.unpaid).length, flagged: rows.filter((r) => r.flagged).length, unresolved: unresolved.length },
    unresolved,
  };
}
```

- [ ] Run `... src/portal/data/signups.test.js` - expect PASS.
- [ ] Append to `hooks/signups.js` (and widen its imports to `import { collection, doc, getDoc, getDocs, orderBy, query, where } from 'firebase/firestore';`, `import { ERR, fetchAllAthletes, isLive, wrap } from './live';`, plus `import { useInvalidation } from './invalidate';`, `import useSeedResource from './useSeedResource';`, `import { buildSignupRows } from '../data/signups';`):

```js
/*
 * The admin sign-ups report's data (spec 7) - ops/owner only; every query
 * below is provable under the staff clauses (households, athletes,
 * loginInvites, bookings, calendlyEvents all grant ops/owner unconditionally).
 */
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

/**
 * `{ data: { rows, counts: { all, unpaid, flagged, unresolved }, unresolved }
 * | null, loading, error }` (D9) - see data/signups.js for the row shape.
 * Invalidation keys: households, athletes, bookings, loginInvites (new bump key).
 */
export default function useSignups() {
  const live = isLive();
  const gens = [useInvalidation('households'), useInvalidation('athletes'), useInvalidation('bookings'), useInvalidation('loginInvites')];
  return useSeedResource(live ? null : EMPTY, live ? { source: liveSignups, deps: ['signups', ...gens] } : undefined);
}
```

- [ ] `hooks/index.js`: the Task 12b import becomes `import useSignups, { fetchLoginInvite } from './signups';` and `useSignups,` joins the re-export at :200. In `liveAdminDashboard` (:3402): `const membership = { active: 0, pastDue: 0, lapsed: 0, pending: 0, lapsedHouseholds: [] };` and after the households loop: `// Sprint 20 (spec 4.4/7): athletes still on checkout - an ATHLETE count beside the household counts, so the dashboard agrees with the sign-ups report.` `membership.pending = athletes.filter((a) => a.billing?.status === 'pending').length;`. Seed (:3567): `membership: { active: 1, pastDue: 0, lapsed: 0, pending: 0, lapsedHouseholds: [] }`.
- [ ] Verify: esbuild check on `hooks/signups.js` and `index.js`; `... src/portal` - every test PASS. Emulator check on :3003 as the seeded owner: a component calling `useSignups()` (the frontend lane's AdminSignups; until it lands, `window.__rypTestAuth.signInAs(<owner uid>)` then React DevTools on `/portal/admin` to read `membership.pending`) shows the db lane's pending seed athlete counted once.
- [ ] Commit:
```
git add frontend/src/portal/data/signups.js frontend/src/portal/data/signups.test.js frontend/src/portal/hooks/signups.js frontend/src/portal/hooks/index.js
git commit -m "Sprint 20: useSignups (admin sign-ups report data) and the admin pending bucket

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Done when

- `cd frontend && CI=true npx react-scripts test --watchAll=false` is green (calendar, packages, billingHub, calendly, signups, callables, live, useAuthSession, billing, index tests).
- `node --env-file=scripts/emulator.env scripts/verify-rules.mjs` prints `ALL PASS` against the shared emulator (Task 4 incl. the parent + grace read-cap line, and Task 5).
- `wc -l` on every touched file is under 500 except the grandfathered `live.js`/`index.js` (net growth there is limited to the lines named above).
- Every commit carries the trailer; nothing pushed; the owner deploys `firestore:rules` from the runbook (spec 12.3).
