# Decision gaps

Open questions and stale premises surfaced while building the token model
(Sprint 12, contract v2.0). Each entry says what is unresolved, what the code
does in the meantime, and who decides. Resolved entries move to the sprint's
integration notes in `TEAM.md`; nothing here is resolved by guessing.

## Owner rulings needed (from the Sprint 12 pin, "Open")

1. **Package prices** — pending Luke. Catalogue prices carry `pending: true`
   and the UI renders "pending" beside them; seeds carry no prices; prod gets
   them only through the user-gated provisioner run.
2. **Saturday 10–12 / 12–2** — two 60-minute sessions or one 2-hour event
   each. The generator produces four 60-minute blocks (10, 11 tournament;
   12, 1 training) and says so in a comment; the calendar sync follows
   whatever the owner titles.
3. **Yannick daytime 1:1 attendee** — athlete (built) or parent (not
   built). Part 1 pins the athlete-attended model; the parent-as-attendee
   shape (guardian attends, a named child's token is spent) is not built.
4. **`SPECIALIST_MONTHLY_CAP.mental`** — 1 per calendar month as pinned, or
   a different cadence. It is a frequency knob, not a pool.
5. **`single`** — a period package (as seeded) or a per-visit sale. Stripe
   sprint question; the catalogue entry costs nothing now.
6. **Waitlist acceptance window** — none in v1 (auto-confirm). Revisit if
   promotion into an unwanted slot becomes a support pattern.

## Stale premises in the Sept 15 handoff (checked against the tree)

- **`firestore.rules.r3`** (Aug 27) is a draft for a data model this app
  never adopted — custom-claim roles, `allowances`, `billing`, `staff`,
  `mentalGame`, `fitnessLogs`. Putting it live would regress every rules
  branch from Sprints 6–11. The token model's rules principle (clients never
  write token ledgers; sessions/bookings writes stay the narrow transaction
  diffs) is implemented inside the current `firestore.rules` instead.
  `NEXT-PROMPT.md` now records the file as dead.
- **`allowances/{athleteId}_{YYYY-MM}`** never existed here — allowances
  were always derived from bookings. The migration in contract §15 reduces
  to: bookings gain `periodKey`, `pool` is retired, `fitnessPackageId` is
  dropped, capacity stays 15.
- **`services/familyService.js` / `calculatePackageCost`** — not in the
  tree (`frontend/src/services/` holds only `userSetupService.js`). Nothing
  to delete.
- **"Elite no-show tracker (already built)"** — there is no separate
  tracker; the `noshow` booking status plus Admin's "No-shows this month"
  query are the mechanism, and Sprint 12 adds a per-athlete count to it.
- **`sessions.bookedCount` / `athlete.userId` / `athlete.guardianIds` /
  `bookedBy`** in the contract's pseudocode map to `sessions.booked`,
  `users.athleteId`, `users.householdId` ⇄ `athletes.householdId`, and
  `bookings.createdBy` here. Names in the code stay as they are.

## Functions

- ~~Lint blocks any functions deploy.~~ Resolved in Sprint 13: the quotes
  rule now matches the file's single-quote convention, `linebreak-style`
  is off (CRLF working tree), and `npm --prefix functions run lint` passes.
- **The kept 2025 triggers run on the v1 API by explicit import.** In
  firebase-functions v6 `require('firebase-functions')` resolves to v2,
  where `functions.firestore.document` and `functions.pubsub.schedule` do
  not exist — nothing in `functions/` was loadable before Sprint 13. The
  fix is `require('firebase-functions/v1')`; migrating the kept triggers to
  v2 is a deliberate separate change, not something to do in passing.
- **Stripe billing cycles anchored on the 29th–31st map to the 28th.** The
  app's periods are anchor-day based and clamp to 1–28, so an invoice
  whose period starts on Jan 31 issues `tokenPeriods/{athlete}_2026-01-28`
  (the only id a hook can look up). Contract call: accept the clamp, or
  require Stripe subscriptions to bill on the 1st–28th.
- **Promotion notifications are email-only unless users carry a phone.**
  The `users` table documents no phone field; `notify.js` reads
  `phoneNumber` or `phone` when present and otherwise sends email only
  through Courier. Decide whether provisioning should capture a guardian
  phone on the users doc (households.guardian.phone exists today).
- **`stripeEvents.outcome == 'processing'`** on a record means a follow-up
  phase (revocation or downgrade trimming) crashed after the event was
  recorded — the daily export should flag those for a manual re-run.
- **`handleSMSResponse` confirms and cancels nothing** (unchanged): a
  YES/NO reply needs a phone → athlete mapping the data model lacks.
- **`onSessionUpdateNotifyWaitlist` is gone** — replaced by the
  `onSessionBookedDecrease` promotion trigger, which treats an absent
  `sessions.status` as `'scheduled'` (generator-written sessions carry no
  status; calendar-synced ones do).
- **`handleSMSResponse` confirms and cancels nothing.** The YES/NO handlers
  are the 2025 stubs; the webhook now verifies Twilio's signature and
  answers the sender, and that is all. Wiring a reply to a real booking
  transition is a Part 2 decision (and needs a phone → athlete mapping the
  data model does not have).
- **`onSessionUpdateNotifyWaitlist` never fires.** It still reads the 2025
  `participants` / `waitlist` arrays; Part 2 rewrites it as the promotion
  trigger on `sessions.booked` decreasing.
