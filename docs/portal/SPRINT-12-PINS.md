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

> Weekly schedule, 60-min sessions, 15 hard cap (now **14 training / 25 tournament**, 2026-09-17/18): Mon/Wed 3–6, Tue/Thu 3–7,
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
Tue/Thu 4, 5, 6; Fri 3, 4; Sat 9 (training), 10, 11, 12, 1 (as titled).
**Tue/Thu 3 PM is reserved** for an invite-only higher-skill group (owner,
2026-09-17) — not public, not on the shared calendar until concrete. When it
is, it must NOT be titled "Training block" or the sync makes it bookable by
everyone; title it so `classifyTitle` skips it, and its booking path is an
owner ruling for a later sprint.
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
seed-only so the emulator shows the real Saturday). `CAPACITY` becomes **training 14, tournament 25** (owner, 2026-09-17/18);
the sync's map becomes `{ training: 14, tournament: 25, phil: 6, mental: 1 }`.
`capacity` is a SYNCED field, so prod sessions pick it up on the next sync
run. Pre-launch, so apply it now; nothing to honor. `data/tour.js`
TOUR_POINTS has 15 positions; extend to 25 (owner-tunable table, PM picks
the tail values and flags them) or leave 16–25 on the 5-point participation
fallback, db lane's call, say which.
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

## Sprint 12 amendment v2.0.1 — owner's pricing sheet (2026-09-17)

Relayed from the owner's pricing sheet. Prices still do NOT go to parents;
they reach prod only via the user-gated import, as before.

| Package | Package | + Facility access | Total | Per session |
|---|---|---|---|---|
| 6 sessions | $299 | $300 | $599 | $50.00 |
| 12 sessions | $569 | $300 | $869 | $47.50 |
| 16 sessions | $719 | $300 | $1,019 | $45.00 |
| Elite | $999 all-in | — | $999 | — |

All monthly. Elite includes: unlimited golf sessions with coaching staff
(**one per day**), unlimited group PT with Phil (**one per day**), **2
individual mental-performance sessions with Yannick** (owner correction
2026-09-17 — the sheet said 4), 24/7 facility access.
Facility access on any package requires a waiver and parent permission if
under 18.

What changes in the pin:

1. **`t-20` is gone.** Catalogue is `t-6`, `t-12`, `t-16`, `elite`, `single`.
2. **Facility access is an add-on, not Elite's differentiator.**
   `athletes.facilityAccess: boolean` (absent == false), ops/owner-settable in
   the Membership editor alongside `packageId` — the assignment rules branch
   widens to `hasOnly(['packageId', 'facilityAccess', 'updatedAt'])`. It is
   a $300 line item, never a session entitlement; the app displays it and
   (Part 2) Stripe carries it as a subscription item. `packages/elite`
   keeps `access247: true` as *included*. The enrollment consent step gains
   a facility-access waiver + under-18 parent permission checkbox, stored on
   the enrollment request and copied to `athletes.facilityAccessConsent:
   { signedAt, byUid } | null`; ops cannot set `facilityAccess: true`
   without it (rules: one `get()` on the athlete).
3. **Elite is not unlimited-everything.** `tokens: null` stays (no token
   accounting), but Elite carries **frequency caps**, the same class as the
   mental cap in K — not a pool, never a charge:
   - `DAILY_CAP` for Elite: at most one `training|tournament` booking per
     date, at most one `phil` booking per date. Client-derived in
     `assertWithinPeriodCap` (count today's non-cancelled bookings of that
     class); typed reason `'one-per-day'`.
   - `SPECIALIST_MONTHLY_CAP.mental` becomes **per package**: Elite 2,
     everyone else 1 (K's default). Owner-tunable in one map:
     `MENTAL_MONTHLY_CAP = { elite: 2, default: 1 }`.
   This is the one place a cap branches on `type` — the keystone's "never
   in a charge path" holds; these are frequency rules and they say so in
   the code comment.
4. **Elite's price is $20 under 16 sessions + facility access ($1,019)**
   while including more — a deliberate funnel. Membership copy for a
   16+access family may say so ("Elite includes everything here for less").
5. Contract §1 products table updated to match. `SINGLE_TOKEN` price still
   pending.

Open, added: whether a token-package athlete's Yannick 1:1 spends a token
(as pinned — "sessions can be used as Yannick sessions") while Elite's two
are a separate included count. Pinned as: yes for token packages; Elite's
two are included and do not touch tokens (Elite has none).

## Sprint 12 amendment v2.0.2 — capacity 14 training / 25 tournament (2026-09-18)

Owner: training sessions cap at **14**, tournament (RYP Tour) sessions cap
at **25**. Phil 6 and Yannick 1 unchanged. Sync `CAPACITY` map,
`schedule.js` `CAPACITY`, seed docs, DATA-MODEL, harness fixtures, and every
"15" in copy. Pre-launch, so apply immediately; no existing bookings to
honor. The Saturday 2–4 adult block is outside the app.

`capacity` is per-type and per-session, so this is the one place `type`
legitimately drives a number. It is a *room* fact, not a charge; the
keystone holds.

`data/tour.js`: TOUR_POINTS covers positions 1–15 with 5 participation
points beyond. At 25 a field, positions 16–25 all score 5 unless the table
is extended. PM extends the table to 25 with a flagged tail (owner-tunable,
single knob, same as today) unless the owner prefers the flat fallback.

## Sprint 12 amendment v2.0.3 — a fourth weekday block, and suggested age groups (2026-09-22)

Owner, direct: the weekday pattern gains a block — **Mon/Wed 3, 4, 5, 6 PM; Tue/Thu 4, 5, 6, 7 PM**
(Tue/Thu 3 PM stays reserved, v2.0.2; Fri 3, 4 PM and Saturday unchanged) — and each weekday
block carries a **suggested age group**:

| | 13 & up | Under 13 |
|---|---|---|
| Mon / Wed | 3 PM, 5 PM | 4 PM, 6 PM |
| Tue / Thu | 4 PM, 6 PM | 5 PM, 7 PM |

**It is a suggestion, and only that.** Booking is not age-gated anywhere and nothing here reaches a
charge: the keystone ("charging never branches on type") is untouched, and this does not branch on
type either — it is a room-and-roster hint keyed to weekday and start time. Any athlete may still
book any block. It is also deliberately NOT the RYP Tour's brackets (10 & under / 11-13 / 14 & up,
`data/tour.js`), which are derived from a date of birth to score competition; these two groupings
answer different questions and share no code.

