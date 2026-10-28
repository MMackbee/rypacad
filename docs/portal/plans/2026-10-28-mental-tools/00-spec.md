# Yannick's mental-performance tools — design spec

Owner rulings 2026-10-28 (Makel Mackbee), in conversation. Branch `mental/tools`,
worktree `C:\Users\Mac\Desktop\rypacadapp\wt-mental`, cut from `develop` f96b676.
Ships through staging (rypacad.ryptest.com) to production before Tue Nov 3 2026,
beside Phil's assessments build (`assessments/v1.2`).

## 1. Intent and why

Yannick Artigolle is the academy's mental performance coach (portal role `mental`,
`users.specialistId == 'mental'`). From Nov 3 he runs three things in the portal:

1. **1:1 mental-game sessions** booked by families through Calendly (sessions
   `cal-<uuid>`, type `mental`, capacity 1). After each one he needs to write a
   private note about the athlete. He is also drafting a mental-performance
   **intake** he runs with every athlete in the first weeks; his question list has
   not arrived yet.
2. **The Commitment Contract.** Every athlete practices a set number of minutes
   a day, five days a week. Yannick checks who is logging their minutes, follows
   up with those who are not, keeps track of which athletes he has checked in
   with each week, and must be reminded of anyone he has not reached in more than
   two weeks.
3. (Outside the portal) a live seminar on rypacademy.com in the first week to
   introduce himself to parents and players. Separate piece of work, not in this
   spec.

Why now: the season starts Tue Nov 3; intakes run Nov 3-14; the contract is
presented to parents in person in week one and switched on after it.

## 2. Goals, non-goals, anti-goals

Goals
- Yannick can see every mental-game 1:1 he has, past and upcoming, by athlete.
- Yannick can write, edit and read a note per athlete per session, and a standing
  intake note per athlete, that **nobody else can read** — not the owners, not ops,
  not coaches, not the family. Enforced in Firestore rules, not only in the UI.
- Yannick can see who is logging contract minutes week by week, mark an athlete
  "checked in" for a week, and see who is overdue (no check-in in more than 14 days).
  Overdue athletes are pushed to him without him opening the board.
- The contract's tier rule becomes the owner's rule: **20 minutes a day, 5 days a
  week; 10 minutes a day if the athlete is under 12.** No tier picker.
- All of it stays off for families until the owner turns the contract on after
  the first week.

Non-goals
- Yannick's intake form. His questions have not arrived; this release gives him a
  free-text intake note per athlete. When the questions come, they become fields
  on that note (a later, small change).
- Parent- or athlete-facing views of Yannick's notes or check-ins.
- Changing how 1:1s are booked (Calendly stays the booking path).
- The seminar page on the website (own task).

Anti-goals (what would make this a failure even if it works)
- Anyone but Yannick reading a note. Notes may contain clinical disclosures about
  minors (Weekly Call Notes, Oct 5).
- Families seeing contract copy, tiers or a log screen before the owner flips the
  switch. Mike's ruling of 2026-09-30 (hidden until explained in person) stands
  until the owner says otherwise.
- A family's practice logging or an athlete's contract history breaking because
  of the tier change.

## 3. People and permissions

| Who | Notes (per athlete) | Check-ins | Contract board | Practice logs |
|---|---|---|---|---|
| Yannick (`role mental`) | read, write, delete own | read, write | read | read all |
| Owner, ops | **none** | read | read | read all (as today) |
| Coaches | none | none | none | as today (none) |
| Athlete (own login) | none | none | none | write own, read own (as today) |
| Parent | none | none | none | **write and read for every athlete in the household** (new, owner 2026-10-28) |

