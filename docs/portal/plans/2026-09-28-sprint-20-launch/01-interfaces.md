# Sprint 20 - cross-lane interface contract

Spec: `docs/portal/SPRINT-20-LAUNCH.md` (v3.0.1). Every name below is what BOTH
lanes that touch it build against. `(chosen)` marks a name the spec left open;
the choice follows the repo's existing naming. Every claim about existing code
cites `file:line` as read on 2026-09-28. Owner rulings 0.11-0.13 stand as
written: the checkout payment prepays November, recurring billing anchors on
the 1st from Dec 1, mid-month joiners prorate by default (`PRORATE_JOINERS`),
and the season starts Nov 3 (Nov 2 is set-up day).

## 1. Callables (functions lane implements, routing lane calls)

### 1.1 Client plumbing

- `frontend/src/firebase.js` gains, beside `auth`/`db` (`firebase.js:58,62`):
  `export const functions = getFunctions(app, 'us-central1');` and, inside the
  existing `if (process.env.REACT_APP_USE_EMULATORS === 'true')` block
  (`firebase.js:78-80`), `connectFunctionsEmulator(functions, '127.0.0.1',
  5001);` (port from `firebase.json` emulators.functions.port). Imports from
  `firebase/functions` (SDK `firebase ^9.22.0`, `frontend/package.json:13`).
- New `frontend/src/portal/hooks/callables.js` (chosen; new code stays out of
  the grandfathered `live.js`, the `grace.js`/`waitlist.js` precedent at
  `hooks/index.js:87-94`). Exports: `callCreateFamily(payload)`,
  `callAddAthletes(payload)`, `callClaimInvite()`,
  `callCreateCheckoutSession(payload)`. Each is
  `httpsCallable(functions, '<name>')` unwrapped to `result.data`, with every
  rejection turned into a `LiveDataError` (`live.js:69-77`) by a local
  `wrapCallable(err, context)` that reuses `wrap()`'s code map
  (`live.js:87-99`) plus two HttpsError codes the map lacks: `'already-exists'`
  and `'failed-precondition'` -> `ERR.INVALID`. The stable string in
  `err.details.reason` becomes `LiveDataError.reason`; `err.message` is
  surfaced verbatim (the function writes plain-language messages).
- Functions side: `firebase-functions/v1` (`functions/index.js:60`), so a
  callable is `functions.runWith({secrets: [...]}).https.onCall(handler)` and
  errors are `new functions.https.HttpsError(code, message, {reason})`.
  Handlers live in `functions/portal/family.js` (createFamily, addAthletes,
  claimInvite), `functions/portal/checkout.js` (createCheckoutSession),
  `functions/portal/calendly.js` (calendlyWebhook), `functions/portal/
  catalogue.js` (6.5) - all (chosen). `functions/index.js` only re-exports.
- Every callable first checks `context.auth` -> `unauthenticated` /
  `'signed-out'`. Emulator custom-token users (`firebase.js:84-96`) have no
  `token.email`; callables that need one return `failed-precondition` /
  `'no-email'`.

### 1.2 `createFamily`

Request (the Registration payload builder, replacing `Registration.js:126-143`):

```js
{
  mode: 'parent' | 'athlete',
  contact: { name: string, email: string, phone: string,
             relationship: string | null },          // relationship: parent mode only
  athletes: [{
    name: string, dob: 'YYYY-MM-DD',
    packageId: 't-6'|'t-12'|'t-16'|'elite'|'single',
    contractMinutes: 20 | 45 | 90 | null,
    handicap: int 0..54 | null,
    loginEmail: string | null,                       // lower-cased by the client AND the function
  }],
  emergencyContact: string | null,
  medical: string | null,                             // one household note, copied to every athlete's private/medical
  consents: { dataCollection: true, videoCapture: true,
              mediaRelease: boolean, facilityAccess: boolean },
  signatureName: string,
}
```

`guardianNotes` (`Registration.js:142`) is retired; `emergencyContact` /
`medical` are top-level (chosen). Athlete mode: `athletes.length === 1`,
`loginEmail` must be null (the caller IS the login), `contact.email` is the
auth email.

Response: `{ householdId: string, athleteIds: string[] }` (spec 2.2). Writes
exactly the spec 2.2 table in one Admin-SDK transaction; `users/{uid}` as
`approveEnrollmentRequest` shapes it today (`live.js:1393-1401`) with
`displayName: contact.name`, `email: contact.email`.

