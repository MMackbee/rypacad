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

## Sprint 8 pins — scores, age brackets, player history (2026-09-10)

Owner's direction: coaches input the SCORES from each tournament session
(strokes, not tap-in-order positions); players see a log of how they've
played in past events; the leaderboard splits into age brackets. Owner
said "8-10, 11-13, 13+" — implemented as 10U / 11-13 / 14+ (a 13-year-old
cannot live in two brackets; under-8s need a home). Age is computed AS OF
SEASON START (SEASON_BOUNDS.start) so no kid changes brackets mid-season.

Data contract v1.6 (supersedes v1.5.1 for tournamentResults; prod has no
result docs yet and the emulator reseeds, so no migration):
- tournamentResults/{sessionId}_{athleteId} = { sessionId, athleteId,
  name (string|null), bracket ('10U'|'11-13'|'14+'|null), date,
  score (int 18..200, strokes), createdBy, createdAt }. POSITION IS NO
  LONGER STORED — it derives at read time: within one (sessionId, bracket)
  group, ascending score; equal scores share a position, next distinct
  score resumes at its 1-based index (competition ranking). Points then
  derive from that position via TOUR_POINTS exactly as before, per
  bracket. `bracket` is a write-time snapshot (same rationale and
  mechanics as the v1.5.1 name snapshot): computed from the athlete's dob
  at write time so standings never need cross-family athlete reads. dob
  null -> bracket null -> grouped under 'open' ("Open") so nothing breaks.
- data/tour.js gains: BRACKETS = [{ id: '10U', label: '10 & under', min:
  0, max: 10 }, { id: '11-13', label: '11–13', min: 11, max: 13 },
  { id: '14+', label: '14 & up', min: 14, max: 999 }] (+ implicit 'open'
  fallback), and bracketFor(dob, asOfISO) -> bracket id | null.
- Read paths SKIP docs with no int score (defensive; none should exist).
- Rules (v1.6 tourShapeOk): keys exactly the eight above; score is int
  18..200; bracket in ['10U','11-13','14+'] || null; NO substring()
  ANYWHERE (rules strings don't have it — sprint 7 hotfix); keep the
  matches() date/sessionId pair and the createdBy/createdAt pins; roles
  unchanged (coach/mental/ops/owner write, any signed-in reads).

Hook seam (routing owns; frontend codes against):
- deriveTourStandings(results, { nameById, labelById }) ->
  { brackets: [{ id, label, standings: [{ athleteId, name, rank, points,
    events, wins }] }], events: [{ sessionId, date, label, results:
    [{ athleteId, name, bracket, score, position }] }], counting:
    { eventsHeld, counted, drops } }. Only non-empty brackets appear, in
  BRACKETS order, 'open' last. Ranking/drop-week/tie rules unchanged,
  applied per bracket; eventsHeld stays global. events sorted date desc,
  each event's results sorted bracket order then position.
- useTourStandings() -> { data: <that shape>, loading, error }. Seed:
  TOUR_SEED reshaped — 8 existing kids spread across the three brackets
  with believable 9-hole-ish scores; no new invented names.
- useTournamentResults(sessionId) -> { data: { results: [{ athleteId,
  name, bracket, score, position }] }, loading, error,
  saveResults(entries) }, entries = [{ athleteId, name, bracket, score }].
- NEW useAthleteBrackets(athleteIds) -> { data: { [athleteId]: bracketId
  | null }, loading, error } via fetchAthletesByIds + bracketFor — for
  the results-entry screen (coach can read assigned athletes). Seed mode:
  {} and never fetches.
- Player history NEEDS NO NEW HOOK: events[].results carries every row —
  the athlete's log is a client-side filter by athleteId.

UI (frontend lane):
- Results entry becomes SCORE entry: each rostered athlete gets a strokes
  field (numeric, 18..200) with their bracket shown as a chip; save-all
  with the existing saving/saved/error states; re-entry pre-fills from
  data.results. Derived standings are never edited by the coach.
- TourStandings: bracket selector chips (only non-empty brackets);
  standings card + recent-tournament podiums (top 3 of the SELECTED
  bracket, showing scores) filter to the selection. Athlete role default-
  selects their own bracket when they appear in one, and gains a "Your
  results" card: date · score · position-in-bracket · points earned, most
  recent first. Drop-week note unchanged.
- StatesHarness: TOUR states updated; results-entry state renamed to the
  score flow.

Seed/provisioning (db lane):
- seed-firestore.mjs: Whitfield athletes get dobs (consistent with any
  existing ageLine copy) landing them across brackets; tournamentResults
  gain score + bracket, drop position — pick scores whose DERIVED
  per-bracket positions tell the same story the old positions did where
  the bracket split allows. Update sanity output.
- provision-family.mjs: accept an optional dob per athlete, written to
  the athlete doc; REAL families (MackBee, Eisele) stay dob: null — never
  invent a real kid's birthday. The owner supplies real dobs later.
- DATA-MODEL.md: v1.6 section replaces the v1.5.1 field table; document
  score/bracket, derived position, and the dob dependency (an athlete
  with no dob competes in Open until provisioning sets one).

## Sprint 8 amendment v1.6.1 — weekly events + real dobs (2026-09-10, mid-sprint)

Owner's rulings, relayed to the running lanes by PM message (their
worktree TEAM.md copies predate this note):
- BLOCKS MERGE BY DATE: "the scores from the 2 blocks would be combined
  a 1 weekly tournament." An EVENT is a DATE (Saturday), not a sessionId.
  Doc shape, keyspace, rules, and the per-block score-entry UX are all
  UNCHANGED — the merge is read-time derivation only: position derives
  from score asc within (date, bracket) across every tournament block
  that date; events[] is keyed/grouped by date ({ date, label, results });
  eventsHeld for the drop-week rule = distinct DATES (which is what
  "miss a week" always meant); event label = any explicit session label
  on that date, else 'Tournament block'. If one athlete somehow has
  results in two blocks of the same date, their LOWEST score counts for
  that week's ranking and the week counts once (flagged as PM judgment —
  a same-day double entry is 18 holes vs everyone's 18, never summed).
- REAL DOBS (owner): jordan 2012-06-17, reese 2014-03-02, nico
  2017-09-09. As of season start 2026-11-02 that is 14 / 12 / 9 ->
  brackets 14+ / 11-13 / 10U — one Whitfield per bracket, so the emulator
  seed shows three one-kid brackets (expected; the harness TOUR_SEED
  carries the multi-kid bracket contrast).

## Sprint 9 pins — specialist 1-on-1s (Phil & Yannick), Lifetime-style booking, cancellation (2026-09-11)

Owner's direction: sessions with Yannick (mental game) and Phil
(performance) become handleable through the app. UI reference: Life Time's
class-scheduling flow — instructor-led browsing, a horizontal day strip, a
slot list, a detail sheet with one Reserve CTA, reservations visible in
"my schedule", and reservation CANCELLATION (which a capacity-1 session
needs — an unused 1-on-1 slot is a dead hour for the specialist).

Design keystone: a specialist 1-on-1 IS a session with capacity 1 and its
own pool. The existing booking transaction, parent book-for-kid, My
Schedule derivation, and attendance all apply unchanged.

Data contract v1.7:
- sessions gain two types: 'phil' and 'mental'. capacity 1. Production
  source stays the Google Calendar via sync (title first word 'Phil' ->
  phil; 'Mental' or 'Yannick' -> mental); the emulator seed hand-adds
  slots with ids `YYYY-MM-DD-s<n>` (the '-x0' extras convention, new
  letter) — the generator never invents them.
- NEW data/specialists.js (routing lane owns, like tour.js):
  SPECIALISTS = [
    { id: 'phil', name: 'Phil', discipline: 'Performance coaching',
      sessionNoun: 'Performance session' },
    { id: 'mental', name: 'Yannick', discipline: 'Mental game',
      sessionNoun: 'Mental game session' },
  ] (id == session type == the catalogue's philSessions/yannickSessions
  stems); SPECIALIST_MONTHLY_CAP = 2 (per specialist TYPE, per athlete,
  per calendar month — owner-tunable single knob; Elite package
  entitlements stay parked with billing, and philSessions/yannickSessions
  counts remain null/undecided — DO NOT surface or invent them);
  SPECIALIST_BOOKING_WINDOW_DAYS = 14 (rolling, from today).
- bookings for specialist sessions carry pool 'specialist' — they NEVER
  touch the training/tournament allowances (both tallies filter on their
  own pool, so exclusion is automatic). poolFor(type) in
  frontend/src/portal/data/packages.js maps phil|mental -> 'specialist'
  — ROUTING lane makes that one edit (db lane consumes it via its
  existing bundle, edits nothing there).
- createBooking's cap check: pool 'specialist' caps at
  SPECIALIST_MONTHLY_CAP per session TYPE per month (phil and mental
  each get their own 2), counted from the athlete's non-cancelled
  bookings of that type — derive-don't-store, same as allowances.
- CANCELLATION (new, all booking types): the athlete's own user or the
  household parent may cancel a CONFIRMED booking. One transaction:
  booking.status -> 'cancelled' AND sessions.booked - 1 (the exact
  mirror of create's +1, under the session rule's existing booked-diff
  clause — routing verifies/extends it for -1). Client gate: cancellable
  until the day BEFORE the session (day-of = contact the academy; copy
  says so); rules allow the transition without the date check in v1
  (flagged as an accepted server-side gap). RE-BOOKING a cancelled doc:
  createBooking's transaction treats an existing doc with status
  'cancelled' as the update path (status -> 'confirmed', booked + 1,
  same doc id per the keyspace); rules gain a member-booking update
  branch: own athlete/parent, diff hasOnly(['status']), exactly
  confirmed->cancelled or cancelled->confirmed. NO substring() in rules.

Hook seam (routing owns; frontend codes against):
- useSpecialistSlots(specialistId) -> { data: { days: [{ date, dayLabel,
  slots: [{ sessionId, time, booked, capacity, open }] }] }, loading,
  error }. The next SPECIALIST_BOOKING_WINDOW_DAYS days from today; days
  with no slots INCLUDED with slots: [] (the day strip needs every day);
  live via the existing range fetch filtered by type; seed synthesizes a
  believable fortnight (Yannick Tue/Thu late afternoons, Phil
  Mon/Wed/Fri, 45-min slots) — invented times only, no invented people.
- Booking a slot: the existing createBooking, unchanged signature —
  BookSession's confirmation idiom is the model.
- useSchedule (or whichever hook MySchedule actually reads — routing
  confirms and reports the name) gains `cancel(bookingId)`; each
  upcoming item gains `cancellable` (status 'confirmed' && date >
  today). live.js gains cancelBooking({ bookingId }) doing the
  transaction above, then bump('bookings') and bump('sessions') once
  each after the commit.
- Routes (PortalRoutes): /portal/coaching -> SpecialistBooking, roles
  athlete + parent; parent deep-link carries { state: { athleteId } }
  exactly like /portal/book (BookSessionRoute is the model, including
  the role resolution).
- displaySession/session naming: an unlabeled specialist session reads
  '<sessionNoun> · <name>' (e.g. 'Mental game session · Yannick'), never
  'Training block'.

UI (frontend lane) — the Life Time flow, translated:
- NEW screens/SpecialistBooking.js: (1) specialist picker — one card per
  SPECIALISTS entry (avatar placeholder, name, discipline, one-line
  blurb); (2) horizontal DAY STRIP of the 14-day window (today first,
  tappable pills: weekday + date, dot when the day has open slots);
  (3) the picked day's slot list — time, 45 min, spots ('Open' /
  'Booked' — capacity 1 so it is binary); (4) tap -> bottom DETAIL SHEET
  (the existing sheet idiom): specialist, day/time, what-to-expect line,
  a 'does not use your training or tournament allowance' line, one
  Reserve CTA -> saving -> confirmed state (BookSession's confirmation
  pattern, including practice/live split and the parent 'Booking for'
  selector via initialAthleteId).
- MySchedule: specialist bookings render with the specialist chip/name;
  every cancellable upcoming booking gets 'Cancel reservation' behind a
  confirm step (tap -> sheet: keep / cancel; Lifetime's own pattern);
  day-of shows the call-the-academy line instead of the button.
  Cancelled items use the existing cancelled treatment.
- TypeChip: 'phil' and 'mental' variants (short labels consistent with
  the chip system).
- Entry points: athlete Home gets a '1-on-1 coaching' action card;
  ParentDashboard gets ONE full-width 'Book 1-on-1 coaching' action
  under the kid cards (not per-card — the coaching screen itself has
  the child selector).
- StatesHarness: SpecialistBooking gallery (picker / slots / sheet /
  confirmed / empty-day) + MySchedule cancel states.

DB lane:
- sync-calendar-sessions.mjs: classifyTitle gains 'phil' -> phil,
  'mental'|'yannick' -> mental (case-insensitive first word, existing
  convention); capacity by type: specialist types 1, others 15; nothing
  else changes (delete/cancel guards apply as-is).
- seed-firestore.mjs: hand-seeded specialist sessions over the two weeks
  after TODAY's date at seed time (ids `YYYY-MM-DD-s0`, `-s1`...,
  capacity 1, correct full shape incl. gcalEventId null) matching the
  pattern the hook's seed branch fakes (Yannick Tue/Thu, Phil
  Mon/Wed/Fri); ONE pre-booked mental session for jordan (pool
  'specialist', booked 1) so schedule display, the cap, and cancel have
  something real; sanity output lists them.
- DATA-MODEL.md v1.7: specialist types + capacity, pool 'specialist',
  the cancellation + re-book semantics and their rules shape, seed id
  convention, sync title convention. provision-family untouched.

Deferred, on the record: the specialist-side day view (Yannick/Phil
seeing their own booked 1-on-1s) — next sprint; v1 rides the existing
staff surfaces. Server-side cancel-window enforcement — accepted gap.

## Sprint 9 amendment v1.7.1 — owner rulings mid-sprint (2026-09-11)

Relayed by PM at integration (lane worktree TEAM.md copies predate this):

1. PHIL'S SESSIONS ARE GROUP SESSIONS, not 1-on-1s (owner: "operate just
   like academy training session just at a cap of 6-7 kids"). Capacity for
   type 'phil' = 6 (PM pick from "6-7"; a one-value sync-knob change if
   the owner says 7) — sync CAPACITY map, seed docs, DATA-MODEL all say 6.
   Yannick ('mental') stays capacity 1 — true 1:1, owner-confirmed.
   UI: slot rows for capacity > 1 show "N spots left", not the binary
   Open/Booked the capacity-1 pin assumed.
2. YANNICK MONTHLY RESTRICTION confirmed: the SPECIALIST_MONTHLY_CAP knob
   is the mechanism; number pending from the owner (default stays 2 per
   athlete per month until then).