**Family contact (Claude's call, 2026-10-28):** `households` read is widened to
`role mental` so Yannick's athlete page can show the parent's name, email and
phone for follow-up (today households are readable by the family, ops and owner
only, `firestore.rules` ~1211). He already reads every athlete's medical
subcollection, which is the more sensitive data. Coaches stay as they are. The
athlete page shows only guardian name, email and phone from the household doc,
never billing fields.

Rules facts the builder relies on: `users/{uid}.role == 'mental'` identifies
Yannick; `me().get('specialistId', null) == 'mental'` is the same account. There
is exactly one such account in production (`yannick@rypgolf.com`). The notes
rules key on **role `mental`** (not on a uid), so a replacement mental coach
inherits the tools and the previous coach loses them when their role changes.
The owner accepts that an owner can grant themselves the role in the console;
the rules cannot stop the database owner, and the spec records that this is
understood.

## 4. Data model

### 4.1 `mentalNotes/{athleteId}/entries/{entryId}` — Yannick only

One document per note. `entryId` is `intake` for the standing intake note and
`<sessionId>` for a session note (so a session has at most one note; a second
save edits it), or `free-<random>` for a note not tied to a booking.

| Field | Type | Notes |
|---|---|---|
| `athleteId` | string | matches the parent doc id |
| `kind` | `'intake' \| 'session' \| 'free'` | |
| `sessionId` | string \| null | the `cal-<uuid>` session for `session` notes |
| `sessionDate` | string \| null | `YYYY-MM-DD` academy date of that session, denormalized for listing |
| `body` | string | the note, max 8,000 characters |
| `createdBy`, `updatedBy` | string | uid; rules pin both to the caller |
| `createdAt`, `updatedAt` | timestamp | server time, rules-pinned |

Rules: `allow read, create, update, delete` only if `me().role == 'mental'`
(create/update also pin `createdBy`/`updatedBy == request.auth.uid`, timestamps
`== request.time`, field set exact, body length). No other branch. The parent
doc `mentalNotes/{athleteId}` is never written. The Athletes list (§5.1) needs
"has an intake note / latest note date" for ~45 athletes at once, so add a
collection-group rule `match /{path=**}/entries/{entryId} { allow read: if
me().role == 'mental' }` (precedent: the diagnostics collection-group rule,
`firestore.rules` ~501-507) and query `collectionGroup('entries')` once.

Why its own top-level collection and not `athletes/{id}/private`: the existing
`athletes/{id}/medical` branch is readable by the assigned coach and owners, and
the builder must not widen or narrow that. A separate root keeps the "mental only"
rule one short, auditable block.

### 4.2 `contractCheckins/{athleteId}_{weekStart}` — Yannick writes, owners read

| Field | Type | Notes |
|---|---|---|
| `athleteId` | string | matches id prefix |
| `weekStart` | string | Monday, `YYYY-MM-DD` (America/Chicago) |
| `checkedIn` | boolean | true when Yannick has spoken with the athlete or family that week |
| `by` | string | uid |
| `at` | timestamp | server time |

Rules: create/update/delete by `role mental` with the id pinned to
`athleteId + '_' + weekStart`; read by `mental`, `ops`, `owner`. Unchecking is a
delete.

### 4.3 Contract tier becomes a rule, not a choice

`athletes.contractMinutes` stays the field the logs snapshot
(`contractLogs.contractMinutes`) and the calendar reads, so history keeps working.
What changes:

- **The required minutes are derived from age**, by one pure function
  `contractMinutesFor(athlete, onDateISO)`: `10` if the athlete is under 12 on that
  date (dob present), else `20`. No dob = 20 (the builder's default; the owner may
  change it).
- **The five days are Monday to Friday**, exactly as the family's contract
  calendar already works (`data/calendar.js`: weekends are not contract days, the
  month grid and its "behind" tally stay as they are). A week is "met" when all
  five weekdays have a log with `minutes >= required`. *Claude's call (2026-10-28):
  the owner said "5 days a week"; the existing weekday model is that rule, and
  keeping it means the family screens are not rebuilt a week before launch. If the
  owner wants "any 5 of 7", the family calendar, dashboard card, household card,
  admin "behind" list and `liveContractState` all move to a week model: a
  separate, larger change.*
- **`athletes.contractMinutes` may be 10.** The athletes rules' accepted tier list
  (`[20, 45, 90, 95]`, `firestore.rules` ~274 and ~300) and the writer in
  `hooks/live.js` (~1686) gain `10`; DATA-MODEL's `20 | 45 | 90 | null` becomes
  `10 | 20 | 45 | 90 | null`. This widens an existing `allow`, never narrows one.
- The tier picker (`NoContract`, the sign-up contract step, AthleteDetail's "Start
  a contract" card) goes: an athlete is on the contract as soon as the switch is
  on. `setTier` callers are replaced by a one-time stamp of `contractMinutes` (the
  derived value) and `contractStart` the first time the athlete opens the contract
  screen or the first log is written, under the existing rule (`hasOnly
  contractMinutes, contractStart`). Existing values of 45/90 on any athlete are
  left alone in the database but the screen shows the derived requirement and the
  log snapshots the derived value from now on.
- `REACT_APP_CONTRACT_ENABLED` keeps gating every family-facing surface. **The
  board, notes and check-ins are not behind it** (Yannick sees them from Nov 3;
  the board simply shows no logs until families start).
- Under-12 is computed from `athletes.dob`; the age boundary is the athlete's
  12th birthday (on and after it: 20 minutes). The log snapshot keeps the value
  that applied that day, so a birthday mid-season changes nothing retroactively.
- **Parents log for their kids (owner, 2026-10-28).** Today only the athlete's own
  login may write a `contractLogs` doc (`firestore.rules` ~1140), the contract
  route is athlete-only (`PortalRoutes.js` ~764) and `liveAthleteIdentity` throws
  for an account without `users.athleteId` (`hooks/index.js` ~347). A kid without
  their own login (parent-run, most under-12s) therefore cannot log at all. This
  release adds the parent path: `contractLogs` create, update and delete are also
  allowed when `me().role == 'parent'` and the log's athlete belongs to the
  caller's household (the same `athleteData(...).householdId == me().householdId`
  test the read rule already uses), with `createdBy` pinned to the parent's uid;
  the parent's athlete page (`AthleteDetail`) gets the same month calendar and
  "Log today" sheet the athlete screen has, for that kid, behind the contract
  switch; the contract hooks take an explicit `athleteId` instead of relying on
  the signed-in identity. An athlete with their own login keeps logging from
  their own screen; a parent logging the same day overwrites the same doc
  (`{athleteId}_{date}`), never a duplicate.

### 4.4 Overdue reminder

A scheduled job, Monday 08:00 America/Chicago (`functions/index.js` pubsub
schedule, same pattern as `tokenExpiryReminders`), runs only while
`config/contract.enabled` is true (§6). **Who is on the contract:** every athlete
of a household that is not `test: true` and whose membership allows booking
(`lib.membershipAllowsBooking`, the same gate `tokenExpiryReminders` uses, so
unpaid, lapsed and past-due athletes are left out). **Overdue:** the athlete's
latest `contractCheckins` doc with `checkedIn == true` is more than 14 days old,
or there is none and more than 14 days have passed since the later of
`config/contract.enabledAt` and the athlete's `createdAt` (so a never-contacted
kid becomes overdue two weeks after the contract starts or after they join,
whether or not they log). The email goes **directly to the `mental`-role user's
email** with `email.sendEmail`, the way `scholarship.js` emails the director; no
new notification category, so nothing new appears on the family's notification
settings. Zero overdue = no email. The same list is what the board shows under
"Due for a check-in", computed by the same pure function
(`overdueCheckins({athletes, checkins, today, enabledAt})`), so the email and the
screen never disagree.

