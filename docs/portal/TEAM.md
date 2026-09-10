# Portal team — process and data contract

Four agents build this portal. Definitions live in `.claude/agents/` at the
workspace root (machine-local); this file is the committed source of truth for
how they work together.

| Agent | Owns | Never touches |
|---|---|---|
| `frontend-dev` | `portal/screens`, `portal/components`, `tokens.js`, `StatesHarness.js` | hooks, data/, rules |
| `data-routing` | `portal/hooks`, `portal/data`, `PortalRoutes.js`, `App.js` routing, `firestore.rules` | screen styling, schema/indexes |
| `db-engineer` | `docs/portal/DATA-MODEL.md`, `firestore.indexes.json`, `scripts/` seeds, emulator config | rules, screens, hooks |
| `pm-senior` | Review + merge gate on everything | pushing, deploying |

## Workflow

1. A specialist gets a task, creates a **worktree** off `portal/r3`
   (`git worktree add ../wt-<agent> -b agent/<agent>/<task> portal/r3`), works
   only there, commits to its branch. Parallel agents never share a checkout.
2. The specialist **verifies** (esbuild bundle exits 0; emulator/node for
   non-UI work) and reports: branch, files, how verified, open questions.
3. `pm-senior` reviews the diff against this file and the handoff docs, then
   **merges into `portal/r3`** or bounces with concrete change requests.
4. Nothing is ever pushed or deployed by an agent. Deploys (hosting, rules,
   functions) are the user's explicit call.

Interface changes (hook payload shapes, document schemas) are proposed in the
agent's report and land in this file **before** dependent code is written
against them.

## Data contract v1 (Firestore, project `rypacad`)

Pinned so the three lanes can build in parallel. Extensions welcome via PM;
contradictions are not.

- `users/{uid}` — role: `athlete | parent | coach | mental | ops | owner`,
  plus `athleteId` (athlete) or `householdId` (parent) or staff flags. The
  routing rules key off this doc.
- `households/{householdId}` — guardian contact, `stripeCustomerId`,
  `stripeSubscriptionId`. **Never card data.**
- `athletes/{athleteId}` — name, dob, `householdId`, `packageId`,
  `contractMinutes` (20|45|95|null), `coachId | null`. Medical/emergency info
  lives in `athletes/{id}/private/medical` so rules can scope it to
  live-session staff only.
- `packages/{packageId}` — the catalog from `portal/data/packages.js`
  (id, name, price, training, tournaments). Elite carries its null Phil/Yannick
  counts as nulls.
- `sessions/{sessionId}` — id is the generator's `YYYY-MM-DD-<block>`;
  fields: date, time, type (`training|tournament`), capacity, booked,
  `coachId | null`, `label | null`, `special`, `overflow`. Seeded from
  `generateSeason()` — never retyped by hand.
- `bookings/{bookingId}` — athleteId, sessionId, date, type,
  pool (`training|tournaments`), status (`confirmed|cancelled|attended|noshow`),
  householdId, createdBy, createdAt. Allowance usage per cycle is **derived**
  by querying bookings; there is no stored counter to drift.
- `contractLogs/{athleteId_date}` — athleteId, date, minutes.

### v1.1 ratifications (PM, Sprint 1 review)

- **Booking id is `{athleteId}_{sessionId}`** — the keyspace enforces one
  booking per athlete per session; re-booking after a cancellation flips
  `status` on the same doc. Rules enforce the id format on create.
- **`packages.kind`**: `golf | drop-in | fitness | elite` discriminator.
- **`coachId` is the coach's auth uid** on both athletes and sessions.
- **Live errors are user-facing**: anything `live.js` throws that reaches a
  screen carries a plain-language `message`; SDK errors are wrapped, never
  surfaced verbatim.
- **Allowance semantics**: `cancelled` bookings never spend; `confirmed`,
  `attended` and `noshow` spend. The 12-hour late-cancel nuance lands with the
  cancellation flow and its own rules.