Errors (HttpsError code / `details.reason`), checked in this order:

| code | reason | when |
|---|---|---|
| `unauthenticated` | `signed-out` | no `context.auth` |
| `already-exists` | `already-provisioned` | `users/{uid}` exists |
| `failed-precondition` | `invite-open` | `loginInvites/{token.email.lower()}` is `open` ("Your parent already enrolled you - sign in with this email and tap Check again.") |
| `invalid-argument` | `invalid-mode` | mode not in the enum |
| `invalid-argument` | `contact-required` | name/email/phone blank |
| `invalid-argument` | `athlete-count` | 0 athletes, or athlete mode with != 1 |
| `invalid-argument` | `athlete-under-18` | athlete mode and DOB < 18 years before Chicago today |
| `invalid-argument` | `dob-invalid` | not `YYYY-MM-DD` or in the future |
| `invalid-argument` | `unknown-package` | packageId not in `ALL_PACKAGES` ids |
| `invalid-argument` | `contract-tier` | contractMinutes not in 20/45/90/null |
| `invalid-argument` | `handicap-range` | not int 0..54 or null |
| `invalid-argument` | `child-email-invalid` | not `EMAIL_RE` (`Registration.js:66`) |
| `invalid-argument` | `child-email-is-guardian` | equals contact.email (lower-cased) |
| `invalid-argument` | `child-email-duplicate` | two athletes share one |
| `invalid-argument` | `consents-required` | dataCollection/videoCapture false or signatureName blank |
| `internal` | `write-failed` | transaction threw (client copy: "Sign-up could not be saved. Try again.") |

### 1.3 `addAthletes`

Request `{ athletes: [<athlete entry as 1.2>], medical: string | null }`.
Caller must be `users.role == 'parent'` (`permission-denied` / `not-parent`);
household is `me().householdId`. Same athlete validation and reasons as 1.2,
plus `child-email-duplicate` also fires against an existing open invite for
the same email. Response `{ householdId, athleteIds }`.

### 1.4 `claimInvite`

Request `{}`. Never throws for an expected state; returns

```js
{ state: 'claimed' | 'needs-verification' | 'already-claimed' | 'none',
  householdId: string | null, athleteId: string | null }
```

`claimed`: users doc + invite flip in one transaction (spec 3.2). Lookup key
is `context.auth.token.email.toLowerCase()`; verification read from
`context.auth.token.email_verified === true`. An invite whose `athleteId` no
longer exists returns `none` and writes `loginInvites.status: 'orphaned'`
(chosen, report-visible). Errors: `unauthenticated`/`signed-out`,
`failed-precondition`/`no-email`.

### 1.5 `createCheckoutSession`

Request `{ athleteId: string, product: 'tier' | 'facility' }`.
Response `{ url: string }` (spec 4.2).

Checks in order: `unauthenticated`/`signed-out`; `not-found`/`athlete-not-found`;
`permission-denied`/`not-owner` (parent of `athlete.householdId`, or
`me().athleteId == athleteId`); `failed-precondition`/`email-unverified`
(password accounts: `token.firebase.sign_in_provider == 'password'` and
`!token.email_verified`); `failed-precondition`/`no-package` (tier with null
packageId); `failed-precondition`/`already-active` (tier when
`billing.status == 'active'`); `failed-precondition`/`billing-not-active`
(facility before the tier is active); `failed-precondition`/
`elite-includes-facility`; `failed-precondition`/`price-missing` (catalogue has
no id for this package in `STRIPE_MODE`); `unavailable`/`stripe-error` (Stripe
API threw; message "Checkout is unavailable right now. Try again in a minute.").

Session body (spec 4.2) plus `subscription_data.metadata`:
`{ householdId, athleteId, product, packageId, prepaidPeriodKey,
prepaidTokens: String(n) | '' }` (Stripe metadata values are strings; Elite
sends `''`). `success_url` = `${PORTAL_URL}/portal/family?paid=${athleteId}&cs={CHECKOUT_SESSION_ID}`
(role athlete: `/portal/home?...`); `cancel_url` = the same path without the query.

## 2. Firestore shapes (absent == X stated for every new field)

