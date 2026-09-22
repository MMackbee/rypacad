# Decision gaps

Open questions and stale premises surfaced while building the token model
(Sprint 12, contract v2.0). Each entry says what is unresolved, what the code
does in the meantime, and who decides. Resolved entries move to the sprint's
integration notes in `TEAM.md`; nothing here is resolved by guessing.

## Owner rulings needed (from the Sprint 12 pin, "Open")

Answered 2026-09-22 (see SPRINT-12-PINS amendment v2.0.4), kept here as the
record of what was decided:

1. ~~**Package prices**~~ - the owner's sheet landed 2026-09-17 (t-6 $299,
   t-12 $569, t-16 $719, Elite $999, all `pending: false`). Prices stay hidden
   from families until enrollment opens, then `PRICES_RELEASED = true`. The
   SINGLE TOKEN is the one price still `pending: true` at $65 - see below.
2. ~~**Saturday 10-12 / 12-2**~~ - one two-hour event each. Built:
   `durationMinutes` on every session, 120 for those two.
3. ~~**`SPECIALIST_MONTHLY_CAP.mental`**~~ - ruled in amendment v2.0.1: Elite
   2 a month, everyone else 1.
4. ~~**Waitlist acceptance window**~~ - none. Promotion auto-confirms (pin F,
   "owner: fine"). Revisit only if promotion into an unwanted slot becomes a
   support pattern.
5. ~~**Yannick daytime 1:1 attendee**~~ - EITHER, chosen at booking. Built:
   `bookings.attendee` / `waitlist.attendee` (`'athlete' | 'parent'`,
   mental-only, absent reads as the athlete), the "Who is attending?"
   control on the slot sheet, "Parent attending" on the family's own rows,
   "<Name> (parent)" on Yannick's day view and the coach roster, and a
   clause on the booked / reminder / promoted notices. The athlete's token
   pays either way - charging does not branch on it.
6. ~~**Single token price**~~ - $65, `pending: false`.

Still open:

1. **Is `single` ever sold per visit?** The $65 one-token period package is
   confirmed and built; selling a single visit a la carte is a Stripe-sprint
   question. The catalogue entry costs nothing while it waits.

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

1. ~~**Reminder timing**~~ - RULED 2026-09-22: stays as built, 24 hours
   ahead at 17:00 America/Chicago.
2. ~~**Expiry warning lead**~~ - RULED 2026-09-22: SEVEN days, not three
   (`EXPIRY_LEAD_DAYS`), still one notice per expiry.
3. ~~**A member's own cancellation**~~ - RULED 2026-09-22: it now sends a
   receipt ("the token is back in this period"). Built as the member branch of
   `onBookingCancelled`; it sends when functions deploy.
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
5. ~~**Elite on the hub**~~ — RULED 2026-09-22: it now also reads "N attended ·
   N booked this period" (and no-shows when there are any), derived from the
   same rows the session list shows. Elite has no countdown, so usage is the
   only honest measure of their period. A 24/7 access log stays out — the
   portal has no door data.

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
3. ~~**Capacity / Tour points tail**~~ — RULED 2026-09-22: the table stays as
   it is. A full 25-player field is already scored position by position, and
   the 12-point tail only matters if a field ever exceeds 25. The original
   note, for the record: the
   pin asks for TOUR_POINTS to be extended from 15 positions to 25, but the
   table in `data/tour.js` ALREADY has 25 positions (100 down to 14) with 12
   participation points beyond, not 15 positions and 5 points - so a full
   25-player field is scored position by position today and nothing was
   changed. Owner: say so if you want a different tail. `capacity` is a
   synced field: prod sessions take 14 / 25 on
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

## Sprint 19 - UI redesign brief (ANSWERED 2026-09-22)

1. ~~**Which town is the academy in?**~~ - EDINA. The portal's calendar invite
   said Eden Prairie and was wrong; fixed. Luke's site was right all along.
2. ~~**Commitment Contract top tier**~~ - 90 minutes. `CONTRACT_TIERS`, the
   client guard and the rules follow; the rules still accept a stored 95.

## Sprint 19 - suggested age groups (2026-09-22)

1. **The Google Calendar has not been updated.** The owner ruled the weekday pattern is now Mon/Wed
   3-6 PM and Tue/Thu 4-7 PM, and said the calendar edit is still to come. Production sessions come
   from that calendar, so until the owner edits it and runs
   `node scripts/sync-calendar-sessions.mjs --prod` (dry-run first), production keeps three blocks a
   day and the new 6 PM / 7 PM blocks - and their age hints - will not appear. The seed and emulator
   generate all four immediately, so the two will disagree until that run.
2. **Friday and Saturday carry no age hint**, by the owner's answer (Mon-Thu only). If families ask
   about Friday's 3 and 4 PM blocks, that is a ruling to make, not a bug to fix.
3. **Two surfaces do not show the hint yet**, both because their data shape would have to change:
   the parent home's per-child "Next" row (`liveChildCard` hands the card one preformatted string,
   "Mon 4:00 PM", with no date or type) and the season calendar (a third-party calendar component
   that would need its own renderer). Neither is a chooser; say so if they should be added.
4. **The demo harness's coach Today blocks show no hint** - those seed fixtures carry no date. The
   live and emulator path computes it, so only the design-review demo is affected.

## Sprint 19 - who attends a Yannick 1:1 (2026-09-22)

1. **The rules must deploy before this ships.** `bookingShapeOk` and
   `waitlistShapeOk` are closed `hasOnly` field lists, so the LIVE rules
   REFUSE any booking carrying `attendee` until
   `firebase deploy --only firestore:rules` runs. That is the same deploy the
   90-minute contract tier needs; until it happens, a parent-attending
   booking fails rather than degrading to an athlete-attending one.
2. **The notice copy does not reach anyone yet.** No functions are deployed
   (Blaze), so the "A parent is attending this one" clause on the booked,
   reminder and promoted notices is built and unsent.
3. **The choice is per booking and is not remembered.** A family that always
   sends the parent picks it every time. Say so if it should default to the
   last choice made for that athlete.
