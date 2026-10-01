# Sprint 20 launch runbook (owner)

Spec: `docs/portal/SPRINT-20-LAUNCH.md` sections 8 and 12. Every step here is
owner-run; agents never deploy, never hold a secret value, never push. Secrets
are named, never written down. Order matters: each step blocks the next.

## 0. Before anything (12.1-12.2)

- Firebase console -> Authentication: Email/Password ON; Authorized domains
  include `portal.rypacademy.com` (the permanent domain) and
  `rypacad.ryptest.com` (redirects to it); email templates DEFAULT (12.1).
- Stripe dashboard, in BOTH test and live mode: one Product + monthly Price
  per tier (t-6, t-12, t-16, Elite), a ONE-TIME $65 price for the single
  token (section 10), and a monthly one for facility access ($300/month); the no-code customer portal activated (its link is
  `REACT_APP_STRIPE_PORTAL_URL`); a **restricted key** per mode with exactly
  three scopes - Checkout Sessions **write**, Customers **write**, Prices
  **read** (`createCheckoutSession` reads the price's `unit_amount` to build
  the prepaid line and checks that the single price is one-time $65;
  Checkout creates the new parent's customer, including the single token's
  `customer_creation: 'always'`; ruled, D12). Paste the LIVE price ids into the `live`
  block of `functions/config/stripe-catalogue.json` (public ids; the `test`
  block is committed, `1b3dc3d`; the file ships inside `functions/`, D3/D19).

## 1. Rules + indexes (12.3)

```bash
firebase deploy --only firestore:rules,firestore:indexes --project rypacad
```

## 2. Railway (12.4)

Set `REACT_APP_CALENDLY_MENTAL_URL` (+ optional `_ELITE_URL`),
`REACT_APP_STRIPE_PORTAL_URL`, `REACT_APP_PORTAL_LIVE_DATA=true`,
`REACT_APP_FIREBASE_VAPID_KEY`; then promote. `main` is production (Railway
builds it) and all work lives on `develop`, so a release is always:

```bash
git push origin develop:main
```

Pushing `develop` alone (`git push origin develop`) deploys nothing.

The build with `/portal/signup` and released prices must be live before any
production smoke.

## 3. Functions, TEST mode (12.5)

### 3.1 Non-secret config - `functions/.env` (gitignored, deploy reads it)

Keys, values yours: `STRIPE_MODE=test`, `PORTAL_URL=https://portal.rypacademy.com`,
`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM`, `PUSH_IN_EMULATOR=false`.
**No secret name may appear in `.env`** - a name that is also declared with
`runWith({secrets})` fails the deploy with a conflict. Check (prints counts
only):

```bash
grep -cE "^(STRIPE_WEBHOOK_SECRET|STRIPE_SECRET_KEY|CALENDLY_WEBHOOK_SIGNING_KEY|SMTP_USER|SMTP_PASS)=" functions/.env   # must print 0
```

### 3.2 Secrets - Secret Manager, by NAME

Each command prompts for the value (hidden; nothing lands in shell history).
Generate the Calendly key first and keep it in the prompt's clipboard only:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
firebase functions:secrets:set STRIPE_SECRET_KEY --project rypacad            # the TEST restricted key (rk_test_...)
firebase functions:secrets:set CALENDLY_WEBHOOK_SIGNING_KEY --project rypacad # the hex string generated above
firebase functions:secrets:set SMTP_USER --project rypacad
firebase functions:secrets:set SMTP_PASS --project rypacad
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET --project rypacad        # a placeholder for now: any non-empty string; replaced in 3.4
```

`STRIPE_WEBHOOK_SECRET` must EXIST before the first deploy (a declared secret
that does not exist fails the deploy); its real value comes from the endpoint
you create in 3.4. Do NOT create `COURIER_AUTH_TOKEN` unless you use Courier -
it is not declared.

### 3.3 Deploy

```bash
cd functions && npm run lint && cd ..
firebase deploy --only functions --project rypacad
```

Expected: 13 functions listed as created/updated: `stripeWebhook`,
`onSessionBookedDecrease`, `onBookingCreated`, `onBookingCancelled`,
`onHouseholdMembership`, `sessionReminders`, `tokenExpiryReminders`,
`sweepWaitlist`, `createFamily`, `addAthletes`, `claimInvite`,
`createCheckoutSession`, `calendlyWebhook`. Once the single-token build is
merged (section 10) the count is **14**: `onSingleTokenSpent` joins them.

### 3.4 The TEST Stripe endpoint (spec 4.3)

Stripe dashboard (test mode) -> Developers -> Webhooks -> Add endpoint:

- URL `https://us-central1-rypacad.cloudfunctions.net/stripeWebhook`
- **API version: `2025-07-30.basil`** (the SDK's pinned version,
  `functions/node_modules/stripe/cjs/apiVersion.js`; the handler reads both
  the Basil and the older shapes, but the endpoint must be pinned so the
  shapes never drift under it)