| Doc / field | Shape | Writer | absent == |
|---|---|---|---|
| `households.signup` | `{ at: Timestamp, by: uid, source: 'self', mode: 'parent'\|'athlete' }` | createFamily | legacy household (provisioned/approved) |
| `households.createdBy` | uid | createFamily | legacy |
| `households.stripeCustomerIds` | `string[]` | createFamily `[]`; webhook `arrayUnion` | `[]` |
| `households.emergencyContact` | `string \| null` | createFamily | null |
| `households.guardian.relationship` | `string \| null` | createFamily | null |
| `athletes.handicap` | `int 0..54 \| null` | createFamily/addAthletes | null ("none yet") |
| `athletes.loginEmail` | lower-cased `string \| null` | createFamily/addAthletes | null (parent runs the child) |
| `athletes.billing` | `{ status: 'pending'\|'active'\|'past_due'\|'lapsed', customerId, subscriptionId, priceId, checkoutSessionId, updatedAt }` (ids null until checkout completes) | createFamily (`{status:'pending', updatedAt}`), webhook | **active** |
| `athletes.facilityBilling` | `{ status: 'active'\|'past_due'\|'lapsed', subscriptionId, priceId, updatedAt }` | webhook only | no add-on |
| `athletes.facilityAccess` | bool | webhook (true on paid, false on lapse/delete) or ops (`firestore.rules:195-206`) | false |
| `loginInvites/{emailLower}` | `{ email, householdId, athleteId, athleteName, requestedBy: 'guardian', createdBy: uid, createdAt, status: 'open'\|'claimed'\|'orphaned', claimedBy: uid\|null, claimedAt: Timestamp\|null }` | createFamily/addAthletes/claimInvite | - |
| `calendlyEvents/{inviteeUuid}_{event}` | `{ event: 'invitee.created'\|'invitee.canceled', inviteeUri, eventUri, athleteId\|null, householdId\|null, receivedAt, outcome }`; outcomes `applied \| duplicate \| unresolved \| already-cancelled \| rescheduled \| not-found` | calendlyWebhook | - |
| `sessions/cal-{eventUuid}` | `{ date, time, type: 'mental', label: 'Mental game session', capacity: 1, booked: 1, status, durationMinutes, bookable: false, coachId: null, special: false, source: 'calendly', calendlyEventUri, gcalEventId: null, coachNote: null }` | calendlyWebhook | `source` absent == `'portal'`/sync; `bookable` absent == true (`hooks/index.js:260`) |
| `bookings.source` | `'calendly'` | calendlyWebhook | `'portal'` |
| `bookings.calendlyInviteeUri` | string | calendlyWebhook | - |
| `bookings.flag` | `'over-cap'\|'over-cadence'\|'membership-inactive'\|'before-open' \| null` | calendlyWebhook | null (clean) |
| `bookings.cancelledBy` | gains the literal `'calendly'` beside uid/`'system'` (DATA-MODEL:330) | calendlyWebhook | - |
| `tokenPeriods.prepaid` | `true` | webhook, first `invoice.paid` of a subscription | false |
| `packages.stripePriceId` | `string \| null` (DATA-MODEL:126) | `write-packages.mjs` only | null |
| `packages.windowDays` | `30` tokens/single, `45` elite | `write-packages.mjs` | 30 (`windowDaysFor` fallback) |
| `stripeEvents.outcome` | gains `unexpected-quantity`, `stripe-lookup-failed`, `applied-checkout`, `issued-prepaid` (chosen) beside `stripe.js` outcomes | webhook | - |
| `users` (role athlete) | `{ role:'athlete', athleteId, householdId, staff:false, specialistId:null, displayName, email }` | claimInvite | - |

Client rules for creating `households`, `users`, `loginInvites`, `calendlyEvents`
stay denied (`firestore.rules:87,825`; no clause == deny). `billing`,
`facilityBilling`, `source`, `calendlyInviteeUri`, `flag` are server-written
and MUST NOT enter any client `hasOnly` list.

## 3. Client constants and pure helpers

### 3.1 `data/calendar.js` (after `windowOpensOn`, `calendar.js:340`)

```js
export const BOOKING_OPENS_AT = 1791633600000; // 2026-10-10T12:00:00Z = 07:00 America/Chicago (verified)
export const BOOKING_OPENS_LABEL = 'Fri, Oct 10 at 7 AM';          // (chosen) the one string every banner reads
export function bookingOpen(now = Date.now(), pkg = null) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  return pkg?.kind === 'elite' || t >= BOOKING_OPENS_AT;
}
```

`openThrough`/`windowOpensOn` defaults change `32 -> 30` (`calendar.js:333,340`).

### 3.2 `data/packages.js`

