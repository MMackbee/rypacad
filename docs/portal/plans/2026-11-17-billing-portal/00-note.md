# Manage billing in Stripe - signs the payer straight in (2026-11-17)

## Why

The Billing screen's "Manage billing in Stripe" opened Stripe's no-code
customer portal LOGIN link (`REACT_APP_STRIPE_PORTAL_URL`). That page asks for
an email and mails a sign-in link. A different address than the Stripe
customer's, or a mail in spam, and nothing happens: parents read it as broken.

## What changed

- New callable `openBillingPortal` (`functions/portal/billing-portal.js`). It
  makes a Stripe customer portal session for the caller's own household's
  `stripeCustomerId` and returns its one-time url. Stripe sends the family
  back to `/portal/billing` on production, staging or (emulator only)
  localhost:3005; any other origin goes back to production.
- Who may open it: the household's parent, or the 18+ athlete who signed up
  for themselves (household `createdBy`) - the same payer test as the Billing
  route and the rules' package change. A child's login and every staff role
  are refused.
- 10 opens per login per 10 minutes (`billingPortalLimits/{uid}`, closed to
  every client in `firestore.rules`).
- The button (same label) now opens Stripe in the same tab, already signed
  in. It shows once the household has a Stripe customer, for the payer only.
  On a failure it says so and, when the build has
  `REACT_APP_STRIPE_PORTAL_URL`, offers the old sign-in link as a fallback.
- Not changed: the past-due hero's "Update payment method" still opens the
  sign-in link.

## Owner release steps

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
   that has paid: tap Manage billing in Stripe, land in Stripe signed in, tap
   Return, land on Billing.
5. Then `git push origin develop:main`.