- **Deploy gate**: the v1 rules remove the legacy `/{document=**}` catch-all,
  which cuts the 2025 app's collections off from clients. Rules do not deploy
  until that migration is sequenced, and deploys are the user's call.
- **Prices**: seeds never carry dollar amounts; `packages.price` reaches the
  live project only via a user-approved import at deploy time.

Access matrix (routing implements in rules; the handoff's table is the spec):
athlete → own records; parent → linked athletes, reflection **summaries only**;
coach → assigned athletes only; mental → academy-wide reads, all logged;
ops → completion/billing/enrollment, no coaching or mental writes; owner → all.

## Onboarding program v1 (pinned for Sprint 3)

A guided first-run walkthrough for parents and athletes, built as **practice
mode on the real screens** — no tour overlays, no duplicated mock screens. The
learner performs each core action once on practice data: a parent books a
practice session through the real Book a Session flow; an athlete logs a
practice contract day and watches the real grid update.

Pinned interfaces:
- `screens/OnboardingFlow.js` (frontend lane) — default export, props
  `{ track: null | 'parent' | 'athlete', bare }`; null renders the track
  chooser. Route `/portal/welcome` (+`?track=`), added by the frontend lane
  under a standing PM exception for this one line in PortalRoutes.
- `hooks/onboarding.js` (routing lane) — `useOnboardingStatus()` returning
  `{ completed: {parent, athlete}, markComplete(track), reset() }`, backed by
  localStorage keys `ryp.onboarding.parent` / `ryp.onboarding.athlete`.
  Future home is `users.onboardedAt` (contract v1.2 candidate; needs a
  diff-key rules allowance — not this sprint).
- `useBooking` / `useSchedule` accept `{ practice: true }` (routing lane):
  practice forces the seed source regardless of REACT_APP_PORTAL_LIVE_DATA.

Invariants: practice mode performs **zero Firestore writes** — practice
entries are component state, visibly badged PRACTICE, and reset on exit.
Stepper chrome reuses Registration's step-header pattern; instruction copy is
plain language; steps advance on the real action completing (confirmation
reached, day logged), never on "Next" alone — with a skip affordance always
visible. Practice data is the existing seed (Whitfield family); nothing new is
invented.

## Sprint 4 pins — booking live end to end

Contract v1.2 extensions:
- `sessions.status`: `'scheduled' | 'cancelled'` (default scheduled). The
  calendar sync sets cancelled — never deletes — when a calendar instance
  disappears but the session has bookings, so families are told rather than
  ghosted. Sessions with no bookings whose instance disappears are deleted.
- `sessions.gcalEventId`: the calendar instance id a synced session came from
  (null for generator-seeded sessions).
- The calendar sync is a **sanctioned production writer** (with
  provision-owner, provision-family, and the future billing integration; all
  share scripts/lib/prod-auth.mjs). It maps events by the
  title convention — `Training block` → bookable training, `Tournament` →
  bookable tournament, anything else skipped (display-only) — with session id
  `YYYY-MM-DD-<n>` by start-time order within the day. Emulator by default;
  `--prod` targets production and a prod write requires `--yes` after a
  printed plan. All prod runs are user-gated commands.
- provision-family.mjs stands up the four-account test family: the packages
  catalogue (bundled from packages.js, price stripped), the `mackbee`
  household, the `makel-test` athlete (g-8-3, 45-min tier), and a users doc
  per account — owner makel@rypgolf.com, athlete makelmackbee@gmail.com,
  parent makelmackbee@live.com, coach makel@pixelcaddie.com. Uids resolve
  from emails via Identity Toolkit, so each account signs in once first;
  idempotent re-runs fill in accounts that were missing.

Auth seam (pinned so frontend and routing build in parallel):
- `useAuthSession()` (routing lane, replaces the scaffold stub) returns
  `{ user: { uid, email, role, athleteId, householdId } | null,
     provisioned: boolean, loading, error, signIn(), signOut() }`.
  signIn() runs the existing Google popup (src/firebase.js provider);
  role resolution reads users/{uid}; a signed-in account with no users doc
  returns user with role null and provisioned false.
- `<RequireRole roles={[...]}>` guard (routing lane, exported from
  PortalRoutes or hooks) wraps role-gated routes; unauthenticated → SignIn,
  provisioned-but-wrong-role → /portal/unauthorized equivalent.
- Frontend owns the SignIn screen wiring to that hook (its four states are
  already designed), the not-provisioned screen, role-based landing after
  sign-in (athlete → home, parent → family, coach → coach, staff → admin),
  and a "Replay the walkthrough" row in Notification Preferences' screen
  footer area.

## Invariants every lane honors

- Two-pool allowances: training and tournaments never substitute.
- No invented data: no fabricated names, coaches, bays, prices, or counts.
  Session names are "Training block"/"Tournament block" plus real event labels.
- Real calendar: dates derive from the device's today (date-fns/FullCalendar);
  the season generator is the schedule feed until Google Calendar replaces it
  (`@fullcalendar/google-calendar` + API key, socket ready in
  `ContractCalendar`/`season.js`).
- Live data sits behind `REACT_APP_PORTAL_LIVE_DATA` with seed fallback.
- Minors' data minimization; MFA required for staff roles at setup.

## Sprint 5 pins — user acceptance punch list (2026-08-31)

Source: owner's first full four-role test. Rulings and interface pins below;
lane split lives in the agent tasks.

Data contract v1.3 (db lane owns the rules/docs diff):
- `contractLogs/{athleteId}_{date}`: `{ athleteId, date, minutes,
  contractMinutes, createdBy, createdAt }`. One log per athlete per day —
  the doc-id keyspace enforces it exactly like bookings. `minutes` is the
  real practiced amount (variable; 90 logged against a 45 contract is ONE
  fulfilled day that recorded 90 — extra minutes never bank extra days).
  `contractMinutes` is a snapshot of the tier at log time so history
  survives tier changes. Fulfilled = minutes >= contractMinutes.
- Closures are schedule facts, not practice facts: contract logging is
  legal on ANY date (kids practice outside the academy). The contract
  calendar drops the 'closed' state entirely; closures still matter to
  session booking only.
- athletes reads: parent may read athletes where householdId == theirs
  (list query must carry the equality filter the rules can prove); coach
  may read athletes where coachId == their uid; staff read any.
- Billing rows derive from athletes×packages (one row per child, package
  name + monthly price from packages.js source, status 'active'
  placeholder) — no Stripe wiring this sprint.

Hook seam additions (routing lane owns; frontend codes against these):
- `useHouseholdAthletes()` -> `{ data: [{ id, name, packageId, packageName,
  allowance }] }` — every athlete in the signed-in parent's household.
- `useBillingSummary()` -> `{ data: { rows: [{ athleteId, name, packageName,
  price, status }] } }`.
- `useMonthSessions(monthISO)` -> `{ data: { month, days: [{ date,
  sessions }] } }` — bookable sessions grouped by date for one calendar
  month, for the booking calendar.
- `usePracticeLog()` -> adds `logPractice({ minutes })` and exposes
  `totalMinutes` for the cycle alongside the day grid.
- `useCoachRoster()` -> every athlete assigned to the coach — a real
  roster, not one session's attendance.
- Athlete detail routes by id: `/portal/athlete/:athleteId`. Parent: only
  athletes in their household; staff (ops/owner/mental): any athlete.
  PortalRoutes passes `athleteId` into the screen; screens never read
  route params directly.
- Sign-out: `useAuthSession().signOut()` already exists — every role gets
  a visible affordance (frontend lane).

UI rulings (frontend lane):
- Athlete dashboard: Code of Grit card removed.
- Book a Session becomes a month calendar in the commitment-contract
  calendar's visual language: tap a date -> that day's sessions ->
  select -> confirm. Empty months say plainly that no sessions are
  scheduled yet.
- Coach: session start is never time-gated (always startable); fix the
  start-session submit; Overview / Students / Sessions must be three
  genuinely different views; the Me tab is removed from the coach tab bar.
- Parent: children list navigates per child; "Link another athlete" moves
  to Settings; Billing lists one row per child.
- Admin: fix the All-tiers filter; athlete names link to
  /portal/athlete/:id (contact info lives there).

Direction-only this sprint (structural seams, no invented integrations):
- DNA modules gain `source: 'measured' | 'self' | 'upload' | 'parallax'`;
  self-reported modules get an entry form, upload modules a dropzone stub,
  Parallax stays a named seam with no API invented.
- Diagnostic capture trims to what is assessable in the indoor facility;
  the rest is deferred, not faked.

## QA testing (2026-08-31)

Fifth team role: `qa-tester` (definition in `.claude/agents/`) — tests in
the browser under every role, files a defect report to the PM, never fixes.

The sandbox: `REACT_APP_USE_EMULATORS=true` connects the app to the local
emulators (auth :9099, Firestore :8080) and exposes
`window.__rypTestAuth.signInAs(uid)` / `.signOut()` — sign-in via UNSIGNED
custom tokens the auth emulator accepts, so no passwords exist anywhere in
the QA flow, and none of it can ship: the hook and emulator connection are
compiled out unless the env var is set at build time.

Test-account suite (users/ doc ids in the seed, one per role):
`athlete-jordan` (Whitfield household, g-8-3), `parent-dana`,
`coach-luke`, `owner`, `mental`, `ops`.

Standing posture: production dev server on :3000 (real Firebase), QA
server on :3001 (`PORT=3001 REACT_APP_USE_EMULATORS=true npm start`),
emulator seeded via `npm run seed:emulator` plus a calendar sync
(`npm run sync:emulator -- --from ... --to ...`) so QA runs against the
real season's data shape. Emulator writes are encouraged — a QA booking
exercises the deployed rules' exact logic locally.

## Sprint 6 pins — QA defect burn-down (2026-08-31, QA report on file)

Theme: the five major defects are one disease — surfaces never live-wired
plus no post-write refresh. Fix the disease, not five symptoms.

Rulings (PM):
- Past sessions read CLOSED/ended and are not startable — "never
  time-gated" forbids PRE-start gates only (QA #9: by design, no change).
- Admin outstanding-list name links stay inert until admin reads live data
  (QA #11: documented, deferred).
- Booking capacity is enforced client-transactionally (QA #5): booking =
  one Firestore transaction (read session, require booked < capacity,
  create booking, update booked+1). Rules addition: sessions update
  allowed ONLY when the diff is exactly booked+1 within capacity (and
  booked-1 >= 0 for future cancellation), by a signed-in portal user.
- Attendance persists as bookings.status (QA #7): coach IN -> 'attended',
  OUT -> 'noshow'; rules allow the assigned coach (athlete.coachId ==
  caller) to update ONLY the status field between
  confirmed|attended|noshow.
- Parents can book (QA #2): sessions readable by role parent; bookings
  create allowed for a parent whose householdId matches the booking AND
  the athlete doc; BookSession gets a child selector when the signed-in
  user is a parent (pinned hook: useHouseholdAthletes already returns the
  choices; the screen passes athleteId through to book()).
- Live-wiring completeness (QA #3, #4): useAthleteDashboard (allowance,
  next session — derived from real bookings, nothing invented),
  useHousehold's per-child cards, and useContract's day grid (from
  contractLogs; fulfilled = minutes >= contractMinutes) all read live when
  isLive(). No screen may show seed numbers in live mode.
- Post-write refresh (QA #3/#5/#7 friction): routing owns one small
  invalidation seam — after createBooking / createContractLog / attendance
  update, dependent hooks re-run (generalize usePracticeLog's refreshKey;
  no global state library).
- useAthleteDetail in live mode ALWAYS fetches the passed athleteId — the
  seed-kid-id shortcut caused QA #1 (always-Jordan) and is removed.
- createBooking rejections are wrapped in plain language (QA #8): the
  duplicate case says the athlete already has this session booked.

## Recurring booking pins (owner's ruling, 2026-09-01)

- Recurrence = same weekday + same time, weekly, from the first booked
  session through a chosen end date. Offered AFTER a successful single
  booking, on the confirmation screen — the one-tap single flow is
  untouched.
- CAP RULE: each booking spends its own month's allowance, and the
  recurrence never books past the monthly limit for its pool — when a
  month's pool is exhausted it SKIPS to the next month (which resets).
  Full sessions, missing weeks, and already-booked sessions are skipped
  and reported, never errored.
- Every recurring instance is the same individual booking transaction
  (capacity check + booked+1); no new collection, no rules change — the
  cap is client-derived exactly like the allowance itself.
- The summary is honest: booked N, skipped M with reasons.

## Sprint 7 pins — RYP Tour, billing parked, parent booking front and center (2026-09-10)

Owner's direction: billing is OUT of the app for now (energy goes to
features); a "RYP Tour" leaderboard tracking weekend tournament results is
IN; parents booking for kids is a first-class path (many kids will never
have their own login).

Data contract v1.5 (db lane documents; routing lane implements rules):
- `tournamentResults/{sessionId}_{athleteId}`: { sessionId, athleteId,
  date, position (int >= 1), createdBy, createdAt }. The keyspace gives
  one result per athlete per tournament. POINTS ARE NEVER STORED —
  position is the fact; points derive at read time from the table in
  `data/tour.js`, so tuning the points table retroactively rescores the
  whole Tour (same derive-don't-store rule as allowances).
- `data/tour.js`: TOUR_POINTS = [100, 80, 65, 55, 50, 45, 40, 36, 32, 28,
  24, 20, 16, 12, 8] (positions 1..15, matching capacity; beyond the
  table = 5 participation points). Owner-tunable placeholder — the table
  is the single knob.
- Standings = sum of an athlete's points across the season window,
  ranked; ties share a rank. Events-played count shown alongside.
- Rules: tournamentResults create/update by coach + staff roles only
  (shape-checked, id must equal `{sessionId}_{athleteId}`, position int
  1..40, date matches the session); readable by any signed-in portal
  user (standings are public inside the academy). No delete in v1 —
  corrections overwrite via update.

Hook seam (routing owns; frontend codes against):
- `useTourStandings()` -> { data: { standings: [{ athleteId, name, rank,
  points, events, wins }], events: [{ sessionId, date, label,
  top3: [{name, position}] }] }, loading, error } — seed fallback with a
  believable demo tour; live derives from tournamentResults + athletes.
- `useTournamentResults(sessionId)` -> existing results for one session +
  `saveResults(entries)` writing the batch (coach/staff only), entries =
  [{ athleteId, position }].
- Routes: `/portal/tour` for athlete, parent, coach, ops, owner, mental.
  Parent's Billing tab is REPLACED by Tour; athlete tab bar gains Tour in
  the retired DNA slot. /portal/billing route redirects to /portal/family
  (screen survives in the harness for Stripe's return).
- Book-for-kid deep link: BookSession accepts `initialAthleteId`; the
  route wrapper reads it from navigation state; ParentDashboard kid cards
  gain a per-kid Book action that navigates with that state.

UI (frontend lane):
- 'RYP Tour' screen: season standings (rank, name, events, points, wins
  highlighted), recent tournaments with podium; empty state before any
  results ("The Tour starts with the first Saturday tournament").
- Results entry: from a TOURNAMENT session's attendance screen, staff see
  "Enter results" — tap athletes in finishing order (1st, 2nd, ...),
  reorder/undo, save once; re-entry pre-fills existing results.
- Parent tab bar: Home / Tour / Settings. Athlete: Home / Schedule /
  Contract / Tour.

## Sprint 7 integration — contract v1.5.1 amendment (PM merge, 2026-09-10)

All three lanes merged clean (db 0aeb603, routing ccdc67f, frontend
17095f7). Two open questions from the lane reports, resolved at merge:

1. NAME VISIBILITY (routing's flag): under the v1.5 rules, live Tour
   standings resolved athlete names per the existing "own records only"
   athletes matrix — mental/ops/owner saw every name, but an athlete,
   parent or coach saw `null` for every kid outside their own visibility,
   defeating the academy-wide leaderboard. RESOLVED as v1.5.1: each
   tournamentResults doc now carries `name` (string | null) — the
   athlete's display name snapshotted AT WRITE TIME from the roster the
   staff member entering results is already reading. Display
   denormalization only: points stay derived, the athletes read matrix is
   untouched ("cross-family reads impossible" holds — name alone travels,
   never dob/householdId/contractMinutes). Read paths prefer the stored
   name and fall back to the per-id athlete join only for docs written
   before the amendment. Rules require the key on every write (string or
   null). Options (a) athletePublic directory and (c) accept-nulls were
   rejected: (a) adds a second writable collection for one field, (c)
   ships a leaderboard most roles can't read.

2. MENTAL ROLE ON RESULTS ENTRY (db lane's question): stands as
   implemented — create/update by coach + the existing staff set (mental,
   ops, owner), matching the pin's "coach + staff" as this codebase has
   always defined staff. Narrowing mental out would be a new distinction
   no other collection draws.

Also closed at integration:
- Sync delete-guard gap (db lane's flag): sync-calendar-sessions.mjs now
  reads tournamentResults session ids and treats a results-bearing
  session like a booked one — cancel, never delete, both in the
  moved-instance and removed-instance branches.
- useTournamentResults shape reconciled in Roster.js (frontend lane's
  guess was a bare array; the pinned envelope is { results: [...] }), and
  results entries now carry the v1.5.1 name snapshot.
- /portal/tour now resolves the signed-in role (TourRoute) so parents get
  the parent tab bar, not the athlete default.
- Parent onboarding walkthrough's Billing step replaced by a Tour +
  notifications step (billing is parked; the walkthrough taught a tab
  that no longer exists).

## Sprint 7 addendum — scoring retune + rules hotfix (2026-09-10, same day)

- RULES HOTFIX: firestore.rules strings have no `substring()` — the
  emulator rejected EVERY tournamentResults write with "Function not found
  error: Name: [substring]" (caught in the integration browser pass; the
  routing lane had no emulator available and self-reviewed). The
  date-matches-sessionId check is now a matches() pair: `date` pinned to a
  literal `[0-9]{4}-[0-9]{2}-[0-9]{2}` (regex-inert), then
  `sessionId.matches(date + '-.*')`. Verified live: coach save now lands.
- SCORING RETUNE (owner, 2026-09-10): TOUR_POINTS extended to 25 places
  for a ~25-kid weekly field — 100, 88, 78, 70, 64, 59, 55, 51, 48, 45,
  42, 40, 38, 36, 34, 32, 30, 28, 26, 24, 22, 20, 18, 16, 14; beyond =
  12 participation. Winner ~2.6x the median finisher; last place still
  banks visible points.
- DROP-WEEK RULE (owner: "miss a week and not be eliminated"):
  standings sum each athlete's best (eventsHeld - drops) weeks, drops =
  floor(eventsHeld / TOUR_DROP_RATE), rate = 6. A missed Saturday becomes
  the dropped week; a full-attendance kid drops their worst finishes
  instead. Phases in at 6 events; derive-don't-store, so retuning either
  knob rescores the season retroactively. deriveTourStandings now returns
  `counting: { eventsHeld, counted, drops }` and the standings screen
  states the rule once drops are live.
- OPEN PRODUCT QUESTION for the owner: a Saturday with TWO tournament
  blocks scores as two separate events (two winners at 100 each week).
  If ~25 kids will span multiple blocks in one "weekly tournament", the
  blocks should merge into one scored event (e.g. by date) — say the word
  and it's a small deriveTourStandings change.