`windowDays: 30` on t-6/t-12/t-16/single (`packages.js:41-43,60`);
`windowDaysFor` fallback 30 (`:107`); `PRICES_RELEASED = true` (`:70`).
`ELITE.windowDays` stays 45. `hooks/index.js:1219` default `32 -> 30`.

### 3.3 `data/season.js`

`SEASON_BOUNDS = { start: '2026-11-03', end: '2027-02-27' }` (`season.js:70`).

### 3.4 `data/calendly.js` (new, chosen)

```js
export const CALENDLY_MENTAL_URL = process.env.REACT_APP_CALENDLY_MENTAL_URL || null;
export const CALENDLY_MENTAL_ELITE_URL = process.env.REACT_APP_CALENDLY_MENTAL_ELITE_URL || null;
export function calendlyUrlFor(pkg) {           // Elite falls back to the standard link
  return (pkg?.kind === 'elite' && CALENDLY_MENTAL_ELITE_URL) || CALENDLY_MENTAL_URL;
}
export function calendlyLinkFor({ url, athleteId, athleteName, householdId, name, email }) {
  if (!url) return null;
  const q = new URLSearchParams({ name, email, a1: athleteName,
    utm_source: 'ryp-portal', utm_medium: 'portal', utm_content: athleteId, utm_campaign: householdId });
  return `${url}${url.includes('?') ? '&' : '?'}${q}`;
}
export const CALENDLY_NOTE = "Yannick's confirmation, reminders and cancellations come from Calendly. The session appears on My Schedule within a minute and spends one token.";
```

`name`/`email` are the ATTENDEE's: `attendee === 'parent'` -> guardian name +
`household.guardian.email`; else athlete name + `athlete.loginEmail ??
household.guardian.email`. `URLSearchParams` encodes `+`, `'`, `&` (unit test,
spec 11).

### 3.5 `data/billingHub.js`

- `hubMemberFor` (`billingHub.js:97`) adds to its return:
  `billing: { status: athlete.billing?.status ?? 'active', facility: athlete.facilityBilling?.status ?? null }`.
- `statusFor(membership, opts)` (`:202`) gains `opts.pendingAthletes:
  [{ athleteId, name }]` (default `[]`). Branch order: past_due, lapsed (as
  today), then **pending** when `pendingAthletes.length > 0`, else active:

```js
{ status: 'pending', tone: 'yellow', badge: { tone: 'yellow', label: 'Payment pending' },
  title: 'Payment pending - finish checkout to start booking',
  body: `${names} can book as soon as checkout is complete. Billed monthly from the 1st once you've paid.`,
  ladder: null, ladderAt: null, cta: 'Pay now', paused: false, pendingAthletes }