- Events (five): `checkout.session.completed`, `invoice.paid`,
  `invoice.payment_failed`, `customer.subscription.updated`,
  `customer.subscription.deleted`

Copy its **Signing secret** (`whsec_...`), then:

```bash
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET --project rypacad
firebase deploy --only functions:stripeWebhook --project rypacad   # a function binds a secret's version at deploy time
```

### 3.5 Deploy check - 400, never 500 (spec 8)

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://us-central1-rypacad.cloudfunctions.net/stripeWebhook -H "content-type: application/json" -d "{}"
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://us-central1-rypacad.cloudfunctions.net/calendlyWebhook -H "content-type: application/json" -d "{}"
```

Expected: `400` and `400`. A `500` means the secret is not bound - check
`firebase functions:secrets:access STRIPE_WEBHOOK_SECRET --project rypacad`
exists (the command prints the value: run it alone, clear the terminal) and
that the deploy log listed the function.

## 4. Calendly (12.6, spec 6.3) - after 3.3

Yannick: Standard plan confirmed; event type *RYP Academy - Mental Game 1:1*
(30 min, secret, 24 h notice, the three invitee questions in order: Athlete
name / Who is attending? Athlete-Parent / Parent email). You, once, with his
personal token in `CALENDLY_TOKEN` for this shell only (`unset` it after):

```bash
curl -s https://api.calendly.com/users/me -H "Authorization: Bearer $CALENDLY_TOKEN"
```

Note `resource.uri` and `resource.current_organization`, then register the
subscription - `organization` is required even for user scope; `signing_key`
is the SAME hex string you set as `CALENDLY_WEBHOOK_SIGNING_KEY`:

```bash
curl -s -X POST https://api.calendly.com/webhook_subscriptions \
  -H "Authorization: Bearer $CALENDLY_TOKEN" -H "Content-Type: application/json" \
  -d '{"url":"https://us-central1-rypacad.cloudfunctions.net/calendlyWebhook","events":["invitee.created","invitee.canceled"],"organization":"<resource.current_organization>","user":"<resource.uri>","scope":"user","signing_key":"<the hex string>"}'