## 5. Screens (Yannick's, role `mental`; owner and ops see the board read-only)

Tab bar for `mental` gains two tabs: **Athletes** and **Contract**. Sessions and
Tour stay. The Contract tab's key must not be `'contract'`: `BottomTabBar.js`
(~120) hides that key while `REACT_APP_CONTRACT_ENABLED` is off, and Yannick's
board is not behind the switch. Use `'mental-contract'`.

1. **Athletes** (`/portal/mental`): every athlete in the academy (he already reads
   all athletes), searchable, each row showing next/last 1:1 date, whether an intake
   note exists, and the latest note date. Tap = athlete page.
2. **Athlete page** (`/portal/mental/:athleteId`): name, age, family and parent
   contact as the roster shows coaches; **Intake** card (open the intake note);
   **Sessions** list of the athlete's `mental` bookings (from `bookings` where
   `athleteId` and `type == 'mental'`, joined to `sessions`), each with "Write
   note" / "Edit note"; **Other notes**; a small contract summary (this week's
   days, required minutes, last check-in).
3. **Note editor**: full-screen textarea, autosaves on blur and every 10 s while
   typing, shows "Saved · 10:42" / "Not saved yet" the way the assessments save
   tracker does (reuse `hooks/assessmentSaves.js` if it has merged; otherwise a
   small local tracker). Delete with a confirm step built into the page.
4. **Contract board** (`/portal/mental/contract`): three groups — **Due for a
   check-in** (overdue first, oldest first), **This week** (everyone else, sorted
   by fewest days met), **Checked in this week**. Each row: athlete, age, required
   minutes, this week `n/5` with the days as seven dots (met / logged-short /
   none), last week `n/5`, last check-in date, a **Checked in** toggle. A week
   switcher goes back week by week. Owners and ops see the same board without
   the toggle.