```

`hooks/billing.js` `liveHub` (`billing.js:110-122`) derives `pendingAthletes`
from `members[].billing.status === 'pending'` and passes it; `liveMyTokens`
passes `[member]` when pending. `useAdminDashboard` membership counts
(`hooks/index.js:3402-3410`) gain `pending` = athletes with
`billing.status == 'pending'` (an athlete count, beside the household counts).

### 3.6 `LiveDataError.reason` strings (new, beside `live.js:56-61`'s list)

| reason | thrown by | copy (`BookingReasons.reasonCopy`) |
|---|---|---|
| `billing-pending` | `createBooking`, `joinWaitlist`, `bookRecurring` when `athlete.billing?.status` is not active/absent | "Payment pending - finish checkout to start booking" |
| `booking-not-open` | same three when `!bookingOpen(Date.now(), pkg)` | "Booking opens Fri, Oct 10 at 7 AM" |
| `calendly-managed` | `cancelBooking` when `booking.source === 'calendly'` | "Cancel or reschedule from Calendly's email" |

Check order in `createBooking` (`live.js:647-669`): billing -> opens-at ->
window -> cadence -> elite-daily -> tokens. `bookRecurring` (`hooks/index.js:
1046-1055`) runs billing + opens-at + window once before its loop (K03).
`no-tokens-left` copy: when `periodKey > current` the message reads
"Next period's tokens are already fully booked (N of M)." (spec 5).

## 4. Hook contracts

### 4.1 `useAuthSession()` (`useAuthSession.js:270-279`) new members

| member | signature | notes |
|---|---|---|
| `user.emailVerified` | boolean | (chosen) from `fbUser.emailVerified`; refreshed by `refresh()` |
| `createLogin(email, password)` | `-> Promise<{ sent: boolean }>` | `createUserWithEmailAndPassword` + `sendEmailVerification`; `auth/email-already-in-use` -> `LiveDataError(ERR.INVALID, 'This email already has a login - sign in instead', err, 'email-in-use')`; weak password -> reason `weak-password` |
| `refresh()` | `-> Promise<void>` | re-runs `fetchCurrentUser()` under the current `seqRef` (`:99`), same NOT_FOUND handling as `:121-137`; also calls `auth.currentUser.reload()` first |
| `claimState` | `'idle'\|'checking'\|'claimed'\|'needs-verification'\|'already-claimed'\|'none'\|'error'` | set from `callClaimInvite` on every NOT_FOUND emission with an email; `'none'` without a call when `fbUser.email` is null |
| `checkInvite()` | `-> Promise<claimState>` | `await user.reload(); await user.getIdToken(true);` then `callClaimInvite`; on `claimed` calls `refresh()` |
| `resendVerification()` | `-> Promise<{ sent: true }>` | `sendEmailVerification(auth.currentUser)`; `auth/too-many-requests` -> ERR.UNAVAILABLE |

### 4.2 `useSignups()` (`hooks/signups.js`, chosen; re-exported from `hooks/index.js:200`)

`{ data: { rows, counts: { all, unpaid, flagged } } | null, loading, error }`, row:

```js
{ householdId, name, signedUpAt: 'YYYY-MM-DDTHH:mm' | null, mode: 'parent'|'athlete'|null,
  parent: { name, email, phone },
  athletes: [{ athleteId, name, age: int|null, packageId, packageName, handicap,
               billing: 'pending'|'active'|'past_due'|'lapsed',
               facility: null|'active'|'past_due'|'lapsed',
               login: 'none'|'invited'|'invited-stale'|'claimed', loginEmail, loginClaimedAt }],
  flags: [{ kind: 'booking', id, flag, date } | { kind: 'calendly', id, outcome, receivedAt }],
  unpaid: boolean, flagged: boolean }