```

Verify (now, and again after the first real booking):

```bash
curl -s "https://api.calendly.com/webhook_subscriptions?organization=<resource.current_organization>&scope=user&user=<resource.uri>" -H "Authorization: Bearer $CALENDLY_TOKEN"
unset CALENDLY_TOKEN
```

Expected: one subscription with `"state": "active"`. Calendly disables a
subscription after repeated non-2xx - the function answers 200 for every
verified event, so `disabled` means the signing key does not match: re-set the
secret (3.2), redeploy `calendlyWebhook`, delete and re-create the
subscription.

## 5. Calendar sync (12.7)

Phil's blocks titled `Phil ...`, `Fitness ...` or anything containing the
word `Phil`, with real end times (the end time is the session length). Then,
from the repo root on a machine with `frontend/.env` (the calendar id + API
key) and a `firebase login`:

```bash
node scripts/sync-calendar-sessions.mjs --prod --dry-run   # review: every mental session is deleted or cancelled
node scripts/sync-calendar-sessions.mjs --prod --yes
```

`--from` defaults to today and `--to` to 90 days out; pass both for another
range. The dry run prints every timed event it will NOT make bookable as
`display-only "<title>" xN (<dates>)` - if a Phil session is in that list,
its title is the reason: rename it on the calendar and re-run.

Re-run after every calendar edit (nothing reaches the app until this runs).
This runs BEFORE any smoke booking. Families see a session only once its date
is inside their package's 30-day booking window (45 for Elite), and before
Oct 10 a non-Elite family sees it with Reserve disabled.

## 6. Packages + production smoke, TEST Stripe (12.8)

```bash
node scripts/write-packages.mjs --prod --mode test --dry-run
node scripts/write-packages.mjs --prod --mode test --yes
```

Smoke on portal.rypacademy.com, in this order, all with test-mode Stripe:

1. Password sign-up -> the verification mail lands in a Gmail inbox -> the
   link returns to `/portal/signin` -> the family is created instantly.
2. **Pay** for a t-6 athlete: the Checkout page shows TWO lines (`6 tokens`
   monthly, trial to Dec 1; `6 tokens - November 2026, prepaid` one-time);
   pay with `4242 4242 4242 4242`.
3. Land on `/portal/family?paid=...` -> "Confirming your payment..." ->
   *active* within a minute. Stripe: the subscription is **Trialing**, trial
   ends **Dec 1, 2026**; the endpoint shows `checkout.session.completed` and
   `invoice.paid` at 200. Firestore: `athletes/{id}.billing.status: 'active'`,
   `tokenPeriods/{id}_2026-11-01` with `prepaid: true`,
   `notifications/membership_{id}_paid`.
4. Claim a child login (password + verification, then Google).
5. An Elite athlete books at once; a t-6 athlete sees "Booking opens Sat,
   Oct 10 at 7 AM".
6. Book Yannick through the Calendly link: the session appears on My
   Schedule within a minute at the right Chicago time; cancel from Calendly's
   email: it disappears and the token returns.
7. Delete the smoke household, its athletes, its invites, and the Stripe test
   customer.

If step 2 shows one line, or the subscription is not Trialing, STOP before
step 7 of section 7 - the prepaid mechanics (spec 4.2) are not right.

Ruled (D11): when the next 1st is under 48 hours away at checkout (the
29th-31st), the session prepays NEXT month in full, the subscription's
trial ends on the 1st after that, and the remaining day or two are free -
Stripe refuses a Checkout trial end under 48 hours out. Before Nov 1 this
never applies.

## 7. Functions, LIVE mode (12.9)

1. `functions/.env`: `STRIPE_MODE=live`.
2. `firebase functions:secrets:set STRIPE_SECRET_KEY --project rypacad` - the
   LIVE restricted key (the same three scopes as section 0, D12).
3. `firebase deploy --only functions --project rypacad`.
4. Stripe dashboard, LIVE mode: create the endpoint exactly as 3.4 (same URL,
   same API version, same five events) - it has its OWN signing secret.
5. `firebase functions:secrets:set STRIPE_WEBHOOK_SECRET --project rypacad`
   with the LIVE `whsec_...`, then
   `firebase deploy --only functions:stripeWebhook --project rypacad`.
6. Repeat 3.5 (both curls -> 400).
7. `node scripts/write-packages.mjs --prod --mode live --dry-run` then
   `--yes`.
8. Disable (do not delete) the TEST endpoint in Stripe so test events never
   hit the live-secret function.

## 8. Accounts + the email (12.10-12.11)

- `node scripts/provision-owner.mjs` for one **ops** account; confirm
  Yannick's and Phil's staff docs exist.
- Send the Oct 1 email.
- Day-2 routine: `/portal/admin/signups` *unpaid* and *flagged* views;
  `node scripts/export-memberships.mjs --prod` for Stripe drift
  (`stripe-lookup-failed` and `unexpected-quantity` rows surface there).
- Once single tokens are on sale: the daily single-token review (10.7).

## 9. If something is wrong

| Symptom | Cause | Fix |
|---|---|---|
| webhook curl -> 500 "Webhook secret not configured" | secret not bound | 3.2 + redeploy that function |
| deploy fails "secret ... does not exist" | a declared name has no Secret Manager entry | create it (3.2) |
| deploy fails with an env/secret conflict | a secret NAME is in `functions/.env` | remove the line, keep it only in Secret Manager (and `.env.local` locally) |
| Pay button -> "Pricing is not set up yet" | `price-missing`: catalogue null for `STRIPE_MODE` | paste the ids, redeploy (the JSON ships inside `functions/`) |
| Pay button -> "Checkout is unavailable" | `stripe-error`: key scope or mode mismatch | the restricted key needs Checkout Sessions write, Customers write, Prices read, in the SAME mode as `STRIPE_MODE` |
| `?paid=` never confirms | endpoint not receiving / wrong secret | Stripe -> Webhooks -> endpoint -> recent deliveries; 3.4-3.5 |
| Calendly booking never appears | subscription `disabled` or key mismatch | 4 |
| `stripeEvents` outcome `unmatched` | legacy household without customer link | the daily export; link `stripeCustomerId` in the console |

## 10. Single session tokens (spec ruling 0.14, D20)

A single token is a ONE-TIME $65 purchase. Each paid Checkout Session is one
token, `graceTokens/single_<cs>`, good for any bookable session through
**Sat, Feb 27, 2027**, still behind the Oct 10 07:00 gate. Families may buy
as many as they like.

**Owner ruling 2026-10-01: single tokens go on sale when booking opens - Sat,
Oct 10, 2026 at 7:00 AM America/Chicago - and not before.** The sale opens by
the clock (the booking gate itself, no flag to flip, no second date), so
everything in 10.3 is deployed BEFORE Oct 10 and nothing has to be done at
7 AM. Until then the sign-up card reads "Available Sat, Oct 10 at 7 AM. Pick
a monthly package now, or come back then.", no Pay or Buy button is shown for
a single token, and `createCheckoutSession` refuses one with "Single tokens
are available from Sat, Oct 10 at 7 AM. Nothing has been charged." before
any Stripe call. **Hard stop: if 10.3 is not fully deployed by Fri, Oct 9,
deploy none of it** - production then keeps refusing single checkout
(`single-one-time`) and sells no singles.

### 10.1 Emulator TEST-mode rehearsal (Oct 6, before any single deploy)

**Since the 2026-10-01 ruling this rehearsal cannot be run on the merged code
before Oct 10**: step 5's Buy button is hidden and the function refuses
`single-not-open`, by the real clock, on the emulator too. Before the gate,
use one of these instead (neither goes around the gate in production):

- `node scripts/check-stripe-key.mjs` with the TEST restricted key. It now
  builds the single token's own payment-mode body (`singleSessionBody`),
  creates that Checkout Session in Stripe TEST, reads its line item and
  expires it - the key-scope check of step 5, with no card and no charge. It
  also checks that the single price is the one-time $65 price.
- The full rehearsal below from `../wt-single-int` (branch
  `single/integration`, written before the gate existed). Its single
  checkout body, price check and webhook are the same code as the merge.

From Oct 10 07:00 the steps below work on the merged code as written.

Production is already LIVE (section 7) and its TEST endpoint is disabled, so
the rehearsal runs on the LOCAL emulator with your real restricted TEST key.
Never switch production back to test mode.

You need the Stripe CLI logged in to the TEST account, and the TEST
restricted key `rk_test_...` with exactly Checkout Sessions write, Customers
write, Prices read.

1. In `functions/.env.local` (and the same secret names in
   `functions/.secret.local`) set `STRIPE_MODE=test`,
   `PORTAL_URL=http://localhost:3000` and `STRIPE_SECRET_KEY` = the
   `rk_test` key. Keep a copy of the harness values (`sk_test_harness` and
   the harness `whsec_`) to put back in step 12.
