# Manage billing in Stripe - signs the payer straight in (2026-11-17)

## Why

The Billing screen's "Manage billing in Stripe" opened Stripe's no-code
customer portal LOGIN link (`REACT_APP_STRIPE_PORTAL_URL`). That page asks for
an email and mails a sign-in link. A different address than the Stripe
customer's, or a mail in spam, and nothing happens: parents read it as broken.

## What changed

- New callable `openBillingPortal` (`functions/portal/billing-portal.js`). It
  makes a Stripe customer portal session for the caller's own household's
  Stripe customer and returns its one-time url. Stripe sends the family
  back to `/portal/billing` on production, staging or (emulator only)
  localhost:3005; any other origin goes back to production.
- Who may open it: the household's parent, or the 18+ athlete who signed up
  for themselves (household `createdBy`) - the same payer test as the Billing
  route and the rules' package change. A child's login and every staff role
  are refused. A password login whose email is not verified is refused, as
  checkout refuses it; the button shows the same verify card Pay now does.
- Which customer: every one the family holds - the household's
  `stripeCustomerId` and `stripeCustomerIds`, and each athlete's own (a
  subscription linked with `scripts/link-subscription.mjs` used to sit on
  the athlete only). One customer: one button. Several (a second checkout
  started before the first payment landed): one button per customer, named
  for its athletes; never one of them silently.
- 10 opens per login per 10 minutes (`billingPortalLimits/{uid}`, closed to
  every client in `firestore.rules`).
- The button (same label) now opens Stripe in the same tab, already signed
  in. It shows once the family has a Stripe customer, for the payer only.
  If the page does not leave, or comes back from Stripe, the button comes
  back and Billing reloads. On a failure it says so and, when the build has
  `REACT_APP_STRIPE_PORTAL_URL`, offers the old sign-in link as a fallback.
- The past-due and lapsed hero's "Update payment method" opens the same
  signed-in session (it used to open the sign-in link). With no Stripe
  customer at all it still says to contact the academy.
- A failure a retry cannot fix says so in plain words instead of "try
  again": the key may not make portal sessions or the portal settings are
  not saved ("not switched on yet"), or Stripe has no such customer in this
  mode ("could not be found, contact the academy").
- `scripts/link-subscription.mjs` now also puts the customer on the
  household, as the webhook does. `scripts/check-stripe-key.mjs` now checks
  the key may make a portal session.

## Owner release steps

0. Stripe Dashboard > Developers > API keys: edit the restricted key the
   functions use (STRIPE_SECRET_KEY), in LIVE mode and again in TEST mode,
   and set "Customer portal" to Write. Today it has Checkout Sessions,
   Customers and Prices only, so without this every tap reads "not
   switched on yet" and the log shows `stripe=StripePermissionError`.
   `node scripts/check-stripe-key.mjs` checks the TEST key (it asks for
   the key; its last row is the customer portal).
1. Stripe Dashboard, LIVE mode: Settings > Billing > Customer portal. Turn
   it on and Save, or every tap reads "not switched on yet". Choose:
   - Payment methods: update card - on.
   - Invoice history - on.
   - Cancel subscriptions - your call. The app never tells families to
     cancel in Stripe; a cancel there ends the membership through the webhook.
   - Switch plans - off. Package changes go through the app.
   Staging calls the same deployed functions, so it uses this LIVE setting
   too. Save it in TEST mode as well for local tests with test keys.
2. Deploy the function: `npx firebase-tools deploy --only functions:openBillingPortal`
3. Deploy the rules: `npx firebase-tools deploy --only firestore:rules`
4. Push `develop` and check on staging (rypacad.ryptest.com) with a family
   that has paid in LIVE mode: tap Manage billing in Stripe, land in Stripe
   signed in, tap Return, land on Billing. Staging calls the LIVE key, so a
   test household whose customer was made in TEST mode reads "could not be
   found" - that is expected, not a fault.
5. Then `git push origin develop:main`.