```

`invited-stale` = open invite older than 7 days. Queries: `households orderBy
signup.at desc` (households without `signup` are excluded), athletes by
householdId, `loginInvites where householdId ==`, `bookings where flag != null`,
`calendlyEvents where outcome == 'unresolved'`. Invalidation keys:
`households`, `athletes`, `bookings`, `loginInvites` (new bump key).

### 4.3 `useSpecialistSlots` (`hooks/index.js:1381`)

Slot payload (`:1288-1292` and `seedSpecialistDays` `:1239-1245`) gains
`durationMinutes: s.durationMinutes ?? (type === 'mental' ? 30 : 45)`. `data`
gains: `bookingMode: 'in-app' | 'calendly'` (`'calendly'` iff
`SPECIALISTS.mental.bookingMode === 'calendly'` AND `calendlyUrlFor(pkg)` is
non-null), `calendlyUrl`, `billingStatus` (athlete, absent == `'active'`),
`bookingOpen: bookingOpen(Date.now(), pkg)`, `athlete: { id, name, loginEmail }`,
`guardian: { name, email }` (for the link builder). `data/specialists.js`
mental entry gains `bookingMode: 'calendly'`, `durationMinutes: 30`; phil
`durationMinutes: 45`. `coachingFor` (`:393`) gains a 4th arg `monthISO`
(default `today.slice(0,7)`) - the slot's month (K04).

### 4.4 `reservationRow` (`hooks/index.js:2104-2134`) and `resolveWaitlistRows` (`:442-473`)

Rows gain `source: b.source ?? 'portal'`; `cancellable` is
`b.status === 'confirmed' && s.date > today && source !== 'calendly'`;
`durationMinutes: s.durationMinutes ?? (specialist ? specialist.durationMinutes : DEFAULT_DURATION_MINUTES)`
replaces the literal 45 at `:466,2130,2218`. The caller at `:2175` passes
`source: b.source`. Copy for a calendly row: 9.3.

### 4.5 `usePaymentConfirmation(athleteId)` (`hooks/billing.js`, chosen)

`{ state: 'idle'|'confirming'|'confirmed'|'timeout', billingStatus }`. Starts
when `athleteId` is non-null (the screen reads `?paid=` via
`useSearchParams`); `fetchAthlete` every 5 s, 24 attempts; on
`billing.status === 'active'` bumps `athletes` + `billing` and strips the
query. Timeout copy: 9.5.

## 5. Rules (`firestore.rules`)

- `athletes` create (`:153-162`): `hasAll(['name','householdId','contractMinutes','coachId'])`
  unchanged; add `&& (!d.keys().hasAny(['handicap']) || d.handicap == null || (d.handicap is int && d.handicap >= 0 && d.handicap <= 54))`,
  `&& (!d.keys().hasAny(['loginEmail']) || d.loginEmail == null || d.loginEmail is string)`,
  `&& !d.keys().hasAny(['billing', 'facilityBilling'])`. `contractMinutes in [20,45,90,95]` unchanged (`:159,172`).
  Update branches `contractMinutesUpdateOk` (`:169`) and `packageAssignmentUpdateOk`
  (`:195`, `hasOnly(['packageId','facilityAccess','updatedAt'])`) unchanged.
- `bookings` and `waitlist` create: one `let a = athleteData(request.resource.data.athleteId);`
  hoisted into a new `bookingAthleteOk()` / `waitlistAthleteOk()` (chosen) that
  returns `request.resource.data.householdId == a.householdId && athleteBillingOk(a) && bookingOpenOk(a)`,
  replacing the inline household check at `:532-533` / `:1249-1250`. Helpers
  (top-level, beside `athleteData` `:48`):
  `function athleteBillingOk(a) { return !('billing' in a) || a.billing.status == 'active'; }`
  `function bookingOpenOk(a) { return request.time >= timestamp.value(1791633600000) || a.packageId == 'elite'; }`
- `memberBookingUpdateOk` (`:667-679`): the confirmed->cancelled arm adds
  `&& resource.data.get('source', null) != 'calendly'`. Re-book arm unchanged.
- `bookingShapeOk` `hasOnly` (`:443-445`) unchanged (server fields never client-written).
- New matches: `match /loginInvites/{email}` - `allow read: if signedIn() && (
  (request.auth.token.email_verified == true && request.auth.token.email.lower() == email)
  || (me().role == 'parent' && resource.data.householdId == me().householdId)
  || me().role in ['ops','owner']);` no write clause.
  `match /calendlyEvents/{id}` - `allow read: if signedIn() && me().role in ['ops','owner'];`.

## 6. Functions internals shared by two functions

### 6.1 `functions/portal/lib.js` (exports list `lib.js:327-350`)

- `chicagoTime(date) -> '4:00 PM'`: `Intl.DateTimeFormat('en-US', {timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true}).formatToParts`, composed `${hour}:${minute} ${dayPeriod.toUpperCase()}` with a plain U+0020 (matches `sync:283-286`).
- `membershipAllowsBooking(household, athlete)` (`:235`): false when household
  `past_due`/`lapsed` OR `athlete && athlete.billing && athlete.billing.status !== 'active'`.
  `promotion.js:98` passes `(household, athlete)`.
- `PRORATE_JOINERS = true` and `prepaidPeriodFor(now, {priceCents, tokens, prorate = PRORATE_JOINERS})`
  -> `{ periodKey, periodEnd, trialEnd, amountCents, tokens, prorated, label }`:
  before Chicago 2026-11-01 -> `periodKey '2026-11-01'`, `trialEnd 1796104800`
  (Dec 1 00:00 Chicago, unix s), full price/tokens, `label 'November 2026'`;
  on/after -> the current Chicago month, `trialEnd` = next 1st 00:00 Chicago,
  `amountCents = round(priceCents * daysRemaining / daysInMonth)`, `tokens =
  max(1, ceil(tokens * daysRemaining / daysInMonth))` (null stays null), or
  full when `!prorate`. `daysRemaining` includes today.
- `ageAt(dobISO, todayISO) -> int|null` (chosen) for the 18+ check.

### 6.2 `functions/portal/stripe.js`

- Basil accessors (`stripe.js:89-98,262-263`): `subscriptionIdOf(invoice)` =
  `invoice.subscription ?? invoice.parent?.subscription_details?.subscription ?? null`
  (string or `.id`); `periodOf(subscription)` = `{start, end}` from
  `subscription.current_period_start/end` else `items.data[0].current_period_start/end`;
  `priceIdOf(subscription)` = `items.data[0].price.id ?? plan.id`.
- `resolveSubject(event, deps) -> { householdId, athleteId, product: 'tier'|'facility'|null, packageId, via }`
  (chosen), called BEFORE `runTransaction`, in this order (spec 4.3):
  `metadata` -> `athletes.billing.subscriptionId ==` -> `athletes.facilityBilling.subscriptionId ==`
  -> `households.stripeCustomerId ==` (`lib.householdByCustomerQuery` `:249`) ->
  `households.stripeCustomerIds array-contains` -> `checkout.sessions.list({subscription, limit: 1})`
  `client_reference_id`. A Stripe throw -> ledger outcome `stripe-lookup-failed`, HTTP 200.
- `HANDLED` (`:37-42`) gains `checkout.session.completed`; `client_reference_id`
  format `${householdId}__${athleteId}__${product}` (double underscore; athlete
  ids never contain `_`, `firestore.rules:547`).
- `sendPaymentReceived({householdId, athleteId, athleteName, pkg})` (chosen)
  after the transaction, on the first `pending -> active`: `notify.sendNotice`
  (`notify.js:298`, args `{kind, category, householdId, athleteId, sessionId?,
  bookingId?, subjectKey, title, body}`) with `kind: 'membership'`, `category:
  'billing'`, `subjectKey: `${athleteId}_paid``. Copy from
  `notices.paymentReceived({ bookingOpen })` (9.5).

### 6.3 `functions/portal/calendly.js`

`verifyCalendlySignature(rawBody, header, signingKey, nowMs = Date.now()) ->
{ ok: boolean, reason: null | 'missing' | 'malformed' | 'stale' | 'mismatch' }`;
`t` older than 300 s -> `stale`; compare with `crypto.timingSafeEqual`.
`handleCalendlyEvent(payload, deps)` returns `{ outcome }`; the HTTP wrapper
maps bad signature -> 400, any outcome -> 200, Firestore throw -> 500.

### 6.4 `runWith` secret lists (`functions/index.js`, one constant each)

`MAIL_SECRETS = ['SMTP_USER', 'SMTP_PASS']` (the SMTP path `email.js:51-53`;
`COURIER_AUTH_TOKEN` is added only if the owner creates that secret - a declared
secret that does not exist fails the deploy).

| function | secrets |
|---|---|
| `stripeWebhook` | `['STRIPE_WEBHOOK_SECRET', 'STRIPE_SECRET_KEY', ...MAIL_SECRETS]` |
| `createCheckoutSession` | `['STRIPE_SECRET_KEY']` |
| `calendlyWebhook` | `['CALENDLY_WEBHOOK_SIGNING_KEY']` |
| `createFamily`, `addAthletes`, `claimInvite` | `[]` (plain `https.onCall`) |
| `onBookingCreated`, `onBookingCancelled`, `onHouseholdMembership`, `sessionReminders`, `tokenExpiryReminders`, `sweepWaitlist`, `onSessionBookedDecrease` | `MAIL_SECRETS` |

### 6.5 `STRIPE_MODE` and the catalogue reader (`functions/portal/catalogue.js`)

`stripeMode()` -> `process.env.STRIPE_MODE === 'live' ? 'live' : 'test'`;
`priceIdFor(key)` / `packageIdForPrice(priceId)` over the JSON in 7.2 for the
current mode; `FACILITY_KEY = 'facility-access'`. **Path deviation (chosen):**
the JSON lives at `functions/config/stripe-catalogue.json`, not
`scripts/config/`, because `firebase deploy` packages only `functions/`
(`firebase.json` functions.source) and cannot `require('../scripts/...')`;
`scripts/write-packages.mjs` reads `../functions/config/stripe-catalogue.json`.
Still ONE source.

### 6.6 Skips

`jobs.runSessionReminders` (`jobs.js:94`) skips `booking.source === 'calendly'`;
`onBookingCancelled` (`index.js:179`) returns early when
`after.cancelledBy === 'calendly'`; `onBookingCreated` already skips
`createdBy === 'system'` (`index.js:144-147`).

## 7. Scripts

### 7.1 `scripts/write-packages.mjs` (new)

Flags: `--prod` (production via `prodAccessToken`, `prod-auth.mjs:34`; without
it the emulator per `resolveTarget`, `firestore-rest.mjs:54`), `--mode test|live`
(required), exactly one of `--dry-run` | `--yes`. For each key of the mode's map
that is an `ALL_PACKAGES` id (via `bundle-frontend.mjs`, the seed's own import
route `seed-firestore.mjs:219-235`): REST `update` of `packages/{id}` with
`updateMask ['stripePriceId', 'windowDays']`, `windowDays` from the seam.
`facility-access` is skipped (no packages doc). A null price id aborts before
any write. Prints one line per doc; never touches households.

### 7.2 `functions/config/stripe-catalogue.json`

```json
{ "test": { "t-6": null, "t-12": null, "t-16": null, "elite": null, "single": null, "facility-access": null },
  "live": { "t-6": null, "t-12": null, "t-16": null, "elite": null, "single": null, "facility-access": null } }
