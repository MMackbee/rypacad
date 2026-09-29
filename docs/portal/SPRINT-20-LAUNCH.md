# Sprint 20 - Launch (contract v3.0.2)

Owner rulings of 2026-09-28. The sign-up email goes out **2026-10-01**;
booking opens for token members **2026-10-10 07:00 America/Chicago**; the
season starts **2026-11-03** (Nov 2 is set-up day; `data/season.js`
SEASON_BOUNDS.start moves accordingly). Everything here is the day-1 feature set
plus the Blaze-dependent work the owner unblocked today by upgrading
`rypacad` to Blaze. The coach-facing side is tabled.

v3.0.1 (same day): rewritten after a four-lens adversarial review (section
16). The headline change: **provisioning moves into Cloud Functions** -
the browser cannot pass the rules' document-read cap for a normal family -
and **Stripe moves from Payment Links to Checkout Sessions** created by a
function, which fixes five independent Payment-Link defects at once.

## 0. Rulings (verbatim intent, 2026-09-28)

1. Sign-up **creates the account instantly** - no approval queue - and admin
   gets a **sign-ups report** instead.
2. A child's own login is **claimed on first sign-in** with the email the
   parent entered (Google or a new password); the parent never sets a child
   password. "No child account" = the parent's account runs the child.
3. **Student self-sign-up is 18+ only**; minors are enrolled by a guardian.
4. Stripe: managed in the Stripe dashboard, no in-app billing UI; the portal
   spawns the right Stripe link per tier via the API and the webhook links
   the customer back to the family.
5. Token window **30 days** (was 32); Elite **45**; booking into the next
   period before renewal ("borrowed" tokens) stays as built.
6. Booking opens **Oct 10** for token members; **Elite books immediately**
   once paid.
7. Yannick: **Calendly stays**, sessions are **30 minutes**, and a Calendly
   booking **spends a portal token** via Calendly's webhook (his plan is
   Standard; the owner holds his personal access token). Over-cap /
   over-cadence bookings are **recorded and flagged**, never auto-cancelled.
8. Phil operates **off the academy golf schedule**: his blocks live on the
   shared Google Calendar and are booked in-app (the existing `phil` path).
9. Prices become **visible on Oct 1** (`PRICES_RELEASED = true`).
10. **Facility access is its own add-on subscription** ($300/month), bought
    separately from the tier; the owner has further integrations planned
    behind it, so it stays a distinct Stripe product and a distinct field.
11. **The sign-up payment IS November, prepaid.** Whatever a family pays at
    checkout before Nov 1 buys the season's first month; recurring billing
    starts **Dec 1** and every subscription anchors on the **1st** from
    then on. Nobody pays twice before the first session. Mechanics in 4.2.
12. **Season starts Nov 3** (Nov 2 is set-up day). `data/season.js`
    SEASON_BOUNDS.start moves 2026-11-02 -> 2026-11-03. Oct 10 + 30 = Nov
    9, so the first week is bookable from Oct 10 either way.
13. **Mid-month joiners prorate both** (ruled 2026-09-28): a family joining
    after Nov 1 pays the rest of the current month **prorated by days
    remaining** and gets that month's tokens **prorated the same way
    (rounded up, never 0)**, then bills in full on the next 1st.
    `PRORATE_JOINERS = true` is the ruling, not a default (4.2).

## 1. Non-goals (explicitly out)