2. `firebase emulators:start --only auth,firestore,functions --project rypacad`
   (ports 9099/8080/5001), then `npm run seed:emulator` (it writes
   `packages/single`).
3. Forward the webhooks:

   ```bash
   stripe listen --forward-to http://127.0.0.1:5001/rypacad/us-central1/stripeWebhook --events checkout.session.completed,invoice.paid,invoice.payment_failed,customer.subscription.updated,customer.subscription.deleted
   ```

   Put the printed `whsec_` into `STRIPE_WEBHOOK_SECRET` in `.env.local` /
   `.secret.local`, then restart the functions emulator.
4. Start the frontend on :3000 with `REACT_APP_USE_EMULATORS=true` and
   `REACT_APP_PORTAL_LIVE_DATA=true`.
5. Sign up a new family at `/portal/signup` with one athlete on **Single
   token** (verify through the auth emulator), then press Pay / "Buy a
   session token - $65". The Stripe TEST Checkout must show one $65.00
   one-time line, card only, the custom submit text, and an expiry about
   24 h out. Pay with `4242 4242 4242 4242`.
   **This is the unverified key-scope check.** If `createCheckoutSession`
   returns `stripe-error`, read the emulator log:
   - it names `custom_text`: remove `custom_text` and retry;
   - it names `payment_intent_data`: remove `payment_intent_data` and retry;
   - it names a missing permission (most likely PaymentIntents write): add
     that scope to BOTH the test and the live restricted key and retry.

   Only a green run may proceed.
