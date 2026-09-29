# Sprint 20 launch runbook (owner)

Spec: `docs/portal/SPRINT-20-LAUNCH.md` sections 8 and 12. Every step here is
owner-run; agents never deploy, never hold a secret value, never push. Secrets
are named, never written down. Order matters: each step blocks the next.

## 0. Before anything (12.1-12.2)

- Firebase console -> Authentication: Email/Password ON; Authorized domains
  include `rypacad.ryptest.com`; email templates DEFAULT (12.1).
- Stripe dashboard, in BOTH test and live mode: one Product + monthly Price
  per tier (t-6, t-12, t-16, Elite, single) and one for facility access
  ($300/month); the no-code customer portal activated (its link is
  `REACT_APP_STRIPE_PORTAL_URL`); a **restricted key** per mode with exactly
  three scopes - Checkout Sessions **write**, Customers **read**, Prices
  **read** (`createCheckoutSession` reads the price's `unit_amount` to build
  the prepaid line; ruled, D12). Paste the LIVE price ids into the `live`
  block of `functions/config/stripe-catalogue.json` (public ids; the `test`
  block is committed, `1b3dc3d`; the file ships inside `functions/`, D3/D19).

## 1. Rules + indexes (12.3)

```bash
firebase deploy --only firestore:rules,firestore:indexes --project rypacad
```

## 2. Railway (12.4)

Set `REACT_APP_CALENDLY_MENTAL_URL` (+ optional `_ELITE_URL`),
`REACT_APP_STRIPE_PORTAL_URL`, `REACT_APP_PORTAL_LIVE_DATA=true`,
`REACT_APP_FIREBASE_VAPID_KEY`; push `main`. The build with `/portal/signup`
and released prices must be live before any production smoke.

## 3. Functions, TEST mode (12.5)

### 3.1 Non-secret config - `functions/.env` (gitignored, deploy reads it)

Keys, values yours: `STRIPE_MODE=test`, `PORTAL_URL=https://rypacad.ryptest.com`,
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
`createCheckoutSession`, `calendlyWebhook`.

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

Phil's blocks titled `Phil ...` with real end times. Then:

```bash
node scripts/sync-calendar-sessions.mjs --prod --dry-run   # review: every mental session is deleted or cancelled
node scripts/sync-calendar-sessions.mjs --prod --yes
```

Re-run after every calendar edit. This runs BEFORE any smoke booking.

## 6. Packages + production smoke, TEST Stripe (12.8)

```bash
node scripts/write-packages.mjs --prod --mode test --dry-run
node scripts/write-packages.mjs --prod --mode test --yes
```

Smoke on rypacad.ryptest.com, in this order, all with test-mode Stripe:

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
5. An Elite athlete books at once; a t-6 athlete sees "Booking opens Fri,
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

## 9. If something is wrong

| Symptom | Cause | Fix |
|---|---|---|
| webhook curl -> 500 "Webhook secret not configured" | secret not bound | 3.2 + redeploy that function |
| deploy fails "secret ... does not exist" | a declared name has no Secret Manager entry | create it (3.2) |
| deploy fails with an env/secret conflict | a secret NAME is in `functions/.env` | remove the line, keep it only in Secret Manager (and `.env.local` locally) |
| Pay button -> "Pricing is not set up yet" | `price-missing`: catalogue null for `STRIPE_MODE` | paste the ids, redeploy (the JSON ships inside `functions/`) |
| Pay button -> "Checkout is unavailable" | `stripe-error`: key scope or mode mismatch | the restricted key needs Checkout Sessions write, Customers read, Prices read, in the SAME mode as `STRIPE_MODE` |
| `?paid=` never confirms | endpoint not receiving / wrong secret | Stripe -> Webhooks -> endpoint -> recent deliveries; 3.4-3.5 |
| Calendly booking never appears | subscription `disabled` or key mismatch | 4 |
| `stripeEvents` outcome `unmatched` | legacy household without customer link | the daily export; link `stripeCustomerId` in the console |