Coach-side changes beyond what launch needs; Stripe Elements / in-app card
entry; Phil via Calendly (the webhook is specialist-agnostic so this is an
env var later); student sign-up under 18; remembering the attendee choice;
MFA; a scheduled calendar sync (backlog, 12.8); a Calendly reconciliation UI
(post-launch, GitHub #27).

## 2. Sign-up (instant, via `createFamily`)

Today `/portal/register` needs an existing login and writes an
`enrollmentRequests/{uid}` request that ops must approve
(`screens/Registration.js:261-621`, `hooks/live.js:1243-1270,1302-1422`).
Nothing in the repo creates a Firebase Auth user.

**Why a function and not a browser batch (review, section 16):** rules cost
document reads (`me()`, `exists()`, `getAfter()`) per write, Firestore caps a
batched write at 20 reads, and a family with 4 kids, medical notes and child
logins is ~14 writes. `TEAM.md:952-960` records a 7-write batch failing on
exactly this; `live.js:1312-1320` split the approval into three requests for
the same reason. So the write is one Admin-SDK transaction inside an `onCall`
function, and the client rules for creating `households`, `users` and
`loginInvites` stay **denied** (ops/owner only, as today).

### 2.1 Routes and steps

- **`/portal/signup`** (public, like `/portal/signin`). Step 0 *Create your
  login*: email + password (`createUserWithEmailAndPassword`) **or**
  Continue with Google. Password accounts get `sendEmailVerification`
  immediately; verification is NOT required to finish sign-up (it IS
  required to pay, 4.2, and to claim a child login, 3.2).
  `auth/email-already-in-use` -> "This email already has a login - sign in
  instead" with the Sign in link. "Already have a login? Sign in."
- **`/portal/register`** keeps its route, now signed-in and instant. A
  **provisioned** account arriving here is redirected to `landingFor(user)`
  - except a `parent` entering **link mode** (Settings' "Link another
  athlete"), which skips to Step 3 for new athletes only and calls
  `addAthletes` (2.3). `SignIn`'s "New family? Start enrollment" ->
  `/portal/signup`.
- Step 1 *Who are you*: **Parent or guardian** | **I'm the athlete (18+)**.
  Athlete mode: DOB must make them 18+ today (client check; the function
  re-checks), else the form says a parent or guardian needs to complete it
  and offers the switch.
- Step 2 *Contact*: name, email (prefilled from auth, editable), phone,
  relationship (parent mode). All three of name/email/phone required.
- Step 3 *Athletes* (parent mode, 1..N; athlete mode = exactly self):
  name, DOB (age derived by `ageFromDob`, U13 / 13+ shown), **current
  handicap** (integer 0-54, or "none yet"), tier (`ALL_PACKAGES`),
  contract tier (20 / 45 / 90, optional, unchanged), **own login?** toggle
  (off by default; on -> child email, required, lower-cased, must differ
  from the guardian's and from every sibling's). Under-13 helper copy:
  "Under 13? A Google account needs Family Link permission for third-party
  sign-in; a new password login works either way." Household emergency
  contact + medical note as today.
- Step 4 *Consents + signature* as today; adult copy variant in athlete
  mode. The facility-access waiver is NOT here (ops-verified, 4.5).
- Success: "You're in" + one **Pay for <athlete>'s <tier>** button per
  athlete (4.2), "what happens next" (Oct 10 / Elite immediate / "you will
  be brought back here after paying" / child-login instructions when a login
  was requested), then *Go to your family* (athlete mode: *Go to your
  home*). No walkthrough hop. The same pay buttons sit on the family home
  (parent) or the athlete home + Membership screen (athlete mode) until paid.

### 2.2 `createFamily` (callable, functions lane)

Input: the validated form (`mode`, contact, athletes[], consents,
signature). Checks, in order: caller signed in; **no `users/{uid}` doc**;
**no open `loginInvites/{callerEmailLower}`** (an invited child must claim,
never self-provision - the error tells them so); athlete mode -> exactly one
athlete whose DOB is 18+; child emails unique, lower-cased, not the
guardian's; packageId in the catalogue; handicap int 0..54 or null. One
transaction writes:

| Doc | Body (new fields **bold**) |
|---|---|
| `households/{auto}` | `name`, `guardian {name, email, phone, **relationship**}`, `stripeCustomerId: null`, `stripeSubscriptionId: null`, **`stripeCustomerIds: []`**, **`signup: {at, by: uid, source: 'self', mode}`**, **`createdBy: uid`**, **`emergencyContact`** (string or null). `membership` is left absent (== active); paid-ness is per athlete (4.3). |
| `athletes/{auto}` x N | `name`, `dob`, `householdId`, `packageId`, `contractMinutes`, `coachId: null`, `facilityAccess: false`, `facilityAccessConsent`, **`handicap`**, **`loginEmail`**, **`billing: {status: 'pending', updatedAt}`**, `updatedAt` |
| `athletes/{id}/private/medical` | as the approval batch wrote it, when a note exists |
| `users/{uid}` | `{role: 'parent', householdId, athleteId: null, staff: false, specialistId: null, displayName, email}` - athlete mode: `{role: 'athlete', athleteId, householdId, ...}` |
| `loginInvites/{loginEmailLower}` x N | **`{email, householdId, athleteId, athleteName, requestedBy: 'guardian', createdBy: uid, createdAt, status: 'open', claimedBy: null, claimedAt: null}`** (named to contrast with `staffInvites`, which is auto-id, pending/provisioned, script-consumed) |

Returns `{householdId, athleteIds}`. The client then calls
`useAuthSession().refresh()` (new: re-runs `fetchCurrentUser` under the
current sequence) so `provisioned` flips without a reload, then navigates.

### 2.3 `addAthletes` (callable)

Caller must be `role == 'parent'`; writes athletes (+ medical, + invites)
into `me().householdId` with the same validation. Backs Settings' "Link
another athlete" (dead today, `firestore.rules:1003`).

### 2.4 Retired

`enrollmentRequests` is no longer written and the admin **Approve** action
is removed (it created households with no billing state and would have let
a legacy request book without paying). NotProvisioned's legacy
pending/declined states keep rendering the two historical docs with the
copy "Sign-up is now instant - start here" -> `/portal/register`. The seed's
`parent-new` pending request stays as that state's fixture.

## 3. Child login - claim on first sign-in

### 3.1 Sign-in page

`/portal/signin` gains **Create a login** (email + password) beside the
existing sign-in and Google. New password accounts get the verification
email. Copy: "Use the email your parent entered." Google's under-13 failure
maps to "Ask your parent to allow sign-in for this app in Family Link, or
create a password login below."

### 3.2 The claim (`claimInvite` callable)

On every auth emission where `fetchCurrentUser()` is NOT_FOUND
(`useAuthSession.js:104-149`) and the account has an email (emulator
custom-token users have none - treated as "no invite"), the client calls
`claimInvite`. The function reads `loginInvites/{token.email.lower()}`:

- open + `token.email_verified` -> one transaction: `users/{uid}`
  `{role: 'athlete', athleteId, householdId, staff: false, specialistId:
  null, displayName: athleteName, email}` and the invite `{status:
  'claimed', claimedBy: uid, claimedAt}` -> client `refresh()` ->
  `/portal/home`.
- open + not verified -> `needs-verification` -> NotProvisioned state
  **"Verify your email to finish"** naming the sender address - Firebase
  Auth's own, `noreply@<REACT_APP_FIREBASE_AUTH_DOMAIN>` (default
  `noreply@rypacad.firebaseapp.com`), NOT `SMTP_FROM`, which only the
  functions' notices use (D5) - with *Resend* and *I've verified*. **I've verified runs `await user.reload();
  await user.getIdToken(true);`** before calling again - a freshly verified
  password account otherwise presents a stale token with
  `email_verified: false` for up to an hour.
- claimed -> `already-claimed` -> "This login is already set up - sign in
  with it" (never overwrite).
- no invite -> the stranger state with two CTAs: *I'm a parent - start
  sign-up* and *My parent enrolled me* ("use the email they entered, then
  tap Check again"). **Check again** re-runs the lookup without a sign-out.

An invite for an email that already holds a `users` doc can never be
claimed; the report (7) shows invites open > 7 days so ops can fix the
email. Parent's family page and the athlete card show **Login: none / not
claimed / claimed <date>**.

Rules: `loginInvites` **read** by the email owner only when
`request.auth.token.email_verified == true` (no enumeration by unverified
accounts), by the household's parent, or ops/owner. No client create or
update on `loginInvites` or `users`.

## 4. Stripe - Checkout Sessions + the webhook

### 4.1 Catalogue

Stripe **Products + monthly Prices** per tier (t-6, t-12, t-16, Elite,
single) and one for **facility-access** ($300/month), in BOTH test and live
mode. `functions/config/stripe-catalogue.json` (`{test: {...}, live: {...}}`,
committed - price ids are public) is the ONLY source (D3: it sits under
`functions/` because `firebase deploy` packages only `functions/` and cannot
`require('../scripts/...')`; `write-packages.mjs` reads
`../functions/config/stripe-catalogue.json`); a new
`scripts/write-packages.mjs --prod --mode test|live --dry-run|--yes` writes
`packages/{id}.stripePriceId` (and `windowDays: 30`) to the Firestore
packages docs and nothing else - NOT `provision-family.mjs`, which
full-replaces `households/mackbee` and `/eisele` (`:441-446`).
`data/packages.js` does NOT carry price ids (two sources of truth would
let the seed copy live ids into the emulator); the seed's field stripper
drops them. The functions read the same JSON (`functions/portal/catalogue.js`),
keyed by `STRIPE_MODE` (`test` | `live`, functions `.env`).

### 4.2 `createCheckoutSession` (callable)

Input `{athleteId, product: 'tier' | 'facility'}`. Caller must own the
athlete (parent of its household, or the athlete itself) and, for password
accounts, `token.email_verified` (Google accounts are always verified).
Creates a Stripe Checkout Session, `mode: 'subscription'`, the athlete's
`packageId` price (or the facility price), quantity 1, `client_reference_id:
"${householdId}__${athleteId}__${product}"`, `customer_email` (or the
household's existing `stripeCustomerId` as `customer` so a second child or
the add-on lands on the same customer), `subscription_data.metadata
{householdId, athleteId, product, packageId}`, `success_url:
${PORTAL_URL}/portal/family?paid=${athleteId}&cs={CHECKOUT_SESSION_ID}`
(athlete mode: `/portal/home?...`), `cancel_url` back to the same screen.
Returns `{url}`; the browser navigates there.

**The prepaid month (rulings 0.11, 0.13).** The session carries TWO lines:
the recurring tier price (quantity 1) and a one-time `price_data` line
"<Tier> - <Month YYYY>, prepaid" (inline `product_data`, no dashboard
product needed), with `subscription_data.trial_end` = 00:00
America/Chicago on the first 1st AFTER the prepaid month. Stripe charges
the one-time line at checkout (the documented "setup fee with trial"
pattern), the recurring line first bills at `trial_end`, and the
subscription anchors on the 1st forever after. Which month is prepaid:

- before Nov 1: **November 2026** at the full tier price; `trial_end` =
  Dec 1. An Elite family may book at once (Phil/Yannick in October, golf
  from Nov 3); a token family's tokens are November's.
- on or after Nov 1: **the current month**, amount = price x days
  remaining / days in month, tokens = ceil(tokens x the same fraction),
  minimum 1 (`PRORATE_JOINERS = true`, ruling 0.13), `trial_end` = next
  1st. The facility add-on uses the same shape at $300.

**The 48-hour rule (D11).** Stripe refuses a Checkout `trial_end` less than
48 hours away. When the next 1st is under 49 hours off at checkout time (the
29th, 30th or 31st - only reachable on or after Nov 1 under 0.13) the session
prepays the NEXT month in full instead (full price, full tokens), `trial_end`
is the 1st after that, and the remaining day or two of the current month is
free. Ruled 2026-09-28, documented in the owner runbook, tested in
`checkout.test.js`; before Nov 1 it never applies (Dec 1 is always far
enough out). Contract 6.1 has the code (`prepaidFor` in `checkout.js`).

Every household therefore anchors on the 1st, periods are calendar months,
and the 29th-31st clamp never bites. `single` (1 token) works the same.
The functions lane verifies in Stripe test mode that the one-time line is
collected at checkout with a trialing subscription before anything ships.

**After payment**: the family lands on `/portal/family?paid=<athleteId>`;
the screen shows "Confirming your payment..." and re-reads the athlete
every 5 s for up to 2 min until `billing.status == 'active'`, then the
active copy. The Success screen says this will happen.

### 4.3 Webhook changes (`functions/portal/stripe.js`)

- **API version**: the endpoint is created at the SDK's pinned version
  (`2025-07-30.basil`, `functions/node_modules/stripe/cjs/apiVersion.js`).
  On Basil `invoice.subscription` is `invoice.parent.subscription_details
  .subscription` and `subscription.current_period_*` live on
  `items.data[0]`; the code reads BOTH shapes (`subId = invoice.subscription
  ?? invoice.parent?.subscription_details?.subscription`, etc.). The
  existing `customer.subscription.updated` handler (`stripe.js:262-263`)
  gets the same fix.
- New event **`checkout.session.completed`** (`mode == 'subscription'`):
  parse `client_reference_id` -> `householdId`, `athleteId`, `product`;
  require `athletes/{athleteId}.householdId == householdId`; `product ==
  'tier'` -> `athletes.billing = {status: 'active' | 'pending' (trialing /
  unpaid), customerId, subscriptionId, priceId, checkoutSessionId,
  updatedAt}` and, if the paid price maps to a different package than the
  family chose, `athletes.packageId` := the PAID package (so the Elite
  exemption in 5 can never be claimed by an unpaid choice); `product ==
  'facility'` -> `athletes.facilityBilling = {status, subscriptionId,
  priceId}` and `facilityAccess: true` (4.5). `households.stripeCustomerId`
  if null; `arrayUnion` into `stripeCustomerIds`. Line items are read via
  `checkout.sessions.listLineItems` **before** `runTransaction`; the only
  accepted shape is exactly one recurring line plus at most one one-time line
  (the prepaid month), every quantity 1 (D13); anything else -> outcome
  `unexpected-quantity`, a flag row, nothing written.
- **Resolution order** for every other event: `subscription_data.metadata`
  on the subscription object when present; `athletes where
  billing.subscriptionId == subId` (then `facilityBilling.subscriptionId`);
  `households.stripeCustomerId == customer`; `households.stripeCustomerIds
  array-contains customer`; last, `checkout.sessions.list({subscription})`
  -> `client_reference_id`. Stripe reads happen **outside** the transaction
  (Firestore retries would repeat them); a Stripe API failure writes the
  ledger row `stripe-lookup-failed` and returns **200** (the daily
  `export-memberships.mjs` audit surfaces it) rather than 500 + three days
  of retries.
- **`invoice.paid`**: issues `tokenPeriods` only for the athlete whose
  subscription the invoice belongs to (today: every athlete in the
  household, `stripe.js:141-179`), sets that athlete's `billing.status:
  'active'` (a `trialing` subscription whose prepaid invoice is paid IS
  active for the portal), sets household `membership.status: 'active'`
  (from past_due / lapsed as today), and `periodAnchorDay: 1` when the
  household has none. **Which period the tokens land in**: for
  `billing_reason == 'subscription_create'` (the checkout invoice) the
  period is the PREPAID month named in `subscription_data.metadata
  .prepaidPeriodKey` (`2026-11-01` before Nov 1; the current month's first
  after), and `granted` = `metadata.prepaidTokens` (the full package count,
  or the prorated count under 0.13); for every later invoice
  (`subscription_cycle`) the period is `lines[].period.start` as today. The
  `tokenPeriods` doc records `source: 'stripe'` and `prepaid: true` on the
  first one.
- `invoice.payment_failed`, `customer.subscription.updated/deleted` resolve
  the same way; the failed/deleted state is written to the owning athlete's
  `billing.status` AND to household membership exactly as today (one
  failing card freezes the family - accepted, 14). **Facility add-on (D10):**
  when the resolved product is `facility`, the event writes
  `facilityBilling.status` and `facilityAccess: false` ONLY - it never touches
  household membership and never revokes bookings; the family keeps booking
  on its tier.
- Notice: the webhook sends the **payment-received** notice itself on an
  athlete's first `active` (kind `membership`, copy branched on
  `bookingOpen`: "Payment received - booking opens Fri, Oct 10 at 7 AM" for
  a token family before the gate, "Payment received - you're all set to
  book" otherwise). `onHouseholdMembership`'s guard is unchanged (it only
  reports past_due/lapsed reinstatements).
- Secrets: `STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY` (a **restricted**
  key: Checkout Sessions write + read, Customers read, **Prices read** -
  `createCheckoutSession` reads the price's `unit_amount` to build the
  prepaid line, nothing in Firestore or the catalogue carries an amount (D12);
  the same key serves `createCheckoutSession`). Endpoint events: the four today +
  `checkout.session.completed`.

### 4.4 Per-athlete paid status is the booking gate

`athletes.billing.status` (`pending` | `active` | `past_due` | `lapsed`;
**absent == active** for every athlete provisioned before this sprint, so
the test families and any ops-created athlete are unaffected). Enforced:

- rules `bookings` and `waitlist` create: `!('billing' in
  athleteData(athleteId)) || athleteData(athleteId).billing.status ==
  'active'` (the athlete doc is already read on these paths; hoisted into
  one `let` so it costs no extra read);
- client `createBooking` / `joinWaitlist` / `bookRecurring` and the
  specialist screen's Calendly button (6.1);
- `lib.membershipAllowsBooking` gains an athlete argument; promotion passes
  it.

Household `membership` keeps its existing meaning (Stripe health for the
family; ops can freeze). Copy for a pending athlete: **"Payment pending -
finish checkout to start booking"** with the pay button on the parent home
banner, the athlete home + Membership screen (athlete mode), the billing
hub hero (`billingHub.statusFor` gains a `pending` branch with test
coverage; `hooks/billing.js` passes the athlete status through; the admin
membership counts gain a `pending` bucket so they agree with 7). Billing
plan card for pending: "Billed monthly from the 1st once you've paid";
connected card: "Your card and invoices are managed in Stripe."
`REACT_APP_STRIPE_PORTAL_URL` (Stripe's no-code customer portal) is
**required**, not optional, so a failed card has a self-serve fix. The build
cannot fail on it (CRA bakes env at build time and the seed/demo build has
none), so `hooks/billing.js` warns once at module load, right after the
existing constant (`billing.js:45`; `isLive` is already imported from
`./live` at `:39`; routing lane, which owns `hooks/billing.js`):

```js
/** The Stripe no-code customer portal login link, when the academy set one up. */
export const STRIPE_PORTAL_URL = process.env.REACT_APP_STRIPE_PORTAL_URL || null;

// Sprint 20 (spec 4.4): required on a live build - a failed card has no
// self-serve fix without it. Module scope, so it logs once per page load.
if (isLive() && !STRIPE_PORTAL_URL) {
  console.warn('[billing] REACT_APP_STRIPE_PORTAL_URL is unset on a live build; the Stripe portal link will not render (spec 4.4).');
}
```

### 4.5 Facility access add-on (ruling 0.10)

Its own product/price. Bought from the billing hub (parent) or Membership
(athlete) per athlete, only once `billing.status == 'active'`, via
`createCheckoutSession({athleteId, product: 'facility'})`. The webhook sets
`facilityAccess: true` on payment and false on cancellation/lapse.
`facilityAccessConsent` (the signed waiver) stays ops-verified as today;
the card reads "Facility access: paid - waiver pending" until ops flips
consent, and "Facility access: active" after. Elite includes it
(`access247`), so Elite never sees the add-on button. Nothing else about the
add-on changes in this sprint (the owner's later integrations hang off
`facilityBilling`).

### 4.6 Prices

`PRICES_RELEASED = true` - prices become visible the moment the Railway
build with it deploys (12.4), before the email.

## 5. Windows and the Oct 10 gate

- `windowDays` **30** on t-6 / t-12 / t-16 / single (`packages.js:41-43,60`),
  the `windowDaysFor` fallback (`:107`), `calendar.js:333,340` defaults,
  `hooks/index.js:1219`; the Firestore docs via 4.1; docs restating 32
  (DATA-MODEL 124/1267, tokens-and-billing-contract 91/103, SPRINT-12-PINS
  85/154/319, ui-redesign-brief 501, TEAM.md) and the `lib.test.js` fixtures
  updated. Rules' 46-day outer bound unchanged. Elite 45 unchanged.
- Borrowed tokens already work (`live.js:640-645`); the one change is copy:
  `no-tokens-left` names the period it means ("next period's tokens are
  already fully booked" when `periodKey > current`).
- **Gate** `BOOKING_OPENS_AT = 1791633600000` (2026-10-10T12:00:00Z =
  07:00 America/Chicago) in `data/calendar.js` with
  `bookingOpen(now, pkg)` = `pkg?.kind === 'elite' || now >= BOOKING_OPENS_AT`.
  Client: `createBooking`, `joinWaitlist`, and `bookRecurring` (which also
  gains the window check it skips today - K03, `hooks/index.js:1046-1055`).
  Rules: `bookingOpenOk(a)` = `request.time >= timestamp.value(1791633600000)
  || a.packageId == 'elite'` on `bookings` and `waitlist` create, where `a`
  is the athlete doc already read for 4.4 (one `let`, no extra read; the
  parent + grace-token path sits at 8 of 10 reads today). Because 4.3
  corrects `packageId` to the paid price, "Elite" here means paid Elite.
  UI: schedule visible, Reserve disabled, banner **"Booking opens Fri, Oct
  10 at 7 AM"** for non-Elite; the specialist screen and the Calendly button
  obey it too. Retire the clause after launch (GitHub #26).

## 6. Yannick via Calendly; Phil on the calendar

### 6.1 Portal side

- `SPECIALISTS.mental.bookingMode = 'calendly'`; URL from
  `REACT_APP_CALENDLY_MENTAL_URL` (optional
  `REACT_APP_CALENDLY_MENTAL_ELITE_URL` for a 45-day event type; Elite falls
  back to the standard link). No URL -> the in-app slot list as today, so
  seed/emulator keep working.
- The Yannick card becomes **Book with Yannick** opening (new tab) the URL
  built with `URLSearchParams`: `name`, `email` (the athlete's, or the
  guardian's when *A parent* is picked on the existing control), `a1` =
  athlete name, `utm_source=ryp-portal`, `utm_medium=portal`,
  `utm_content=<athleteId>`, `utm_campaign=<householdId>`. Shown only
  when: `billing.status` active (4.4), booking open (5), a token left or
  Elite, and the monthly cadence not yet hit for the current month.
  Otherwise the existing reason copy. Below the button: "Yannick's
  confirmation, reminders and cancellations come from Calendly. The session
  appears on My Schedule within a minute and spends one token."
- A Calendly-sourced booking is **not cancellable in-app**: `reservationRow`
  / My Schedule / Reservations show "Cancel or reschedule from Calendly's
  email" instead of Cancel; the rules' member-cancel branch adds
  `resource.data.get('source', null) != 'calendly'`. Attendance updates by
  Yannick are unaffected (diff-only) and intended.
- Calendly sessions carry `bookable: false`, so `liveSpecialistDays` (which
  lists every non-cancelled `mental` session) never offers a freed `cal-`
  slot in-app; `displaySession` already renders `bookable: false` as
  display-only.
- `scripts/sync-calendar-sessions.mjs` `classifyTitle` drops
  `yannick|mental` (those calendar events become display-only). **Effect
  of the first sync after this change**: every previously synced mental
  session is deleted (booked 0) or cancelled, and same-day training ids
  renumber (`sync:27-28,500-530`) - which is why 12.6 runs the sync BEFORE
  any smoke-test booking. `phil` stays.
- The end-time regex bug (`sync:317`, `d{4}` without backslashes) is fixed
  so **every synced session carries its real `durationMinutes`** - this is
  what makes Phil's blocks (8) the right length. `SYNCED_FIELDS` unchanged.
- The three hard-coded 45s (`hooks/index.js:466,2130,2218`), the two literal
  "45 min" strings (`SpecialistBooking.js:536,607`) and the slot payloads
  (`hooks/index.js:1288-1292,1464-1479`, `seedSpecialistDays`) read
  `durationMinutes`; the attendance `block` state (`PortalRoutes.js:336-348,
  386-404`) passes it. Seeds (both `seed-firestore.mjs:320-359` and
  `hooks/index.js:1216-1217`) write `durationMinutes` (phil 45, mental 30)
  with mental at 4:00 / 4:30 / 5:00 PM.
- K04: `coachingFor` evaluates the cap for the slot's month, not today's.

### 6.2 `calendlyWebhook` (functions lane)

`onRequest`, us-central1, raw body, `.runWith({secrets:
['CALENDLY_WEBHOOK_SIGNING_KEY']})`. Verify `Calendly-Webhook-Signature`
(`t=<unix>,v1=<hex>`; HMAC-SHA256 over `t + '.' + body`; reject > 5 min
skew). **Response contract**: 400 only for a bad signature; **200 for every
verified event whatever the outcome** (duplicate, unresolved, flagged);
500 only for a Firestore write failure worth a retry. Calendly retries
non-2xx and eventually sets the subscription `state: disabled`. No network
calls inside the handler. Ledger `calendlyEvents/{inviteeUuid}_{event}`
`{event, inviteeUri, eventUri, athleteId|null, householdId|null,
receivedAt, outcome}` in the same transaction; a repeat is `duplicate`.

`invitee.created`:
1. Resolve the athlete: `payload.tracking.utm_content` -> `athletes/{id}`;
   else invitee email -> `users where email ==` -> `householdId` -> the
   household's only athlete; ambiguous or none -> outcome `unresolved`,
   flag row in the report, 200.
2. If `payload.old_invitee` is set (a reschedule; Calendly does not order
   the `canceled`/`created` pair), cancel the old booking found by
   `bookings where calendlyInviteeUri == old_invitee` in the same
   transaction BEFORE charging, so a plain reschedule never reads as
   over-cadence.
3. Session `sessions/cal-{eventUuid}` `{date, time, type: 'mental', label:
   'Mental game session', capacity: 1, booked: 1, status: 'scheduled',
   durationMinutes, bookable: false, coachId: null, special: false, source:
   'calendly', calendlyEventUri, gcalEventId: null}`. `date =
   lib.chicagoDate(start)`; `time` via a new `lib.chicagoTime(start)` built
   from `Intl.formatToParts` and composed as `${h12}:${mm} ${AM|PM}` with a
   plain space exactly like the sync's `formatTime` (Node 22's `format()`
   emits U+202F before AM/PM); `durationMinutes = round((end - start) /
   60000)`.
4. Booking `bookings/{athleteId}_{sessionId}` through the charge path
   promotion uses (`lib.periodFor` on the session date, `lib.chargeFor`):
   `{athleteId, sessionId, householdId, date, type: 'mental', status:
   'confirmed', periodKey, chargedFrom, graceTokenId, attendee ('parent'
   when the "Who is attending?" answer contains "parent"), createdBy:
   'system', source: 'calendly', calendlyInviteeUri, createdAt}`. No charge
   source, cadence exceeded, athlete not `active`, or received before
   `bookingOpen` for a non-Elite -> still written with `chargedFrom:
   'period'` and **`flag: 'over-cap' | 'over-cadence' | 'membership-inactive'
   | 'before-open'`**. Tokens are derived, so an over-cap booking floors
   `left` at 0; the report shows the flag.
5. No portal notice: Calendly sends its own. `runSessionReminders` skips
   `source == 'calendly'`; `onBookingCreated` already skips `createdBy ==
   'system'`.

`invitee.canceled`: find the booking by `calendlyInviteeUri == payload.uri`
(single-field index, automatic); already cancelled (a reschedule handled in
step 2) -> `already-cancelled`; else `{status: 'cancelled', cancelledBy:
'calendly', cancelReason: 'member', cancelledAt}` and the session
`{booked: 0, status: 'cancelled'}`. `onBookingCancelled` skips
`cancelledBy == 'calendly'`; `cancelReasonCopy` learns nothing new
(`'member'`).

### 6.3 Calendly account (owner + Yannick, no code)

Plan check FIRST: webhook subscriptions need Standard or above on
**Yannick's** account, and his own token must create a user-scoped
subscription. Event type *RYP Academy - Mental Game 1:1*: one-on-one, **30
min**, secret (unlisted, not private - the URL still works for anyone
holding it, which is why 6.2 flags), RYP availability, 30-day range (a
second, Elite-only type at 45 days is optional), buffers, minimum notice 24
h, cancel/reschedule until the day before, invitee questions **1. Athlete
name** (required), **2. Who is attending? Athlete / Parent** (required),
**3. Parent email**. After the functions deploy the owner runs, once, `GET
https://api.calendly.com/users/me` (for `resource.uri` AND
`resource.current_organization`) then `POST /webhook_subscriptions` with
`{url: <calendlyWebhook URL>, events: ["invitee.created",
"invitee.canceled"], organization: <current_organization>, user:
<resource.uri>, scope: "user", signing_key: <generated>}` - `organization`
is required even for user scope. The same signing key is the function
secret. Verify afterwards with `GET /webhook_subscriptions?organization=
...&scope=user&user=...` -> `state: active`, and again after the first real
booking. The token is never pasted anywhere but that terminal.