```

Exactly these twelve keys; values `price_...` strings once pasted (public ids).

### 7.3 `scripts/sync-calendar-sessions.mjs`

`classifyTitle` (`sync:103-116`) drops the `mental|yannick` branch; regex at
`sync:317` becomes `/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/`. `SYNCED_FIELDS`
(`:476`) unchanged. Seeds: `seed-firestore.mjs:320-323` mental times
`['4:00 PM','4:30 PM','5:00 PM']`, `durationMinutes` (phil 45, mental 30) on
every specialist slot; `hooks/index.js:1216-1217` the same; seed athletes
carry `billing: {status: 'pending'}` on one Whitfield child (chosen: `nico`)
and `handicap`, plus one open `loginInvites` doc.

## 8. Env / secrets by NAME

| Host | Names |
|---|---|
| Railway (`REACT_APP_*`, build-time) | `REACT_APP_CALENDLY_MENTAL_URL`, `REACT_APP_CALENDLY_MENTAL_ELITE_URL` (optional), `REACT_APP_STRIPE_PORTAL_URL` (now required, `billing.js:45`), `REACT_APP_PORTAL_LIVE_DATA=true`, `REACT_APP_FIREBASE_VAPID_KEY`, existing `REACT_APP_FIREBASE_*`, `REACT_APP_STRIPE_PUBLISHABLE_KEY`, `REACT_APP_GCAL_*`; never `REACT_APP_USE_EMULATORS` |
| `functions/.env` (non-secret, committed-shape per `env.template`) | `PORTAL_URL`, `STRIPE_MODE`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM`, `PUSH_IN_EMULATOR` |
| `functions/.env.local` (gitignored, emulator only) | `STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `CALENDLY_WEBHOOK_SIGNING_KEY`, `SMTP_USER`, `SMTP_PASS` |
| Secret Manager (`firebase functions:secrets:set`) | `STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `CALENDLY_WEBHOOK_SIGNING_KEY`, `SMTP_USER`, `SMTP_PASS` (+ `COURIER_AUTH_TOKEN` only if used) |

