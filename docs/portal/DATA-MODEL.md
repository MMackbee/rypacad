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
| `tournamentResults` | `{sessionId}_{athleteId}` | **Contract v1.5.** One result per athlete per tournament, enforced by the keyspace itself — the same pattern as `bookings` and `contractLogs`. Corrections overwrite via update; there is no delete in v1. |

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

One doc per schedulable block. Two sanctioned writers, never a hand: seeded
from `buildSeason()` in `frontend/src/portal/data/season.js`, and synced from
the Google Calendar by `scripts/sync-calendar-sessions.mjs`
([below](#calendar--sessions-sync)) — the calendar is the session source of
truth per the Sprint 4 pins in TEAM.md. Doc id is `YYYY-MM-DD-<n>` in both
cases.

| Field | Type | Notes |
|---|---|---|
| `date` | string | `YYYY-MM-DD` (matches the id prefix). |
| `time` | string | Block start, e.g. "3:00 PM". |
| `type` | string | `training \| tournament` — decides which allowance pool a booking spends. |
| `capacity` | number | From the generator's capacity config. |
| `booked` | number | Denormalized confirmed-booking count for capacity display. Must be updated in the same transaction as a booking create/cancel (data-routing lane). The roster truth is always the bookings query — this is a display counter, and a reconcile can rebuild it from bookings at any time. **Contract v1.4** (Sprint 6): the exact transaction that maintains this field is pinned in [Booking transaction, attendance, and parent linkage](#booking-transaction-attendance-and-parent-linkage-contract-v14-sprint-6) below. |
| `coachId` | string \| null | Assigned coach uid. |
| `label` | string \| null | Real event names only ("Holiday Tournament"); null for regular blocks. |
| `special` | boolean | True for explicitly-dated extras (holiday tournaments on closed days). |
| `overflow` | boolean | True for Friday overflow blocks (off by default in the generator). |
| `status` | string | **Contract v1.2.** `scheduled \| cancelled`, default `scheduled`. The calendar sync sets `cancelled` — never deletes — when a synced session's calendar instance disappears but the session has bookings, so families are told rather than ghosted. |
| `gcalEventId` | string \| null | **Contract v1.2.** The calendar instance id a synced session came from; null for generator-seeded sessions. The sync matches sessions by this id, so a retitled or retimed event updates its session instead of duplicating it. |

### Calendar → sessions sync

`scripts/sync-calendar-sessions.mjs` turns Google Calendar events into
bookable session docs — the calendar is the session source of truth
(Sprint 4 pin, TEAM.md), and this script is the **third sanctioned production
writer** (with `provision-owner.mjs` and the future billing integration).
Emulator always; production runs are user-gated commands.

```
npm run sync:emulator -- --from 2026-11-02 --to 2027-02-27   # sync a running emulator
node scripts/sync-calendar-sessions.mjs --from ... --to ... --dry-run     # plan only, no writes
node scripts/sync-calendar-sessions.mjs --from ... --to ... --dry-run \
  --fixture scripts/fixtures/gcal-sample-events.json                      # deterministic, no network
```

**Title convention** (pinned in TEAM.md — the mapper implements exactly this):

| Calendar event | Becomes |
|---|---|
| summary starts with `Training block`, timed (`start.dateTime`) | bookable session, `type: 'training'` |
| summary starts with `Tournament`, timed | bookable session, `type: 'tournament'` |
| all-day event (`start.date` only) | skipped — display-only, whatever the title |
| any other summary | skipped — display-only (counted, e.g. legacy `Academy Training`) |

Mapped fields: id `YYYY-MM-DD-<n>` where n is the 0-based start-time order of
that day's **bookable** events; `time` formatted like the generator
(`'3:00 PM'`); `capacity` from `CAPACITY` in
`frontend/src/portal/data/schedule.js` (replicated in the script with a source
note); `label` null for the generic titles (`Training block`, `Tournament`,
`Tournament block`) and the event summary verbatim otherwise; `booked` 0,
`coachId` null, `special`/`overflow` false, `status` `'scheduled'`,
`gcalEventId` the instance id. Times are read in `America/Chicago`, the
calendar's timezone.

**Upsert / cancel / delete semantics** (per run, over the `--from..--to` window):

- **New** event → session created.
- **Existing** session, matched by `gcalEventId` — falling back to doc id, but
  only onto docs with *no* `gcalEventId`, which is how the sync adopts
  generator-seeded sessions (and their bookings) without stealing a doc that
  belongs to a different instance → masked patch of
  `date/time/type/label/status/gcalEventId` only. **`booked`, coach
  assignments and all bookings are preserved.**
- Synced session whose calendar instance no longer exists → **deleted** if
  `booked === 0`, else `status: 'cancelled'`. A session with bookings is never
  deleted.
- Generator-seeded sessions (`gcalEventId` null) not adopted by id are left
  untouched — reaping those is not this script's call.
- An instance whose date/day-order changed maps to a new id: the old doc is
  deleted-and-recreated when empty, but patched in place (id kept, flagged as
  a CONFLICT in the run report) when it has bookings — preserving bookings
  outranks the id convention.

Same production guard as the seed script: writes require
`FIRESTORE_EMULATOR_HOST` pointing at a local host or the script exits;
`--dry-run` may read the real calendar but writes nothing. Calendar
credentials (`REACT_APP_GCAL_CALENDAR_ID` / `REACT_APP_GCAL_API_KEY`) are read
from `frontend/.env` at runtime, never hardcoded; the key is
referer-restricted, so the script sends `Referer: http://localhost:3000/`.

### `bookings/{bookingId}`

One doc per athlete-session reservation. Doc id `{athleteId}_{sessionId}`.

| Field | Type | Notes |
|---|---|---|
| `athleteId` | string | |
| `sessionId` | string | Into `sessions/` — the session carries time/type/label; the booking does not duplicate them beyond the query fields below. |
| `date` | string | `YYYY-MM-DD`, copied from the session so date-range queries need no join. |
| `type` | string | `training \| tournament` — the session's type at booking time. |
| `pool` | string | `training \| tournaments` — which allowance pool this spends (`poolFor()` in packages.js). Stored, not derived, so the cycle-usage query is a pure index scan. |
| `status` | string | `confirmed \| cancelled \| attended \| noshow`. **Contract v1.4** (Sprint 6): the `confirmed -> attended \| noshow` transitions are attendance, pinned below. |
| `householdId` | string | Denormalized from the athlete for the parent's cross-children view and household-scoped rules. |
| `createdBy` | string | uid of the account that made the booking (parent or athlete). **Contract v1.4:** for a parent-created booking this is the *parent's* uid, not the athlete's — see the linkage note below. |
| `createdAt` | timestamp | |

**Allowance usage is derived, never stored.** "Used 3 of 8" comes from
counting this collection for the athlete's current billing cycle — the
[cycle-usage index](#4-bookings-athleteid-asc-pool-asc-date-asc--cycle-usage)
makes that a cheap indexed read. There is no `used` counter on the athlete,
package, or allowance anywhere, so there is nothing to drift when a booking is
cancelled, a session is closed, or a write is retried. (`sessions.booked` is a
per-session capacity display counter, not an allowance counter.)

### Booking transaction, attendance, and parent linkage (contract v1.4, Sprint 6)

Pinned by the Sprint 6 QA burn-down rulings (TEAM.md "Sprint 6 pins") to close
the gap between what the screens showed and what Firestore actually enforced
— QA found booking capacity, attendance, and parent booking all client-side
only, with nothing in `firestore.rules` backing them up.

**Booking is one client transaction, and the only writer of `booked`.**
Creating a booking is never two writes — it is a single Firestore transaction
that:

1. reads `sessions/{sessionId}`;
2. requires `booked < capacity`, aborting the transaction otherwise (the
   plain-language "this session is full" rejection the screen shows);
3. creates `bookings/{athleteId}_{sessionId}` — the deterministic id from
   contract v1.1, so a duplicate booking attempt lands on the same doc and is
   rejected by the rules instead of creating a second record (surfaced in
   plain language as "the athlete already has this session booked", QA #8);
4. updates `sessions/{sessionId}.booked` to `booked + 1`.

Rules addition (data-routing lane): a `sessions` update is allowed only when
the caller is a signed-in portal user **and** the diff is exactly
`booked + 1` while staying within `capacity` (or, for the future cancellation
path below, exactly `booked - 1` and never below `0`) — no other field of
`sessions` may change in the same write as a `booked` delta, and no other
delta on `booked` is legal at all. This is the only writer of `booked`
anywhere in the app; the seed script (below) sets `booked` directly because it
is standing up state that *represents* the outcome of transactions that never
literally ran, not because `booked` has a second real writer.

`booked` remains authoritative for **capacity display only** — the
roster/attendance truth is always the `bookings` query
([index 5](#5-bookings-sessionid-asc-status-asc--session-roster), reasoning
updated below for v1.4). A future **cancellation** path is this transaction's
mirror image: read the booking, flip `status` to `cancelled`, decrement
`sessions.booked` by `booked - 1` (never below 0) in the same transaction —
not built this sprint, but the field, the rules shape, and the "one writer"
invariant are already correct for it, so cancellation lands without a schema
change.

**Attendance is derived state on the booking — there is no `attendance`
collection.** A coach marks a booked athlete IN or OUT during a live session;
that write is a `status` transition on the existing `bookings` doc, nothing
else:

- `confirmed -> attended` (coach marks IN)
- `confirmed -> noshow` (coach marks OUT)

Only the **assigned coach** may make this transition — `athletes/{athleteId}.coachId
== request.auth.uid`, resolved through the booking's `athleteId` (routing
lane implements the `get()` in `firestore.rules`) — and the write may change
**only** the `status` field; `athleteId`, `sessionId`, `date`, `type`, `pool`,
`householdId`, `createdBy`, and `createdAt` are immutable after create.
Marking attendance never touches `sessions.booked`: the athlete already held
the seat from the moment of booking, so `attended`/`noshow` records what
happened in an already-counted seat, not a new capacity event.

**Parent-created bookings.** A parent books for a child in their household —
`createdBy` is the **parent's uid**, so `createdBy != athleteId`'s owning
account is the expected shape for these, not an anomaly. The linkage the
rules must prove on create is a three-way match: the caller's own
`users/{request.auth.uid}.householdId` equals both the write's own
`householdId` field and the target athlete's `athletes/{athleteId}.householdId`
(a `get()`). A parent can book only into their own household's athletes —
never a neighbor's — and the booking's `householdId` can't be forged to a
household different from the one the athlete actually belongs to.

**Post-write refresh (routing lane; documented here for the data-contract
record).** Sprint 6 also fixes the "confirm a booking, the dashboard still
shows the old count" friction (QA #3/#5/#7) with a **read-refresh seam**, not
a new stored counter: after `createBooking` / `createContractLog` / an
attendance update, the routing lane's dependent hooks re-run and re-derive
their view from Firestore (generalizing `usePracticeLog`'s existing
`refreshKey` pattern — no global state library, no cache to invalidate wrong).
Contract v1.4 adds **zero** new denormalized fields for this: `sessions.booked`
remains the only stored counter anywhere in the schema; allowance usage,
attendance history, and the roster are all live queries, so there is nothing
else that can drift.

### `contractLogs/{athleteId}_{date}`

Commitment Contract practice log — one per athlete per day, id-enforced. Field
set is **contract v1.3** (Sprint 5 pin, TEAM.md): `contractMinutes`,
`createdBy` and `createdAt` are additions over v1's `athleteId, date, minutes`.

| Field | Type | Notes |
|---|---|---|
| `athleteId` | string | Matches the id prefix. |
| `date` | string | `YYYY-MM-DD` (ISO), matches the id suffix. |
| `minutes` | number | Integer > 0. The real practiced amount that day — variable, not a fixed block length. |
| `contractMinutes` | number | **Snapshot** of the athlete's `contractMinutes` tier at the moment this log was created — copied from `athletes/{athleteId}.contractMinutes`, not read live. This is what lets history survive a later tier change: a log written against the 45-min tier still reads as fulfilled/not against 45 forever, even if the athlete moves to the 95-min tier next month. |
| `createdBy` | string | uid of the account that wrote the log (athlete or parent). |
| `createdAt` | timestamp | Server write time. |

**One log per athlete per day** via the doc-id keyspace — same pattern as
`bookings`' `{athleteId}_{sessionId}`. A second log for the same
athlete/date overwrites the first rather than creating a duplicate.

**Fulfilled = `minutes >= contractMinutes`.** Surplus minutes never bank an
extra fulfilled day — 90 minutes logged against a 45-minute contract is
**one** fulfilled day that happens to record 90, not two days' worth of
credit. There is no rollover or banking concept anywhere in this collection.

**Any date is loggable.** Closures are a *scheduling* fact (they constrain
which `sessions` are bookable) — they are not a *practice* fact, because kids
practice outside the academy. The contract calendar has no `closed` state;
every calendar date accepts a log.

### `tournamentResults/{sessionId}_{athleteId}` (contract v1.5, Sprint 7)

One doc per athlete's finishing position in one Saturday tournament block —
the fact record behind the "RYP Tour" season leaderboard (TEAM.md "Sprint 7
pins"). Doc id `{sessionId}_{athleteId}`, same enforced-by-construction
pattern as `bookings`' `{athleteId}_{sessionId}` and `contractLogs`'
`{athleteId}_{date}`: the keyspace itself guarantees one result per athlete
per tournament, and a correction is a same-id update — **there is no delete
in v1**, so a bad entry is fixed by overwriting `position`, not by removing
the doc.

| Field | Type | Notes |
|---|---|---|
| `sessionId` | string | Into `sessions/` — must be a `type: 'tournament'` session. Matches the id prefix. |
| `athleteId` | string | Into `athletes/`. Matches the id suffix. |
| `date` | string | `YYYY-MM-DD`. **Must equal the referenced session's own `date`** — read off `sessions/{sessionId}.date` at write time (never typed independently), so the two can never disagree. |
| `position` | number | Integer >= 1. Finishing place in that tournament block. |
| `createdBy` | string | uid of the staff account (coach or ops/owner) that entered the result. |
| `createdAt` | timestamp | Server write time. |

**Points are never stored — position is the only fact in Firestore.** The
season standings' point value for a given position comes from the
`TOUR_POINTS` table in the frontend's `frontend/src/portal/data/tour.js`
(routing lane; positions 1-15 map to `[100, 80, 65, 55, 50, 45, 40, 36, 32,
28, 24, 20, 16, 12, 8]`, matching the 15-athlete tournament capacity in
`schedule.js`; any position beyond the table scores a flat 5 participation
points) and is computed at **read** time, in the hook that derives standings
— never written back to a document. This is deliberate, for the same reason
allowance usage is never a stored counter: if the owner retunes the points
table (first place worth more, a narrower payout curve, whatever), that
change **retroactively rescores the entire season** the next time standings
are read, instead of requiring a migration over every past result. Storing a
`points` field on this document would freeze every past tournament's scoring
to whatever the table said on the day it was entered — exactly the drift this
schema avoids everywhere else (`sessions.booked` aside, which is a display
counter with its own single-writer transaction, not a derived value with a
policy knob behind it).

**Standings derivation** (read-time, no stored aggregate): for the season
window, sum each athlete's points across every `tournamentResults` doc with
their `athleteId`, rank descending by that sum, and **let ties share a
rank** (two athletes tied for the season lead are both "1st", the next
distinct total is "3rd", not "2nd" — standard competition ranking, not
dense ranking). "Events played" alongside each row is simply the count of
that athlete's `tournamentResults` docs in the window — no separate counter,
same derive-don't-store discipline as allowance usage and contract
fulfillment elsewhere in this schema.

**Rules** (data-routing lane implements; noted here so the shape they
enforce is on the record): create/update restricted to `coach` and staff
roles (`ops`, `owner`, `mental` per the existing staff set); shape-checked —
id must equal `{sessionId}_{athleteId}`, `position` an integer in `1..40`,
`date` must match the referenced session's `date`; readable by any signed-in
portal user (standings are public inside the academy, not scoped per
household or per coach); **no delete** in v1.

### Billing rows (derived, no new collection)

Sprint 5 adds a per-child billing list to the parent surface. It is **not** a
stored collection — each row is derived at read time by joining one
`athletes` doc to its `packages` doc:

- one row per athlete: `{ athleteId, name, packageName: packages[packageId].name, price, status }`
- `price` comes **only** from the frontend's `packages.js` source (the same
  module `seed-firestore.mjs` and `provision-family.mjs` bundle from) —
  Firestore's `packages/{id}.price` field is never populated (policy: no
  dollar amounts in Firestore; see the `packages` collection notes above), so
  the derivation reads the number out of the bundled catalogue, not out of a
  document.
- `status` is a hardcoded `'active'` placeholder until Stripe wiring lands;
  it is not read from `households.stripeSubscriptionId` this sprint.

### Query semantics (v1.3 access patterns)

Three read patterns the Sprint 5 hook seam relies on, pinned here so the
index reasoning below has a fixed target:

- **Coach roster** — "every athlete assigned to a coach" is not attendance
  for one session; it is `athletes where coachId == :coachUid`, full stop.
  This is a real roster query against the athlete's standing assignment
  (`athletes.coachId`), not a derivation from `sessions`/`bookings`.
- **Parent household list** — a parent's children list (and the billing
  rows above) come from `athletes where householdId == :parentHouseholdId`.
  This is the query the rules must be able to prove is scoped to the
  caller's own household (`request.auth`-derived equality filter), per the
  Sprint 5 access-matrix ruling in TEAM.md.
- **Month session grid** — `useMonthSessions(monthISO)` reads
  `sessions where date >= :monthStart and date <= :monthEnd orderBy date`,
  the same range-on-the-ordered-field shape as the existing Book-a-Session
  query ([index 1](#1-season-browsing--no-composite-needed-deploy-verified)),
  just bounded to one calendar month instead of the whole season.

### RYP Tour query patterns (v1.5, Sprint 7)

Three read patterns the Sprint 7 hook seam (`useTourStandings`,
`useTournamentResults`) relies on against `tournamentResults`:

- **Season standings** — every result in the season window, summed and
  ranked per athlete. Two equivalent shapes answer it: an **unfiltered
  collection read** (`tournamentResults` with no filter at all — the whole
  collection is the season, since v1 has no result outside the current
  season and no archival concept yet), or a **date-range read**
  (`tournamentResults where date >= :seasonStart and date <= :seasonEnd
  orderBy date`, the identical range-plus-orderBy-on-the-same-field shape as
  [index 1](#1-season-browsing--no-composite-needed-deploy-verified)/the
  month-session-grid pattern above). Either way the aggregation (sum points
  per athlete, rank, tie-handling) happens client-side after the read, the
  same as every other derived value in this schema — there is nothing to
  aggregate at the database layer for a collection this size (at most ~3-4
  dozen tournament blocks in a season x up to 15 athletes each).
- **Per-session results** (`useTournamentResults(sessionId)`, and the
  results-entry screen's pre-fill) — `tournamentResults where sessionId ==
  :id`. A single equality filter on one field.
- **Per-athlete history** — an athlete's own tournament record —
  `tournamentResults where athleteId == :id`. Also a single equality filter
  on one field; the result set is small enough (a season's worth of
  tournaments for one kid) to sort client-side rather than needing an
  `orderBy` in the query.

## Indexes

All composite indexes live in `firestore.indexes.json`. Single-field lookups
(booking by `sessionId` alone, sessions by `date` alone) ride Firestore's
automatic single-field indexes and are not listed.

### 1. Season browsing — no composite needed (deploy-verified)

The Book-a-Session query — `sessions where date >= :today orderBy date,
__name__` — rides Firestore's automatic single-field index on `date`:
`__name__` is the implicit tiebreaker on every single-field index, so the
composite `(date ASC, __name__ ASC)` is redundant, and the deploy API rejects
it outright ("this index is not necessary, configure using single field index
controls"). The chronological-cursor property still holds, because session ids
are date-prefixed and blocks sort within a day (`-0`, `-1`, `-2`).

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
capacity reconcile that can rebuild `sessions.booked` from truth (count
non-cancelled bookings for a session and compare against the stored
counter).

**v1.4 note (Sprint 6):** this is **not** the query behind the coach's
attendance roster — the list a coach sees to mark a block IN/OUT. That list
must keep showing a booking after it flips to `attended` or `noshow` (a
booking that vanished from the roster the moment it was marked would be
useless for a coach reviewing who's already been checked), so it reads
*every* booking for the session regardless of status:
`bookings where sessionId == :id` alone. That is a single equality filter on
one field, which rides Firestore's automatic single-field index on
`sessionId` — no composite involved, and this one specifically. This
composite index stays in the file for the narrower reconcile query above,
which genuinely does filter on two distinct fields (`sessionId` and
`status`) — unlike [index 1](#1-season-browsing--no-composite-needed-deploy-verified)'s
redundant `(date, __name__)` case, a two-distinct-field composite is never
"not necessary" from Firestore's perspective, so it isn't at risk of the
deploy-time rejection; it's simply the index for a different, narrower query
than the roster now uses.

### 6. `contractLogs (athleteId ASC, date ASC)` — contract history

Serves: `contractLogs where athleteId == :id and date >= :monthStart and
date <= :monthEnd orderBy date` — the contract month grid, streaks, and
attendance percentage on the parent's child-detail screen.

### v1.3 query additions (Sprint 5) — no `firestore.indexes.json` changes

Every new/changed query the Sprint 5 hook seam needs was checked against the
existing composites and Firestore's automatic single-field indexes.
**Nothing was added** — each one either rides an index that already exists or
rides the automatic single-field index that a composite would duplicate:

- **`contractLogs` variable-minutes practice log** (`usePracticeLog`) — the
  read is `contractLogs where athleteId == :id and date >= :cycleStart and
  date <= :cycleEnd orderBy date`, the exact shape [index 6](#6-contractlogs-athleteid-asc-date-asc--contract-history)
  already serves. Contract v1.3 added fields (`contractMinutes`, `createdBy`,
  `createdAt`) to the document, not to the query's filter/sort clauses, so
  the existing 2-field composite is untouched and already sufficient.
- **`athletes where householdId == :id`** (`useHouseholdAthletes`, and the
  billing derivation) — a single equality filter with no `orderBy` on a
  different field. Firestore's automatic single-field index answers this
  directly. Adding a `(householdId ASC)` "composite" here is exactly the
  redundant-index shape production rejects at deploy time with "this index
  is not necessary, configure using single field index controls" — which
  aborts the whole `firestore deploy --only firestore:indexes` run, not just
  that one index. Left off the file entirely, on purpose.
- **`athletes where coachId == :uid`** (`useCoachRoster`) — same reasoning
  as `householdId` above: single equality filter, automatic single-field
  index, no composite.
- **`sessions` month range** (`useMonthSessions`) — `date >= :monthStart and
  date <= :monthEnd orderBy date` is a range filter and `orderBy` on the
  *same* field, the identical shape already established as composite-free in
  [index 1](#1-season-browsing--no-composite-needed-deploy-verified) (and
  deploy-verified there). Narrowing the range to one month instead of the
  whole season doesn't change which index type answers it.

If a future sprint adds a *second* sort/filter field to any of these four
queries (e.g. ordering the roster by name, or paginating billing rows), that
is the point a real composite becomes necessary — not before.

### v1.4 query additions (Sprint 6) — no `firestore.indexes.json` changes

Every Sprint 6 read/write pattern (booking transaction, attendance, parent
linkage — [pinned above](#booking-transaction-attendance-and-parent-linkage-contract-v14-sprint-6))
was checked against the existing composites and against what actually needs
an index at all. **Nothing was added:**

- **Attendance roster** (`bookings where sessionId == :id`) — a single
  equality filter on one field, so it rides Firestore's automatic
  single-field index on `sessionId`. See the v1.4 note on
  [index 5](#5-bookings-sessionid-asc-status-asc--session-roster) above for
  why this is a *different* (narrower, unindexed-by-composite) query than
  the one that index actually serves.
- **Booking-capacity transaction** — reads `sessions/{sessionId}` and writes
  `bookings/{athleteId}_{sessionId}` plus `sessions/{sessionId}.booked` by
  **document id**, never by query. Document gets/sets have no index
  implication at all.
- **Attendance status transition** — same reasoning: a
  `bookings/{athleteId}_{sessionId}` update by id, not a query.
- **Parent-created booking linkage check** — a rules-time comparison of
  already-resolved values (the caller's own `users` doc via
  `request.auth.uid`, the write's own `householdId` field, and one `get()`
  on the target `athletes` doc) evaluated at write time in
  `firestore.rules`. It is not a query the client SDK runs, so it has no
  index implication either.

If a future sprint adds a genuine second *query* dimension to the attendance
roster (e.g., a coach paging results, or ordering by athlete name), that is
the point a `(sessionId ASC, <field> ASC)` composite becomes real — not
before, and not the existing `(sessionId ASC, status ASC)` one, which already
exists to serve a different query.

### v1.5 query additions (Sprint 7 — RYP Tour) — no `firestore.indexes.json` changes

All three [Tour query patterns](#ryp-tour-query-patterns-v15-sprint-7) were
checked against the existing composites and against what actually needs an
index at all. **Nothing was added — expected, and worth spelling out why,
since a wrong guess here doesn't fail loudly in dev, it fails at `firebase
deploy --only firestore:indexes` in front of the whole team:**

- **Season standings** — either candidate shape is composite-free. The
  unfiltered collection read has no filter or sort at all, so there is
  nothing for a composite to serve. The date-range alternative
  (`date >= :start and date <= :end orderBy date`) is a range filter and
  `orderBy` on the *same* field — the exact shape already established as
  riding Firestore's automatic single-field index in
  [index 1](#1-season-browsing--no-composite-needed-deploy-verified) and in
  the v1.3 month-session-grid note above. Adding a `(date ASC)` "composite"
  for either shape is precisely the redundant-index case production's deploy
  API rejects outright ("this index is not necessary, configure using single
  field index controls") — and that rejection **aborts the entire indexes
  deploy**, not just this one entry, which is why this collection stays out
  of `firestore.indexes.json` on purpose rather than "to be safe."
- **Per-session results** (`tournamentResults where sessionId == :id`) — a
  single equality filter on one field, riding the automatic single-field
  index on `sessionId`. Same shape as the bookings-by-session case
  ([index 5](#5-bookings-sessionid-asc-status-asc--session-roster)'s v1.4
  note), just on a different collection.
- **Per-athlete history** (`tournamentResults where athleteId == :id`) — same
  reasoning again: single equality filter, automatic single-field index, no
  `orderBy` clause to force a composite.

If a future sprint adds a genuine second filter/sort dimension to any of
these three — e.g. standings scoped to a date range *and* a specific coach's
roster in one query, or paginating per-athlete history with a secondary
sort — that is the point a real `tournamentResults` composite becomes
necessary. Not before, and note the shape that would trigger it: two
*distinct* fields in the filter/sort clause, not a range-plus-orderBy on the
same field, which is what every query above already is.

## Seeding & emulator workflow

Both npm scripts live in the **root `package.json`** (created for this — the
repo root had none, and this is where `firebase.json` lives, so emulator
commands resolve their config; neither the CRA app in `frontend/` nor the
`functions/` package is the right owner for repo-level data tooling).

```
npm run emulator         # firestore :8080, auth :9099, emulator UI (firebase.json)
npm run seed:emulator    # seed the running emulator (env via scripts/emulator.env)
npm run sync:emulator -- --from ... --to ...   # calendar -> sessions sync (see above)
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
- seeds no dollar amounts, no Stripe ids (null), and no medical documents;
- seeds real `bookings` for all three Whitfield athletes against real
  generated session ids (contract v1.4) and increments each referenced
  session's `booked` to match — the same invariant the booking transaction
  maintains live, so `booked` and the `bookings` collection agree from the
  first seed rather than only after a QA pass exercises real bookings;
- seeds `tournamentResults` (contract v1.5) for two real generated Saturday
  tournament sessions, referenced by id and validated against `buildSeason()`
  the same way the bookings above are — a stale session id throws instead of
  silently writing an orphaned result. `position` only; no points value is
  ever written (see the collection's notes above). The referenced sessions'
  attendance (`bookings.status`) is kept coherent with the results — every
  athlete who has a result there is `attended`, not merely `confirmed`.