Friday and Saturday carry **no** suggestion — the owner ruled on Mon-Thu only. Unmapped hours carry
none either, so a block the calendar adds at, say, 4:30 PM simply shows no hint rather than a guess.

Built as `AGE_GROUP_BY_DAY` + `ageGroupFor(session)` in `data/schedule.js` (an explicit lookup, not
a parity trick — 4 PM and 6 PM mean OPPOSITE groups on Mon/Wed versus Tue/Thu, which is exactly the
kind of rule an if/else gets wrong), resolved once in `displaySession` and `liveCoachDay`, where a
session still has its date beside its full time string, and rendered as a chip beside the type chip.
Surfaces: the booking day list (with a one-line key above it), My Schedule, family Reservations, the
athlete's next-session card, the coach's Today and Sessions lists, and the attendance header. Not on
the month grid (every weekday carries both groups, so one cell colour would be false), not on the
booking confirmation, and never on a cancelled row.

**The calendar is not updated yet.** The owner said the schedule changed but the Google Calendar edit
had not been made when this landed, and production sessions come from that calendar via the sync. So
production keeps three weekday blocks, and the 6 PM / 7 PM blocks (and their hints) appear only after
the owner edits the calendar and the next `node scripts/sync-calendar-sessions.mjs --prod` run. The
seed/emulator season generates all four immediately.

## Sprint 12 amendment v2.0.4 - the decision-gap pass (2026-09-22)

Eleven open questions answered in one sitting. Each is now the built
behaviour.

1. **Saturday 10-12 and 12-2 are SINGLE TWO-HOUR EVENTS**, not four 60-minute
   blocks. This closes pin J's own open question. Each still costs ONE token -
   length has never been what a session costs, and nothing about the charge
   path changed. 9 AM stays a 60-minute training block; the 2-4 PM adult block
   is unchanged and still display-only. The app now carries a real
   `durationMinutes` on every session (absent == 60), because it had assumed
   60 minutes in eight places, including the calendar invite a family keeps
   and the coach's "is this block finished" check.
2. **The academy is in EDINA**, not Eden Prairie. The calendar invite every
   family receives on booking said Eden Prairie; it was the only place in the
   app that named a town, and it was wrong.
3. **The Commitment Contract's top tier is 90 minutes**, not 95, matching the
   academy's own commitment copy. The rules still ACCEPT 95 so an athlete who
   already holds it is not broken, but nothing offers it any more.
4. **Prices stay hidden until enrollment opens.** `PRICES_RELEASED = false`
   is now a launch-day flip rather than an open question.
5. **Session reminders stay as built**: the day before, 17:00 America/Chicago.
6. **Token expiry warns SEVEN days out**, not three, so a family has a weekend
   in hand to use what they paid for. Still exactly one notice per expiry.
7. **A family's own cancellation now sends a receipt** (it sent nothing).
   Staff cancellations keep their own notice and their bonus token; the
   self-cancel receipt says the token is back and nothing else.
8. **The single token is $65 and no longer pending** - a real one-token
   period package, priced and shown to staff like the others. Whether it is
   ever sold per visit instead is a Stripe-sprint question and changes
   nothing in the catalogue.
9. **Elite shows a sessions-attended count.** Unlimited has no balance to
   count down, so the billing hub's Elite row reports the period's booked,
   attended and no-show counts instead of an empty meter.
10. **The Tour points tail stays as it is.** A full 25-player field is
    already scored position by position; the 12-point tail beyond 25 only
    matters if a field ever exceeds the tournament capacity.
11. **A Yannick 1:1 may be booked for the ATHLETE OR THE PARENT**, chosen
    at booking. The mental-performance work is often the parent's to do,
    and the Academy was already fielding the request. `bookings.attendee`
    / `waitlist.attendee` (`'athlete' | 'parent'`) carry the choice;
    absent reads as the athlete, so nothing already written changes. The
    rules admit the field ONLY on a `mental` booking, which keeps the
    keystone intact: charging still never branches on type, and the
    athlete's own token pays either way. Yannick's capacity is 1, so the
    waitlist carries it too - otherwise the common path (full, then
    promoted) would silently drop the family's choice.

Also ruled, and shaping the Stripe sprint rather than this one: **subscriptions
must bill on the 1st-28th.** The portal's periods are anchor-day based and
clamp to 28, so a subscription billing on the 29th-31st would have shown period
dates a few days off from the invoice. Constraining sign-ups keeps the two in
agreement instead.
