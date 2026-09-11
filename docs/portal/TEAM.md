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
