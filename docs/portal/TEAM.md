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
- The calendar sync is the **third sanctioned production writer** (with
  provision-owner and the future billing integration). It maps events by the
  title convention — `Training block` → bookable training, `Tournament` →
  bookable tournament, anything else skipped (display-only) — with session id
  `YYYY-MM-DD-<n>` by start-time order within the day. Emulator always;
  prod runs are user-gated commands.

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