## 7. Admin sign-ups report

`/portal/admin/signups` (ops/owner). `useSignups()` reads `households
orderBy signup.at desc`, each household's athletes, its `loginInvites`, and
`bookings where flag != null` + `calendlyEvents where outcome ==
'unresolved'`. Row: sign-up time, parent name/email/phone, athletes (name,
age, tier, handicap), **payment** per athlete (`billing.status`; facility
add-on state), **child login** (none / invited / invited > 7 days /
claimed), **flags**. Filters: all / unpaid / flagged. Row tap -> the
existing `/portal/admin/households/:householdId`. The admin dashboard's
Enrollment queue card becomes a *Sign-ups* card with the unpaid count.
Rules: ops/owner read on `loginInvites` and `calendlyEvents`.

## 8. The Blaze bundle (one functions deploy, owner-run)

`firebase deploy --only functions` ships the 8 built functions +
`createFamily`, `addAthletes`, `claimInvite`, `createCheckoutSession`,
`calendlyWebhook` + the 4.3 changes.

**Secret binding (review blocker):** 1st-gen functions only see a secret
they declare - `grep runWith functions/` is empty today, so after a naive
deploy `stripeWebhook` 500s "Webhook secret not configured" and every mail
send is silently null. Each function declares `.runWith({secrets: [...]})`:
`stripeWebhook` + `createCheckoutSession` -> `STRIPE_WEBHOOK_SECRET`,
`STRIPE_SECRET_KEY`, the mail secret (`revoke.js` sends from inside the
webhook); `calendlyWebhook` -> `CALENDLY_WEBHOOK_SIGNING_KEY`; every
trigger and job that calls `sendNotice` (`index.js:139,179,251,289,305,323`,
`onSessionBookedDecrease`) -> the mail secret (`SMTP_PASS` + `SMTP_USER`,
or `COURIER_AUTH_TOKEN`). Non-secret config (`SMTP_HOST`, `SMTP_PORT`,
`SMTP_FROM`, `PORTAL_URL`, `STRIPE_MODE`) lives in `functions/.env`.
`functions/.env` currently carries `STRIPE_WEBHOOK_SECRET` as a dotenv key
(value not read) - it moves to the gitignored `functions/.env.local`
(emulator only) before the first deploy, so a secret is never shipped in a
plain-text file.