3. SPECIALIST-SIDE ACCESS moves from deferred to IN SCOPE at integration
   (owner: "provision Yannick and Phils account seperately to have access
   to the back end of the booked session side"):
   - users docs gain optional `specialistId` ('phil'|'mental'|null) —
     written by provisioning, links a staff account to the sessions it
     runs (== sessions.type). provision-family.mjs already carries the
     STAFF entries (Yannick: role mental; Phil: role coach, never the
     athletes' assigned golf coach) with email: null until the owner
     supplies real addresses.
   - NEW SpecialistDay screen (PM builds at integration): the signed-in
     specialist's upcoming sessions of their type with per-session booked
     count and roster names; tapping one opens the existing
     SessionAttendance. Route /portal/my-sessions, roles mental + coach
     (gated by specialistId != null) + ops/owner (with a specialist
     picker).
   - Rules: attendance updates (status + noshowReason) also allowed when
     the caller's users doc `specialistId` == the booking's own `type` —
     bookings carry type, so NO extra get(). Yannick/Phil mark their own
     sessions' attendance; the golf-coach clause is unchanged.
4. AVAILABILITY MIGRATION (context, no code): Yannick books via Calendly
   and Phil via SignUp Genius today. Their availability moves onto the
   shared Google Calendar as 'Mental ...' / 'Phil ...' events — the sync
   already turns those into bookable slots; no importer built. The owner
   is getting Phil's updated training times.

QUEUED AS SPRINT 10 (owner, same day): the parked Billing surface returns
as a MEMBERSHIP/PERMISSIONS page — no payments — listing each athlete's
golf package AND fitness package with what they entitle, and letting
ops/owner assign packages per athlete/family. Then Phil's monthly
entitlement derives from the athlete's fitness package `sessions` count
(FITNESS_PACKAGES already carry it) instead of the flat cap; Yannick's
stays the flat knob until the Elite yannickSessions count is decided.
Sprint 9 ships with the flat cap for both types so the feature is usable
before package assignment exists.

## Sprint 9 integration notes + Sprint 10 queue addition (2026-09-11)

Integration applied on merge (PM): the v1.7.1 rulings (phil capacity 6
everywhere + "N spots left" slot rows; mental stays 1:1), the frontend
lane's fallbacks reconciled (SPECIALISTS gained capacity + whatToExpect;
reservation rides useBooking.book() per routing's ruling), role-aware back
from /portal/coaching, ParentDashboard onBookCoaching wired, and the
specialist-side access set: users.specialistId, /portal/my-sessions
(SpecialistDay screen + useSpecialistSessions hook), specialist landing
override, attendance route widened, and two rules additions (specialists
read athletes academy-wide like mental — medical subcollection untouched —
and run attendanceUpdateOk on bookings of their own session type via
me().get('specialistId', null), null-safe for every pre-existing users
doc). Seed adds the 'phil' QA account (signInAs('phil')). Yannick/Phil
production emails are in provision-family.mjs (owner-supplied).

SPRINT 10 QUEUE ADDITION (owner's Life Time Reservations screenshot,
2026-09-11): a family-grouped Reservations view for parents — one screen,
sections per household member ("You / Peggy / Maeve" in the reference),
date-block rows with time · duration · instructor, waitlist state later —
pairs naturally with the membership/permissions surface already queued.

Still open from the db lane (pre-existing, deferred): generator-seeded
sessions never write status/gcalEventId though DATA-MODEL documents both
since v1.2 — emulator-only inconsistency, follow-up candidate.

## Sprint 10 pins — "make it real": intake paths + live staff surfaces (2026-09-11)

Origin: the 2026-09-11 three-agent surface scan (browser sweep + member
code scan + staff code scan). Owner's ruling on the burn-down: BE
INTENTIONAL — approach every finding from the larger lens of the missing
capability, not the symptom. Example given: the Commitment Contract crash
for a no-tier athlete isn't a null guard, it's that there is NO contract
intake. This pin is organized by capability accordingly. Already fixed
before this pin: the group-booking crash (specialist slots leaking into
the two-pool flow) and the next-session Type mislabel.

Root diagnosis the scan surfaced: the member side got its live wiring
across Sprints 5-9; the staff side and every INTAKE path (enrollment,
contract tier, diagnostics, staff invites, notification prefs) were
scaffolded against seed data and never wired. Sprint 10 closes that.

Explicitly PARKED (not built, made honest instead): the Newsletter
composer (invented scaffold; route leaves staff nav, screen stays in the
harness); billing-failure UI on the parent dashboard (billing is parked —
the PaymentBanner never renders in live mode); Practice DNA stays retired
(copy stops promising it). The membership/permissions surface and the
family-grouped Reservations view move to Sprint 11.

Data contract v1.8 (db lane documents; routing implements rules):

A. ENROLLMENT — self-serve with owner approval. A new family signs in
   (Google or email — auth already exists), is unprovisioned, and is
   routed to /portal/register instead of a dead end.
   - enrollmentRequests/{uid} (uid = the signed-in guardian's auth uid):
     { guardian: { name, email, phone }, athletes: [{ name, dob (string
     YYYY-MM-DD | null), packageId, contractMinutes (20|45|95|null) }],
     consents: { dataCollection, videoCapture, mediaRelease } (booleans),
     status: 'pending'|'approved'|'declined', declineReason (string|null),
     createdAt, updatedAt, reviewedBy (uid|null), reviewedAt }.
     Rules: create/update by request.auth.uid == uid ONLY while status is
     'pending' (a submitter can edit their pending request, never flip
     status); read by own uid + ops/owner; ops/owner may update status/
     declineReason/reviewedBy/reviewedAt only.
   - APPROVAL (owner/ops client, one batched write): households/{autoId}
     from guardian; athletes/{autoId} per athlete (name, dob, packageId,
     contractMinutes, householdId, coachId: null); users/{uid} for the
     guardian { role:'parent', householdId, athleteId:null, staff:false,
     specialistId:null, displayName, email }; request status ->
     'approved'. Rules gain: athletes create by ops/owner; users create/
     update by ops/owner for ANY uid (never self-role change by non-owner
     — self-write stays denied). Kids' own logins remain a later
     provisioning step (parent-managed is the default, Sprint 7).
   - NotProvisioned shows the request's state: none -> "start
     enrollment"; pending -> "under review" with what was submitted;
     declined -> the reason + "edit and resubmit" (sets status back to
     pending).

B. CONTRACT INTAKE — athletes.contractMinutes becomes settable by the
   athlete's own user OR the household parent: int in [20, 45, 95] or
   null; rules allow update of ONLY that field by those two callers
   (diff hasOnly(['contractMinutes'])). Hook: useContract gains
   setTier(minutes). Screens: the existing NoContract tier picker's CTA
   ("Start the N min contract") is wired (athlete); AthleteDetail (parent)
   gets a "Start a contract" tier picker card for a kid with no tier;
   CommitmentContract renders NoContract (never crashes) whenever
   data.tierMinutes is null in live mode. Registration captures an
   initial tier per athlete (nullable).

C. DIAGNOSTICS PERSISTENCE — athletes/{athleteId}/diagnostics/{captureId}
   (auto id): { athleteId, capturedBy (uid), capturedAt, updatedAt,
   status: 'draft'|'published', values: { <fieldId>: number|string|null
   } keyed by the existing DIAGNOSTIC_SECTIONS field ids (db lane reads
   data/seed.js to enumerate them and documents the key list), notes
   (string|null) }. Rules: create/update by the assigned coach
   (athleteData(athleteId).coachId == uid), any specialist
   (me().get('specialistId', null) != null), mental/ops/owner; read: the
   athlete's own user and the household parent see PUBLISHED only
   (resource.data.status == 'published'), staff see all. Plus a
   collection-group read for staff so the admin "no diagnostic yet" list
   is one query: match /{path=**}/diagnostics/{id} allow read for
   coach/mental/ops/owner/specialists. Hooks: useDiagnostic(athleteId)
   live -> { data: { latest (published|null), draft (draft|null),
   sections }, saveDraft(values, notes), publish(values, notes) } —
   saveDraft upserts the athlete's single open draft, publish flips it to
   published (a second publish creates a new capture; history is the
   collection). DiagnosticCapture wires both footer buttons with a shared
   Saved toast; AthleteDetail's "Progress summary" and "Reflection
   summaries" placeholders (the scan found developer commentary shipped
   to parents) are replaced by the latest PUBLISHED capture's values (or
   an honest "no capture yet"); the athlete home "Start here" card reads
   the same state.

D. LIVE ADMIN — useAdminDashboard gets a live source built from existing
   collections, no new store: enrolled athletes (athletes count),
   enrollment by package (group athletes.packageId), block fill this week
   (sessions in the current week: sum booked / sum capacity, group type
   only), and "Who needs a call" derived: (1) pending enrollment requests
   (count, links to the queue), (2) no-shows this month — bookings where
   status == 'noshow' and date >= monthStart (NEW composite index bookings
   (status ASC, date ASC), db lane adds it to firestore.indexes.json),
   grouped by athleteId with names via the per-id join, (3) contract
   behind — ONE contractLogs range query (date >= monthStart) grouped by
   athleteId, compared to each athlete's tier over the month's contract
   days (reuse the existing month derivation; db lane confirms the query
   is index-free), (4) athletes with no published diagnostic (the
   collection-group read minus athletes). Every card TAPS to somewhere
   real: athlete detail (route already exists for staff), the enrollment
   queue (new Admin section), the roster. Header reads the real week
   ("Week of <this Monday's long date>"). Billing card is gone in live
   mode. Seed mode keeps the existing demo payload untouched.
   The ENROLLMENT QUEUE lives on the Admin screen as its own section:
   pending requests with guardian + athletes summary, Approve / Decline
   (with reason) — approve runs the batched write in A.

E. STAFF & ROLES LIVE — useStaff live: users where staff == true (owner
   reads all users; ops gets the same list — rules: users read by ops
   too, reads only). "Add staff" becomes real: staffInvites/{autoId}
   { email (lowercased), role ('coach'|'mental'|'ops'|'owner'),
   displayName, specialistId ('phil'|'mental'|null), status:
   'pending'|'provisioned', createdBy, createdAt } — create by owner
   only; read owner/ops. The screen lists pending invites under the
   staff list with an honest "provisions when they first sign in" line.
   scripts/provision-family.mjs (db lane) consumes pending staffInvites:
   looks up the auth uid by email, writes the users doc, marks the invite
   'provisioned' — the STAFF array in the script stays as the seed of
   record for Yannick/Phil.

F. STAFF NAVIGATION — BottomTabBar gains staff tab sets (frontend lane
   owns TABS; routing owns the routes they point at): owner -> Admin
   (/portal/admin) · Sessions (/portal/my-sessions) · Staff
   (/portal/staff) · Tour; ops -> Admin · Sessions · Tour; mental ->
   Sessions · Admin · Tour; a coach WITH specialistId (Phil) -> Sessions
   (/portal/my-sessions) · Roster · Capture; plain coach unchanged.
   BottomTabBar takes an optional specialistId to pick the Phil variant.
   Every staff screen renders the bar AND a SignOutButton (the scan found
   Staff & Roles and the Newsletter with neither). Newsletter leaves
   every tab set (parked).

G. NOTIFICATION PREFS PERSIST — users.notificationPrefs (map of
   category -> { email: bool, sms: bool }, shape from the existing
   screen's categories); rules: a user may update ONLY that field on
   their own users doc (diff hasOnly(['notificationPrefs'])) — the one
   self-write the users collection ever allows, and it cannot touch
   role/household/athlete/specialist links. Hook: useNotificationPrefs
   gains save(prefs); the Saved toast fires on a real save.

H. SESSION NOTES — sessions.coachNote (string <= 500 | null): rules let
   the assigned coach / any specialist / mental / ops / owner update ONLY
   that field (a second field-limited branch beside bookedDiffOk).
   useSessionAttendance gains setSessionNote(sessionId, note); the
   roster's "Add a session note" (the scan's third inert-button instance)
   opens the same inline editor the no-show reason uses.

I. QUICK WINS (frontend lane, with the routing bits noted):
   - Forgot password: a real link on LiveSignIn calling Firebase
     sendPasswordResetEmail (routing adds requestPasswordReset(email) to
     useAuthSession/live.js) with sent/error states.
   - Vocabulary: every CTA for the group flow says "Book a session"
     ("Book a slot" on the athlete home goes); session-card names stay
     ("Training block").
   - Coach dashboard: header date formatted like every other role; the
     NoSessions copy's hardcoded "Mon Feb 22, 5:00 PM" derives from the
     real next session or is dropped. Coach Overview counts subscribe to
     sessions/bookings invalidation (routing, useCoachDay).
   - Coach roster rows tap through to AthleteDetail (routing adds coach
     to the route's roles — rules already scope coach reads to assigned
     athletes).
   - Truncation audit: AthleteRow/SessionCard names ellipsize only when
     genuinely out of room (the scan saw "Jordan Whitfi..." with space
     to spare).
   - Keyboard access: password show/hide is a real button; calendar day
     cells (DayGridCell + ContractCalendar's delegated container) get
     role/tabIndex/Enter-Space handling.
   - Practice DNA copy on the athlete home stops naming a screen that
     does not exist (reads diagnostics state instead, per C).
   - MediaPlaceholder captions stop inviting taps ("TAP TO RECORD") until
     capture exists.
   - SpecialistDay: a pinned "Today" section above the rest; reuse the
     day strip only if it extracts cleanly — otherwise leave the list.
   - Shared SavedToast component (the practice-log "no refresh" report
     did NOT reproduce on a clean server — stale watcher — but toast-less
     writes were the sweep's top friction item; use it on log, capture,
     prefs, notes, contract tier).

Ownership:
- DB lane: DATA-MODEL v1.8 (A-H shapes + the collection-group + index),
  firestore.indexes.json, seed (a pending enrollmentRequests/parent-new
  doc — a NEW unprovisioned QA uid; one draft + one older published
  diagnostic for jordan with values for every section field; one pending
  staffInvites doc; users.notificationPrefs on parent-dana; a coachNote
  on one past session; nico keeps contractMinutes null so the intake is
  exercisable), provision-family.mjs staffInvites consumption.
- Routing lane: firestore.rules (every branch above, NO substring(),
  me().get() null-safety on every new field, null-resource read branches
  where a transaction probes nonexistence), hooks/live.js + hooks/index.js
  (every hook named above), PortalRoutes (register gating from
  not-provisioned, staff routes, coach on athlete detail, newsletter
  route parked), useAuthSession (password reset).
- Frontend lane: Registration, NotProvisioned, CommitmentContract/
  NoContract, AthleteDetail, DiagnosticCapture, AdminDashboard (+ queue),
  StaffRoles, BottomTabBar, Roster (session note), NotificationPreferences,
  SignIn (forgot password), CoachDashboard copy/date, AthleteDashboard
  copy, SpecialistDay today section, components (SavedToast,
  MediaPlaceholder copy, AthleteRow/SessionCard truncation, DayGridCell
  a11y), StatesHarness.

Sequencing inside each lane (report what is NOT done rather than rush):
A (enrollment) and C (diagnostics) first — they are the two silent
data-loss / dead-end paths; then D/E/F (staff real + nav); then B, G, H;
quick wins last.

## Sprint 10 integration notes (PM merge + live pass, 2026-09-11)

All three lanes merged clean. Reconciled at integration: useEnrollment
exposes top-level `status`; guardianNotes (emergency contact + medical
free text) rides enrollmentRequests and lands in each approved athlete's
private/medical doc (rules: ops/owner create there); household name is
"<surname> family"; block fill is per-day over group sessions (the pin's
"group type only" meant exclude specialist slots); useAthleteTier gives
the parent an athleteId-aware tier write; useSessionAttendance also READS
the session's coachNote; AthleteDetail keys "no tier" off the real
contractMinutes field; the athlete home's Start-here card keys off a live
diagnosticCaptured flag; Phil's tab set is Sessions · Capture · Tour (no
assignment-based Roster); AdminRoute/SpecialistDayRoute resolve `role`;
coach roster and dashboard rows open AthleteDetail.

Live emulator pass (every new rules branch exercised) — defects found and
fixed before commit:
1. APPROVAL BATCH: the pinned single 7-write batch errored — every
   rule's me() get() across that many writes hit Firestore's document-
   access cap for multi-document requests (production has the same cap).
   Approval is now three small requests made retry-safe: household +
   athletes + medical in one batch, then the parent's users doc, then the
   request status; a re-approval finds the household by guardian email
   and resumes. Also the ops/owner request-update rule lacked updatedAt
   in its allowed keys (clean denial) — added.
2. Enrollment queue rows now carry `uid` as well as `id` (the card called
   approve(req.uid) and got undefined).
3. DiagnosticCapture: the draft never prefilled (useState seeded before
   the hook loaded — now a one-time seed effect); Publish could never
   render (completion counted the uncapturable swing-video slot); the
   header claimed "All sections complete" whenever an older publication
   existed.
4. liveDiagnostic queried every status in one list — Firestore denies a
   list wholesale when any doc could fail the rule, so parents (published-
   only readers) saw "No capture yet" for kids with captures. Now two
   queries (published; draft tolerated as denied for non-staff).
5. AthleteDetail's capture card read latest.sections (a capture doc has no
   sections — the catalogue lives beside it); it now groups latest.values
   by the catalogue and renders only entered fields.
6. Coach-day (Luke's Today) listed Phil's sessions as his blocks —
   specialist filter added (the Sprint 9 fix covered booking hooks only).

Verified end to end: unprovisioned parent -> "under review" -> owner
approves from the live admin queue -> parent lands on "Contreras family"
with the enrolled kids -> parent starts a kid's contract tier; coach saves
+ publishes a diagnostic -> parent and owner see its values; owner staff
invite; parent notification prefs persist; coach session note reads and
writes. Admin dashboard derives its call list, counts and package bars
from real records.

Cosmetic follow-ups (seed copy on live screens, not blocking): AthleteDetail
back link hardcodes "Whitfield family"; its CONTRACT HISTORY caption
references the December closure for a kid with no history; Admin's block-
fill footnote "Friday is the overflow block" is seed copy; the attendance
footer still says "Add a session note" when a note exists ("Edit note").
Deploy now includes firestore.indexes.json (the bookings status+date
composite the admin no-show query needs).

## Sprint 11 pins — membership & entitlements (no payments) + family Reservations (2026-09-15)

Origin: the owner's Sprint 9 ruling ("Phil has fitness packages that we
will need to work into the old 'billing' which wont actually handle
billing but needs to be updated with permissions for each player and
family"), the Sprint 10 queue (the parked Billing surface returns as a
MEMBERSHIP/PERMISSIONS page; Phil's monthly entitlement derives from the
athlete's fitness package instead of the flat cap), and the owner's Life
Time Reservations reference (one family-grouped view, a section per
household member). Production going in: rules v1.8 + indexes live;
Yannick, Phil and the Eisele parent provisioned 2026-09-15; the tester
kids carry dobs; NO athlete carries a fitness package yet — assignment is
exactly what this sprint builds.

Design keystone: ENTITLEMENTS ARE DERIVED FROM PACKAGES, NEVER STORED.
An athlete's two package pointers (golf `packageId`, new fitness
`fitnessPackageId`) are the only stored facts; every "N of M left" on
every surface derives from the package doc plus the athlete's bookings,
exactly the way the two-pool allowance already does. No payments, no
Stripe, no invoices, no "billing status" — the word "billing" leaves every
live member surface this sprint (Billing.js itself stays unrouted in the
harness, untouched, per the Sprint 7 ruling).

Data contract v1.9 (db lane documents; routing implements rules):

A. FITNESS PACKAGE ON THE ATHLETE — `athletes.fitnessPackageId` (string |
   null, into `packages/` where kind == 'fitness'; f-4/f-8/f-12/f-16
   already exist in prod and seed). ABSENT == null everywhere: rules read
   it as `resource.data.get('fitnessPackageId', null)`, hooks as `?? null`,
   and provision-family.mjs does NOT write the field at all, so a re-run
   can never clobber a UI assignment. Seed: jordan f-8, reese f-4, nico
   null (the "no fitness package" state stays exercisable, like nico's
   null tier).

B. PACKAGE ASSIGNMENT (ops/owner) — a second field-limited update branch
   on athletes beside contractMinutesUpdateOk:
   `after.diff(resource.data).affectedKeys().hasOnly(['packageId',
   'fitnessPackageId', 'updatedAt'])`, packageId a string,
   fitnessPackageId string | null, caller ops/owner. live.js
   `setAthletePackages(athleteId, { packageId, fitnessPackageId })` →
   hook `useAssignPackages()` → `{ assign(athleteId, { packageId,
   fitnessPackageId }), saving, error }`; one `bump('athletes')` per write.
   Assignment is IMMEDIATE and un-prorated: allowances are derived, so
   headroom changes for the next booking; nothing already booked is
   touched (no cancellations, no refunds — there is no money here).

C. ENTITLEMENT DERIVATION — one pure function, `entitlementsFor(athlete,
   packages, bookings, monthISO)` in data/packages.js (routing lane owns;
   both data modes call it):
   - training / tournaments: the unchanged two-pool math (makeAllowance).
   - phil: limit = fitness.sessions when fitnessPackageId is set; else,
     if the golf package's kind == 'elite', SPECIALIST_MONTHLY_CAP (Elite
     includes Phil, count still undecided — ELITE_TIERS.philSessions stays
     null, do not invent); else 0. used = the athlete's non-cancelled
     'phil' bookings in the calendar month. `source: 'fitness' | 'elite'
     | 'none'`.
   - mental: limit = SPECIALIST_MONTHLY_CAP (the flat knob stays, owner
     ruling v1.7.1); used likewise. `source: 'flat'`.
   - Booking gate: live.js's specialist branch of assertWithinMonthlyCap
     uses this per-type limit (it reads the athlete and, when set, the
     fitness package inside the transaction). A 0-limit Phil attempt
     fails with typed reason 'no-fitness-package'; a cap hit stays
     'cap-reached'. useBooking surfaces the reason so SpecialistBooking
     can render it (G).