6. The return lands on `/portal/family?paid=<id>&cs=cs_test_...&single=1`,
   and the green "Payment received" banner appears within about 10 s.
7. Emulator Firestore must show:
   - `graceTokens/single_<cs>`: athleteId, householdId, `expiresAt
     '2027-02-27'`, `reason 'single-purchase'`, `paymentIntentId 'pi_...'`,
     `amountTotal 6500`, `currency 'usd'`, `priceId
     price_1UKlCPD16IMJzfAPYPEI29ED`;
   - `athletes/<id>.billing` `{status 'active', oneTime true, subscriptionId
     null, customerId 'cus_...'}`;
   - `households/<id>.stripeCustomerId` set;
   - `stripeEvents/<evt>`: outcome `issued-single`, via `client-reference`,
     `checkoutMode 'payment'`.
8. The Stripe TEST Dashboard shows one succeeded $65 payment and a new
   Customer, with NO subscription and NO invoice.
9. Buy a second token from the Billing card: a second doc `single_<cs2>`,
   the banner confirms on the new cs, and no second payment-received
   notice.
10. Replay: `stripe events resend <evt_id>` answers `duplicate`; delete that
    `stripeEvents` row and resend: `duplicate-purchase`, still two tokens.
11. Refund rehearsal: refund payment #2 in the TEST Dashboard; void
    `graceTokens/single_<cs2>` in the emulator (10.6); the portal count drops
    to 1; a resend of cs2's event is still `duplicate-purchase`.
12. Stop `stripe listen` and put the harness values back in `.env.local` /
    `.secret.local`.

Booking with the token is not rehearsed here - the real clock is before the
Oct 10 gate. `verify-single.js` and `verify-rules.mjs` pass B prove it.

### 10.2 The LIVE price (Oct 6-7, before 10.3)

1. Stripe LIVE dashboard: on the *Casual Coaching Session* product, create a
   ONE-TIME $65.00 USD price (not recurring, no customer-chosen amount).
2. Paste its id into `live.single` in `functions/config/stripe-catalogue.json`
   and commit it.
3. Optional: `node scripts/write-packages.mjs --prod --mode live --dry-run`,
   then `--yes`.

`live.single` must be set BEFORE the webhook deploy. A recurring price or a
wrong amount is refused at checkout as `price-mismatch`.

### 10.3 Deploy order (any day before Oct 10; each step blocks the next)

Rewritten 2026-10-01 for the merge of the single token onto develop (branch
`single/merge`). The LIVE one-time single price is already in
`functions/config/stripe-catalogue.json` (`live.single`), so 10.2 is done.
There is no index change and no new `REACT_APP_*` or functions variable.
Run the gates first (TEAM.md / the merge report): unit suites, lint, build,
then the emulator harnesses - `verify-rules.mjs` must print "firestore.rules
loads" before any rules deploy, because the merged rules were never compiled
by a builder.

1. `firebase deploy --only functions --project rypacad` - all 15 functions.
   FIRST, because the old webhook records a payment-mode session as `ignored`
   for good and must never meet one. It ships the new `stripeWebhook`
   (payment mode -> `graceTokens/single_<cs>`), `createCheckoutSession` (the
   single checkout behind the clock gate), the new `onSingleTokenSpent`, and
   the updated `onSessionBookedDecrease`, `calendlyWebhook`,
   `tokenExpiryReminders` and `onBookingCancelled`. Run
   `node test/check-exports.js` from `functions/` first: it must print
   "ok  15 functions exported".
   *What a family sees after this step: nothing new.* Monthly checkout, the
   sibling discount, the family facility add-on and the waitlist behave as
   they do today. A single-token checkout was refused before and is still
   refused, now with the Oct 10 sentence.