- **`sendDailyReminders` was deleted, not fixed.** It read `participants`
  and called an HTTP export as a function. Session reminders, if wanted,
  are a Courier job over `bookings` in Part 2.

## Sprint 14 — notifications (owner rulings needed)

Built to the pinned defaults (TEAM.md "Sprint 14 pins"); each is a one-line
constant change if the owner rules otherwise.

1. **Reminder timing** — 24 hours ahead, sent at 17:00 America/Chicago
   (`sessionReminders` schedule). Alternative: morning-of.
2. **Expiry warning lead** — 3 days before the period ends (tokens) or the
   grace token expires (`tokenExpiryReminders`, 09:00 Chicago), once per
   period/token. Alternative: 7 days, or a second warning the day before.
3. **A member's own cancellation** — no notice in v1 (the screen confirms
   it). Staff cancellations and revocations always notify.
4. **Progress / check-in notices** — not built (`checkin-due` when the
   Yannick cadence is overdue); needs the mental-cap cadence ruling above
   (item 4 of the Sprint 12 list) first.
5. **Deploy** — every sender is a Cloud Function: nothing sends until the
   project is on Blaze and `firebase deploy --only functions` runs with
   the `SMTP_*` keys (or `COURIER_AUTH_TOKEN`) set for email; push needs no
   key on the server, only `REACT_APP_FIREBASE_VAPID_KEY` in the client
   build. The ledger and the Settings list work without any of them
   (outcomes 'skipped').
6. **SMS retired (owner, 2026-09-16: "push is fine + email")** — the
   Twilio sender, its quiet-hours rule and the YES/NO reply webhook are
   deleted in Sprint 15; web push through Firebase Cloud Messaging is the
   phone channel and `users.phone` is contact information only. The two
   `handleSMSResponse` entries in the Functions section above are moot.

Superseded by Sprints 14–15: the Functions note above that promotion
notices are email-only — every notice now goes by email (SMTP or Courier,
`functions/portal/email.js`) and by web push (`functions/portal/push.js`),
gated per recipient by `users.notificationPrefs` and `users.pushTokens`,
with the per-channel outcome recorded on the ledger row.

## Sprint 16 — the Billing hub (owner rulings, 2026-09-16)

1. **"Billing" is back on the live member surface** — the owner's ruling
   ("build out the billing suite... the hub for parents to see how many
   tokens are left") reverses Sprint 7/11. `/portal/billing` is the parent
   hub with its own tab; the parent's old Membership route redirects there.
2. **Waitlist reservations now block booking** — `assertPeriodTokensLeft`
   counts the athlete's own waitlist entries in the period, matching
   `tokensFor`'s `left` (which always subtracted them). Before this, a
   parent could read "0 left" and still book. Ruling if unwanted: drop the
   reservation from both, never from one.
3. **Card updates** — no Stripe Checkout/Elements yet. Set
   `REACT_APP_STRIPE_PORTAL_URL` to Stripe's no-code customer portal login
   link and the hub's "Update payment method" opens it; until then the
   hero says to contact the academy.
4. **Newsletter scrapped** (owner) — composer, route, hook, fixtures and the
   `newsletter` notification category are gone. A saved preference map that
   still carries the key is ignored.
5. **Elite on the hub** — reads "Unlimited" with the period's sessions as a
   plain list. Whether to show more (attendance rate, 24/7 access log) is
   open.

## Sprint 17 — staff billing + the self-running token model (2026-09-17)

No new rulings. Closed: the specialist Sessions screen listed today's
sessions twice (Sprint 13 cosmetic follow-up) — the day list now skips
today when the pinned section renders it. Note for the owner: the
`sweepWaitlist` function replaces the daily manual
`node scripts/sweep-waitlist.mjs --prod --yes` once functions deploy
(Blaze); until then the script remains the way expired waitlist entries
turn into bonus tokens, and the two now mint the same document id.

## Sprint 18 — the owner's amendments v2.0.1 / v2.0.2 (2026-09-17)

1. **Tue/Thu 3 PM (invite-only group)** — removed from the generated
   schedule; its booking path is an owner ruling for a later sprint. When it
   reaches the shared calendar its title must not begin "Training" or
   "Tournament", or the sync makes it bookable by everyone.
2. **`t-20` retired** — gone from the catalogue and seeds; production loses
   the doc on the next user-gated `provision-family.mjs` catalogue run. Any
   athlete still pointing at it reads "no package" until reassigned.
3. **Capacity 14** — `capacity` is a synced field: prod sessions take 14 on
   the next user-gated calendar sync run. `data/tour.js` TOUR_POINTS has 25
   positions (the pin assumed 15) and is unaffected.
4. **Prices withheld** — the owner's figures are in the catalogue;
   `PRICES_RELEASED = false` hides them from parents and athletes (Billing
   hub, Membership, Registration). Flip it when pricing is released.
5. **Elite's per-day cap is client-side only** — the server promotion
   trigger does not check it (an Elite athlete waitlisted twice on one date
   could be promoted into both). Mirror it in `functions/portal/promotion.js`
   if that ever happens; noted, not built.
6. **Facility access and Stripe** — the $300 line item is displayed and
   stored; carrying it as a subscription item is the Stripe sprint's.