After deploy: the Stripe endpoint
`https://us-central1-rypacad.cloudfunctions.net/stripeWebhook` (five
events, API version pinned per 4.3; TEST endpoint for the smoke, LIVE
endpoint for launch - each has its own signing secret, 12.5), the Calendly
subscription to `.../calendlyWebhook`. Deploy check: `curl` the webhook URL
with no signature and expect **400**, not 500. From that moment every
notice in the app is real - which is why the "you'll get an email" copy is
made TRUE rather than removed (9).

## 9. Launch fixes riding along (frontend lane unless noted)

`path="*"` catch-all (K18); copy that promised emails now describes what
actually sends (Registration success, NotProvisioned, BookSession
confirmation - K30); the contract tier offered as 95 in
`Registration.js:504` AND `AthleteDetail.js:37` becomes 90 (the client's
`setContractTier` at `live.js:1451` already accepts only 20/45/90; the
rules already accept both - no rules item); the admin route hidden from
role `mental` (PortalRoutes 743 / AdminDashboard 154); the Success ->
walkthrough -> NotProvisioned loop; `Link another athlete` made real (2.3);
K04 (6.1); `no-tokens-left` period copy (5); Success/`?paid=` polling (4.2).

## 10. Data-model deltas (db lane writes DATA-MODEL.md)