5. **My Sessions** (existing `SpecialistDay`): each mental session row gains a
   "Note" chip that opens the note editor for that session's athlete. Nothing
   else changes there. That list is today-forward only (`hooks/index.js` ~1557),
   so a note for a past session is written from the athlete page's Sessions list,
   which reads `bookings` directly.

Layout: phone first (430 px column like the rest of the staff screens); the board
also fits a tablet. No desktop-only layout.

Seed mode (`isLive() === false`) gets fixtures for two athletes, three sessions,
one intake note, and two weeks of logs and check-ins, so the screens appear in
`StatesHarness` and in tests.

## 6. The switch

`REACT_APP_CONTRACT_ENABLED` (CRA build-time) stays the family-facing switch. Add
a server-readable mirror the job can use: `config/contract` `{ enabled: boolean,
enabledAt }`, owner-writable, readable by staff. The owner's run of flipping it on:
set the Railway variable (production) and set `config/contract.enabled = true`
with a one-line script `scripts/set-contract-flag.mjs --prod --on --dry-run / --yes`
(dry-run only for Claude). Until `enabled` is true the Monday job sends nothing.

## 7. Backward compatibility and release

- Staging shares the production backend: every rules and function change here is
  additive (new collections `mentalNotes`, `contractCheckins`, `config/contract`;
  a new scheduled function; a new notice category). No existing `allow` is
  narrowed. The live portal on `main` must keep working with the new rules
  deployed (Task 27-style check: `git diff origin/main -- firestore.rules` shows
  no removed `allow`).
- The tier change touches family-facing code only behind
  `REACT_APP_CONTRACT_ENABLED`, which is off in production and staging today.
- Order: merge `mental/tools` into `develop` when complete and reviewed; owner
  deploys functions + rules to production; `git push origin develop` (staging);
  owner and Yannick test at rypacad.ryptest.com with Yannick's real login and the
  RYP Test Family (from the assessments release); `git push origin develop:main`.
- Both branches (`assessments/v1.2`, `mental/tools`) edit `BottomTabBar.js`,
  `PortalRoutes.js`, `firestore.rules`, `functions/index.js`, `seed-firestore.mjs`
  and `verify-rules.mjs`. Whichever merges second resolves; the integrator checks
  the mental tab set and the assessor tab both render.

## 8. Testing

- Jest: `contractMinutesFor` (11 years 364 days → 10; 12th birthday → 20; no
  dob → 20), week math across DST (Nov 1 2026) and year end, `overdueCheckins`
  (never checked in but logging for 15 days → overdue; checked in 13 days ago →
  not; 15 → overdue), board grouping and sorting, note autosave states.
- Rules probes (a new section of `scripts/verify-rules.mjs`, which is one file
  with inline sections; or `scripts/rules-probes/mental.mjs` if the assessments
  branch's probe loader has merged by then): owner, ops, coach, parent, athlete
  and Phil all get `PERMISSION_DENIED` on every `mentalNotes` read and write;
  Yannick reads, writes and deletes; check-in id pinning; owners read check-ins
  and cannot write them; `config/contract` owner-only write; a parent logs for
  their own kid and is refused for another household's kid; `contractMinutes`
  10 accepted on the athlete doc; `mental` reads a household.
- Functions: the Monday job with a stand-in Firestore: zero overdue sends nothing;
  one overdue sends one email naming the athlete; the switch off sends nothing.
- Browser QA on the emulator as Yannick (seeded `mental` account): write a session
  note from My Sessions, see it on the athlete page, sign in as the owner and
  confirm the athlete page shows no notes and the rules refuse the read; mark a
  check-in and see the row move groups.

## 9. Left to the builder

- Exact copy on the board and editor (plain, no jargon; "Checked in" not
  "touchpoint").
- Whether the Athletes list paginates (production has ~45 athletes; a plain list
  is fine).
- Index needs for `bookings` by `athleteId` + `type` and `contractLogs` by
  `athleteId` + `date` range (add to `firestore.indexes.json` if the emulator asks).
- Where "last 1:1" comes from when the booking is older than the sessions window
  the app keeps (read `bookings` directly; do not widen the sessions window).

## 10. Open items for the owner and Yannick (not blockers)

- Yannick's intake questions (free text until then).
- The seminar: no date set and the platform is undecided (owner, 2026-10-28). A
  "Meet Yannick" page on rypacademy.com with an embedded YouTube Live player is
  the suggested shape; nothing is built until the date and platform are picked.
