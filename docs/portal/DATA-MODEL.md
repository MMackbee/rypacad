# Portal data model — Firestore

Concrete field-level spec for data contract v1 (pinned in `docs/portal/TEAM.md`
— this document extends it and must never contradict it). Firebase project is
`rypacad` (work account); agents only ever run against the **emulator**
(`npm run emulator`), never production. Access policy lives in
`firestore.rules` (data-routing lane); this document defines the shapes those
policies protect.

Seeding: `scripts/seed-firestore.mjs` (see [Seeding & emulator workflow](#seeding--emulator-workflow)).
Composite indexes: `firestore.indexes.json` at the repo root, referenced from
`firebase.json` — each index is documented [below](#indexes) with the query it
serves.

## Id conventions

| Collection | Doc id | Why |
|---|---|---|
| `users` | Firebase Auth uid | Rules resolve the caller via `users/{request.auth.uid}`. Seed uses readable slugs (`parent-dana`) since the emulator mints no uids. |
| `households` | slug / auto-id | Referenced by `users.householdId`, `athletes.householdId`, `bookings.householdId`. |
| `athletes` | slug / auto-id | Referenced by `users.athleteId`, `bookings.athleteId`, `contractLogs.athleteId`. |
| `packages` | catalogue id (`g-8-3`, `f-4`, `elite`, `drop-in`) | Matches `frontend/src/portal/data/packages.js` exactly, so the client and the database name the same package the same way. |
| `sessions` | the generator's `YYYY-MM-DD-<block>` (`2026-11-02-0`; extras `2026-11-27-x0`) | Ids come from `generateSeason()` and are never invented elsewhere. Date-prefixed ids make `orderBy(date, __name__)` a stable chronological cursor. |
| `bookings` | `{athleteId}_{sessionId}` | Deterministic id = one booking per athlete per session, enforced by the keyspace itself. Re-booking after a cancellation updates the same doc's `status` instead of creating a duplicate. |
| `contractLogs` | `{athleteId}_{date}` | Pinned by contract v1: one log per athlete per day, duplicate-proof by construction. |

## Collections

### `users/{uid}`

The role document rules key off. One per authenticated account.

| Field | Type | Notes |
|---|---|---|
| `role` | string | `athlete \| parent \| coach \| mental \| ops \| owner` |
| `athleteId` | string \| null | Set when `role == 'athlete'` — the athlete doc this account is. |
| `householdId` | string \| null | Set when `role == 'parent'` — the household this guardian belongs to. |
| `staff` | boolean | True for `coach`, `mental`, `ops`, `owner`. MFA is required for staff at setup (enforced at the auth layer, not stored here). |
| `displayName` | string \| null | |
| `email` | string \| null | |

### `households/{householdId}`

Guardian + billing linkage. **Never card data** — Stripe ids only.

| Field | Type | Notes |
|---|---|---|
| `name` | string | e.g. "Whitfield family" |
| `guardian` | map | `{ name, email, phone }` — guardian contact. |
| `stripeCustomerId` | string \| null | Id only. Card data never touches Firestore. |
| `stripeSubscriptionId` | string \| null | Id only. |

### `athletes/{athleteId}`

The athlete's profile. Everything a coach's roster or a parent's home card
needs — and nothing medical (see the subcollection below).

| Field | Type | Notes |
|---|---|---|
| `name` | string | |
| `dob` | string \| null | `YYYY-MM-DD`. Null in seed data — the scaffold gives ages only and no birthday is invented. |
| `householdId` | string | Parent link; rules grant guardians access through it. |
| `packageId` | string | Into `packages/` — decides both monthly allowance pools. |
| `contractMinutes` | number \| null | `20 \| 45 \| 95 \| null` — Commitment Contract tier. |
| `coachId` | string \| null | uid of a `users` doc with `role == 'coach'`. Coach access filters on this assignment, never on role alone. |

### `athletes/{athleteId}/private/medical`

Medical and emergency info lives in its **own subcollection document, apart
from the profile, precisely so `firestore.rules` can scope it to live-session
staff only** — a coach pulling a roster or a parent reading a dashboard never
transports medical fields, and the minors' data-minimization rule in the
Blueprint holds structurally instead of by field-filtering discipline.

| Field | Type | Notes |
|---|---|---|
| `emergencyContact` | map | `{ name, phone, relationship }` |
| `medicalNotes` | string \| null | Allergies, conditions, instructions. |
| `updatedAt` | timestamp | |

The seed script never writes this document: inventing medical data for minors
would defeat the point of minimizing it.

### `packages/{packageId}`

The 2026-27 catalogue, mirrored from `frontend/src/portal/data/packages.js`
(the confirmed source). A package grants **two separate monthly allowances** —
training sessions and tournament entries — that never substitute for each
other.

| Field | Type | Notes |
|---|---|---|
| `name` | string | "8 + 3", "Drop-in", "Elite 24/7"… |
| `kind` | string | `golf \| drop-in \| fitness \| elite` — catalogue grouping (extension to contract v1; the contract names the catalogue, this labels its four lists). |
| `price` | number | Monthly price. **In the schema per contract v1 but never written by the seed script** — no dollar amounts in seed data, policy. How real prices enter the live project is a PM/user decision at deploy time. |
| `training` | number | Training sessions per month (golf/elite/drop-in). |
| `tournaments` | number | Tournament entries per month (golf/elite/drop-in). |
| `sessions` | number | Fitness packages only — fitness sessions per month. |
| `philSessions` | number \| null | Elite only. Null until decided — nulls are seeded as nulls, per the catalogue. |
| `yannickSessions` | number \| null | Elite only. Null until decided. |
| `facility247` | boolean | Elite only. |

### `sessions/{sessionId}`

One doc per schedulable block, seeded from `buildSeason()` in
`frontend/src/portal/data/season.js` — **never retyped by hand**. Doc id is
the generator's own id.

| Field | Type | Notes |
|---|---|---|
| `date` | string | `YYYY-MM-DD` (matches the id prefix). |
| `time` | string | Block start, e.g. "3:00 PM". |
| `type` | string | `training \| tournament` — decides which allowance pool a booking spends. |
| `capacity` | number | From the generator's capacity config. |
| `booked` | number | Denormalized confirmed-booking count for capacity display. Must be updated in the same transaction as a booking create/cancel (data-routing lane). The roster truth is always the bookings query — this is a display counter, and a reconcile can rebuild it from bookings at any time. |
| `coachId` | string \| null | Assigned coach uid. |
| `label` | string \| null | Real event names only ("Holiday Tournament"); null for regular blocks. |
| `special` | boolean | True for explicitly-dated extras (holiday tournaments on closed days). |
| `overflow` | boolean | True for Friday overflow blocks (off by default in the generator). |

### `bookings/{bookingId}`

One doc per athlete-session reservation. Doc id `{athleteId}_{sessionId}`.

| Field | Type | Notes |
|---|---|---|
| `athleteId` | string | |
| `sessionId` | string | Into `sessions/` — the session carries time/type/label; the booking does not duplicate them beyond the query fields below. |
| `date` | string | `YYYY-MM-DD`, copied from the session so date-range queries need no join. |
| `type` | string | `training \| tournament` — the session's type at booking time. |
| `pool` | string | `training \| tournaments` — which allowance pool this spends (`poolFor()` in packages.js). Stored, not derived, so the cycle-usage query is a pure index scan. |
| `status` | string | `confirmed \| cancelled \| attended \| noshow` |
| `householdId` | string | Denormalized from the athlete for the parent's cross-children view and household-scoped rules. |
| `createdBy` | string | uid of the account that made the booking (parent or athlete). |
| `createdAt` | timestamp | |

**Allowance usage is derived, never stored.** "Used 3 of 8" comes from
counting this collection for the athlete's current billing cycle — the
[cycle-usage index](#4-bookings-athleteid-asc-pool-asc-date-asc--cycle-usage)
makes that a cheap indexed read. There is no `used` counter on the athlete,
package, or allowance anywhere, so there is nothing to drift when a booking is
cancelled, a session is closed, or a write is retried. (`sessions.booked` is a
per-session capacity display counter, not an allowance counter.)

### `contractLogs/{athleteId_date}`

Commitment Contract practice log — one per athlete per day, id-enforced.

| Field | Type | Notes |
|---|---|---|
| `athleteId` | string | Matches the id prefix. |
| `date` | string | `YYYY-MM-DD`, matches the id suffix. |
| `minutes` | number | Minutes logged that day. |

## Indexes

All composite indexes live in `firestore.indexes.json`. Single-field lookups
(booking by `sessionId` alone, sessions by `date` alone) ride Firestore's
automatic single-field indexes and are not listed.

### 1. `sessions (date ASC, __name__ ASC)` — season browsing

Serves: `sessions where date >= :today orderBy date, __name__` — the Book-a-
Session list and date strip, paged with a cursor. Because session ids are
date-prefixed and blocks sort within a day (`-0`, `-1`, `-2`), `__name__` as
the explicit tiebreak yields a stable chronological cursor across pages.

### 2. `bookings (athleteId ASC, date ASC)` — My Schedule

Serves: `bookings where athleteId == :id and date >= :today orderBy date`
(upcoming) and the `date < :today` variant (past tab). The athlete's schedule
across both pools, in date order.

### 3. `bookings (householdId ASC, date ASC)` — parent household view

Serves: `bookings where householdId == :id and date >= :today orderBy date` —
the parent home screen's "next session" per child and the household's combined
calendar, one query for all children instead of one per athlete.

### 4. `bookings (athleteId ASC, pool ASC, date ASC)` — cycle usage

Serves: `bookings where athleteId == :id and pool == :pool and
date >= :cycleStart and date <= :cycleEnd` — **the derived-allowance query.**
Counting the results (excluding `status == 'cancelled'` in memory) yields
"used N of M" for that pool this billing cycle. Status is filtered client-side
rather than indexed because a cycle holds at most a couple dozen docs per
athlete; a fourth index field would buy nothing measurable.

### 5. `bookings (sessionId ASC, status ASC)` — session roster

Serves: `bookings where sessionId == :id and status == 'confirmed'` — the
coach's live roster and attendance list for one block, and the capacity
reconcile that can rebuild `sessions.booked` from truth.

### 6. `contractLogs (athleteId ASC, date ASC)` — contract history

Serves: `contractLogs where athleteId == :id and date >= :monthStart and
date <= :monthEnd orderBy date` — the contract month grid, streaks, and
attendance percentage on the parent's child-detail screen.

## Seeding & emulator workflow

Both npm scripts live in the **root `package.json`** (created for this — the
repo root had none, and this is where `firebase.json` lives, so emulator
commands resolve their config; neither the CRA app in `frontend/` nor the
`functions/` package is the right owner for repo-level data tooling).

```
npm run emulator         # firestore :8080, auth :9099, emulator UI (firebase.json)
npm run seed:emulator    # seed the running emulator (env via scripts/emulator.env)
node scripts/seed-firestore.mjs --dry-run   # print counts + samples, write nothing
```

The seed script:

- bundles `season.js` / `packages.js` / `seed.js` from frontend source with
  esbuild (`--bundle --format=cjs --platform=node`) and executes them — the
  season and catalogue are **never retyped**; requires `frontend/` deps
  installed (date-fns) for the bundle step;
- refuses to run without `FIRESTORE_EMULATOR_HOST` (unless `--dry-run`), and
  refuses any non-local host, so it structurally cannot write to production;
- writes via the Firestore REST API, so the repo root needs no dependencies;
- seeds no dollar amounts, no Stripe ids (null), and no medical documents.