| Collection | Field | Notes |
|---|---|---|
| households | `signup {at, by, source, mode}`, `createdBy`, `stripeCustomerIds[]`, `emergencyContact`, `guardian.relationship` | new; `membership` semantics unchanged (absent == active) |
| athletes | `handicap` int 0..54 or null; `loginEmail` string or null; `billing {status, customerId, subscriptionId, priceId, checkoutSessionId, updatedAt}`; `facilityBilling {status, subscriptionId, priceId}` | `billing` / `facilityBilling` server-written only; **absent `billing` == active** |
| users | - | `role: 'athlete'` docs now created by `claimInvite` |
| loginInvites/{emailLower} | whole collection | new (2.2, 3.2); contrast with `staffInvites` |
| packages | `stripePriceId`, `windowDays: 30` | written only by `write-packages.mjs` |
| sessions | `source: 'calendly'`, `calendlyEventUri`, `bookable: false` on `cal-` docs; `durationMinutes` now real on synced docs; id form `cal-<uuid>` (never date-prefixed, never carries tournament results, invisible to the sync's reap) | 6 |
| bookings | `source`, `calendlyInviteeUri`, `flag`, `cancelledBy: 'calendly'` | server-written only |
| calendlyEvents/{id} | whole collection | idempotency ledger, admin read |
| stripeEvents | outcomes gain `unexpected-quantity`, `stripe-lookup-failed` | - |

Indexes: none new (single-field or existing composites).

## 11. Verification

- Unit (frontend jest): `bookingOpen` (before/after, Elite, no package),
  window 30, Calendly link builder (`+` addresses, apostrophes, `&`),
  claim-state table, the sign-up form -> `createFamily` payload builder,
  K04 month logic, `billingHub.statusFor('pending')`.
- Functions (`lib.test.js` + emulator harnesses): resolution order incl. a
  Basil-shaped `invoice.paid`; `checkout.session.completed` ->
  `invoice.paid` in BOTH orders; `createFamily` happy path + every refusal
  (existing users doc, open invite for the caller, minor in athlete mode,
  duplicate child email); `claimInvite` (open, unverified, claimed, none);
  `verify-calendly.js` replays `invitee.created` / `invitee.canceled` and
  the reversed reschedule pair, asserting the literal `'4:00 PM'`, the
  booking, the ledger and the token position.
- Rules (emulator): self-create of households/users/loginInvites REFUSED
  from the client; athlete `billing.status: 'pending'` refused to book,
  `active` allowed, absent allowed; gate refused before Oct 10 for t-6,
  allowed for Elite, allowed after; parent+grace booking before Oct 10
  stays under the read cap; member cancel of a `source: 'calendly'` booking
  refused; `.lower()` comparisons on `loginInvites` read.
- QA: the `qa-tester` agent drives every role on :3001 (functions emulator
  running): sign-up -> pay (Stripe test mode) -> return + confirm -> claim
  (password + verification, Google) -> book / blocked before Oct 10 / Elite
  books -> Calendly replay -> report. Production smoke with **test-mode**
  Stripe before `--mode live`; the smoke household is deleted afterwards.
- `/code-review` on the plan, then on the integrated diff; PM gate on every
  lane before merge.

## 12. Owner checklist (ordered; each blocks what follows it)

1. **Firebase console**: Authentication -> Sign-in method -> Email/Password
   ON; Authentication -> Settings -> Authorized domains includes
   `rypacad.ryptest.com`. Templates stay DEFAULT: the email's action link
   must keep pointing at Firebase's own handler
   (`rypacad.firebaseapp.com/__/auth/action`), which completes the
   verification; the return-to-portal step is the `continueUrl` the code
   passes to `sendEmailVerification(user, {url: 'https://rypacad.ryptest.com/portal/signin'})`
   (routing lane). A custom action URL would need an in-app
   `applyActionCode` handler that does not exist. Firestore -> App Check is NOT required for
   launch (household create is a callable; unverified spam is filtered by
   the report's *unpaid* view and deleted by ops).
2. **Stripe dashboard**: one Product + monthly Price per tier and for
   facility access, in BOTH test and live mode; the no-code **customer
   portal** activated (its link -> `REACT_APP_STRIPE_PORTAL_URL`); a
   restricted key per mode (Checkout Sessions write, Customers read, Prices
   read - D12) -> `STRIPE_SECRET_KEY`. Paste the price ids into
   `functions/config/stripe-catalogue.json` (public ids, both blocks; D3).
3. `firebase deploy --only firestore:rules,firestore:indexes --project
   rypacad` (one deploy: per-athlete billing gate, Oct 10 gate, Calendly
   cancel guard, loginInvites/calendlyEvents reads, attendee field).
4. **Railway**: `REACT_APP_CALENDLY_MENTAL_URL` (+ `_ELITE_URL`),
   `REACT_APP_STRIPE_PORTAL_URL`, `REACT_APP_PORTAL_LIVE_DATA=true`
   confirmed, `REACT_APP_FIREBASE_VAPID_KEY`; **push main** - this is the
   build that contains `/portal/signup` and shows prices; it must be live
   before any production smoke.
5. Functions, TEST first: `firebase functions:secrets:set` (names in 8, test
   Stripe values, `STRIPE_MODE=test` in `.env`), `firebase deploy --only
   functions`; create the **test** Stripe endpoint (five events) -> set
   `STRIPE_WEBHOOK_SECRET` -> redeploy; `curl` the webhook -> 400.
6. **Calendly**: Yannick confirms Standard, builds the event type (6.3); you
   run `GET /users/me` and the registration `POST` with his token and the
   signing key; confirm `state: active`.
7. Google Calendar: Phil's blocks titled **`Phil ...`** with real end times
   (capacity 6 comes from the type); Yannick's RYP events retitled or left
   (display-only). `node scripts/sync-calendar-sessions.mjs --prod --dry-run`
   (review the CONFLICT / delete lines - the mental sessions go) then
   `--yes`. **Re-run after every calendar edit** until a scheduled sync
   exists (backlog).
8. `node scripts/write-packages.mjs --prod --mode test --dry-run` then
   `--yes`; **production smoke** on rypacad.ryptest.com: password sign-up
   (verification mail lands in a Gmail inbox and returns to the portal),
   pay with a test card, land back and see *active*, claim a child login,
   Elite books, a t-6 family is gated. Delete the smoke household, its
   athletes and the Stripe test customer.
9. Functions, LIVE: live secrets (`STRIPE_MODE=live`), redeploy; create the
   **live** Stripe endpoint -> its secret -> redeploy; `write-packages.mjs
   --mode live --yes`.
10. Provision one **ops** account (an approver besides you) with
    `provision-owner.mjs`; confirm Yannick's and Phil's staff docs exist.
11. Send the Oct 1 email. Ops day-2 routine: the report's *unpaid* and
    *flagged* views; `export-memberships.mjs --prod` for Stripe drift.

## 13. Lanes, sequence and the cut line

| Lane | Owns |
|---|---|
| routing (`data-routing`) | rules (4.4 gate, 5, 6.1 cancel guard, `loginInvites`/`calendlyEvents` reads, athletes shape), `useAuthSession` create-login / `refresh()` / claim call / token refresh, `live.js` gates (billing status, opens-at, recurring window) and the callable clients, `packages.js`/`calendar.js`/`season.js` constants (SEASON_BOUNDS.start 2026-11-03), `billingHub.statusFor('pending')` + `hooks/billing.js`, `useSignups`, Calendly link builder + gate, duration plumbing in hooks, admin `pending` bucket |
| frontend (`frontend-dev`) | `SignUp` screen, `Registration` (Step 1, link mode, handicap, own-login, adult copy, Success), family-home + athlete-home + Membership pending banners and pay buttons, `?paid=` confirming state, facility add-on card (4.5), `SignIn` create-login, NotProvisioned states (verify / check again / legacy), `SpecialistBooking` Calendly branch + durations + non-cancellable rows, `AdminSignups` screen, section 9 fixes |
| db (`db-engineer`) | DATA-MODEL, `write-packages.mjs`, `stripe-catalogue.json`, sync classifier + regex fix, seeds (invites, billing pending, handicap, durations), docs (DECISION-GAPS, TEAM, contract), `functions/.env.local` split |
| functions (`backend-dev`) | `createFamily`, `addAthletes`, `claimInvite`, `createCheckoutSession`, `calendlyWebhook`, `stripe.js` 4.3 (Basil shapes, resolution, per-athlete issuance, facility, payment-received notice), `lib.membershipAllowsBooking(athlete)`, `chicagoTime`, reminder/cancel skips, `runWith` secrets on every function, harnesses (11), deploy runbook |
| PM (`pm-senior`) | worktrees, this contract, integration, `/code-review`, qa-tester pass, GitHub issues, the owner runbook |

**Cut line.** MUST be live for the Oct 1 email (what the email promises):
2 sign-up (`createFamily`, the screens, `refresh()`), 4.1-4.4 (catalogue,
`createCheckoutSession`, the webhook changes, per-athlete gate, pending
copy, `?paid=` return), 4.6 prices, 8 (the deploy with `runWith`), 9's
catch-all and email copy, 12.1-12.5, 12.8-12.11. MAY slip to Oct 10 without
breaking the email: 3 child login (hide the "own login?" toggle until
`claimInvite` ships - the parent's account runs the child, ruling 0.2),
6.1/6.2 Calendly (keep the in-app slot list and the calendar-synced mental
sessions until the webhook is verified; the "appears on My Schedule" copy
never ships without 6.2), 4.5 facility add-on, 7 AdminSignups (the owner
reads households in the console meanwhile), duration plumbing, K04, the
rest of 9. The Oct 10 gate (5) ships rules-first; until Oct 10 the 30-day
window alone keeps November out of reach for token families.

Day 1 (Sep 28): this spec, the plan, `/code-review` on it, lanes spawned.
Day 2 (Sep 29): build + unit tests; owner does 12.1-12.2. Day 3 (Sep 30):
integration, rules deploy, Railway push, TEST functions deploy, Calendly
wiring, QA on :3001, production smoke. Oct 1: LIVE secrets + endpoint +
packages, email.

## 14. Accepted gaps (say so if any is wrong)

- A stranger with an unverified password account can create a household;
  they cannot pay, claim or read invites unverified, and the report's
  *unpaid* view is where ops deletes them.
- One failing card freezes the whole household (membership is household-
  level); per-athlete `billing` only gates who may book.
- Multi-child families share one Stripe customer when the second checkout
  reuses `stripeCustomerId`; if it does not (customer not yet written),
  `stripeCustomerIds` holds both.
- Before Nov 1 every tier prepays November at full price whatever the
  sign-up date; Elite's October access (Phil/Yannick) is included, not
  charged. The `pkg.tokens` fallback for a period with no `tokenPeriods`
  doc (needed for borrowing into the next period) means a joiner's first
  partial month is never short-granted; it is never over-granted either,
  because the prepaid doc is written before booking opens for them.
- The Calendly link leaks via Calendly's own emails; early/over-cap
  bookings are flagged, not refused.
- The Oct 10 gate is a constant; changing the date is a rules + client
  deploy.
- Elite's Calendly range is 30 days unless Yannick makes the second event
  type.
- An invite for an email that already holds a login cannot be claimed;
  the report shows it after 7 days.
- No welcome email; the Success screen is the receipt.
- The calendar sync is manual; Phil's edits reach the portal when the owner
  re-runs it.

## 15. What the scope map found (for the record)

Registration is a request form, not account creation; no auth-user creation
anywhere; the Stripe webhook exists but nothing creates links or customers;
window is 32 in code, docs and production package docs; borrowed-token
booking already works; Elite 45 already rolling; no Oct 10 switch exists;
the sync's end-time regex can never match, so every synced session is 60
minutes; three surfaces hard-code 45 for specialists; eight functions are
built and none deployed; the rules deploy is pending and blocking.

## 16. What the spec review found (v3.0 -> v3.0.1)

Four reviewers (rules feasibility, Stripe/Calendly facts, repo consistency,
launch risk): 49 findings, 5 blockers. Adopted: provisioning via callables
(read cap); `runWith` secret binding; Basil-version Stripe shapes;
per-athlete paid status (a paid sibling unlocked an unpaid Elite); Checkout
Sessions over Payment Links (quantity, return URL, prefill encoding,
anchors); token refresh before claim; Calendly cancel guard, `bookable:
false`, reschedule ordering, 200-always response contract, `organization`
in the subscription body, U+202F time formatting; provisioned users on the
sign-up routes; stranger-vs-invited CTAs; pending copy in every membership
reader; the right files for the 90-minute tier; a single source for price
ids; sync-before-smoke ordering; test-then-live Stripe endpoints; the
verification action URL; the cut line. Rejected: none. Owner rulings that
followed: the checkout payment prepays November and recurring billing
starts Dec 1 (0.11); season start Nov 3 (0.12); mid-month joiners
prorate both price and tokens (0.13).

**Plan check (v3.0.2, same day).** Writing the four lane plans against
v3.0.1 forced sixteen decisions. Each is now a fact in the contract (marked
`(D<n>)` where it lands) and, where it changes this spec, folded in above:

- **D1** The frontend's report helpers move to
  `frontend/src/portal/data/signupsReport.js` (+ `signupsReport.test.js`);
  routing keeps `data/signups.js` (`buildSignupRows`), so the two lanes never
  edit one file.
- **D2** The attendance block's `durationMinutes` edit in `PortalRoutes.js`
  belongs to routing Task 11 only; frontend Task 14 drops it.
- **D3** The catalogue JSON lives at `functions/config/stripe-catalogue.json`
  (4.1, 12.2). db Task 1 and functions Task 3 both create it with identical
  content - add/add at integration, keep either.
- **D4** The secret lists (`MAIL_SECRETS`, `STRIPE_WEBHOOK_SECRETS`,
  `CHECKOUT_SECRETS`, `CALENDLY_SECRETS`) live in
  `functions/portal/secrets.js`; `functions/index.js` requires them and
  exports nothing but the 13 functions.
- **D5** The verification email is Firebase Auth's own, from
  `noreply@<REACT_APP_FIREBASE_AUTH_DOMAIN>` (default
  `rypacad.firebaseapp.com`), not `SMTP_FROM` (3.2).
- **D6** Copy: the in-app line uses a hyphen ("Payment received - booking
  opens Fri, Oct 10 at 7 AM."), the emailed notice the em dash; both are
  sanctioned.
- **D7** Error reasons added: `athlete-name-required` (createFamily /
  addAthletes), `invalid-product` (createCheckoutSession, checked right
  after signed-out), `already-active` also for the facility product,
  `child-email-duplicate` also against an existing open invite; `claimInvite`
  returns `householdId` / `athleteId` only on `claimed`.
- **D8** Fields added: `athletes.billing.lastEventId`;
  `athletes.facilityBilling.customerId` / `checkoutSessionId` /
  `lastEventId`; `calendlyEvents` outcome `malformed` and a `flag` field;
  `stripeEvents.athleteId` / `via` and outcomes `facility-active`,
  `no-period`.
- **D9** `useSignups().data = { rows, counts: { all, unpaid, flagged,
  unresolved }, unresolved: [...] }`; `useSpecialistSlots().data` gains
  `householdId`; `liveAthleteDetail` and `liveChildCard` gain `loginEmail` +
  `login { state: 'none'|'invited'|'invited-stale'|'claimed', claimedAt }`;
  `hubMemberFor` gains `facilityAccessConsent`.
- **D10** A facility-add-on `customer.subscription.deleted` /
  `invoice.payment_failed` writes `facilityBilling.status` and
  `facilityAccess: false` only - never household membership, never bookings
  (4.3).
- **D11** The 48-hour rule (4.2): a checkout with the next 1st under 48 h
  away prepays the NEXT month in full and `trial_end` is the 1st after that;
  the remaining day or two is free. Ruled, documented, tested.
- **D12** The restricted Stripe key scopes: Checkout Sessions write,
  Customers read, Prices read - `createCheckoutSession` reads `unit_amount`
  from Stripe (4.3, 12.2).
- **D13** `checkout.session.completed` accepts exactly one recurring line
  plus at most one one-time line, every quantity 1; anything else is
  `unexpected-quantity` (4.3).
- **D14** Routing runs Tasks 1, 2, 3, 6, 9 first (the seams every frontend
  screen imports), then 4/5 (rules), then 7, 8, 10, 11, 12, 13. Frontend
  Day-2 rule: every screen that imports a routing seam keeps its jest virtual
  mock AND, for anything on a day-1 route, guards the import at runtime with
  the namespace-import + inert-fallback pattern (`Registration.js:27-35`,
  `useEnrollmentFallback`) so `/portal/admin` never crashes before routing
  Task 13 merges.
- **D15** functions Task 11 lands after db Task 7 (the `env.template`
  rewrite); the functions lane creates its own gitignored
  `functions/.env.local` and `functions/.secret.local` in its worktree (a
  step in Task 11) with `STRIPE_SECRET_KEY='sk_test_harness'`, so
  `checkout.sessions.list` throws deterministically in the harnesses (Task
  13 STEP H's precondition).
- **D16** New frontend work: the proactive Oct 10 gate on BookSession
  (Reserve disabled + the section 5 banner from `bookingOpen(Date.now(),
  pkg)`) and on SpecialistBooking's in-app branch (`data.bookingOpen`);
  AdminSignups renders `data.unresolved` as "Unmatched Calendly bookings"
  and counts `counts.unresolved` inside the Flagged filter; ChildCard on the
  parent home renders the login line.