D. MEMBERSHIP SURFACE (member side) — NEW screens/Membership.js, route
   /portal/membership, roles parent + athlete; the old /portal/billing
   redirect now lands here. Hook `useMembership()` →
   `{ data: { household: {id,name} | null, members: [{ athleteId, name,
   golf: {id,name,price,training,tournaments,kind} | null, fitness:
   {id,name,price,sessions} | null, contractMinutes, resetsOn,
   entitlements: { training:{used,limit,left}, tournaments:{used,limit,
   left}, phil:{used,limit,left,source}, mental:{used,limit,left,source}
   } }] }, loading, error }` — parent: every household athlete in
   household order; athlete: self only. Layout (Life Time reference): one
   section per member; inside it a Golf card (package name, the two pools
   via the existing AllowancePools), a Performance card (fitness package
   name + Phil used/limit, or "No fitness package on file — ask the
   academy"), a Mental game line (Yannick's cap), and the contract tier
   line linking to /portal/contract (athlete) or the AthleteDetail
   contract card (parent). Prices render as catalogue facts ("$200 /
   month"), never as amounts due. Entry points: Settings gains a
   "Membership" row (parent + athlete); the ParentDashboard child card's
   package label taps into it; AthleteDashboard's allowance card gets a
   "Membership" link.

E. MEMBERSHIP EDITOR (staff side) — AthleteDetail gains a Membership card:
   ops/owner get a golf package select (GOLF_PACKAGES + ELITE_TIERS +
   DROP_IN) and a fitness package select (none + FITNESS_PACKAGES), Save →
   useAssignPackages, SavedToast, derived entitlements re-render off the
   bump; coach and specialists see the same card read-only. No separate
   staff route.

F. FAMILY RESERVATIONS — NEW screens/Reservations.js, route
   /portal/reservations, role parent; the parent tab set becomes Home ·
   Reservations · Tour · Settings. Hook `useHouseholdReservations()` →
   `{ data: { members: [{ athleteId, name, upcoming: [item], past:
   [item] }] }, loading, error, cancel(bookingId) }` where item == the
   useSchedule item (displaySession fields + bookingId/status/cancellable)
   plus `athleteId`, `instructor` (the assigned coach's displayName for
   training/tournament when one is set, the specialist's name for
   phil/mental, else null) and `durationMinutes` (60 for generator blocks;
   specialist slots as seeded). One query on the existing (householdId,
   date) bookings index; parents already read household bookings — verify
   the rule, do not widen it. Sections per member in household order,
   Upcoming / Past tabs, date-block rows (date · time · duration ·
   instructor · type chip), "Cancel reservation" reusing MySchedule's
   confirm sheet and the same cancellable rule (confirmed && date >
   today). No waitlist state (later). Per-member empty state ("No upcoming
   reservations — Book a session") and a household-wide one.

G. SPECIALIST BOOKING STATES — SpecialistBooking's summary reads the
   entitlement: "2 of 8 performance sessions used this month" (fitness),
   "Included with Elite — up to 2 this month" (elite), and for source
   'none' a blocking notice "No fitness package on file" with a "See
   membership" link — slots still render, the reserve CTA is disabled
   with that reason. Yannick's copy stays "up to 2 mental game sessions a
   month".

H. QUICK WINS (frontend lane; logged from the Sprint 10 live pass):
   AthleteDetail's back link derives the household name (no hardcoded
   "Whitfield family"); the CONTRACT HISTORY empty-state caption stops
   citing the December closure; Admin's block-fill footnote "Friday is the
   overflow block" renders only when a Friday block exists in the data;
   the attendance footer says "Edit note" when a note already exists.

Ownership:
- DB lane: DATA-MODEL v1.9 (A's field row + the absent-as-null rule, B's
  branch, F's query note), seed (jordan f-8 / reese f-4 / nico null; two
  past 'phil' bookings for jordan in the current month so "used" is
  non-zero; one upcoming phil + one upcoming mental booking for the
  Reservations view; a coachId on at least one upcoming booked training
  session so `instructor` has a real value), provision-family.mjs (does
  NOT write fitnessPackageId — the comment says why), verify packages
  docs carry `kind` + `sessions` in seed and provisioner, indexes (none
  expected — say so explicitly if none).
- Routing lane: firestore.rules (B's branch; A's null-safe get; verify
  F's parent read), data/packages.js entitlementsFor (C), hooks/live.js
  (setAthletePackages, fetch helpers, assertWithinMonthlyCap per-type
  limit + typed reasons), hooks/index.js (useMembership,
  useAssignPackages, useHouseholdReservations, useBooking reason
  plumbing, useSpecialistSlots/summary entitlement), PortalRoutes
  (/portal/membership, /portal/reservations, the billing redirect).
- Frontend lane: Membership.js, Reservations.js, AthleteDetail membership
  card + editor, SpecialistBooking entitlement states, Settings row,
  ParentDashboard/AthleteDashboard entry points, BottomTabBar parent tabs,
  quick wins (H), StatesHarness entries. Hook fallbacks: until routing's
  hooks land, screens import from '../hooks' and tolerate a missing
  export the way Roster/TourStandings did — report it, never stub a fake
  into hooks/.

Invariants (the standing list plus): no substring() in rules; one bump
per write; derive-don't-store; no invented numbers (Elite
philSessions/yannickSessions stay null); the word "billing" appears on no
live member surface after this sprint; files under 500 lines —
Membership.js and Reservations.js each stand alone and share via
components/.

Sequencing: A + B + C first in db/routing (the entitlement rule is what
everything else reads), then D/E, then F, G, H last. Report what is NOT
done rather than rush it.

Worktrees: wt-db / wt-routing / wt-frontend, siblings of rypacad, on
agent/<lane>/sprint11-membership off portal/r3 at this pin's commit; PM
merges db → routing → frontend, integrates, browser-passes on :3001,
removes worktrees.

## Sprint 11 amendment v1.9.1 — owner ruling mid-sprint (2026-09-15)

Relayed by PM to all three lanes while they run (lane worktree TEAM.md
copies predate this):

ELITE INCLUDES 16 PHIL SESSIONS A MONTH (owner: "elite gets you 16
sessions with phil"). This is the number section C's elite branch was
waiting on, and it matches the catalogue's own arithmetic — Elite's $1,000
is exactly the top golf package ($740) plus the 16-session fitness package
($260), so Elite carries f-16's Phil count.

- data/packages.js: ELITE_TIERS.philSessions = 16 on BOTH 'elite' and
  'elite-247' (PM assumption: 24/7 is Elite plus facility access with the
  same Phil count — flag if wrong). yannickSessions stays null: still
  undecided, so mental stays the flat SPECIALIST_MONTHLY_CAP.
- entitlementsFor (routing): phil precedence unchanged — an explicit
  fitnessPackageId still wins, then Elite, then none — but the Elite
  branch's limit is now the golf package's philSessions (16), no longer
  the SPECIALIST_MONTHLY_CAP fallback. source stays 'elite'.
- data/specialists.js: the comment forbidding any read of
  philSessions is retired for phil (it stays true for yannickSessions).
- Copy (frontend): "Included with Elite — 3 of 16 used this month" on the
  booking summary and the Membership performance card; the ops/owner
  editor shows "Elite already includes Phil sessions" beside the fitness
  select when the golf package is Elite (assigning one anyway is allowed
  and still wins, per the precedence above).
- Data (db): the seed's and the provisioner's packages docs derive from
  packages.js, so philSessions: 16 flows into packages/elite and
  packages/elite-247 on the next seed / user-gated provisioning run —
  DATA-MODEL's packages table notes the field is now set for phil and
  still null for yannick. Quinn MackBee (elite) is the production athlete
  this exercises.

## Sprint 11 integration notes (PM merge + live pass, 2026-09-15)

All three lanes merged clean (db -> routing -> frontend, --no-ff).
Reconciled at integration:
- The frontend lane's screen-local fallbacks (components/useMembershipCompat.js,
  the demoMembership/demoReservations fixtures, the useAssignPackages stub)
  are removed; Membership.js, Reservations.js, AthleteMembershipCard.js and
  SpecialistBooking.js import the routing lane's real hooks by name. The
  harness `variant` prop survives on the two new screens as harness-only:
  'populated' is the real hook in seed mode, loading/error/empty drive the
  branches locally (TourStandings' precedent).
- SpecialistBooking reads the entitlement off useSpecialistSlots' own
  payload (`data.entitlement`, scoped by the parent's selected child via
  the hook's athleteId option), not off useMembership; the selectedAthleteId
  state moved above the hook call so it can scope it. `demoEntitlementSource`
  is now an explicit harness override with no default.
- useAthleteDetail exposes `packageId` and `fitnessPackageId` on `athlete`
  (both modes), which the editor's selects preselect from.
- PortalRoutes: the two placeholder components are gone; /portal/membership
  and /portal/reservations render the real screens; /portal/settings admits
  athletes through a role-resolving SettingsRoute; AthleteDetailRoute passes
  the signed-in role (the editor card and the tab bar key off it) plus a
  role-aware back target and label (Admin / Roster / My sessions; parents
  keep the derived household name).
- Frontend-lane finding worth keeping: CRA's webpack build hard-fails on a
  statically-known namespace property (`hooks.useX`, `hooks['useX']`) whose
  export is absent - only a variable key escapes the check. The precedent
  comments in Roster/TourStandings are stale, not proof of safety. Lanes
  should not build against missing exports at all; placeholders in the
  routing lane (as this sprint did) are the right shape.

Live emulator pass (parent-dana, athlete-jordan, owner, coach-luke) -
defects found and fixed before commit:
1. SpecialistBooking's summary never rendered: the integration read
   `slotsState.entitlement`; the payload is `slotsState.data.entitlement`.
2. AthleteDetail never received the signed-in role from its route, so the
   staff-only membership editor could not render and staff saw the parent
   tab bar and a "Family" back link.
3. The editor seeded its selects once at mount, before the athlete record
   loaded - the golf select stayed blank and Save was a no-op. A sync effect
   now follows the loaded values (and the post-save refetch).
4. The emulator's packages/elite doc predated amendment v1.9.1 (seeded
   from the db worktree before routing's philSessions change), so Elite
   read "0 of 0" until a re-seed from the merged checkout. PRODUCTION HAS
   THE SAME GAP: packages/elite and packages/elite-247 carry philSessions
   null until the owner re-runs provision-family.mjs (a full-replace write
   on packages docs), which is now a listed deploy step.

Verified end to end: parent Membership (three members, Elite "0 of 16",
fitness "2 of 8", "1 of 4", prices as catalogue facts, no "billing");
Reservations (sections per member, Upcoming/Past, instructor on specialist
rows, same-day rule, cancel sheet -> booking cancelled + session booked
decremented); specialist booking entitlement states per selected child
(fitness / Elite / none with Reserve disabled) and Yannick's flat-cap copy;
athlete self-only Membership + Settings row; owner editor (preselect,
assign f-4 -> doc + updatedAt, Elite hint, restore to null); coach read-only
card, "‹ Roster" back, coach tab set; admin block-fill footnote hidden when
the week has no Friday block.

Decisions recorded:
- Instructor names on training/tournament rows stay null for parents (no
  rules-compliant read of a coach's users doc; widening it would expose
  staff emails to every family) - the row omits the segment. Specialist
  rows name Phil/Yannick with no extra read. Revisit only if coach
  assignment becomes a real production workflow.
- The notification category "Billing" (charges, failed payments, invoice
  receipts) stays on Settings: it is a transactional notice about
  out-of-app billing, keyed by the stored notificationPrefs.billing entry,
  not an in-app billing surface.
- Seed quirk carried forward (emulator-only, pre-existing): Whitfield
  bookings on Nov 7/9/14 are seeded `attended` though the dates are in the
  future, so they list under Upcoming without a cancel affordance.
  Correct per the cancellable rule; a seed follow-up if it confuses QA.
- Queued (db lane flag, out of scope): provision-family.mjs's users write
  is a full replace and would reset a parent's saved notificationPrefs on
  re-run - the same updateMask treatment the athletes write now has.
- PortalRoutes.js (703 lines) and SpecialistBooking.js (747) remain over
  the 500-line guideline, both pre-existing; grandfathered like hooks/.

Deploy steps (owner-gated): push portal/r3:main; deploy
firestore:rules (the package-assignment branch); re-run
provision-family.mjs so packages/elite* carry philSessions 16 (athlete
docs are mask-protected, so any fitness package assigned in the app
survives the re-run).

Not exercised live: the attendance footer "Edit session note" state (needs
a completed session carrying a note; harness-verified by the frontend lane).

## Sprint 12 pins — the token model (2026-09-16)

**For the PM to append to `docs/portal/TEAM.md` after the Sprint 11 integration
notes.** Written against `main` @ 8ce7afe plus the local Sprint 11 merge
(TEAM.md through "Sprint 11 integration notes"). Policy source is
`docs/portal/tokens-and-billing-contract.md` §1–11; its §12–15 and
`CHANGES-2026-09.md` are superseded by this pin, which is written to the
architecture that actually exists — client transactions gated by rules,
derive-don't-store, sanctioned admin-SDK writers, no callables.

Origin: owner's Sept 15 rulings, relayed in full. Direct quotes where it
matters, because several reverse things this team pinned as invariants.

> "We are going to shift to an all-in token model. No more 'tournament'
> tokens, no more 'fitness' tokens. The packages will look similar to
> before, 6, 12, 16, 20, elite. [...] $50, $47.50, $45, $42.50 per session
> for the 4 token packages with elite being unlimited everything for 1000.
> These sessions can also be used as Yannick sessions as well."

> "Elite gets 24/7 access, that's the differentiator."

> "Advance access for the next month's booking [...] 32 days from the
> current day and then elite gets 45." Window rolls at 7 AM.

> "We need to have an automated system that can regulate whether or not a
> person's package has been updated or not and allow or revoke the rest of
> sessions in perpetuity if they lapse." Freeze before revoke. Revocation
> gives up the seat. Hard expiry on tokens each period. Reconciliation as a
> daily DB export, not a cloud function.

> Weekly schedule, 60-min sessions, 15 hard cap: Mon/Wed 3–6, Tue/Thu 3–7,
> Fri 3–5; Sat 9–10 training, 10–12 and 12–2 tournament/training, 2–4
> college / Elite Am / Mid Am (collected in person via Stripe, ~$20, not
> in the app).

> Yannick: resident RYP Golf staff. Leads blocks a few days a week, 1:1
> time weekday daytime, Commitment Contract leader. Per-person cadence one
> visit every 3–4 weeks. Every household gets the 1:1. His cost sits on RYP
> Golf this season.

> Fitness getting more expensive under tokens is accepted. Elite no-show
> rule/tracker: already built (the `noshow` status + Admin's no-shows query).

### What this reverses, on the record

Sprint 11 (merged 2026-09-15) and amendment v1.9.1 built: `athletes.
fitnessPackageId` + the two-select editor; `entitlementsFor()` returning
training/tournaments/phil/mental; Elite `philSessions: 16`; the
SpecialistBooking "no fitness package on file → Reserve disabled" state;
the Membership screen's Golf card / Performance card / Mental line layout;
the "no Stripe, no billing status" keystone. **All of that is rewritten
here.** Sprint 11's Reservations screen, the Membership route and screen
shell, `setAthletePackages` / `useAssignPackages`, and the AthleteDetail
editor survive — narrowed, not removed. Cost is acknowledged: a sprint's
entitlement layer is being replaced one sprint after it shipped, because
the owner's pricing philosophy changed the same day it merged.

Two standing invariants are struck: "Two-pool allowances: training and
tournaments never substitute" and "Elite philSessions/yannickSessions stay
null." See the amended invariants at the end.

### Design keystone

ONE POOL, DERIVED. A token is spent by any non-cancelled booking of any
session type. `used` in a period is a count over bookings; `reserved` is a
count over waitlist entries; a grace token is consumed when a booking
references it. Nothing is a stored counter. **Charging never branches on
`sessions.type`** — if a lane finds itself writing `if (type === ...)` in a
cap or allowance path, that is the pool model coming back; stop and report.

Delivered in two parts so a refactor of what exists never shares a sprint
with the first server-side writers:

- **Part 1 (this sprint):** A, B, D, K, L, N, J-code, I. Periods derive as
  calendar cycles from a household field; ops assigns packages; no Stripe.
- **Part 2 (Sprint 13, interfaces pinned now so Part 1 does not build
  against them wrong):** C, E, F, H — token issuance docs, grace tokens,
  waitlist + promotion trigger, Stripe webhook + membership status +
  revoke + daily export.

### Data contract v2.0 (db lane documents; routing implements rules)

**A. PACKAGES — one catalogue.** `packages/{id}` becomes
`{ id, name, kind: 'tokens' | 'elite' | 'single', tokens: number | null,
price, windowDays: 32 | 45 }`. `tokens: null` means unlimited (Elite only).
Ids `t-6`, `t-12`, `t-16`, `t-20`, `elite`, `single`. **Deleted:** `g-*`,
`f-*`, `drop-in`, `elite-247` (24/7 is an Elite attribute, `access247:
true` on `packages/elite`, not a tier), `philSessions`, `yannickSessions`,
`training`, `tournaments`, `sessions`. `data/packages.js` exports
`TOKEN_PACKAGES`, `ELITE`, `SINGLE_TOKEN`, `packageById`, `tokensFor`
(below), `periodFor` (B), `windowDaysFor(pkg)`. `makeAllowance`, `poolFor`,
`entitlementsFor`, `ratePerSession`, `monthlyTotal` are deleted. Prices
stay out of seeds and reach prod only via the user-gated provisioner
import (v1.1 rule unchanged); catalogue prices carry `pending: true` until
the owner's OK and the UI may render "pending" beside them.

`athletes.fitnessPackageId` → **removed.** The v1.9 package-assignment
rules branch narrows to `hasOnly(['packageId', 'updatedAt'])`.
provision-family.mjs never wrote it, so no prod cleanup beyond the rule.

`bookings.pool` → retired. Writers stop setting it; readers stop filtering
on it. Existing docs keep the field harmlessly. (Rules' create shape drops
`pool` from required keys.)

**B. PERIODS.** A period is the household's billing cycle, anchored on a
day-of-month, **not** the calendar month. `households.periodAnchorDay`
(int 1–28, ops/owner-settable in the Membership editor; absent == 1).
`periodFor(dateISO, anchorDay)` → `{ periodKey: 'YYYY-MM-DD' (period
start), periodEnd }` — pure, in data/packages.js, both data modes.
Bookings gain `periodKey` (string, write-once at create; rules shape-check
it is a `YYYY-MM-DD` string — correctness is client-derived, the same
accepted-gap class as the cap itself). The seed's Whitfield household
anchors on 1; one seeded household anchors on 15 so the mid-month cycle
is exercised.

`tokensFor(athlete, pkg, bookings, waitlist, graceTokens, periodKey)` →
`{ granted, used, reserved, grace: [{ id, expiresAt }], left, unlimited }`.
`granted` = `pkg.tokens` in Part 1 (derived from the assignment); in Part
2 it reads the period's `tokenPeriods` doc when one exists and falls back
to `pkg.tokens` when none does (absent == the package's grant, so Part 1
data is valid Part 2 data). `used` = non-cancelled bookings with this
`periodKey`. `reserved` = waitlist entries with this `periodKey`. `left` =
`granted - used - reserved`, floored at 0; `unlimited` when `tokens ===
null`.

**Charging rule:** a booking is charged against the period its
`sessions.date` falls in — never the period it is made in. That is the
whole of "hard expiry": January's grant can only be spent on January
dates, and a February date booked in January simply counts against
February. There is no "provisional" status; a future-period booking is a
confirmed booking whose period has not been reached, and the UI badges it
"next period" by comparing `periodKey` to today's. The client cap for any
period is `pkg.tokens` (Part 1) or the period's grant (Part 2); a family
can therefore hold at most one package's worth of bookings in any single
period — the advance-booking cap falls out for free.

`assertWithinMonthlyCap` in live.js becomes `assertWithinPeriodCap`: reads
the athlete, its package, the period's bookings + waitlist (+ grace and
`tokenPeriods` in Part 2) inside the transaction; skips when
`pkg.tokens === null`; typed reasons `'no-tokens-left'`,
`'outside-window'` (D), `'membership-inactive'` (H). The specialist branch
is deleted (K).

**C. TOKEN ISSUANCE (Part 2).** `tokenPeriods/{athleteId}_{periodKey}`:
`{ athleteId, householdId, periodKey, periodEnd, granted, source:
'stripe' | 'ops', createdAt }`. `granted` is stored because it is a fact
about a payment event (what was actually issued), the same class as
`tournamentResults.position` — not a derivation. Written by the Stripe
handler (admin SDK) or by ops/owner (rules: create only, shape-checked, id
must equal `{athleteId}_{periodKey}`). **Members read own; no member
write.** Absent == `pkg.tokens` (B), so nothing breaks before Stripe lands.

**D. BOOKING WINDOWS.** `SPECIALIST_BOOKING_WINDOW_DAYS` is deleted. Every
session type uses the athlete's package window: `windowDaysFor(pkg)` → 32,
Elite 45. The window **rolls at 07:00 America/Chicago**:
`anchor = localNow.hour >= 7 ? localToday : localToday - 1; openThrough =
anchor + windowDays; bookable iff session.date <= openThrough`. Pure
`openThrough(now, windowDays)` in data/calendar.js. Client gate in
`createBooking` (reason `'outside-window'`); `useSchedule` /
`useSpecialistSlots` fetch through `openThrough` instead of 7 / 14 days;
BookSession and SpecialistBooking render days past the window as locked
with "opens 7 AM on <date>". Rules: routing evaluates a hard outer bound
(`session.date <= request.time + 46d` as an ISO compare) and pins it if it
fits without `substring()`; if not, the client gate stands as an accepted
gap of the existing class.

**E. GRACE TOKENS (Part 2).** `graceTokens/{auto}`: `{ athleteId,
householdId, expiresAt (ISO date, minted + 30 days), reason:
'session-cancelled' | 'waitlist-expired', sourceSessionId, createdBy,
createdAt }`. Created by ops/owner (rules, shape) or the sweep script
(admin). Members read own. **Consumed is derived:** a non-cancelled booking
with `graceTokenId == id`. `createBooking` charge order: soonest-expiry
unconsumed grace token first, else the period. Rules on booking create
with a `graceTokenId`: one `get()` of the grace doc — its `athleteId`
matches and `expiresAt >= sessions.date`. Minting triggers are exactly two:
staff cancels a session (`sessions.status → 'cancelled'` with bookings;
ops mints one per confirmed booking from the attendance screen — a
"Cancel session" action, new), and a waitlist entry whose session date
passes unpromoted (sweep). An athlete's own cancellation, leaving a
waitlist, or revocation mints nothing. This is the whole of the earlier
tournament-rollover policy, generalized.

**F. WAITLIST (Part 2).** `waitlist/{sessionId}_{athleteId}`: `{ sessionId,
athleteId, householdId, date, periodKey, joinedAt, createdBy }` — the
keyspace gives one entry per athlete per session, matching bookings. Member
create (own athlete / household parent; rules `get()` the session and
require `booked >= capacity` and `status == 'scheduled'`); member delete
(leave); admin delete (promote / expire). Elite entries count 0 reserved.
**Promotion is server-side:** rewrite `functions/index.js`'s 2025
`onSessionUpdateNotifyWaitlist` (it reads `participants` / `waitlist`
arrays that do not exist in v1+) as a Firestore trigger on
`sessions/{id}` where `booked` decreased and `status == 'scheduled'`: pick
the head of the waitlist — entries whose athlete holds an unconsumed grace
token first, then `joinedAt` asc — create the booking under admin
(replicating the period-cap check server-side, since rules are bypassed),
`booked + 1`, delete the entry, notify via the existing Courier/Twilio
helpers. **Auto-confirm, no acceptance window in v1** (owner: fine).
Expiry sweep: `scripts/sweep-waitlist.mjs` (daily, run with the export):
entries with `date < today` → delete + mint grace token.

**G. CANCELLATION — unchanged.** Client gate stays "until the day before";
rules' `confirmed <-> cancelled` member branch stays; cancelled bookings
never count. The Aug 27 contract's 12-hour rule was never built and is
withdrawn.

**H. MEMBERSHIP STATUS + STRIPE (Part 2).** `households.membership`:
`{ status: 'active' | 'past_due' | 'lapsed', stripeSubscriptionStatus,
currentPeriodStart, currentPeriodEnd, lastEventId, updatedAt }`.
**Absent == active** (the `fitnessPackageId` absent-as-null pattern), so
every provisioned household is active until the handler writes otherwise.
No member or staff write clause — admin SDK only. Rules on booking create:
one `get()` of the household; deny when `membership.status` is
`'past_due'` or `'lapsed'` (null-safe). That is the freeze, enforced
server-side — a genuine gate, not a client courtesy.

Stripe handler: the **first authenticated production HTTPS function** —
verifies the Stripe signature, idempotent on `event.id` via
`stripeEvents/{eventId}` (admin-only collection), admin SDK. Actions:
`invoice.paid` → create `tokenPeriods` for each athlete in the household
(granted = their package's tokens), set `active`, advance the period
fields. `invoice.payment_failed` → `past_due` (idempotent across retries).
`invoice.payment_failed` with `next_payment_attempt == null`, or
`customer.subscription.deleted` → `lapsed` + **revoke**: every booking for
the household with `date > today` and status `confirmed` →
`cancelled` with `cancelledBy: 'system'`, `cancelReason: 'lapsed'`
(no new status; the existing cancelled treatment renders it, with the
reason line), `sessions.booked - 1` each (which fires promotion), delete
the household's waitlist entries. Tokens need no voiding — no next
`tokenPeriods` doc is issued, and `granted` falls back to nothing only if
the athlete's package is also cleared; ops clears it on lapse from the
editor. `customer.subscription.updated` (package change) → update
`athletes.packageId` via the same admin path; excess future-period bookings
beyond the new grant are cancelled newest-first with reason
`'downgrade'`. **Reinstatement** (`invoice.paid` after `lapsed`) → issue,
`active`; revoked bookings stay cancelled — the UI says so. Freeze before
revoke is deliberate: an expired card blocks *new* bookings immediately and
costs nothing already booked until Stripe's final retry.

Daily export: `scripts/export-memberships.mjs` — one row per household:
app status, live `subscription.status` from the Stripe API, period dates,
per-athlete granted/used/reserved, open bookings, `MISMATCH` when they
disagree. A script on the sanctioned-writer auth, not a function. The
webhook stays primary; the export is the audit for the events it dropped.

**I. FUNCTIONS CLEANUP (Part 1, amends "do not touch functions/index.js").**
That ruling protected the Courier/Twilio *helpers*, which stay. The 2025
`onRequest` endpoints — `createPaymentIntent`, `handlePaymentSuccess`,
`processRefund`, `notifyWaitlist`, `sendSMS`, `sendBookingConfirmation`,
`sendSessionReminder`, `testCourier`, `addTokens`, `useTokens`,
`getUserTokens` — are unauthenticated HTTP with open CORS. `addTokens`
writes token balances for any caller. **None of these may be deployed
under a token model.** Delete them; keep `handleSMSResponse` only with
Twilio signature verification; keep `onBookingCreateNotifyChild`. The
helper functions they wrapped become the internal API the Part 2 trigger
and handler call.

**J. SCHEDULE.** Production sessions come from the Google Calendar sync,
so the locked weekly schedule is a **calendar edit by the owner**, not a
code change: "Training block" / "Tournament" events at Mon/Wed 3, 4, 5;
Tue/Thu 3, 4, 5, 6; Fri 3, 4; Sat 9 (training), 10, 11, 12, 1 (as titled).
The Sat 2–4 college / Elite Am / Mid Am event is titled anything that does
not match `classifyTitle` → skipped → display-only, exactly as the sync
was designed; nothing to build. Yannick-led group blocks are titled
"Training block · Yannick" and the synced `label` carries it (parents do
not get coach names per the Sprint 11 decision; the label is the visible
signal). Code: `schedule.js` generator moves to per-day blocks for seed
parity (`{ Mon: [15,16,17], Tue: [15,16,17,18], Wed: ..., Fri: [15,16] }`
in 24h), the `friday` option and `overflow` field are deleted, Saturday
generates 9 + four 60-min blocks with the 2–4 pair as `type: 'adult',
bookable: false` (display only; sync never produces this type — it is
seed-only so the emulator shows the real Saturday). `CAPACITY` stays 15;
the sync's map stays `{ training: 15, tournament: 15, phil: 6, mental: 1 }`.
**Open:** whether 10–12 and 12–2 are single 2-hour events — if so the owner
titles one event per window and the generator follows.

**K. SPECIALISTS.** Phil (6) and Yannick (1) sessions spend an ordinary
token. `SPECIALIST_MONTHLY_CAP` becomes a per-type frequency knob,
`SPECIALIST_MONTHLY_CAP = { phil: null, mental: 1 }` — `null` means tokens
are the only limit; `mental: 1` per calendar month is the owner's stated
3–4 week cadence expressed as a cap and is owner-tunable (it is a
*frequency* rule, not a pool — it never creates an allowance). The Sprint
11 'no-fitness-package' / 'cap-reached' Phil states are deleted; Yannick's
'cap-reached' stays with copy "next mental game session opens <date>".
`isSpecialistType` stays for display only. Athlete Home's "1-on-1 coaching"
card and ParentDashboard's action survive.

**Open — owner ruling before daytime slots go on the calendar:** the
existing 'mental' session is athlete-attended (capacity 1, parent may book
for the kid). The owner's "1:1 time for parents during the day" reads as
the *parent* attending. If so, that is a new booking shape — attendee is a
guardian, token comes from a named child — and it is not built. Pin the
athlete-attended model for Part 1; do not build parent-as-attendee until
ruled.

Commitment Contract: the review rides Yannick's 1:1 cadence, so
`athletes.lastMentalSessionAt` is **derived** (latest attended 'mental'
booking) and the Contract screen shows "Check-in due" when > 28 days —
no monthly review cycle, no new field.

**L. ELITE.** `packages/elite`: `tokens: null`, `windowDays: 45`,
`access247: true`. The cap check skips on `tokens === null`; the
Membership card reads "Unlimited · 24/7 access · books 45 days out". No
countdown anywhere for Elite. No-shows: the existing `noshow` status and
Admin's "No-shows this month" query are the tracker — no new mechanism.
24/7 paperwork (waiver, age rule, door credentials, insurance) is Mike and
Luke's, outside the app.

**M. SINGLE TOKEN.** `packages/single`: `tokens: 1, price: 65 (pending),
kind: 'single', windowDays: 32`. Assignable by ops like any package; an
athlete on `single` has one token per period. (Whether singles are sold
per-visit rather than as a period package is a Stripe-sprint question; the
catalogue entry costs nothing now.)

### Hook seam (routing owns; frontend codes against)

- `useMembership()` payload: `members[].golf/fitness/entitlements` →
  `members[].package: { id, name, price, tokens, windowDays, kind } |
  null` and `members[].tokens: { granted, used, reserved, left, unlimited,
  grace: [{ id, expiresAt }], nextPeriod: { periodKey, booked } }`.
  `resetsOn` → `periodEnd`. Household gains `periodAnchorDay` and (Part 2)
  `membership.status`.
- `useAssignPackages()` → `assign(athleteId, { packageId })` (one field);
  new `useHouseholdSettings()` → `{ setPeriodAnchorDay(day) }` ops/owner.
- `useBooking().book()` reasons: `'no-tokens-left'`, `'outside-window'`,
  `'membership-inactive'` (Part 2), `'full'` unchanged; the specialist
  reasons collapse to these plus `'cap-reached'` for mental only.
- `useSchedule` / `useSpecialistSlots` / `useHouseholdReservations` items
  gain `periodKey` and `nextPeriod: boolean`; Reservations and MySchedule
  badge it.
- Part 2: `useWaitlist(sessionId)` → `{ position, join(), leave() }`;
  `useBooking` returns `'waitlisted'` when the session is full and the
  caller joins.

### UI (frontend lane)

- Membership.js: per member — one **Tokens** card (used / granted / left;
  grace line "1 bonus token, expires <date>" when present; "N booked next
  period"), one **Coaching** line ("Yannick: 1 of 1 this month"), the
  contract tier line unchanged. Elite card per L. The staff editor:
  one package select (t-6 … t-20, elite, single) + period anchor day.
  The word "billing" stays off every live member surface (Sprint 11
  ruling holds; Part 2 adds a membership *status* line, which is not
  billing).
- BookSession / SpecialistBooking: remove every pool and "does not use
  your allowance" line; the sheet says "Uses 1 token · 7 left this period"
  (or "Uses a bonus token" / "Included with Elite"); days past the window
  render locked with "opens 7 AM on <date>"; full sessions offer Join
  waitlist (Part 2).
- AthleteDashboard: the allowance card becomes the tokens card (one
  number; Elite shows no number). ParentDashboard child cards likewise.
- Reservations / MySchedule: "next period" badge; Part 2 adds a
  `waitlisted` row state and the system-cancelled reason line.
- Admin: "No-shows this month" gains a per-athlete count (Elite brake);
  Part 2 adds "Past due / Lapsed households".
- StatesHarness: Membership tokens/elite/grace, BookSession
  window-locked / waitlist, Reservations next-period.

### DB lane

- DATA-MODEL v2.0: packages table rewritten (A, L, M), `athletes` drops
  `fitnessPackageId`, `bookings` adds `periodKey` and marks `pool`
  retired, `households` adds `periodAnchorDay` (+ `membership` map, Part
  2), new tables for `tokenPeriods`, `graceTokens`, `waitlist`,
  `stripeEvents` (Part 2, documented now, seeded empty).
- seed-firestore.mjs: catalogue = the six new packages (no prices);
  Whitfield on t-12, jordan's past bookings carry `periodKey`; one
  household on anchor 15; one Elite athlete; Part 2 seeds one grace token
  and one waitlist entry for the states.
- provision-family.mjs: catalogue bundle from the new packages.js;
  packages docs are a full-replace write (prod has `g-*`/`f-*`/`elite-247`
  docs today — the deploy step is a user-gated re-run that also **deletes**
  the retired ids, listed in the printed plan).
- sync-calendar-sessions.mjs: no capacity change; `classifyTitle`
  unchanged; verify it never emits `pool`.
- Indexes: `bookings (athleteId, periodKey)` and `waitlist (sessionId,
  joinedAt)`; say so if the existing `(athleteId, date)` index already
  serves the period query via a date range.
- scripts (Part 2): `export-memberships.mjs`, `sweep-waitlist.mjs`, on
  `scripts/lib/prod-auth.mjs` like the sync.

### Functions lane (new; Part 2 except I)

`functions/index.js` cleanup (I) is Part 1. Part 2 adds the Stripe
handler (H) and the promotion trigger (F). Both run under the admin SDK
and are the first production writers that are not user-gated scripts —
which is why they are a separate sprint, deploy last, and carry their own
emulator tests (Stripe CLI event replay against the emulator is the
verification).

### Invariants — amended

- ~~Two-pool allowances: training and tournaments never substitute.~~ →
  **One token pool. `sessions.type` is display, roster and Tour only;
  charging never branches on it.**
- ~~Elite philSessions/yannickSessions stay null.~~ → the fields are gone;
  Elite is `tokens: null`.
- **`households.membership` absent == active; `tokenPeriods` absent ==
  the package's grant.** Nothing provisioned today breaks.
- Derive-don't-store: `used`, `reserved`, grace consumption, "next period",
  `lastMentalSessionAt`, the specialist frequency cap — all counts.
  `tokenPeriods.granted` and `graceTokens` are stored because they are
  events, not tallies.
- No invented numbers: prices carry `pending` until the owner's OK; the
  seed carries none.
- Unchanged: no `substring()` in rules; one bump per write; files under
  500 lines; minors' data minimization; deploys are the owner's call.

### Sequencing

Part 1: A → B → D → K → L/M → N (Membership/editor) → J-code → I. The
period + cap rule is what everything reads, so A/B land in db/routing
before any screen. Report what is NOT done rather than rush it.

Part 2 (Sprint 13): C → E → F → H, functions last, with the two scripts.
Do not start Part 2 in a Part 1 worktree.

Worktrees: wt-db / wt-routing / wt-frontend on
`agent/<lane>/sprint12-tokens` off `portal/r3` at this pin's commit; PM
merges db → routing → frontend, integrates, browser-passes on :3001.

### Open — owner rulings needed

1. Package prices (pending Luke).
2. Saturday 10–12 / 12–2: two 60-min sessions or one 2-hour event each (J).
3. Yannick daytime 1:1 attendee — athlete (built) or parent (not built) (K).
4. `SPECIALIST_MONTHLY_CAP.mental` — 1 as pinned, or a different cadence.
5. Whether `single` is a period package or a per-visit sale (M).
6. Waitlist acceptance window — none in v1 as pinned; revisit if promotion
   into an unwanted slot becomes a support pattern.

## Sprint 12 integration notes (Part 1 - PM merge + live pass, 2026-09-16)

Landed ahead of the lanes as PM commits: the seam (f7d6d22 - TOKEN_PACKAGES /
ELITE / SINGLE_TOKEN, packageById, windowDaysFor, normalizeAnchorDay,
periodFor, tokensFor; calendar.js openThrough / windowOpensOn rolling at
07:00 America/Chicago - all unit-checked), the functions cleanup (pin I,
546e152: the thirteen unauthenticated 2025 onRequest endpoints, their
2025-model helpers and sendDailyReminders deleted; Courier/Twilio helpers,
the two Firestore triggers and cleanupSMSLogs kept; handleSMSResponse now
verifies X-Twilio-Signature and uses a real sendSms helper - the old handler
called an HTTP export as a function and could never have run), and
DECISION-GAPS.md. The task-chip session's users-write updateMask fix landed
as 13eefcd before the DB merge.

All three lanes merged clean (db -> routing -> frontend, --no-ff).
Reconciled at integration:
- The DEPRECATED two-pool block in packages.js and the seed's ALLOWANCE
  fixtures are deleted; packages.js is the 128-line seam. No importer of
  GOLF_PACKAGES / FITNESS_PACKAGES / ELITE_TIERS / DROP_IN / makeAllowance /
  poolFor / entitlementsFor / ratePerSession / monthlyTotal remains.
- Two fields the frontend consumed optionally now exist: useMembership
  members carry `coaching: { used, limit, capReached }` and
  useSpecialistSlots data carries `capReached` - both derived by one
  `coachingFor(bookings, today)` (non-cancelled 'mental' bookings in the
  calendar month against SPECIALIST_MONTHLY_CAP.mental), in both modes.
- useHouseholdSettings(householdId) is wired into the editor's period-anchor
  control (the routing lane put the household id on the hook call rather
  than the setter, since ops manage many households - accepted). The
  household and its anchor ride the athlete-detail payload (householdId,
  householdName, periodAnchorDay), fetched with a tolerated denial for
  callers the rules keep out of households.
- The seed-only adult block (pin J) flows through displaySession as
  `bookable: false`; a `isGroupBookable()` predicate keeps it (and specialist
  slots) out of the booking slots, recurrence, coach day and admin block
  fill, while the month calendar still lists it and Book a Session renders
  it as a display-only "Front desk" row. TypeChip gains `adult`.
- OnboardingSteps (owned by no lane) moved off the two-pool copy and passes
  `tokens` to the rewritten meter; data/admin.js demo ids moved to t-*.
- Live membership entries now carry the catalogue's `pending` flag beside
  price (seed docs strip both; they are catalogue facts).

Live emulator pass (athlete-jordan, parent-dana, owner) on the token seed:
athlete home and Book a Session show one number ("9 left · 3 of 12 used" -
two attended Phil sessions and today's Yannick session all spend ordinary
tokens); parent Membership shows a Tokens card per kid with "Yannick: 1 of
1 this month"; Reservations badges every November row NEXT PERIOD; Yannick's
booking screen shows the cap-reached state and Phil's says "SPENDS 1 TOKEN ·
9 LEFT" on the summary and the sheet; the owner's editor preselects the
package, lists "(pending)" prices, and writes households.periodAnchorDay
(verified 15 on the doc, restored). Console clean apart from dev-server
restart noise. Not exercised live: the adult row (season Saturdays sit
outside every window at today's date - harness-verified), the window-locked
day copy (the routing lane verified it live: "opens for booking at 7 AM on
2026-10-03" for Nov 4).

Process findings worth keeping:
- A lane stopped its dev server with `taskkill /F /IM node.exe /T`, which
  killed every Node process on the machine - the shared emulator (twice,
  the "quiet exit code 1" seen since Sprint 11), the other lane's dev
  server and the QA server. Lane briefs now say: kill by PID/port only.
- Seed coaching rows carry no `type`/`date`, so seed-mode Membership shows
  "Yannick: 0 of 1"; live mode is correct. Seed follow-up if it confuses QA.
- SpecialistBooking.js (748) and BookSession.js (816) remain over the
  500-line guideline; pre-existing, grandfathered like hooks/.

Deploy (owner-gated, in this order): push portal/r3:main and let Railway
build; deploy firestore:rules and firestore:indexes (the athletes package
branch narrows, bookings require periodKey, households gain the anchor
branch, athletes can read their household, the waitlist index); THEN re-run
provision-family.mjs - it deletes the ten retired package docs, so it must
run only once the new build is live. Part 2 (Sprint 13: tokenPeriods, grace
tokens, waitlist + promotion trigger, Stripe handler + membership status,
the two scripts) starts from a fresh pin; the functions lint blocker in
DECISION-GAPS.md gates any functions deploy.

## Sprint 13 pins — token model Part 2: issuance, grace, waitlist, Stripe (2026-09-16)

Origin: the Sprint 12 pin's Part 2 (its sections C, E, F, H, the Part 2
lines of the hook seam and UI lists, and the functions lane), promoted to a
sprint now that Part 1 is live in production (main @ 798bd85, rules v2.0
released, packages migrated by the owner's provisioner run). Policy source
stays tokens-and-billing-contract.md sections 1–11. Everything below is
written to the architecture as built: client transactions gated by rules,
derive-don't-store, sanctioned admin-SDK writers. The two new server
writers — the Stripe handler and the promotion trigger — are the first
production writers that are not user-gated scripts; they deploy last and
carry their own emulator tests.

Owner rulings still open (DECISION-GAPS.md) stay as pinned in Sprint 12:
auto-confirm promotion with no acceptance window; mental cap 1 per month;
athlete-attended 1:1; `single` as a period package; prices pending.

Design keystones (unchanged): ONE POOL, DERIVED; charging never branches on
`sessions.type`; `households.membership` absent == active; `tokenPeriods`
absent == the package's grant; grace tokens are stored because they are
events, their consumption is derived. New for this sprint: every Stripe
handler is idempotent on `event.id`; promotion replicates every client gate
under the admin SDK; no secret ever enters the repo.

### Data contract v2.1 (db lane documents; routing implements rules)

**C. TOKEN ISSUANCE.** `tokenPeriods/{athleteId}_{periodKey}`:
`{ athleteId, householdId, periodKey, periodEnd, granted (int), source:
'stripe' | 'ops', eventId (Stripe event id | null), createdAt }`. Written by
the Stripe handler (admin SDK) on `invoice.paid`, or by ops/owner from the
membership editor ("Issue tokens" for this period or the next — the cash
and comp cases). Rules: member read own (own athlete, or the parent's
household — one `get()` of the athlete); ops/owner CREATE only, shape-
checked, doc id must equal `{athleteId}_{periodKey}`, `granted` an int in
0..40, `source == 'ops'`; no client update or delete. Hooks read the doc by
id for the current period and the next (no query, no index) and pass it as
`tokensFor`'s `opts.tokenPeriod`; absent == the package's grant. Elite
athletes get no doc.

**E. GRACE TOKENS.** `graceTokens/{auto}`: `{ athleteId, householdId,
expiresAt ('YYYY-MM-DD', minted + 30 days), reason: 'session-cancelled' |
'waitlist-expired', sourceSessionId, createdBy (uid | 'sweep'), createdAt }`.
Created by ops/owner (rules create, shape-checked, reason
'session-cancelled' only from clients) or the sweep script (admin). Members
read own (query `athleteId ==`; index `graceTokens (athleteId, expiresAt)`).
Consumed is DERIVED: a non-cancelled booking whose `graceTokenId == id`.
SEAM AMENDMENT (PM, landed with this pin): `tokensFor`'s `used` no longer
counts grace-charged bookings (`graceTokenId` set) — a grace token is a
second life for a token the Academy could not honor, not a period spend.
`createBooking` charge order: Elite → nothing charged; else the soonest-
expiring unconsumed grace token with `expiresAt >= session.date` →
`booking.graceTokenId`, `chargedFrom: 'grace'`; else the period
(`chargedFrom: 'period'`). Rules on a booking create carrying
`graceTokenId`: one `get()` of the grace doc — its `athleteId` matches and
`expiresAt >= request.resource.data.date`. Minting triggers are exactly
two: (1) staff CANCEL SESSION — a new ops/owner action on the attendance
screen: `sessions.status → 'cancelled'`, every confirmed booking on it →
`cancelled` with `cancelledBy` = the staff uid and `cancelReason:
'session-cancelled'`, one grace token per cancelled booking. Client-side,
in chunked batches of at most 8 writes (the rules' ~20-document-access cap
per batch, Sprint 10), idempotent: already-cancelled bookings are skipped
and an athlete who already holds a grace token with this `sourceSessionId`
is not minted twice. (2) the waitlist expiry sweep (F). An athlete's own
cancellation, leaving a waitlist, or revocation mints nothing.

**F. WAITLIST.** `waitlist/{sessionId}_{athleteId}`: `{ sessionId,
athleteId, householdId, date, periodKey, joinedAt, createdBy }`. Member
create (own athlete / household parent) — rules `get()` the session and
require `booked >= capacity` and `status == 'scheduled'`, and (H) the
household's membership not past_due/lapsed; member delete (leave); admin
delete (promote / expire). `tokensFor`'s `reserved` counts entries with the
periodKey; Elite is unlimited anyway. Index `waitlist (sessionId,
joinedAt)` already exists. `useBooking().book()` on a full session joins
the waitlist and resolves `{ status: 'waitlisted' }`. PROMOTION IS SERVER-
SIDE (functions lane): a trigger on `sessions/{id}` update where `booked`
decreased, `status == 'scheduled'` and `booked < capacity` picks the head —
entries whose athlete holds an unconsumed, unexpired grace token first
(soonest expiry), then `joinedAt` asc — replicates the gates under admin
(membership active; period cap unless Elite, counting exactly as
`tokensFor` does; grace-first charge), creates the booking
`{ athleteId, sessionId, householdId, date, type, status: 'confirmed',
periodKey, graceTokenId | null, chargedFrom, createdBy: 'system',
promotedFromWaitlist: true, createdAt }` (no `pool`), `sessions.booked + 1`,
deletes the entry, and notifies through the Courier helper (the athlete's
and the household parent's users docs for email/phone). Repeats while seats
and entries remain. Entries that fail a gate are deleted with no grace
token. AUTO-CONFIRM, no acceptance window. Expiry sweep:
`scripts/sweep-waitlist.mjs` (db lane; the sync's sanctioned-writer auth;
`--dry-run` default, `--yes` writes; `FIRESTORE_EMULATOR_HOST` for the
emulator): entries with `date < today` → delete + mint one grace token
(reason 'waitlist-expired', createdBy 'sweep').

**G. CANCELLATION REASONS.** `bookings` gain optional `cancelledBy` (uid |
'system') and `cancelReason` ('member' | 'session-cancelled' | 'lapsed' |
'downgrade'). A member's own cancel writes `cancelledBy` = uid and
`cancelReason: 'member'` (the member confirmed→cancelled rules branch's
hasOnly grows by exactly these two). Rows render a reason line for the
system reasons; the client gate stays "until the day before".

**H. MEMBERSHIP STATUS + STRIPE.** `households.membership`: `{ status:
'active' | 'past_due' | 'lapsed', stripeSubscriptionStatus,
currentPeriodStart, currentPeriodEnd, lastEventId, updatedAt }` — absent ==
active; admin SDK only, no client write clause. `households.stripeCustomerId`
and `stripeSubscriptionId` become ops/owner-settable through the household
settings branch (hasOnly grows by them) so events resolve to a household:
`where stripeCustomerId == event.data.object.customer`; an unmatched event
is recorded and skipped, never thrown. `packages.stripePriceId` (string |
null, ops-set through the provisioner catalogue for now) maps Stripe prices
to packages. Rules on booking create AND waitlist create: one `get()` of
the household; deny when `membership.status` is 'past_due' or 'lapsed'
(null-safe) — the freeze, enforced server-side.

Stripe handler (functions lane): `stripeWebhook`, an `onRequest` reading
the raw body, verifying the signature with `STRIPE_WEBHOOK_SECRET`,
idempotent on `event.id` via `stripeEvents/{eventId}` `{ type, customer,
householdId | null, receivedAt, outcome }` written in the same transaction
as its effect (clients: no access). Actions:
- `invoice.paid` → resolve the household; for each of its athletes with a
  token package: create `tokenPeriods` for the invoice line's period
  (`periodKey` = the Stripe period start as an America/Chicago date), with
  `granted` = the package's tokens, `source 'stripe'`, `eventId`; set
  `households.periodAnchorDay` to that start's day-of-month clamped 1..28
  (so the app's derived periods align with Stripe); set membership
  `active` and the period fields. Elite athletes: no doc. Reinstatement
  (paid after lapsed) is the same action; revoked bookings stay cancelled.
- `invoice.payment_failed` → `past_due` (idempotent across retries).
- `invoice.payment_failed` with `next_payment_attempt == null`, or
  `customer.subscription.deleted` → `lapsed` + REVOKE: every household
  booking with `date > today` and `status 'confirmed'` → `cancelled`,
  `cancelledBy 'system'`, `cancelReason 'lapsed'`, `sessions.booked - 1`
  each (which fires promotion); delete the household's waitlist entries.
- `customer.subscription.updated` with a price change → map the new price
  to a package via `packages.stripePriceId`; update `athletes.packageId`
  for the household's athletes (unmapped price: record and skip); future-
  period bookings beyond the new grant are cancelled newest-first with
  `cancelReason 'downgrade'`.
Daily export `scripts/export-memberships.mjs` (db lane): one row per
household — app status, live `subscription.status` from the Stripe API
(`STRIPE_SECRET_KEY` from the environment, read-only), period dates, per-
athlete granted/used/reserved/grace, open bookings and waitlist entries,
`MISMATCH` when app status and Stripe disagree; CSV to stdout; in emulator
mode (`FIRESTORE_EMULATOR_HOST`) the Stripe column reads `skipped`.

**I. FUNCTIONS DEPLOYABILITY** (functions lane): `npm --prefix functions
run lint` must pass — align the ESLint quotes rule to the file's single-
quote convention rather than rewriting the file, and fix whatever else lint
reports. `firebase.json` gains the functions emulator (port 5001). Secrets
never enter the repo: `functions/.env` is gitignored; `env.template` gains
`STRIPE_WEBHOOK_SECRET`; the emulator runs on a local `.env` with test
values. Files under `functions/` stay under 500 lines: `functions/portal/
stripe.js`, `functions/portal/promotion.js`, `functions/portal/lib.js`
(period math and the charge order mirrored from `data/packages.js` — change
one, change both), `index.js` re-exporting them next to the kept helpers.

### Hook seam (routing owns; frontend codes against)

- `useMembership()`: `household` gains `membership: { status,
  currentPeriodEnd } | null` (null == active) and `stripeCustomerId`;
  `members[].tokens.grace` lists live grace tokens `[{ id, expiresAt,
  reason }]`; `tokens.granted` reads the `tokenPeriods` doc when present;
  `tokens.used` excludes grace-charged bookings (seam amendment).
- `useBooking().book()` resolves `{ status: 'confirmed' | 'waitlisted',
  chargedFrom: 'elite' | 'grace' | 'period' | null }`; reasons gain
  `'membership-inactive'`.
- New `useWaitlist(sessionId, { athleteId })` → `{ entry, position (1-based
  by joinedAt), join(), leave(), saving, error }`.
- `useSchedule` / `useHouseholdReservations` / `useMonthSessions` items:
  `status` gains `'waitlisted'` (entries merged in, with `waitlistPosition`);
  cancelled items carry `cancelReason` and `cancelledBy`.
- `useSessionAttendance` (staff) gains `sessionStatus` and
  `cancelSession(sessionId)` (E's chunked, idempotent client action).
- New `useIssueTokens()` → `{ issue(athleteId, periodKey, granted), saving,
  error }` (ops/owner).
- `useHouseholdSettings(householdId)` gains `setStripeIds({ stripeCustomerId,
  stripeSubscriptionId })`.
- `useAdminDashboard` gains `membership: { active, pastDue, lapsed,
  lapsedHouseholds: [{ id, name }] }`.

### UI (frontend lane)

- Membership.js: a status line per household — active: nothing loud;
  past_due: "Payment didn't go through — new bookings are paused until it
  clears; everything already booked is kept"; lapsed: "Membership lapsed —
  upcoming bookings were released. Once payment resumes, book again from
  what's open." The grace line shows the reason ("bonus token — the Nov 9
  block was cancelled — expires <date>"). The word "billing" stays off
  every live member surface.
- BookSession / SpecialistBooking: a full session offers "Join waitlist ·
  reserves one token" instead of a dead Full pill; the confirmation state
  for a waitlisted booking says its position; the reason map gains
  'membership-inactive' copy that points at Membership.
- MySchedule / Reservations: a `waitlisted` row state (position + "Leave
  waitlist"), and cancelled rows show the system reason line.
- SessionAttendance / Roster (ops/owner): "Cancel session" behind a confirm
  sheet that states how many bookings will be cancelled and how many grace
  tokens minted; the session then renders as cancelled.
- AthleteMembershipCard (ops/owner): "Issue tokens" (period: this / next,
  granted prefilled from the package, source ops) with a SavedToast; the
  household's Stripe customer / subscription id fields.
- AdminDashboard: "Membership" card — active / past due / lapsed counts and
  the lapsed households list.
- StatesHarness entries for every state above.

### DB lane

- DATA-MODEL v2.1: the four Part 2 collections as built (C, E, F, H),
  `bookings.cancelledBy` / `cancelReason`, `households.membership`,
  `packages.stripePriceId`, and the index reasoning.
- seed-firestore.mjs: jordan gets a `tokenPeriods` doc for the current
  period (granted 12, source 'stripe', a fake eventId) and reese an
  unconsumed grace token (reason 'session-cancelled', expiring in 20 days);
  ONE seed-only full session — capacity 2, booked by jordan and reese, with
  nico waitlisted — flagged in a comment as the one exception to the 15 cap
  so the waitlist state is exercisable; `households.membership` absent on
  whitfield (active) and `{ status: 'past_due' }` on parker; one
  `stripeEvents` doc; a cancelled booking carrying `cancelReason
  'session-cancelled'`.
- firestore.indexes.json: `graceTokens (athleteId, expiresAt)`; say
  explicitly which existing indexes serve the revoke and export queries.
- scripts/sweep-waitlist.mjs and scripts/export-memberships.mjs as in F and
  H, on `scripts/lib/prod-auth.mjs` like the sync, dry-run by default.
- provision-family.mjs: unchanged except the catalogue bundle carrying
  `stripePriceId: null` if the seam adds it (say so).

### Functions lane (new)

`functions/index.js` + `functions/portal/*` per H, F and I. Verification in
an ISOLATED emulator: a scratch `firebase.functions-lane.json` (not
committed) on ports 8082 firestore / 9098 auth / 5001 functions / 4401 hub,
started with `--config`, so the shared instance on 8080/9099 is untouched;
signed Stripe test events built with
`stripe.webhooks.generateTestHeaderString` (no Stripe CLI on this machine)
posted to the emulated `stripeWebhook`; promotion exercised by writing a
full session + waitlist entries through the admin SDK against 8082 and
decrementing `booked`. Report the exact event sequence tested. Deploy is
owner-gated (`firebase deploy --only functions`) and last; the Stripe
dashboard endpoint + secret are the owner's.

### Sequencing

C → E → G → F → H in db and routing (the rules and the charge order are
what every screen reads); frontend builds to the seam shapes and reports
every fallback; functions works independently and lands last. Report what
is NOT done rather than rush it.

Worktrees: wt-db / wt-routing / wt-frontend / wt-functions on
`agent/<lane>/sprint13-part2` off `portal/r3` at this pin's commit; PM
merges db → routing → frontend → functions, integrates, browser-passes on
:3001 (client) and replays the functions lane's event sequence (server).

## Sprint 13 integration notes (Part 2 - PM merge, replay + live pass, 2026-09-16)

Four lanes merged clean (db -> functions -> routing -> frontend; functions
overlaps no other lane, so it landed as soon as its replay passed). PM
commits alongside: the functions replay harness kept as committed dev
tooling (`functions/test/verify-lane.js` + `firebase.functions-lane.json`,
excluded from the deploy lint and bundle), DECISION-GAPS.md updated.

Reconciled at integration:
- Waitlist rule + promotion trigger treat an absent `sessions.status` as
  'scheduled' (generator-written sessions carry none; synced ones do) -
  relayed mid-sprint to both lanes from the db lane's finding.
- Promoted bookings carry `createdBy: 'system'`; no bookings rule keys off
  `createdBy == request.auth.uid` (verified by the routing lane).
- MySchedule / Reservations "Leave waitlist" goes through
  `hooks/waitlist.js#leaveWaitlist`; join and leave both bump `bookings`
  so the lists refresh through their existing seam. The Leave button
  compared `leavingId === item.bookingId`, and a waitlisted row has no
  bookingId while the idle state is null - it booted stuck in "Leaving…";
  now keyed off a non-null row key.
- The waitlisted booking result carries `position` (queue length once the
  entry is in) for the confirmation screens.
- `assertPeriodTokensLeft` reads `tokenPeriods/{athleteId}_{periodKey}` and
  honours an issued grant over the package default (the routing lane
  flagged this as its own follow-up).
- `useIssueTokens` wired into the editor; `SessionAttendanceRoute` resolves
  and passes the signed-in role so ops/owner reach "Cancel session";
  `tokens.grace[]` carries `sourceSessionId` so the grace line reads "the
  Wednesday, Nov 11 block was cancelled".
- Waitlist READ is academy-wide (`signedIn()`), not family-scoped: the
  pinned position needs every entry on the session and a family-scoped
  rule cannot make that list query provable. Entries hold opaque ids only.
  PM sign-off recorded here.

Server replay (PM, merged checkout, isolated emulator 8082/5001): ALL
CHECKS PASSED - invoice.paid issues per athlete, sets the anchor and
active; payment_failed freezes (bookings kept); final failure lapses,
revokes future confirmed bookings with reason 'lapsed', releases seats and
promotion fires grace-holders first; reinstatement re-issues and leaves
revoked bookings cancelled; a subscription downgrade trims future-period
bookings newest-first with reason 'downgrade'; a duplicate event id is a
no-op; an unmatched customer is recorded and skipped; a forged signature
is 400 with nothing written.

Client pass (parent-dana, owner) on the Part 2 seed: Membership shows no
banner for the active household, Jordan's grant from the issued period
doc, the grace line naming the cancelled block; Reservations shows Nico
"#1 on the waitlist", the system-cancelled reason line, and Leave waitlist
deletes the entry; the owner's editor issues a next-period grant (doc
verified, then removed) and saves Stripe ids (verified, then reset); the
owner's Sessions -> attendance -> Cancel session flow cancels the session
and its booking (reason 'session-cancelled', cancelledBy the owner) and
mints a 30-day grace token naming the session; Admin's Membership card
reads 1 active / 1 past due / 0 lapsed. Console clean throughout.

Not exercised live: Join waitlist through the UI (every seeded full
session sits outside today's booking window; the routing lane verified
the join path by rules test, the frontend by harness), the past-due
booking block in the UI (routing verified it live in its own pass), the
promotion trigger against the shared emulator (verified in the isolated
replay only - the shared instance runs no functions).

Cosmetic follow-ups: the owner's Sessions screen lists today's specialist
sessions twice (the pinned "Today" section and the day list both include
today - Sprint 10 quick win, pre-existing); cancelSession leaves
`sessions.booked` at its pre-cancel count on purpose (the session is
gone), which the DATA-MODEL should say explicitly.

Deploy (owner-gated, in this order): push portal/r3:main and let Railway
build; deploy firestore:rules and firestore:indexes (the four new
collections, the membership freeze, the graceTokens index); THEN
`firebase deploy --only functions` (lint passes; STRIPE_WEBHOOK_SECRET
and optional COURIER_/TWILIO_ keys must be set in the functions
environment first); THEN in the Stripe dashboard create the endpoint
https://us-central1-rypacad.cloudfunctions.net/stripeWebhook for
invoice.paid, invoice.payment_failed, customer.subscription.updated,
customer.subscription.deleted and copy its signing secret into the
functions environment; set `households.stripeCustomerId` per household
from the editor and `packages.stripePriceId` per catalogue doc. Until
customer ids are set every event records outcome 'unmatched' and changes
nothing - a safe rollout. The daily scripts: `node scripts/export-
memberships.mjs --prod` (read-only; STRIPE_SECRET_KEY for live status)
and `node scripts/sweep-waitlist.mjs --prod --yes` (writes; dry-run
without --yes).

## Owner UX pass — Mike's parent-account notes (2026-09-16, PM, commit 3ed773a)

Source: Mike's Slack DM notes from testing the parent account on
production the afternoon of 2026-09-16. Six of eight referred to
screenshots the PM could not open (Claude in Chrome was offline), so the
mapping below is inferred from the message text and the parent screens.

1. "Do I need a profile view to set my phone/email for notifications?" →
   Settings (retitled from "Notifications") gains a Profile card: the sign-in
   email read-only and a self-service mobile phone, saved as `users.phone`
   (the second and last member self-write; rules hasOnly notificationPrefs +
   phone, ≤ 32 chars, null clears). The Part 2 promotion notifier already
   reads `phone` — this is what text notices send to.
2. "Should this be three boxes — Golf / PT / Mental? Not all of Phil's will
   be 1-on-1" and "when I click Book a session should it go to an
   intermediate page with those options, or show them here?" → one
   BookChooser (golf session / performance session with Phil / mental game
   session with Yannick) inline on both home screens, and as a sheet off a
   kid's own "Book a session" on the parent home ("Book for Reese"). Each
   option deep-links with the kid and, for specialists, the specialist
   preselected (routes read athleteId / specialistId off navigation state;
   SpecialistBooking gains `initialSpecialist`). "1-on-1 coaching" is gone
   as an entry point; the coaching picker is titled "Coaching". The athlete
   home's quick actions collapse to "Log today".
3. "Can we have a back button on all of this?" → Back links on the coaching
   picker and Book a Session (role-aware: parents return to the family home,
   athletes to their schedule). Tab-root screens keep the tab bar only.
4. "Is this kid name intentional? (tutorial)" → the walkthrough runs on the
   sample Whitfield family by design (practice mode pins seed data, writes
   nothing); it now says so — a "Sample family" badge beside "Practice" and
   the intro copy names the Whitfields and points at Home for the real kids.
5. "This button is not clickable — again" → not identified. The four
   chevron rows on the parent flow were audited and all carry handlers;
   the screenshot is needed.

Verified on :3001 (parent-dana, athlete-jordan): the chooser, the per-kid
sheet landing on Phil with Reese preselected (her balance shown), both
Back links, the phone save (doc verified, reset), the athlete home, the
walkthrough badges. Deploy: push + rules (the phone self-write branch).

## Sprint 14 pins — notifications (2026-09-16)

Origin: the owner (2026-09-16): "we need to build out a notification
system, for waitlist, session reminders, package expiry reminders, etc."
Built on what exists: `functions/portal/notify.js` (Courier helper,
`recipientsForAthlete` = the athlete's own users doc + the household's
parents), the Twilio `sendSms` helper in `functions/index.js`, the Part 2
promotion notice, `users.notificationPrefs` (categories billing · schedule
· newsletter · progress) and the new `users.phone` (owner UX pass).
DEPLOY DEPENDENCY: every sender runs in Cloud Functions, which need the
project on Blaze — parked by the owner. This sprint builds and verifies in
the emulator; it goes live with the functions deploy.

Design keystones:
- SENDING IS SERVER-SIDE ONLY. No client ever sends, and no provider key
  ever reaches the client bundle. Email through Courier, SMS through the
  Twilio helper; each is skipped (recorded as 'skipped') when its key is
  not configured, so the pipeline is testable with neither.
- PREFERENCE-AWARE, PHONE-AWARE. Every notice carries a `category` mapped
  onto the existing `notificationPrefs` ids; a channel sends only when the
  recipient's preference for that category allows it (absent == the
  category's default in `data/parent.js` — mirror the defaults server-side,
  change one, change both), and SMS only when the recipient has a `phone`.
  `billing` stays locked-on (transactional): membership status and token
  expiry always reach at least email.
- LEDGER-IDEMPOTENT. `notifications/{id}` is written once per event with a
  deterministic id (below) inside the send; a scheduled job that runs twice
  sends nothing twice. The ledger is the audit and, read-only, the in-app
  "Recent notices" list.
- DERIVE, DON'T STORE (unchanged): "tokens expiring" is computed from the
  same period math as the app (`functions/portal/lib.js` mirrors
  `data/packages.js`); nothing new is counted or cached.

### Data contract v2.2 (PM documents; functions lane writes)

`notifications/{id}`: `{ kind, category, householdId, athleteId | null,
sessionId | null, bookingId | null, subjectKey (the deterministic key),
title, body, recipients: [{ uid, email: 'sent' | 'skipped' | 'failed' |
'off', sms: 'sent' | 'skipped' | 'failed' | 'off' | 'no-phone' }],
sentAt, createdAt }`. Written by the functions under the admin SDK only.
Rules: parent/athlete read where `householdId` == theirs (one get() of the
athlete for an athlete user, `me().householdId` for a parent); ops/owner
read all; no client write. Index `notifications (householdId ASC,
createdAt DESC)`.

Deterministic ids (`{kind}_{subject}`): `booking-confirmed_{bookingId}`,
`promoted_{bookingId}`, `session-cancelled_{bookingId}`,
`booking-revoked_{bookingId}` (lapsed / downgrade), `reminder-24h_{bookingId}`,
`tokens-expiring_{athleteId}_{periodKey}`, `grace-expiring_{graceTokenId}`,
`membership_{householdId}_{eventId}`.

### Kinds (functions lane)

| kind | category | trigger | recipients | copy (ad-hoc when no Courier template) |
|---|---|---|---|---|
| booking-confirmed | schedule | Firestore onCreate `bookings` with status 'confirmed' (client-created or promotion) | athlete + parents | "<Name> is booked: <session label>, <day> at <time>." |
| promoted | schedule | the Part 2 promotion trigger — rewire `notifyWaitlistPromotion` onto this pipeline (same ledger, same gating) | athlete + parents | "A spot opened — <Name> is now booked for <session>, <day> at <time>." |
| session-cancelled | schedule | onUpdate `bookings`: confirmed → cancelled with cancelReason 'session-cancelled' | athlete + parents | "<session> on <day> was cancelled by the academy. A bonus token was added to <Name>'s account (expires <date>)." |
| booking-revoked | billing | onUpdate `bookings`: → cancelled with cancelReason 'lapsed' \| 'downgrade' — ONE notice per household per event (group by cancelledAt minute), not one per booking | parents | "<N> upcoming bookings were released because <reason>. Book again once payment resumes." |
| reminder-24h | schedule | scheduled daily 17:00 America/Chicago: confirmed bookings dated tomorrow | athlete + parents | "Reminder: <Name> has <session> tomorrow at <time>." |
| tokens-expiring | billing | scheduled daily 09:00 America/Chicago: athletes on a token package whose current period ends in exactly 3 days with `left > 0` (tokensFor mirror, grace excluded) | parents | "<Name> has <N> tokens left that expire <date>. Book before then." |
| grace-expiring | billing | same job: unconsumed grace tokens expiring in exactly 3 days | parents | "<Name>'s bonus token expires <date>." |
| membership | billing | onUpdate `households` when `membership.status` changes | parents | past_due: "A payment didn't go through — new bookings are paused until it clears." lapsed: "Membership lapsed — upcoming bookings were released." active after lapsed/past_due: "Payment received — booking is open again." |

Scheduled jobs use the v1 API (`functions.pubsub.schedule(...).timeZone(
'America/Chicago')`, matching the explicit `/v1` import). Each job's body
is an exported plain function `runX({ now, db })` so the emulator harness
can call it with a fixed clock; a second call with the same clock sends
nothing (ledger). SMS never goes out before 08:00 or after 21:00 Chicago
(defer to the next job run; reminders at 17:00 always qualify).
Recipient/channel resolution lives in one place (`notify.js`):
`sendNotice({ kind, category, householdId, athleteId, sessionId,
bookingId, subjectKey, title, body })` resolves recipients, applies prefs
and phone, sends per channel, writes the ledger doc, and returns it.
Templates: `COURIER_EVENT_<KIND>` env per kind when set, else ad-hoc
content — the same fallback the helper already has.

Files: `functions/portal/notify.js` (sendNotice + gating; may grow past
its current size — split `notify-send.js` / `notify-recipients.js` if it
nears 500), `functions/portal/notices.js` (the per-kind copy builders),
`functions/portal/jobs.js` (the two scheduled jobs' bodies),
`functions/index.js` (exports: onBookingCreated replacing
onBookingCreateNotifyChild, onBookingCancelled, onHouseholdMembership,
sessionReminders, tokenExpiryReminders), `functions/env.template` (new
COURIER_EVENT_* keys). `functions/portal/promotion.js` calls sendNotice.
Delete the 2025 `onBookingCreateNotifyChild` (it reads `parentId` /
`userId` / `childId` fields no v1+ booking carries).

Verification (isolated emulator, `firebase.functions-lane.json`):
`functions/test/verify-notifications.js` seeds households (one parent
with phone, one without; one athlete user), athletes, sessions, bookings,
a grace token; asserts a ledger doc with the expected recipients and
per-channel outcomes for: a client booking create, a promotion, a staff
session cancel, a lapse revoke (one household notice), the reminder job
at a fixed clock (one per tomorrow booking; idempotent on re-run), the
expiry job (tokens and grace, exactly 3 days out; nothing at 4), and a
membership status flip. Courier and Twilio unconfigured → every channel
'skipped' or 'off'/'no-phone' exactly per prefs. Report the sequence.

### PM (this sprint's client and data pieces)

- DATA-MODEL v2.2: the `notifications` table, the index, the kinds.
- firestore.rules: `notifications` read own household / staff; deny writes.
- `data/parent.js` category copy: billing → "Membership & tokens — payment
  problems, token expiry, membership changes (always on)"; schedule →
  "Sessions — confirmations, reminders, waitlist spots, cancellations".
- Settings: a "Recent notices" list (last 10 ledger rows for the
  household, title + relative time), read-only — the in-app inbox.
- `scripts/seed-firestore.mjs`: three seeded notices for the Whitfields.

### Open — owner rulings
1. Reminder timing: 24 hours ahead at 17:00 Chicago as pinned, or morning-of.
2. Expiry warning lead: 3 days as pinned.
3. Whether members should also get a notice for their own cancellation
   (not sent in v1).
4. Progress/check-in notices (`checkin-due` when the Yannick cadence is
   overdue) — not in v1; needs the cadence ruling first.

Implementation notes (PM, after reading the current functions):
- `profileFor` already reads `users.phone` (and the 2025 `phoneNumber`).
- `sendSms` + `logSMS` move from index.js into `notify.js` (or a small
  `sms.js`) with the Twilio client resolved LAZILY like `courier()` — no
  key, no client, outcome 'skipped'. `handleSMSResponse` keeps using it.
- `notificationPrefs` is `{ <categoryId>: { email, sms } }` or null (see
  DATA-MODEL users). Defaults to mirror: billing email+sms, schedule
  email+sms, newsletter email only, progress email only. Billing: email
  always sends (locked); sms per pref.
- `cleanupSMSLogs` shows the v1 `pubsub.schedule` shape; add `.timeZone`.
- Copy builders take the session doc (`label`, `date`, `time`, `type`) and
  the athlete's `firstName`; never the booking's 2025 fields.

## Sprint 14 integration notes (notifications - PM merge, replay + live pass, 2026-09-16)

Lanes: one functions lane (Opus, worktree wt-functions, branch
agent/functions/sprint14-notifications, three commits) merged at c30841d;
the PM built the read side directly on portal/r3 (7b95641) and the
integration edits after the merge. The lane was cut off once by the
account's spend limit mid-run and resumed with its context intact.

What landed (server, `functions/`): `portal/notify.js` `sendNotice` - the
one sender: resolves recipients (athlete + household parents for schedule
kinds, parents only for billing), applies `notificationPrefs` per channel
with the client's defaults mirrored (`CATEGORY_DEFAULTS`; billing email
locked on), claims the ledger row `notifications/{kind}_{subjectKey}` with
`tx.create` BEFORE any provider call (attempted channels written 'failed'
pessimistically, rewritten with the real outcome after), emails through
Courier's email channel, texts through the new `portal/sms.js` (Twilio
client resolved lazily - no key, outcome 'skipped'; 08:00-21:00 Chicago
quiet hours, outside == 'skipped' and never re-sent). `portal/notices.js`
builds copy per kind from the SESSION doc and `athletes.name` (there is
no firstName field). `portal/jobs.js` `runSessionReminders` /
`runTokenExpiryReminders` take `{ now, db }` so the harness drives them on
a fixed clock. `index.js`: onBookingCreated, onBookingCancelled,
onHouseholdMembership, sessionReminders (0 17 * * * Chicago),
tokenExpiryReminders (0 9 * * * Chicago); the 2025 onBookingCreateNotifyChild
is deleted; `revoke.js` sends ONE booking-revoked per household per Stripe
event on both the lapse and downgrade paths; `env.template` lists
COURIER_EVENT_<KIND> for all eight kinds (optional; ad-hoc content
otherwise).

What landed (client + data, PM): rules `notifications` branch (parent by
householdId, athlete by athleteId, staff all, no client write), indexes
`notifications (householdId, createdAt desc)` and `(athleteId, createdAt
desc)`, `hooks/notices.js` + `components/RecentNotices.js` ("Recent
notices" on Settings, newest ten, relative times), category copy
"Membership & tokens" / "Sessions", `SEED_NOTICES` for practice mode,
three seeded Whitfield notices, DATA-MODEL v2.2 `notifications` section,
DECISION-GAPS Sprint 14 rulings.

Deviations from the pin, accepted: `booking-revoked` is keyed
`{householdId}_{stripeEventId}` (one per household per event, sent from
revoke.js where the count is known), not per booking; `membership` is
keyed `{householdId}_{triggerEventId}`; titles were not pinned - the lane's
("Session booked", "A spot opened up", "Session cancelled", "Upcoming
bookings released", "Session tomorrow", "Tokens expiring soon", "Bonus
token expiring", "Payment problem" / "Membership lapsed" / "Payment
received") stand; SMS carries the body verbatim; an account with no email
address records 'skipped' (no 'no-email' value); tokens-expiring has no
membership gate (a past_due family is exactly who should book before the
tokens die); membership speaks only for past_due, lapsed, and active after
one of those.

Verified: isolated-emulator replay `functions/test/verify-notifications.js`
from the MERGED checkout - all 7 steps pass (booking create -> one
booking-confirmed with per-recipient outcomes off/no-phone/skipped exactly
per prefs; promotion -> one promoted and no booking-confirmed; staff cancel
-> session-cancelled naming the grace expiry, member's own cancel silent;
reminders job at a fixed clock -> one per tomorrow booking, none for the
cancelled or day-after bookings, idempotent re-run; expiry job -> tokens
and grace at exactly 3 days, nothing at 4, consumed grace and Elite
silent, idempotent re-run; three membership flips -> the pin's three
bodies, parents only; Stripe lapse -> one booking-revoked for two bookings
plus its own membership notice). `verify-lane.js` (Sprint 13) still passes
after it. `npm run lint` clean, `lib.test.js` 27 passing. Shared emulator:
the notifications rules probe (10 cases: parent/athlete own-only, staff
all, coach denied, create/delete denied even for the owner) passes; :3001
as parent-dana shows Settings with the three notices newest-first and the
renamed categories.

Not exercised: a real Courier or Twilio send (no credentials, by design -
every allowed channel records 'skipped'); the two schedules firing (no
pubsub emulator - their bodies were driven directly); the practice-mode
sample list (:3001 runs live data; the seed path is the same seam).

Deploy (owner-gated, in this order): push portal/r3:main (Railway builds
the Settings list and copy); `firebase deploy --only
firestore:rules,firestore:indexes` (the notifications branch + two
indexes, and the phone self-write from the UX pass); THEN, once the
project is on Blaze, `firebase deploy --only functions` with
COURIER_AUTH_TOKEN and the TWILIO_* keys set - nothing sends until then,
and the ledger stays empty in production, so Recent notices reads
"Nothing sent yet" until the first function fires.

## Sprint 15 pins — push replaces SMS (contract v2.3, 2026-09-16)

Origin: the owner, after setting up Twilio: "there has to be a simpler way
than that" → "ok push is fine + email". US carrier registration (10DLC /
toll-free verification) is what made SMS a mess, and it follows every
vendor, so SMS is RETIRED rather than re-vendored. Built inline by the PM
(no lanes: a channel swap on a pipeline built the same day).

Keystones:
- The PHONE CHANNEL IS WEB PUSH through Firebase Cloud Messaging: no
  vendor, no key on the server (the admin SDK sends with the project's own
  credentials), free. A device registers by granting the browser's
  permission on Settings → "Push notifications"; its FCM token goes on the
  member's own `users.pushTokens` (list, ≤ 10, the third and last member
  self-write). The functions send to every token and prune the dead ones.
  iPhone: push works only once the portal is on the Home Screen (the card
  says so); everywhere else it is one tap.
- EMAIL GETS A SIMPLE TRANSPORT: `functions/portal/email.js` sends over
  SMTP when `SMTP_HOST/USER/PASS` are set (a Google Workspace address + app
  password), else Courier when its token is set, else 'skipped'. No
  Courier account needed.
- The ledger row's recipients become `{ uid, email, push }` with outcomes
  'sent' | 'skipped' | 'failed' | 'off' and, for push, 'no-device'. The
  preferences map stores `{ email, push }` per category; Settings shows
  Email / Push columns; defaults: billing and schedule both on, newsletter
  and progress email only. Billing email stays locked on.
- DELETED: `functions/portal/sms.js`, `handleSMSResponse`,
  `cleanupSMSLogs`, the `twilio` dependency, the quiet-hours rule, the
  TWILIO_* env keys. `users.phone` stays as contact information; the
  Profile card says so.
- Client: `public/firebase-messaging-sw.js` (registered with the Firebase
  config in its query string, so nothing is hardcoded), `hooks/push.js`
  (`pushSupport` → ready | blocked | ios-install | unsupported |
  unconfigured; `enablePush` / `disablePush`; foreground messages refresh
  Recent notices), `components/PushCard.js` on Settings. Needs
  `REACT_APP_FIREBASE_VAPID_KEY` in the build (Firebase console → Cloud
  Messaging → Web Push certificates); until set the card reads "Push isn't
  switched on for this site yet" and email still works.
- Verification: the Sprint 14 replay harness re-pointed at push (users
  with `pushTokens`, outcomes per prefs/devices, push 'skipped' from the
  emulator since FCM is unreachable there); rules probe for the
  pushTokens self-write; :3001 Settings shows the card's states.
- Open: none new. Push is verified end-to-end only after the VAPID key
  exists and the functions deploy (Blaze).

## Sprint 15 integration notes (push replaces SMS - PM build, replay + live pass, 2026-09-16)

Built inline by the PM on portal/r3 (no lanes). Server: `functions/portal/
email.js` (SMTP via nodemailer when SMTP_HOST/USER/PASS are set, else
Courier, else 'skipped'; `sendCourierNotification` and `courierEventId`
moved here from notify.js), `functions/portal/push.js` (FCM
`sendEachForMulticast` to every `users.pushTokens` entry, dead tokens
pruned with arrayRemove, 'no-device' with no tokens, 'skipped' inside the
Functions emulator unless PUSH_IN_EMULATOR=true, tap link from
`PORTAL_URL` + a per-kind portal path), `notify.js` re-pointed at the two
(`CATEGORY_DEFAULTS` now email/push, `planFor` → email/push, ledger rows
`{ uid, email, push }`), `index.js` minus handleSMSResponse /
cleanupSMSLogs / twilio, `jobs.js` minus the SMS clock argument,
`portal/sms.js` deleted, `twilio` dependency removed and `nodemailer`
added, env.template rewritten (SMTP_*, PORTAL_URL; TWILIO_* gone). Client:
`public/firebase-messaging-sw.js`, `hooks/push.js`, `components/PushCard.js`
on Settings, Email / Push columns and `{ email, push }` preference maps
(a map saved before this sprint carries `sms`, which is simply ignored -
the push default applies), `users.pushTokens` self-write in the rules
(list ≤ 10), the Profile card's phone copy, DATA-MODEL v2.3 rows,
DECISION-GAPS updated (quiet-hours item replaced by "SMS retired").

Verified: isolated-emulator replay `verify-notifications.js` (re-pointed:
users carry `pushTokens`, outcomes 'skipped' / 'off' / 'no-device' exactly
per prefs and devices, push from the emulator 'skipped') - all steps pass;
`verify-lane.js` passes after it; lint clean; lib.test 27 passing; the
emulator loads with only `stripeWebhook` as an HTTP endpoint (the Twilio
webhook is gone). Shared emulator: a pushTokens rules probe (own-doc
write 200, other's doc 403, 11 tokens 403, non-list 403, pushTokens+role
403) passes; :3001 as parent-dana shows the Push notifications card, the
Email / Push columns and the reworded phone help.

Not exercised: a real push. The sandbox build has no VAPID key, so the
card sits in its "not switched on for this site yet" state; `enablePush`
(permission prompt → service-worker registration → getToken → arrayUnion)
runs for the first time once `REACT_APP_FIREBASE_VAPID_KEY` is in the
build, and a real send once the functions deploy. No real email either
(no SMTP credentials in the emulator).

Owner setup, in this order:
1. Firebase console → Project settings → Cloud Messaging → Web Push
   certificates → Generate key pair; put the public key in Railway as
   `REACT_APP_FIREBASE_VAPID_KEY` (and in frontend/.env for local runs).
2. A Google Workspace app password for the sending address → functions env
   `SMTP_HOST=smtp.gmail.com SMTP_PORT=465 SMTP_USER=… SMTP_PASS=…
   SMTP_FROM="RYP Academy <…>"`, plus `PORTAL_URL`.
3. Push portal/r3:main; deploy rules + indexes; then (Blaze) deploy
   functions. Parents turn push on from Settings; on iPhone only after
   Add to Home Screen.

## Sprint 16 pins — the Billing hub (contract v2.4, 2026-09-16)

Origin: the owner: "scrap the newsletter composer. build out the billing
suite to your best ability. Focus on this page being the hub for parents
to see how many tokens are left. This part needs to be ROCK SOLID." This
REVERSES the Sprint 7/11 ruling that kept "billing" off the live member
surface. Built inline by the PM.

Keystones:
- ONE NUMBER, ONE DERIVATION. "Tokens left" on the hub is
  `data/packages.js#tokensFor` over the athlete's real documents — the
  SAME call the booking gate (`hooks/live.js`, `no-tokens-left`), the
  Membership screen, the parent home's child cards and the booking
  screens make. The hub adds no counter, no cache and no second formula;
  it adds the evidence: WHICH bookings spent the tokens, which waitlist
  entries reserve them, which bonus tokens are on file and when they
  expire, when the period resets, and what next period grants. Every
  claim on the page is traceable to a document.
- `/portal/billing` is the parents' hub and gets a Billing tab (Home ·
  Reservations · Billing · Tour · Settings). `/portal/membership` stays
  the athlete's own view; a parent hitting it is redirected to the hub.
  Settings' "Membership" row and the parent home's package links point at
  the hub. The parent home shows the household's payment banner from the
  same membership status the hub renders (it never rendered live before).
- STATUS IS STRIPE'S, TOKENS ARE OURS. The hero reads
  `households.membership` (absent == active): active / past due /
  lapsed, with the retry position when the Stripe handler recorded it —
  `attemptCount`, `nextPaymentAttempt`, `lastFailedAt` are NEW membership
  fields written on `invoice.payment_failed` and cleared on `invoice.paid`.
  The ladder draws only what is known; it never invents dates.
- NO FAKE MONEY. No card art, no invoice rows, no amounts until Stripe
  data exists: one line says card and invoices appear once online billing
  is connected. Package prices are catalogue facts with "pending" where
  flagged. "Update payment method" opens the Stripe no-code customer
  portal login link when `REACT_APP_STRIPE_PORTAL_URL` is set (no server
  needed); otherwise the hero says to contact the academy.
- TESTED AS MATH, NOT AS PIXELS: `data/packages.test.js` pins periodFor
  (anchors 1/15/28, February, year wrap) and tokensFor (cancelled and
  grace-charged bookings excluded, waitlist reserved, expired and consumed
  grace dropped, issued grant overrides the package, floor at zero, Elite
  unlimited, no package == zero); `hooks/billing.test.js` pins the hub's
  view model (spent rows, reservations, last period, reset date, expiry
  nudge, status ladder). Then the emulator: the hub's numbers against the
  seed, a booking and a cancellation moving "left" by exactly one, and
  the past-due household's hero.
- SCRAPPED: the Newsletter composer — screen, route, hook, seed fixtures,
  harness entry, the admin "outstanding" seed row, and the `newsletter`
  notification category (nothing sends one). Three categories remain.

Data contract v2.4: `households.membership` gains `attemptCount: int |
null`, `nextPaymentAttempt: 'YYYY-MM-DD' | null`, `lastFailedAt:
'YYYY-MM-DD' | null` (admin-SDK-only, like the rest of the map). No new
collection, no new index, no rules change.

Open (owner): whether the hub should also list every booking in the
period for Elite (unlimited) members — v1 shows "Unlimited" and the
period's sessions as a plain list.

## Sprint 16 integration notes (the Billing hub - PM build, tests + live pass, 2026-09-16)

Built inline on portal/r3. New: `data/billingHub.js` (pure view model:
`hubMemberFor`, `periodRows`, `statusFor`, `ordinal`, `daysBetween`),
`hooks/billing.js` (`useBillingHub` - fetches the documents, derives
nothing itself; seed branch for practice mode; re-fetches on bookings /
waitlist / graceTokens / tokenPeriods / athletes / households / billing
bumps), `components/TokenMeter.js` (the big number, the used+reserved bar,
chips, bonus line, reset line, the expiry nudge inside the last week, and
the "This period" evidence list with next- and last-period lines),
`screens/Billing.js` rewritten (status hero, "Where this stands" ladder,
per-athlete meters, Plan, Card & invoices). Routing: `/portal/billing` is
a parent route with a Billing tab; a parent at `/portal/membership` is
redirected; Settings' row reads "Billing & tokens" for parents; the parent
home's child package link and its payment banner ("See billing") point
here, and the banner + ON HOLD badges now follow `households.membership`
live (they never rendered live before). The booking gate
(`assertPeriodTokensLeft`) now counts the athlete's own waitlist entries
in the period, as `tokensFor` always did, so "left" on the hub is exactly
what the gate permits. Stripe: `applyPastDue` records `attemptCount`,
`nextPaymentAttempt`, `lastFailedAt`; the paid path clears them. Push
links for the billing kinds open the hub. Scrapped: NewsletterComposer,
its route, `useNewsletter`, the admin fixtures and outstanding row, the
harness entry, and the `newsletter` notification category (client + server
defaults); the seed-only billing fixtures (`BILLING_STATES`,
`DUNNING_LADDER`, `PAYMENT_METHOD`, `INVOICES`, `useBilling`) went with
the old screen.

Tests: `data/packages.test.js` (periodFor: anchors 1/15/28, February and a
leap year, year wrap, clamping; tokensFor: cancelled and grace-charged
bookings excluded, waitlist reserved, grace ordering/expiry/consumption,
issued grant override, floor at zero, Elite unlimited, no package zero)
and `data/billingHub.test.js` (evidence rows equal used/reserved, period
and next/last period dates, issued grants, the nudge, Elite, no package,
anchor 15, status hero for active/past_due/lapsed with and without
recorded dates) - 27 passing via `react-scripts test`. Functions: lint
clean, lib.test 27 passing, `verify-lane.js` passes with two new v2.4
checks (retry position recorded on payment_failed, cleared on paid),
`verify-notifications.js` passes.

Live pass (:3001, emulator seed): Whitfield hub reads Jordan 9 of 12
(three September specialist sessions listed, two attended, one booked),
Nico 6 of 6, Reese 5 of 6 with the Nov 11 bonus token; Plan rows with
pending prices and "Billed monthly on the 1st". A booking added for Jordan
moved it to 8 of 12 with a fourth row; deleting it and adding a waitlist
entry read 8 of 12 as USED 3 · WAITLIST 1 with the waitlist row; removed
after. Parker (new seed user `parent-sam`): RETRY 1 OF 3, "Card declined
Tuesday, Sep 15", next attempt Sep 19, the ladder at Retry 1, Elite
unlimited, Stripe-managed card line; the parent home shows the banner
with "See billing" and ON HOLD. Settings row and the membership redirect
verified.

Not exercised live: the gate refusing a booking at "0 left with a
reservation" (needs nine waitlist entries; the count is three lines of
code, mirrored from tokensFor and covered by the unit tests of the
derivation), the Stripe portal button (no REACT_APP_STRIPE_PORTAL_URL in
the sandbox), and practice mode (bundle-checked; seed branch shares the
view model).

Deploy: push portal/r3:main (Railway); no rules or index change this
sprint; functions carry the retry-position fields for whenever Blaze
lands. Optional: set REACT_APP_STRIPE_PORTAL_URL in Railway to Stripe's
no-code customer portal login link.

## Sprint 17 pins — staff billing + the self-running token model (contract v2.5, 2026-09-17)

Origin: the owner: "continue on with the next sprint" after the Billing
hub shipped. Two gaps the hub exposed: staff cannot see what a parent
sees when the parent calls, and one leg of the token model still runs by
hand (the waitlist sweep). Built inline by the PM.

Keystones:
- STAFF SEE THE SAME HUB. `/portal/admin/households/:householdId` (ops,
  owner) renders the Billing hub for any household, read-only, from the
  same `hubMemberFor` over the same documents — so a support call and the
  parent's screen can never disagree. Reached from a new "Households"
  card on the Admin dashboard (every household: name, standing badge,
  athletes and packages) and from the athlete detail's membership card
  ("View household billing"). Rules unchanged: ops/owner already read
  households, athletes, bookings, waitlist, graceTokens and tokenPeriods
  academy-wide; a parent cannot reach the route (RequireRole) or the data
  (the parent clauses are householdId-scoped).
- ATHLETES SEE THE SAME METER. The athlete's Membership view swaps its
  token card for TokenMeter over `useMyTokens()` (self, own household's
  anchor) — one component, one derivation, three audiences.
- THE WAITLIST SWEEP BECOMES A FUNCTION. `sweepWaitlist`, daily 06:00
  America/Chicago (v1 API, body `runWaitlistSweep({ now, db })` in
  `functions/portal/sweep.js`): every waitlist entry whose session date
  is before today is expired — mint a `graceTokens` doc (reason
  'waitlist-expired', 30 days, `createdBy: 'sweep'`, id
  `{sessionId}_{athleteId}_waitlist`, create-only so a re-run mints
  nothing twice), delete the entry, and send ONE notice kind
  `waitlist-expired` (schedule; subjectKey the grace id): "The waitlist
  for <session> closed without a spot for <Name> — a bonus token was
  added (expires <date>)." `scripts/sweep-waitlist.mjs` stays for manual
  runs and must agree with the function on id and shape.
- COSMETIC, CLOSED: the specialist Sessions screen listed today's
  sessions twice (the pinned Today section and the day list); the day
  list now skips today when the pinned section renders it.

Verification: `functions/test/verify-sweep.js` on the isolated emulator
(expired entry → grace doc + entry gone + one notice; re-run mints
nothing; an unexpired entry untouched; an entry whose athlete already
holds a waitlist-expired token for that session mints nothing); the
existing harnesses still pass; :3001 — owner opens the Whitfield and
Parker household hubs and reads the same numbers the parents read;
athlete-jordan's Membership shows the meter; Phil's Sessions screen
lists today once.

Open: none new.

## Sprint 17 integration notes (staff billing + the self-running token model - PM build, 2026-09-17)

Built inline on portal/r3. Staff: `/portal/admin/households/:householdId`
(ops/owner) renders `screens/Billing.js` in its staff mode — `useBillingHub(
{ householdId })`, "Billing · staff view" header with the household name,
back to Admin, the staff tab bar, no card CTA; reached from the new
`components/HouseholdsCard.js` on the Admin dashboard (every household,
standing badge, athletes and packages; `useHouseholdsDirectory()`) and from
the athlete detail's membership editor ("View household billing"). Athlete:
`screens/Membership.js` rewritten over `useMyTokens()` — the same TokenMeter,
the paused-bookings banner when the household's standing bites, contract
link; the harness's demoMembers/demoHousehold props and their fixtures are
gone (variants are seed-driven like Billing's). Functions:
`portal/sweep.js` `runWaitlistSweep({ now, db })` and the `sweepWaitlist`
schedule (06:00 Chicago) — expired entries mint `graceTokens/{sessionId}_
{athleteId}_waitlist` (30 days, `createdBy: 'sweep'`, create-only), are
deleted, and send one `waitlist-expired` notice (`notices.waitlistExpired`);
an athlete already holding a waitlist-expired token for that session under
ANY id (the manual script's older `sweep-…` ids included) is not minted
again; `scripts/sweep-waitlist.mjs` now mints the same deterministic id.
Cosmetic: the specialist Sessions screen's day list skips today when the
pinned Today section renders it. Fix found in the live pass: the Sprint 16
parent redirect on `/portal/membership` fired before the auth session
resolved, so an athlete was read as a parent, sent to Billing and bounced
home — MembershipRoute now waits for the session.

Verified: `verify-sweep.js` (isolated emulator; two expirations minted +
notified with the pinned copy, one skipped for the script's existing token,
the future entry untouched, idempotent re-run, a later run expiring the
next entry with its own 30-day expiry) — all pass; `verify-lane.js` and
`verify-notifications.js` still pass; functions lint clean, lib.test 27
passing; frontend unit tests unchanged (27); bundle clean. :3001 as owner:
Admin shows "Households · 2" (Parker past due, Whitfield active with three
athletes and packages); Whitfield opens the staff view with exactly the
parent's numbers (Jordan 9 of 12, Nico 6 of 6, Reese 5 of 6 + bonus).
The seed has no Phil session today, so the Sessions dedupe was verified by
reading, not by eye.

Owner's amended pins found in the tree during this sprint (uncommitted,
dated 2026-09-17: SPRINT-12-PINS.md v2.0.1 pricing sheet / facility access /
Elite frequency caps, v2.0.2 capacity 14 + Tue/Thu 3 PM reserved;
tokens-and-billing-contract.md §1) — NOT folded in here; they are the next
sprint's pin.

## Sprint 18 pins — the owner's amendments v2.0.1 / v2.0.2 (contract v2.6, 2026-09-17)

Origin: the owner amended `docs/portal/SPRINT-12-PINS.md` (Sprint 12
amendment v2.0.1 "owner's pricing sheet" and v2.0.2 "capacity 14") and
`docs/portal/tokens-and-billing-contract.md` §1 in the working tree on
2026-09-17. Those two documents are the source; this pin is the build
plan against the tree as it stands after Sprint 17. Built inline by the PM.

Keystones (from the amendments, restated as build facts):
- CAPACITY 14 for training and tournament sessions (was 15). Phil 6,
  Yannick 1 unchanged. `schedule.js` CAPACITY, the calendar sync's map,
  seed and DATA-MODEL. `capacity` is a synced field: prod sessions take
  14 on the next user-gated sync run; a session already above 14 keeps
  its bookings. `data/tour.js` TOUR_POINTS has 25 positions (not 15) and
  is unaffected: a 14-cap bracket simply never reaches the tail.
- TUE/THU 3 PM IS RESERVED (invite-only higher-skill group): removed from
  the generated weekday blocks (Tue/Thu are 4, 5, 6 PM). It is not on the
  shared calendar until concrete; when it is, its title must not begin
  "Training"/"Tournament" or `classifyTitle` makes it bookable by everyone
  — any other title stays display-only. Its booking path is an owner
  ruling for a later sprint (DECISION-GAPS).
- THE CATALOGUE IS t-6 $299 · t-12 $569 · t-16 $719 · elite $999 · single
  $65 (still pending). `t-20` is retired (catalogue, admin seed, comments;
  the provisioner's catalogue run deletes it from prod). Prices are the
  owner's figures now (`pending: false` except single) but are NOT
  RELEASED TO PARENTS: `PRICES_RELEASED = false` in packages.js gates
  every parent/athlete-facing price (Billing hub Plan and meters,
  Membership, Registration's package step); staff surfaces keep them.
- FACILITY ACCESS is a $300/month add-on on any package, never a session
  entitlement: `athletes.facilityAccess: boolean` (absent == false),
  ops/owner-settable in the Membership editor (rules branch widens to
  `hasOnly(['packageId', 'facilityAccess', 'updatedAt'])`) but only when
  `athletes.facilityAccessConsent: { signedAt, byUid } | null` is set —
  the enrollment consent step gains a facility-access waiver + under-18
  guardian permission checkbox (optional; enrollment proceeds without
  it), stored on the request's `consents.facilityAccess` and copied to
  the athlete at approval. Elite keeps `access247: true` as INCLUDED.
  The hub's Plan shows "+ Facility access" (and Elite "includes facility
  access"); prices, when released, add the $300 line.
- ELITE FREQUENCY CAPS (not a pool, never a charge; the named exception
  to "charging never branches on type", alongside K): at most one
  training-or-tournament booking per date and at most one Phil booking
  per date — `eliteDailyCapHit()` in packages.js, enforced in
  createBooking with typed reason `'one-per-day'`; and the mental cap
  becomes per package: `MENTAL_MONTHLY_CAP = { elite: 2, default: 1 }`,
  `mentalCapFor(pkg)` in specialists.js, used by the gate, the coaching
  line and the Yannick slot picker. A token-package athlete's Yannick 1:1
  spends a token (unchanged); Elite's two are included.
- Docs: DATA-MODEL (packages, athletes.facilityAccess /
  facilityAccessConsent, enrollmentRequests.consents, sessions capacity,
  schedule), the two owner documents committed as-is, DECISION-GAPS.

Verification: unit tests (catalogue, eliteDailyCapHit, mentalCapFor,
capacity/blocks); functions replays unchanged; the emulator re-seeded
at 14 with Tue/Thu 3 PM gone; :3001 — a parent's hub and Registration
show no prices, the staff view does; the editor's facility-access toggle
locked without consent and saved with it (rules probe: ops sets
facilityAccess true only with consent on the doc; any other key denied).

## Sprint 18 integration notes (the owner's amendments - PM build, tests + live pass, 2026-09-17)

Built inline on portal/r3 from the owner's amended documents (committed in
this sprint as they were found in the tree). Catalogue: `TOKEN_PACKAGES`
t-6 $299 / t-12 $569 / t-16 $719 (pending false), `t-20` gone, `ELITE`
$999, `PRICES_RELEASED = false`, `FACILITY_ACCESS` ($300),
`eliteDailyCapHit()`; `MENTAL_MONTHLY_CAP = { elite: 2, default: 1 }` +
`mentalCapFor(pkg)` (SPECIALIST_MONTHLY_CAP.mental now reads the default);
`coachingFor(bookings, today, pkg)` and `assertMentalCadence(..., pkg)`
take the package; `assertEliteDailyCap` in createBooking with reason
'one-per-day' (BookingReasons copy added). Schedule: CAPACITY 14, Tue/Thu
blocks 4/5/6 PM (3 PM reserved, not generated), the sync's capacity map
14/14/6/1 with a note on the reserved slot's title. Facility access:
`athletes.facilityAccess` / `facilityAccessConsent`; the enrollment consent
list gains the optional waiver card (`consents.facilityAccess`), approval
copies it to `facilityAccessConsent: { signedAt, byUid }` and sets
`facilityAccess: false`; the Membership editor gains the toggle (visible
only with the waiver on file; otherwise the row says why) and
`assign(athleteId, { packageId, facilityAccess })` writes it; the
package-assignment rules branch widens to `hasOnly(['packageId',
'facilityAccess', 'updatedAt'])` and refuses `true` without the consent;
the athlete-detail payload carries both fields. Prices withheld: TokenMeter
and the hub's Plan card take `showPrices` (staff view only), the Plan row
shows "+ facility access" / "facility access included", Registration's
package step says "Pricing from the academy". Seeds: jordan carries the
add-on + waiver; the enrollment request's consents carry
`facilityAccess: false`; `t-20` is out of the admin seed; the provisioner's
RETIRED_PACKAGE_IDS gains `t-20`. Docs: DATA-MODEL (packages, the two
athlete rows, capacity, a v2.6 section), DECISION-GAPS Sprint 18 (six
items: the reserved slot's booking path, t-20 in prod, the sync run,
PRICES_RELEASED, the server promotion not checking the per-day cap,
facility access in Stripe). One pin correction: `data/tour.js` TOUR_POINTS
has 25 positions, not 15 - untouched.

Verified: `data/amendments.test.js` (catalogue ids/prices/pending,
PRICES_RELEASED false, Elite $999 + access, eliteDailyCapHit for golf/Phil/
Yannick/token packages/cancelled, mentalCapFor, CAPACITY 14, Tue/Thu
blocks) + the earlier suites - 36 passing; bundle clean; the seed writes
390 docs (31 fewer sessions: the Tue/Thu 3 PM blocks); rules probe on the
shared emulator (ops on/off with the waiver, refused without it, package +
access together, non-boolean and stray key refused, parent refused) - all
pass; :3001 - parent-dana's hub renders no "$" anywhere and Jordan's Plan
row reads "+ facility access"; the owner's staff view shows $569 / $299 and
"$569 + $300"; the editor shows "+$300 / month · waiver on file" for jordan
and the locked row for reese; the package select lists the three prices.

Not exercised live: the Elite per-day gate (needs an Elite athlete booking
two same-day sessions through the UI; the rule is the unit-tested
`eliteDailyCapHit`), the enrollment waiver end to end (approval copies it -
read, not run), the calendar sync at 14 against prod (user-gated).

Deploy (owner-gated): push portal/r3:main; `firebase deploy --only
firestore:rules` (the facility-access branch); the calendar sync run so
prod sessions take capacity 14; the provisioner's catalogue run so prod
loses `t-20` and gets the new package docs (prices are never written).

## Repo cleanup (owner request, 2026-09-17)

Origin: the owner: "that whole dissected root folder bothers me... go ahead,
delete the untracked ones too. Any dead or old context files can also be
deleted." Done after a read-only audit (five auditors, three adversarial
verifiers: build/deploy, tooling references, content loss) and a
deterministic reachability check of `frontend/src` (esbuild metafile from
`src/index.js`: 92 of 95 source files reachable).

Removed (104 tracked files; all recoverable from the parent of this
commit): `ryp-academy-frontend/` (the abandoned 2025 TypeScript prototype,
81 files incl. a byte-identical `src_old/`), `backend/venv/` (a Flask stub
and a file NAMED serviceAccountKey.json that was a 7-line code snippet, not
a credential - verified, no key was ever tracked), `deploy.sh` (deployed
everything ungated, to Firebase Hosting, and still told you to set up
Twilio), the two root `INTEGRATION_*.md` and six 2025 guides in
`frontend/`, `frontend/firebase.json` + `frontend/.firebaserc` (Firebase
Hosting config; Railway is the host), `frontend/public/test.html` (was
being served in production), a tracked `.DS_Store`, three unreachable
source files (`components/LoadingSpinner.js`, `services/userSetupService.js`,
`portal/screens/PackageStep.js`), and four dead context docs
(`CHANGES-2026-09.md`, `NEXT-PROMPT.md`, `handoff-r3-update.md`,
`booking-contract.md`) plus the dead rules draft `firestore.rules.r3`. The
last two had never been committed; commit 8a9d206 archives them so they too
are recoverable. Also removed from disk: the root `.env.local` (config for a
non-rypacad project; nothing read it), three emulator debug logs,
`frontend/build/`; and from the parent folder the July 2025 `App.jsx`
prototype, the empty `wt-db/` and dead `.claude-flow/` tool state.

Edits that went with it: `frontend/package.json` loses the three Firebase
Hosting `deploy*` scripts and the `proxy` to the deleted Flask stub
(dependencies untouched, so `npm ci` still matches the lockfile);
`.gitignore` loses five entries that match nothing; the team agent
definitions (`.claude/agents/frontend-dev.md`, `pm-senior.md`) no longer
send lanes to the revision-3 handoff, which described the retired two-pool
model - the spec of record is `design-handoff.md` (visual) plus the owner's
`tokens-and-billing-contract.md` and `SPRINT-12-PINS.md` (policy).

FIX FOUND BY THE AUDIT (a Sprint 18 miss): the "prices withheld from
parents" gate had been applied to the orphaned `screens/PackageStep.js`,
while the LIVE registration step renders `components/PackageCard.js`, which
showed `$price` and a per-token rate unconditionally. `PackageCard` now
takes `showPrices` defaulting to `PRICES_RELEASED`; with the flag false the
card shows what a package includes and no dollar figure.

Kept on purpose: `storage.rules` (firebase.json deploys it),
`firebase.functions-lane.json` (the replay harnesses' isolated emulator),
`frontend/src/components/ErrorBoundary.js` + `styles/theme.js` (App.js's
crash fallback and its tokens), `frontend/.env.example`, every script and
every functions file (each is required or cited), `design-handoff.md`
(cited throughout the code).

Pointers: `tokens-and-billing-contract.md` still cites `booking-contract.md`
by name (the 12-hour cancellation rule, the transaction shape, and the
OPEN makeup ruling whose terms `isMakeup` / `makeupFor` are defined only
there) - read it with `git show 8a9d206:docs/portal/booking-contract.md`.
The staging Firebase project `ryp-academy-app` is real but no longer
referenced anywhere in the repo.

Noticed, not fixed (needs an asset from the owner): `frontend/public/
index.html` and `manifest.json` link `favicon.ico` and `logo192.png`, and
neither file exists - the portal has no favicon or home-screen icon, which
matters now that iPhone push depends on Add to Home Screen. The only copies
in the old app were the stock React logo.

Verified after the cleanup: bundle builds, 36 frontend unit tests, functions
lint + 27 unit tests, every script parses, no live file references a
deleted path.

## Brand icons (owner-supplied logo, 2026-09-18)

The owner sent the RYP Academy logo (1200x1200, black on white), closing the
gap the cleanup audit found: `index.html` and `manifest.json` linked
`favicon.ico` and `logo192.png`, and neither file existed. Generated with
Pillow from that one file into `frontend/public`: `logo512.png` and
`logo192.png` (the full logo on white, 72% wide so it sits inside the
maskable safe zone; the 512 is also declared maskable), `apple-touch-icon.png`
(180x180 - the iPhone home-screen icon Sprint 15's push depends on) and
`favicon.ico` (16/32/48/64). The favicon is the mark's "Y" alone - the grey
chevron and the black slash, lifted by connected components - because the
full wordmark is about 4:1 and unreadable at tab size; swap in an official
icon mark if the academy has one. `index.html`: the real apple-touch-icon,
title "RYP Academy" and a portal description (was the 2025 "Rypacad - Your
fitness and wellness platform"); `manifest.json`: name and short_name "RYP
Academy" plus the icon list; `functions/portal/push.js`: pushes carry
`logo192.png` as their icon. Verified: every file present at its declared
size, the manifest parses, functions lint and tests pass. Not verified in a
browser tab or on a device.

## Brand icons, revised - the white logo on black (2026-09-18, same day)

Supersedes the tile colours in the note above. The owner then sent the
REVERSED logo - white lettering with the grey chevron on a transparent
background, made for dark surfaces ("will work good on black on app") - and
the portal is black, so every icon was rebuilt from it on a black tile:
`logo512.png`, `logo192.png`, `apple-touch-icon.png` (the full logo, 72-76%
wide, maskable-safe) and `favicon.ico` (16/32/48/64: the mark's "Y", grey
chevron + white slash, on black). `manifest.json` `background_color` is now
`#000000`, so the install splash matches the tile and the app. In the app:
`frontend/src/portal/assets/ryp-academy-logo-white.png` (760x303, trimmed,
transparent, resized in premultiplied alpha so the white edges stay clean) is
what `BrandHeader` in `screens/SignIn.js` renders at 196px - it replaces the
dashed "RYP MARK" placeholder and the typed-out "RYP Academy" wordmark on the
sign-in, reset and not-provisioned screens; the tagline stays. PM error worth
recording: the white logo first read as "the chevron alone" because white
lettering is invisible on a white preview - check the alpha channel, not the
picture, before deciding what an asset contains. Verified on :3001: the logo
loads (natural 760x303, shown 196x78), the placeholder text is gone, the tab
title reads "RYP Academy", and /favicon.ico, /logo192.png, /logo512.png,
/apple-touch-icon.png and /manifest.json all return 200. Not verified on a
phone's home screen.

## Capacity per type - training 14, tournament 25 (owner ruling, 2026-09-18)

The owner revised amendment v2.0.2 in `SPRINT-12-PINS.md` and the contract:
training sessions cap at 14, RYP Tour tournaments at 25 (Phil 6, Yannick 1
unchanged), to apply immediately (pre-launch, nothing to honor). Built as
`CAPACITY_BY_TYPE` + `capacityForType()` in `data/schedule.js` - applied where
sessions are MADE (`generateSeason`, holiday extras, and the calendar syncs
`CAPACITY` map), while every reader still sees a plain `session.capacity`. It
is a room fact, never a charge, so "charging never branches on type" holds.
`CAPACITY` stays exported as the training number. The pin asks for TOUR_POINTS
to grow from 15 positions to 25; the table already HAS 25 positions (100 to
14) with 12 participation points beyond, so nothing changed there - logged in
DECISION-GAPS. Verified: 37 unit tests (the generated week carries 14 / 25,
a holiday extra follows its type or its own number, the flat override still
wins), scripts parse, bundle builds. Production sessions take the new numbers
on the next user-gated calendar sync run.

## UI redesign brief for Claude Design (2026-09-18)

The owner shared Luke's draft marketing-site redesign
(`~/Downloads/RYP-Academy-preview/ryp-share`) with one instruction: "DO NOT USE
THIS IS SOURCE OF TURTH. Just use it to reference a ui redisgn breif that will
be given to claude design." Written as `docs/portal/ui-redesign-brief.md`:
sections 3-4 carry the site's visual system (the #0D0D0D canvas, one green
accent, Work Sans 900 + IBM Plex Mono labels, hairline ledgers, datum
numerals, note cards, the instrument-panel idea) and say what to carry over,
what to adapt for a phone-native app, and what to leave on the website;
sections 1, 5 and 6 carry the product facts from the contract, the pins and
the code. Section 8 is the firewall - every factual claim on the site that
conflicts with the portal, with the portal's own answer beside it - plus 8.1,
a vocabulary table so site words (makeup, Drop-In, class, 12U, "4 of 10
open") cannot reach a mockup. Two errors of mine were caught before the file
landed, both by reading the source rather than the summary: the brief said
cancellation was the contract's 12-hour rule (pin G withdrew it - it is
"until the day before", and `data/seed.js` says so in copy), and it gave the
Tour brackets as the owner's original "8-10, 11-13, 13+" rather than the
implemented 10U / 11-13 / 14+ / Open. Section 9 lists real defects the
restyle should fix rather than reproduce - inputs set `outline: none` and the
only global focus rule covers buttons and links, so text fields have no focus
state at all; registration's inline field errors are unreachable because the
step CTA disables first; selected and recommended package cards share one
green border. Section 7.1 prices the work honestly: recolour, hairline, radii,
glow and the heading font are close to a `tokens.js` edit, while type scale
and spacing rhythm are literals across ~1,150 inline style objects. Then five read-only Opus critics reviewed the draft against both sources
(portal facts, containment, design fidelity, designer usability, red team) and
returned 48 findings; the two adversarial verifiers died on the account spend
limit, so the findings were triaged by hand against source instead. The catch
worth recording: an earlier reader had handed me a vocabulary row mapping the
site's Four Zones to the portal's "Workshop / Lab / Arena" rotation, and I
copied it into the one table the brief tells a designer is safe to ship from.
Those names are retired - hooks/index.js says in as many words that the
rotation "was an invented placeholder, and no made-up name ships" - so the
brief would have put invented session names into production, the exact thing
its own section 6 bans. Lesson: a summary from a reader is a lead, not
evidence; the row that says "safe to ship" earns a source read every time.
Other real fixes: the retry ladder is three rungs and there is no reinstated
state; "revoked" has no UI and renders as a cancelled row with a reason line;
Elite reserves nothing on a waitlist; a next-period booking carries a "next
period" badge and provisional does not exist; Saturday sessions and the locked
weekly-hours sentence are real shipped content the "no fixed timetable" rule
would have deleted; the progress meter is never red, by design. The two
mismatches the brief hands the owner (Edina vs Eden Prairie, contract tier 90
vs 95) are now logged in DECISION-GAPS under Sprint 19, which is what the
brief claims. Nothing in the app changed; this is a brief only. Not yet sent
to Claude Design.

## Role testing guide and 45 confirmed defects (2026-09-21)

The owner asked for a testing guide per profile to hand to the staff team. Published as a private
Artifact, RYP Portal Test Guide: https://claude.ai/artifact/8e1wN3kwnYaq6BkPVD9NFj - 181 checks across
five tabs (Athlete, Parent, New family, Coach & Phil, Owner/ops/Yannick), each with steps, what you
should see, a Pass / Fail / Blocked control and a note box. Results are shared through the artifact's
db (each tester writes only their own `results/<id>` doc; everyone reads all; only editors can start a
new round), so Claude can read them back with ArtifactData to triage. Team members need "Can interact"
on the share menu to record results; view-only falls back to results on their own device.

How it was built, because the method is the point: the facts that shape every check were verified
first - production is in live mode and `firebase functions:list --project rypacad` returns no
functions, so no email, push, Stripe events, waitlist promotion or reminders exist in production and
every check that depends on them is marked Not live. Five read-only writers drafted one lane each from
the code, and five adversarial verifiers re-checked every case against the live code path (75
corrections, e.g. exact curly apostrophes in copy, a check that asked a tester to reach a state the
form cannot produce). The writers' 45 suspected bugs went to a separate four-agent refutation pass;
all 45 held up, several with a sharper root cause, and I read the five money/access ones myself. A
third pass tagged 95 checks with the known issue they run into and restated 72 "you should see"
bullets that described a bug as correct - otherwise a tester would have passed the bug. That pass
was not taken blind: 13 of its edits turned K30 (copy promising messages that cannot be sent yet)
into "an email arrives" expectations, contradicting the Not-live rule, and were rejected. Lesson for
the next guide: a verifier that checks "does the code do this" will faithfully certify a bug; the
expected result has to describe intent, with the bug named beside it. The page itself was checked at
320 and 375 px with every case expanded - the first pass found three tabs overflowing sideways (long
portal addresses inside grid cells), fixed before publishing. K10 and K21 are deliberately left off
the tester page (a security hole, and a consent-record gap testers cannot see).

Owner ruling needed on K08: when the academy cancels a session, should a family get one token back
or two (today: the booking's own token returns because cancelled bookings are not counted, and a
bonus token is minted on top).

Confirmed defects, most serious first (full evidence with each claim is in the verification run):

- **K08** (serious) When staff cancel a session, each booked athlete gets their normal token back and also a bonus token, so they end up one token ahead. `hooks/grace.js:173-226`
- **K10** (serious, not on the tester page) The parent update branch excludes only stripeCustomerId, stripeSubscriptionId and periodAnchorDay, so a parent can write membership (for example status back to 'active') through the SDK. Both the booking and waitlist create gates, and the client transaction, trust households.membership.status to freeze past_due/lapsed families, so that freeze can be bypassed. `firestore.rules:858-866`
- **K12** (serious) If a new sign-up uses a guardian email that already belongs to another family, approving it gives that login access to the other family's account, and the new children are never added. `hooks/live.js:1305-1311`
- **K25** (serious) From Settings, '+ Link another athlete' either fails with an error or, once staff approve it, adds no child. If a different email is typed, the parent can be moved into a new empty family and lose sight of their existing kids. `firestore.rules:998-1002 (update requires resource.data.status in ['pending'`
- **K28** (serious) The enrollment form lets you type any email. If it matches an existing family's email, approving the request puts the new account into that other family. `screens/Registration.js:79-81 (email starts '' when not a demo`
- **K01** (major) The number of tokens left on the Home screen and Book a Session can differ from Billing and My Schedule, for example after joining a waitlist, getting a bonus token or being given extra tokens by staff. `hooks/index.js:347-351`
- **K02** (major) On Book a Session you can tap an earlier day this month that had sessions and book it, which spends a token on a session that already happened, and the app gives you no way to cancel it. `hooks/index.js:1107-1116 (month fetched from month start)`
- **K03** (major) Using 'Repeat weekly' can book weeks further out than the family's booking window, double-book an Elite athlete on the same day, or use more tokens than the athlete has, and weeks that fail for other reasons are reported as 'full'. `hooks/index.js:938-1063`
- **K04** (major) Once an athlete has used this month's Yannick session, the Yannick booking screen blocks every slot, including next month's that should be open, and the 'next session opens' date can name the wrong month. `hooks/index.js:381-389`
- **K09** (major) A session staff cancelled in the app can come back as bookable after the next calendar sync, showing fewer open spots than it really has, and its bookings stay cancelled. `hooks/grace.js:198-212`
- **K11** (major) A staff member can open the family sign-up page and submit a request; if someone approves it, that staff account becomes a parent account and loses its staff screens. `PortalRoutes.js:104-111`
- **K13** (major) A golf coach who opens a session that includes a newly enrolled athlete gets an attendance screen that fails to load, with no athlete list. `hooks/index.js:3650-3651 (Promise.all over fetchAthlete)`
- **K15** (major) A mental-performance coach who opens the Admin tab sees an empty dashboard with no numbers. `hooks/index.js:3351-3363 (one Promise.all that includes fetchPendingEnrollmentRequests and fetchAllHouseholds)`
- **K16** (major) A staff invite sent by mistake can't be withdrawn in the app, and the next provisioning run gives that person the staff role anyway. `firestore.rules:1034-1055 (create`
- **K21** (major, not on the tester page) The relationship to the athlete and the typed signature a family enters at registration are never saved. `screens/Registration.js:81`
- **K23** (major) If a family refreshes the waiting page, it can wrongly say "No enrollment on file" and offer Start enrollment, even though their enrollment is pending, declined or approved. `hooks/index.js:2292-2303 (source with deps ['enrollment'`
- **K29** (major) The practice walkthrough shows your real family and saves real notification changes, won't let you finish the practice booking until October, and still talks about two separate token pools. `screens/OnboardingSteps.js:286-300 (ParentDashboard variant='three'`
- **K30** (major) The app promises emails and notifications (booking confirmation emails, waitlist alerts, 'email notices still arrive', an approval email), and says staff invites take effect on first sign-in, but none of this happens. An invited staff member lands on the 'not provisioned' screen. `screens/BookSession.js:757-761 with hooks/index.js:650 (live confirmation.email = the account email)`
- **K40** (major) Phil's Capture tab always shows "No assigned athletes", its back link opens the group coach's Today page, and opening Tour as any staff member leaves you with no tab bar to get back. `screens/DiagnosticCapture.js:339-371 (useCoachRoster`
- **K07** (minor) If you tap 'Join waitlist' again on a full session you are already waiting for, the app does not say you are already on the list and shows a technical permissions error instead. `screens/BookSession.js:446-483`
- **K14** (minor) When an owner or ops user opens a session from My sessions and taps IN or OUT, nothing happens and no error is shown. `firestore.rules:606-624 (update allowed only for role=='coach' with an assigned athlete`
- **K18** (minor) Typing or following a wrong portal address shows a blank white page instead of redirecting you. `PortalRoutes.js:494-770 (no path="*" route)`
- **K19** (minor) Opening the attendance page directly, without picking a session, shows six made-up athlete names, and owners get a Cancel session button that pretends to succeed. `screens/Roster.js:243-266 (live = isLive() && sessionId != null`
- **K20** (minor) During registration, the Continue button stays grey with no explanation of which field still needs filling in. `screens/Registration.js:106-120 (showErrors is set only inside handleContinue)`
- **K24** (minor) Staff are told the decline reason lets the family edit and resubmit, but the family only gets a 'Resubmit for review' button that sends the same details again with nothing changed. `screens/NotProvisioned.js:226-283 (DeclinedState calls submit(request) with the stored request`
- **K26** (minor) If enrolling or resubmitting fails, the family sees technical text such as 'submitMyEnrollmentRequest: Missing or insufficient permissions.' instead of a friendly message. `hooks/live.js:87-99 (wrap builds the message as `${context}: ${err.message}`)`
- **K27** (minor) The date-of-birth field accepts a future date or an adult's birthday, and enrollment goes through anyway. `screens/Registration.js:103 (athletesValid only checks dob !== '')`
- **K32** (minor) On any day with no session (for example a Sunday mid-season), Book a Session shows a green banner saying the season opens on the next session day. `hooks/index.js:638-641 (seasonNote whenever dates[0].iso > today)`
- **K33** (minor) The athlete's Home page always shows the Commitment Contract as 'On track', even when the Contract tab says 'Behind'. `screens/AthleteDashboard.js:292 (hardcoded 'On track' span in ContractCard)`
- **K34** (minor) A named calendar event (for example a holiday tournament) shows as plain 'Training block' or 'Tournament block' on Book a Session and on its confirmation, while My Schedule shows the real name. `hooks/index.js:1094-1095 (month rows spread displaySession output`
- **K36** (minor) Opening an athlete that fails to load (or while it loads) shows a fake "Jordan enrolled Feb 8" message, and staff see a "Start a contract" card that errors when they try to save it. `screens/AthleteDetail.js:68 (only data used`
- **K38** (minor) On a busy day with more than 6 sessions (including Phil/Yannick slots), the coach's Today screen can leave out later group blocks. `hooks/live.js:229-258 (MAX_BLOCKS_PER_DAY=6`
- **K39** (minor) On the attendance screen, a slow or failed load looks like nobody is booked, and an IN/OUT tap that fails does nothing with no error message. `screens/Roster.js:245-284 (roster/marks from liveAttendance.data ?? []`
- **K41** (minor) Pressing "Publish to Practice DNA" twice saves the same diagnostic twice, and the number boxes will accept pasted text. `components/NumericField.js:18-21`
- **K42** (minor) A saved session note is hidden when you reopen a session; you only see it after tapping Start session and then Close block. `screens/Roster.js:335 (live always starts 'pre')`
- **K43** (minor) Once a tour score is saved you can change it but never remove it; clearing the box and saving does not delete it. `screens/Roster.js:721-729 (.filter(e => e.score != null))`
- **K44** (minor) The Stripe id boxes on an athlete's membership card always start empty, and saving just one id quietly erases the other. `components/AthleteMembershipCard.js:317-354 (useState('')`
- **K45** (minor) A mental-coach account created without the specialist link opens on Admin, and tapping its Sessions tab just bounces back to Admin. `screens/SignIn.js:46 (mental -> /portal/admin)`
- **K05** (cosmetic) A session the athlete missed (no-show) shows a grey 'Booked' badge on Membership and Billing instead of a red 'No-show' badge. `components/TokenMeter.js:34-42`
- **K06** (cosmetic) On My Schedule, a booking in the next billing period shows 'Confirmed' and never shows the 'Next period' label. `screens/MySchedule.js:271-282`
- **K17** (cosmetic) After a family is approved, the waiting page still says "Account not linked yet" as its heading, just above a green Approved message. `PortalRoutes.js:526-529 (no RequireRole or RequireSignedIn wrapper)`
- **K22** (cosmetic) Tapping "Read the facility rules" at registration opens a panel titled "What is stored" that contains no facility rules. `data/seed.js:77-88 (facilityAccess consent with link 'Read the facility rules')`
- **K31** (cosmetic) Under 'Membership & tokens' the note says push is your choice, but the push switch is locked on and can't be changed. `data/parent.js:53-61 (locked: true`
- **K35** (cosmetic) After booking, the confirmation shows the time without AM/PM ("Tomorrow · 4:00"), and "Back to schedule" takes you back to the booking calendar, not My Schedule. `screens/BookSession.js:240-245 (time/meridiem split)`
- **K37** (cosmetic) The coach's Today pill says "1 BLOCKS", and on a future session day the count card still says "blocks today". `screens/CoachDashboard.js:64 (`${...length} blocks`)`

## Suggested age groups on training blocks (owner ruling, 2026-09-22)

Owner: each weekday block gets a colour-coded age hint, and the weekday pattern gains a fourth
block. Mon/Wed 3 PM and 5 PM are 13 & up, 4 PM and 6 PM under 13; Tue/Thu 4 PM and 6 PM are 13 & up,
5 PM and 7 PM under 13. Recorded as amendment v2.0.3 in SPRINT-12-PINS.md.

Built as `AGE_GROUPS` + `AGE_GROUP_BY_DAY` + `ageGroupFor(session)` in `data/schedule.js`: an
explicit (weekday, start hour) lookup returning null for everything unmapped. Explicit on purpose -
4 PM and 6 PM mean OPPOSITE groups on Mon/Wed versus Tue/Thu, so any odd/even or if/else shortcut
gets half the week wrong, and a wrong age label is worse than none. Resolved ONCE in
`displaySession` and `liveCoachDay` (hooks/index.js), where a session still holds its own date
beside its full "4:00 PM" string - below those, `time` and `meridiem` are two separate fields and a
caller that rejoined them would be one stale meridiem from labelling a morning block as afternoon.
Rendered by `components/AgeGroupChip.js` beside the type chip, through one optional `ageGroup` prop
on the shared `SessionCard`, which is what carries it to the booking day list (plus a one-line key
above it), My Schedule, family Reservations, the athlete's next-session card and the coach's Today
and Sessions lists; the attendance header sets it from the tapped block. Deliberately NOT on the
month grid (every weekday carries both groups, so one cell colour would be a lie), not on the
booking confirmation, and never on a cancelled row.

Colours are new tokens (`color.ageOlder` #5AA9E6, `color.ageYounger` #C79BF2) because the palette
was full of meanings: green is tap/on-track, yellow caution, red error, amber the payment ladder.
6.85:1 and 7.8:1 on the card surface. Colour is never the only signal - the chip always prints "13+"
or "U13", which is what survives colour blindness and a phone in sunlight.

It is a SUGGESTION: booking is not age-gated, nothing branches on it in a charge path, and it shares
no code with the RYP Tour's brackets (10 & under / 11-13 / 14 & up), which are dob-derived for
scoring. The legend says so out loud: "suggested only, any block can be booked".

Also in this change, because the fourth block caused it: `MAX_BLOCKS_PER_DAY` in hooks/live.js was
6, and every session doc on a date counts against it (specialists are filtered out AFTER the fetch).
Four training blocks + Phil + Yannick is exactly 6, so the coach's Today would have silently dropped
its late blocks - that is known issue K38 made worse. Raised to 12.

Verified: 48 unit tests pass (12 new, covering the mapping, the reserved Tue/Thu 3 PM, Fri/Sat and
non-training carrying none, half-hour starts, bad input, and DST dates), production build compiles,
and the chips were read out of the live DOM on a demo server - Mon 4 PM "U13", Mon 5 PM "13+",
Thu 4 PM "13+" (same clock hour as Monday's, opposite group) and Saturday tournaments carrying none.
Not verified on a phone, and not seen in production, because the blocks themselves are not there yet.