2. `firebase deploy --only firestore:rules --project rypacad` - backward
   compatible with the site that is live now, and it MUST precede step 3:
   the new site's re-book writes `chargedFrom` / `graceTokenId` /
   `rebookedAt`, which today's rules refuse for everyone.
   *What a family sees after this step, on the current site: nothing new.*
   Booking, cancelling and re-booking work as before. The rules now also
   refuse two things no screen offers (cancelling a session whose day is
   over; re-booking while the household is past due or lapsed) and one a
   family could meet on the current site until step 3: booking again a
   session it had cancelled, when that booking was paid with a bonus token
   that has since expired, fails with an error (the new site re-decides the
   charge, so it works again after step 3). Keep the gap between steps 2 and
   3 short. Check once with an Elite account on the live site: book, cancel,
   book again.
3. `git push origin develop:main` (Railway rebuild) once `single/merge` is
   merged into `develop`.
   *What a family sees after this step:* the single token card at sign-up
   reads "Available Sat, Oct 10 at 7 AM. Pick a monthly package now, or come
   back then." and cannot be picked; an athlete already on the single token
   sees "Single tokens are available from Sat, Oct 10 at 7 AM." where a Pay
   button would be; a single athlete's meter reads session tokens, not "0 of
   0". A tab left open on the old site keeps working until it is reloaded
   (its status-only re-book passes the new rules).
4. Nothing to do on Oct 10. At 7:00 AM Chicago the card becomes a pick like
   any other, "Buy a session token - $65" appears for an active athlete (a
   payment-pending one sees "Pay now"; an under-18 athlete's own login sees
   the ask-a-parent line), and the same instant
   `createCheckoutSession` starts selling. Do 10.4 then.

Steps 1 and 2 may swap (each is compatible with everything live); step 3 is
never before step 2.

Rollback. Before Oct 10 there is nothing to roll back - no single can be
sold. From Oct 10, to stop selling singles without touching anything else,
redeploy develop's checkout from a clean checkout of the commit before the
merge (it refuses every single checkout as `single-one-time`):

```bash
git worktree add ../wt-rollback 00b88c3
cd ../wt-rollback   # junction functions/node_modules and copy functions/.env first
firebase deploy --only functions:createCheckoutSession --project rypacad
```

The rules, the webhook and the site stay; they are compatible (the site then
shows the Buy button and the function answers its refusal). Never write an
old `checkout.js` over the merged one: it would drop the sibling discount,
the family facility checks and the open-session reuse. If the RULES ever
have to go back, put the previous site back first (the merged site's re-book
needs the merged rules), then deploy `firestore.rules` from `00b88c3`.

### 10.4 LIVE smoke (Oct 10, 7:00 AM - not before)

The ruling means no single can be bought before the gate, with a real card
or a test one, so this cannot be done on Oct 8 any more. Before the gate the
LIVE key is covered only by its scopes matching the TEST key that passed
`check-stripe-key.mjs` (10.1). At 7:00 AM on Oct 10, before the families:

A throwaway household buys one $65 single with a real card. Check the Stripe
LIVE payment, `graceTokens/single_<cs>`, `billing.oneTime`, and the ledger
row `issued-single`. Refund it in Stripe, void the token (10.6), then delete
the smoke household, its athlete and its invites (as in section 6 step 7).
This also proves the LIVE restricted key has the same three scopes. If the
Buy button answers "Checkout is unavailable right now", read the function log
for the missing key scope (section 9) and add that scope to the LIVE
restricted key in Stripe - the key itself does not change, so no deploy is
needed.

### 10.5 Before Oct 10 07:00 - two read-only counts

- Athletes with `packageId 'single'` and NO `billing` block: they lose the
  implicit monthly token. Each family buys tokens or gets an ops comp (the
  Issue tokens editor now defaults to 0 for a single).
- Lapsed households with a legacy athlete (no `billing` block): single
  checkout refuses them (`household-lapsed-legacy`).

### 10.6 Refunds (manual)