## 9. Shared copy (exact)

1. Pending banner (parent home, athlete home, Membership, hub hero title):
   **"Payment pending - finish checkout to start booking"**; button **"Pay now"**;
   plan card **"Billed monthly from the 1st once you've paid"**; connected card
   **"Your card and invoices are managed in Stripe."**
2. Booking-opens banner (BookSession, SpecialistBooking, `reasonCopy`):
   **"Booking opens Fri, Oct 10 at 7 AM"** (`BOOKING_OPENS_LABEL`).
3. Calendly: button **"Book with Yannick"**; note = `CALENDLY_NOTE` (3.4);
   non-cancellable row **"Cancel or reschedule from Calendly's email"**.
4. Verify-email state (NotProvisioned, sign-up Step 0, pay gate):
   title **"Verify your email to finish"**, body **"We sent a link to {email}
   from {SMTP_FROM sender}. Open it, then tap I've verified."**; buttons
   **"Resend"**, **"I've verified"**; stranger CTAs **"I'm a parent - start
   sign-up"**, **"My parent enrolled me"** with **"Use the email they entered,
   then tap Check again."** and button **"Check again"**; legacy
   pending/declined **"Sign-up is now instant - start here"**.
5. Payment-received notice (`notices.paymentReceived`, title **"Payment
   received"**): body **"Payment received — booking opens Fri, Oct 10 at 7 AM."**
   when `!bookingOpen`, else **"Payment received — you're all set to book."**
   (em dash, matching `notices.js:268`). `?paid=` screen: **"Confirming your
   payment..."**; timeout **"Still confirming - refresh in a minute, or check
   your email from Stripe."**
6. Sign-up: `auth/email-already-in-use` -> **"This email already has a login -
   sign in instead"**; under-13 helper **"Under 13? A Google account needs
   Family Link permission for third-party sign-in; a new password login works
   either way."**; Google under-13 failure **"Ask your parent to allow sign-in
   for this app in Family Link, or create a password login below."**;
   Success title **"You're in"**, pay button **"Pay for {athlete}'s {tier}"**.