Refund in Stripe first, then VOID the token in the Firebase console: on
`graceTokens/single_<cs>` set `expiresAt: '2000-01-01'`, `refundedAt`,
`refundedBy` and `refundNote`. **Never delete it** - the id is what stops a
Stripe replay from issuing it again. Every reader drops an expired token and
the rules refuse to book with it. If the token is already SPENT (a
non-cancelled booking carries `graceTokenId == 'single_<cs>'`), the refund is
your decision: cancel that booking first, or keep the token and refund
nothing. Each token stores its `paymentIntentId` for the Stripe lookup.

### 10.7 Standing rules

- Never sell a single by Payment Link or a Dashboard invoice. A Payment Link
  has no portal client reference (`ignored`), and a one-off invoice runs the
  legacy household path. Only the portal's Buy button sells tokens.
- Cancel a monthly subscription in Stripe BEFORE moving an athlete to Single
  in the portal. Otherwise Stripe keeps billing them, `invoice.paid` keeps
  granting monthly tokens and `subscription.updated` moves the package back.
- Changing the single price: move the OLD id into `retired.<mode>.single`
  (a top-level `{"retired": {"test": {"single": []}, "live": {"single":
  []}}}` block in `stripe-catalogue.json`) and keep it there at least 24 h
  (a Checkout Session lives up to 24 h); deploy `stripeWebhook` BEFORE
  `createCheckoutSession`. The same commit relaxes `catalogue.test.js`'s
  "exactly the twelve keys" check.
- A PAID payment-mode row (`checkoutMode 'payment'`) recorded `ignored`,
  `unexpected-one-time` or `unmatched`: fix the cause (the catalogue id, the
  webhook deploy), delete that `stripeEvents` row and Resend the event from
  Stripe - or refund it.
- Review daily: `double-spend` cancellations (`bookings` where
  `cancelReason == 'double-spend'`; each family also got a "Booking
  released" notice) and any `issued-single-late`,
  `issued-single-amount-check` or `issued-single-household-lapsed` ledger
  rows (the function also logs each one).
- Review daily: `stripeEvents` rows with `checkoutMode 'payment'` whose
  outcome is not `issued-single...` or `duplicate-purchase` (`unmatched`,
  `unexpected-one-time`, `ignored`, `stripe-lookup-failed`). When Stripe
  shows that session PAID, the family has paid $65 and holds no token:
  repair it as in the rule above. The function logs each paid one that
  carries a portal reference as an error, "no token issued - needs ops
  review".
- Review daily: refunds and disputes on the single price in Stripe, against
  the tokens. Each refunded or disputed $65 payment's token (`graceTokens`
  where `paymentIntentId` is that payment's) must read `expiresAt
  '2000-01-01'` (10.6). The portal does not hear about a refund or a
  dispute: until the token is voided the athlete can still book with it.
- A monthly athlete's subscription that ends after failed payments, in a
  family whose other paying athletes hold only session tokens: the webhook
  sets the household back to `active` in the same event (no invoice would
  ever clear `past_due`), the session-token athletes book again and the
  ended athlete gets Pay now. A sibling with a monthly subscription keeps
  the freeze until that sibling's next paid invoice, as before.
- After any calendar sync that prints `cancel ... (booked N)`, open that
  session in Roster and run **Cancel remaining bookings**: monthly members
  get a bonus token, session-token holders get their token back, and each
  family gets the session-cancelled notice.

| Symptom | Cause | Fix |
|---|---|---|
| Buy -> "Pricing is not set up correctly yet" | `price-mismatch`: `single` is not a one-time $65 USD price | paste the right id (10.2), redeploy |
| Buy -> "Session tokens for this season are no longer on sale" | `season-over`: under 30 min to 00:00 Chicago Feb 28, 2027 | expected |
| Buy -> "A card on this family account needs updating" | `household-past-due` | the family updates the card in the Stripe portal |
| Buy -> "needs the academy's help" | `household-lapsed-legacy` | sort out the legacy sibling (its own checkout) first, then the family retries |
| Facility add-on refused for a single | `single-no-facility` | expected: facility needs a monthly membership |
| `?paid=...&single=1` never confirms | the webhook is the OLD one (`ignored`) or not receiving | 10.3 step 1, then the recovery rule above |
