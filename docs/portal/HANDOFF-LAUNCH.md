# Launch handoff: RYP portal, Sprint 20 (state as of Wed 2026-09-30)

Feed this whole file to the next assistant (Cursor or Claude). It is the
single source of truth for what is done, what is blocked, and what is next.
Read `docs/portal/RUNBOOK-SPRINT-20.md` (the owner runbook) and
`docs/portal/SPRINT-20-LAUNCH.md` (spec, decisions D1-D20) alongside it.

## 0. Ground rules (the owner has set these; do not break them)

- **The assistant never pushes, deploys, or writes to production.** Hand the
  owner (Makel) one command at a time, prefixed with
  `cd C:\Users\Mac\Desktop\rypacadapp\rypacad &&`.
- **Branches (owner, 2026-09-30):** `main` is PRODUCTION. Every push to it
  deploys the site (Railway builds `main`), and functions and rules deploys
  are run from its code. All new work goes to `develop` (or a short-lived
  branch cut from `develop` and merged back). Promote only tested work:
  `git push origin develop:main` (a fast-forward; if refused, merge
  `origin/main` into `develop` first). Pushing `develop` itself
  (`git push origin develop`) deploys nothing. `portal/r3` is retired.
- Production scripts (`scripts/*.mjs --prod`): the assistant runs `--dry-run`
  only; the owner runs `--yes`. Read-only production reads are fine.
- Never print or paste secrets (`rk_*`, `sk_*`, `whsec_*`, Calendly tokens,
  signing keys, `.env` values). Secrets go into hidden prompts in the owner's
  terminal only (`firebase functions:secrets:set NAME`).
- Never `taskkill /F /IM node.exe`. Stop only processes you started, by PID.
- Repo files are **CRLF**. Edit with a normalize/restore step and check with
  `file <path>`; never trust bare `sed -i`.
- Owner rulings are settled (spec section 0 and D1-D20). Do not re-ask them.
- Commit messages end with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- The owner wants one step at a time and plain language.

## 1. Dates

- Sign-up email: **Thu Oct 1 2026** (about 14 hours from this writing).
- Token members can book: **Sat Oct 10 07:00 America/Chicago** (Elite exempt).
- Sessions: **Tue Nov 3 2026 - Sat Feb 27 2027**. Nothing after February.

## 2. Production state right now

**Launch-eve release (2026-09-30 evening, develop -> main):** tester feedback
from Yannick, Teddy, Mike and Phil, built in reviewed lanes and merged:
structured emergency contact (name, mobile, relationship); Commitment
Contract as its own sign-up step BUT hidden at launch behind
`REACT_APP_CONTRACT_ENABLED` (Mike's ruling; off = 5-step sign-up, no
contract anywhere in the app); users.phone written at sign-up; contractStart
stamped; verify-email copy says check Spam; booking windows anchored at Nov 1
(Elite Dec 16, tokens Dec 1, rolling after; firestore.rules bound matches);
Repeat weekly rebuilt (one button through the window end, honest summary);
week view spans months; tournament (yellow) / closed (red) day marks; contract
"Behind" only after >5 missed weekdays inside the season window; push
controls per channel; sibling discount automatic (coupon SIBLING, 2+
memberships, functions/.env STRIPE_SIBLING_COUPON); a second Pay now reuses
the open Checkout Session (no double charge); payment notices name the
child; "Change package" for a pending athlete (rules clause
pendingPackageUpdateOk); pre-season token copy ("Tokens start Nov 1" / "Pay
to start"); sibling-discount note on receipt and pending card; walkthrough
fixes (sample family pinned, no sticky headers, first-visit offer, Month
default, practice never locked); fuller consent terms (data/consentTerms.js,
for Luke/Mike to approve); initials avatars; welcome video only when
`REACT_APP_WELCOME_VIDEO_URL` is set. Deploy order: rules -> functions ->
site. Next: the facility add-on at sign-up (fb/facility), then Stripe LIVE
mode (runbook section 7) before the Oct 1 email.

**Domain (owner, 2026-09-30):** the permanent address is
`https://portal.rypacademy.com` - the same Railway service, DNS at Squarespace
(`portal` CNAME to Railway plus a `_railway-verify.portal` TXT that must stay).
It is in Firebase Auth authorized domains and on the Google Calendar key's
website list (that key lives in GCP project 962055310703, not rypacad).
`rypacad.ryptest.com` stays attached and is redirected to it by a Cloudflare
rule; keep it in both allowlists. Never send mail From @rypacademy.com (its
DNS rejects all mail). Stripe Payment Links and the customer-portal redirect
point at `https://portal.rypacademy.com/portal/signin`.

**Commitment Contract hidden (Mike, 2026-09-30):** off until closer to
launch, behind `REACT_APP_CONTRACT_ENABLED` (Railway variable; only the exact
value `true` shows it, and changing it rebuilds the site). Off: no contract
step in sign-up (5 steps, link mode 2; every athlete is saved with
`contractMinutes` null), no Contract tab, `/portal/contract` redirects to the
role's home, and no contract card, standing, tier, Board stat, admin/coach
"Contract behind" row or walkthrough step. The code, data fields and rules
all stay. Functions need no switch: no notice or job sends contract messages,
so there is no `CONTRACT_ENABLED` in `functions/.env`. Families who sign up
while it is off can start a contract later from the app once it is on.

**Site (Railway, rypacad.ryptest.com):** `main` = `portal/r3` = `cb10a40`
(single-token copy fix 46654ad, runbook fix cb10a40, checkout single refusal
840ed77, sign-up hardening 0497713). Railway variables set:
`REACT_APP_CALENDLY_MENTAL_URL` =
`https://calendly.com/yannickartigolle2022-u/ryp-academy-mental-game-1on1`,
`REACT_APP_PORTAL_LIVE_DATA=true`, VAPID key. **Missing:**
`REACT_APP_STRIPE_PORTAL_URL` (Phil is getting the Stripe test customer
portal link; the owner adds it in Railway, which triggers a rebuild).

**Cloud Functions (project rypacad, 1st gen, us-central1):** all 13 deployed
from `840ed77` with `functions/.env` `STRIPE_MODE=test`,
`PORTAL_URL=https://portal.rypacademy.com` (switched 2026-09-30; a full
functions deploy applies it). Secrets in Secret Manager:
`STRIPE_SECRET_KEY` (TEST restricted key: Checkout Sessions write, Customers
write, Prices read - verified by a live rehearsal), `STRIPE_WEBHOOK_SECRET`
(real TEST `whsec_` of the test endpoint), `SMTP_USER`/`SMTP_PASS`
(placeholders; SMTP is off, portal emails are skipped by design),
`CALENDLY_WEBHOOK_SIGNING_KEY` (v2; it will be replaced by the Calendly
script, see 4.3).

**RESOLVED 2026-09-30 - public access:** Mike set the rypacad override (Replace, Allow All) and the owner added allUsers invoker to the six; probes now return 400 (webhooks, unsigned) and 401 "Sign in to continue." (callables). History: the rypgolf.com Google Cloud organization
(org 958821783034) enforces domain restricted sharing
(`iam.allowedPolicyMemberDomains`), so `allUsers` cannot invoke functions.
The six public functions (`stripeWebhook`, `calendlyWebhook`, `createFamily`,
`addAthletes`, `claimInvite`, `createCheckoutSession`) answer **403** to
everyone. Sign-up and payment cannot work until this is fixed. Mike (the org
admin) has the instructions: override that policy on project rypacad with
"Allow All". makel@rypgolf.com has no org-level permissions.
(Already fixed: the build service account
`297400448648-compute@developer.gserviceaccount.com` was granted
`roles/cloudbuild.builds.builder`; before that every build failed.)

**Firestore:** rules and indexes deployed by the owner. Sessions synced from
Google Calendar through Feb 27 (412 Phil fitness sessions, 60 min, 6 spots;
training; tournaments). The owner fixed the calendar so nothing runs past
February. Packages carry the Stripe TEST price ids (`write-packages --mode
test` done). **Pending owner command** (dry run verified: deletes 154 unbooked
March 2027 leftover sessions, nothing else):
`node scripts/sync-calendar-sessions.mjs --prod --yes --from 2027-02-28 --to 2027-03-31`

**Stripe (TEST mode):** products and monthly prices exist (ids in
`functions/config/stripe-catalogue.json` `test`; the single token price is
ONE-TIME $65 by owner ruling). Test webhook endpoint created: URL
`https://us-central1-rypacad.cloudfunctions.net/stripeWebhook`, API version
`2025-07-30.basil`, events `checkout.session.completed`, `invoice.paid`,
`invoice.payment_failed`, `customer.subscription.updated`,
`customer.subscription.deleted`. Phil is doing the Stripe work from this
checklist: https://claude.ai/artifact/BssEJigbH92bhwreqHShYs (test customer
portal link; the six LIVE price ids; LIVE restricted key; LIVE webhook;
receipts).

## 3. What to do next, in order

### 3.1 DONE - the six functions are open (kept for reference)

The owner pastes this in Google Cloud Shell (project rypacad):

```bash
for f in stripeWebhook calendlyWebhook createFamily addAthletes claimInvite createCheckoutSession; do
  gcloud functions add-iam-policy-binding $f --region=us-central1 --project=rypacad --no-gen2 --member=allUsers --role=roles/cloudfunctions.invoker --quiet > /dev/null && echo "open: $f"
done
```

Then verify from outside: both webhooks answer **400** to an unsigned POST;
the four callables answer a JSON `UNAUTHENTICATED`/`invalid-argument` error,
never 403/404/500.

### 3.2 DONE 2026-09-30 - Calendly (Yannick)

Connected: signing key v3 in Secret Manager, calendlyWebhook redeployed and
verified with a signed test message, one ACTIVE user-scope subscription
(invitee.created + invitee.canceled) to the portal URL. Check any time with
`node scripts/register-calendly-webhook.mjs --status` (changes nothing).
Original instructions:

`node scripts/register-calendly-webhook.mjs` (owner runs it). It asks for
Yannick's Calendly personal access token (hidden), confirms the account,
refuses if the webhook is still 403, creates a NEW signing key in memory,
saves it to Secret Manager via stdin, redeploys `calendlyWebhook`, proves the
deployed function accepts a signed test message, then replaces any old
subscription and registers `invitee.created` + `invitee.canceled`. It never
prints a secret. Expect "ALL SET" with one active subscription.

### 3.3 Test-mode smoke on production

The testing guide is being generated (sign-up, edge cases, parent and athlete
booking): `C:\Users\Mac\AppData\Local\Temp\claude\C--Users-Mac-Desktop-rypacadapp\34e211be-d740-4252-a56c-fa1b99a42786\scratchpad\testing-guide.html`,
to be published as an artifact. Runbook section 6 has the core smoke. Token
athletes cannot book before Oct 10; test booking with an Elite athlete, or
have staff switch a test athlete to Elite temporarily. Delete test households,
athletes, invites, auth users and Stripe test customers afterwards.

### 3.4 Switch to LIVE (runbook section 7), then the email

1. Paste Phil's six LIVE price ids into `functions/config/stripe-catalogue.json`
   `live` (monthly: t-6 $299, t-12 $569, t-16 $719, elite $999,
   facility-access $300; single = ONE-TIME $65). Commit.
2. `functions/.env`: `STRIPE_MODE=live`.
3. Owner: `firebase functions:secrets:set STRIPE_SECRET_KEY` (LIVE restricted
   key, same three scopes), then `firebase deploy --only functions`.
4. Owner: set `STRIPE_WEBHOOK_SECRET` to the LIVE endpoint's `whsec_`, then
   `firebase deploy --only functions:stripeWebhook`.
5. `node scripts/write-packages.mjs --prod --mode live --dry-run`, owner `--yes`.
6. Railway: `REACT_APP_STRIPE_PORTAL_URL` = the LIVE customer portal link.
7. Disable (not delete) the TEST webhook endpoint in Stripe.
8. One real purchase on a throwaway family, refund it, clean up.
9. Provision an ops account (`scripts/provision-owner.mjs`, dry run first).
10. Send the email.

`scripts/check-stripe-key.mjs` verifies a TEST key's permissions and the six
test prices (it refuses live keys by design; adapt it for a live price-only
check if needed).

### 3.4a Morning of Oct 1, before the email - turn portal email on

Portal notice emails are OFF: `SMTP_HOST` is not in `functions/.env`, so
every notice email is recorded 'skipped' (in-app notices and push still work;
Firebase's verification email is separate). The booking confirmation screen
tells families a confirmation email is on its way, so this goes on before the
launch email.

1. Mike: a Google Workspace mailbox (suggested `portal@rypgolf.com`, name
   "RYP Academy"), 2-Step Verification on, an app password created.
2. Owner: `npx firebase-tools functions:secrets:set SMTP_USER --project rypacad`
   (the address) and the same for `SMTP_PASS` (the app password).
3. Add to `functions/.env`: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`,
   `SMTP_SECURE=true`, `SMTP_FROM=RYP Academy <the address>`.
4. `npx firebase-tools deploy --only functions --project rypacad`, then one
   test booking: the ledger row should read 'sent' and the email should arrive.

### 3.5 Before Nov 1 - proration (owner, 2026-09-30)

The website tells families "joining mid-month or upgrading is prorated to the
day", and the owner has ruled that copy stays. The app has to match it before
the season's first billing month starts on Nov 1:

1. **Mid-month joiners** - built, not yet exercised. `functions/portal/prepaid.js`
   (`PRORATE_JOINERS = true`, ruling 0.13) prorates the first charge and the
   month's tokens by days remaining, but only once the Chicago date is on or
   after `SEASON_FIRST_PERIOD`, so nothing on production has run it. Unit
   tests exist (`prepaid.test.js`, `checkout.test.js`). Still to do: an
   end-to-end check with the clock past Nov 1 (emulator or a test-mode
   checkout): the Stripe line amount and label, the token count on Membership
   and Billing, the "First period" copy, and the sibling discount on top of a
   prorated amount.
2. **Upgrading a paid membership** - not built. Change package exists only
   for an unpaid (pending) athlete. Either build a prorated upgrade for paid
   members or take "or upgrading" out of the website and FAQ copy.

### 3.6 Before Oct 10 - waitlist hardening (audit 2026-09-30)

A read-only audit of the waitlist (five readers, every finding re-traced by a
second agent: 51 confirmed, 1 refuted) after Mike's Phil waitlist test. The
happy path works for training blocks and Phil sessions alike: join, position,
automatic promotion when a seat is cancelled, the 'promoted' notice, the 06:00
sweep. None of the problems below is reachable before sessions exist (Nov 3);
fix them before token booking opens on Oct 10. Distinct issues, worst first:

1. **Past sessions (high).** Nothing stops a booking or a waitlist join on a
   session that already happened. A join on a past full session can never be
   promoted, so the next 06:00 sweep mints a bonus token: a free token per
   past full session. A past session with space books outright and spends a
   token. Guard in the sweep (no token when `joinedAt` is after the session
   start), in the rules (lower date bound on booking and waitlist create) and
   in `createBooking` / `joinWaitlist`; make past days inert on both screens.
2. **Academy cancels a full session.** Its waitlist entries stay: still
   "Waitlisted", token held, no notice, until the sweep the day after the
   session date.
3. **Promotion skips checks a normal booking makes.** Elite's one-per-type-
   per-day cap and Yannick's monthly limit are not applied when joining or at
   promotion; a Phil waitlist at the hour of a held training block promotes
   into a double booking.
4. **Bonus tokens.** A bonus token already spent in another period is spent
   again at promotion and jumps the line (`promotion.js` loadCandidate only
   reads the session's period). Booking screens ignore waitlist holds and
   bonus tokens, so a bonus token cannot be spent once period tokens read
   zero. Elite athletes are minted bonus tokens they cannot use.
5. **No promotion cutoff.** A family can be auto-booked late the evening
   before or on the day and cannot cancel. Suggested: no same-day promotion
   (`session.date <= today`) and say in the notice that a token was used.
6. **Privacy.** `waitlist` is readable by any signed-in account, and the ids
   resolve to children's names through `tournamentResults`. Scope the read
   rule like bookings.
7. **Counter integrity.** The rules allow booked plus or minus 1 from any
   signed-in user and do not tie a booking create to the +1, so a hand-made
   request can skip the line or force a promotion into a full session.
   Promotion should count real bookings; the rules should pair the writes.
8. **Raising capacity or un-cancelling promotes nobody.**
9. **Screens.** "You'll be notified if a spot opens" (the family is booked
   and charged automatically); an already-waitlisted family is offered "Join
   waitlist" again and gets a raw permissions error; a failed "Leave
   waitlist" says nothing; Repeat weekly reports a week as "full" when it
   actually joined that week's waitlist; the shown position ignores the
   bonus-token priority.
10. **RULED 2026-10-01 (owner): no bonus token from a waitlist.** When a
    waitlist closes without a spot, close it and return the held token.
    Nothing is minted. This supersedes contract 4.2 for waitlists; bonus
    tokens remain only for a session the academy cancels.

Full findings with file:line evidence and fixes: the audit output saved by the
session (`waitlist-audit.json`); re-run the audit if it is gone.

### 3.7 After Nov 3 - waitlist checks that need real sessions (owner, 2026-10-01)

The waitlist hardening (merge 456c997) is live. Three behaviours could not be
tried by hand on Oct 1 because no session has happened yet; they are covered
by unit tests and the emulator harnesses only. Check each on production in
the first week of the season:

1. **Past sessions.** A session that has started, or an earlier day, cannot
   be booked or waitlisted: not offered on Book a Session or the Phil screen,
   and a direct attempt is refused ("This session has already started.").
2. **No same-day promotion.** Cancel a seat in a full session on the day it
   runs: nobody on the waitlist is auto-booked.
3. **The 06:00 sweep.** The morning after a full session with someone still
   waiting, the entry is gone, the family has one "Waitlist closed" notice
   saying the held token is free again, and no bonus token was created
   (`graceTokens` has no new 'waitlist-expired' doc).

### 3.8 Before Mar 1 - billing must end with the season (owner, 2026-10-01)

Owner ruling: the season ends Sat 2027-02-27 and billing ends with it. The
website says so ("Monthly on the 1st, ending with the season on February 27,
2027"; "Nothing continues once the season ends"). The app does not do it yet:
every membership and facility subscription is created with no end date
(`functions/portal/checkout.js`, subscription mode, no `cancel_at`), so each
would charge again on Mar 1, 2027. The last charge that should happen is
Feb 1 (it pays for February).

Checkout Sessions cannot set `cancel_at`, so this needs one of:
1. the webhook sets `cancel_at` (Feb 28, 2027) on each subscription when it
   is created - needs Subscriptions write on the portal's restricted key; or
2. a one-off run before Mar 1 that sets `cancel_at` on every active
   subscription (Stripe CLI or a script), plus the same for late joiners.
Either way the portal should then show the family their end date, and a
lapse on Feb 28 must not read as a failed payment.

### 3.9 Single tokens open Oct 10 (owner, 2026-10-01)

Owner ruling: single tokens are not available until booking opens, Sat Oct 10
at 7 AM Chicago, and the purchase must work by then. The built feature
(branch `single/integration`, section 4.4) is being merged into today's
develop on branch `single/merge` (worktree `../wt-single-merge`), with the
sale gated on the booking-open clock so it can deploy early. Still to do
after the merge: the emulator harnesses, a test-mode rehearsal, then the
deploy in 4.4's order and one live $65 purchase, refunded.

## 4. Work in flight

### 4.1 Month / Week toggle (owner request, must ship before the email)

"A toggle on every view where the calendar or the week view populates, to
switch between them, consistent everywhere." Decisions: each screen keeps
its current default; one shared segmented control ("Month" / "Week") in the
calendar card header; the choice is remembered in localStorage (try/catch);
booking handlers identical in both views. A workflow is building it in
worktree `../wt-toggle` on branch `ui/view-toggle` (builders on
`ui/view-toggle-a` / `-b`), then a gate (full jest, eslint, build) and a
review. When done: check it in the browser against the emulator, merge into
`portal/r3`, owner pushes.

### 4.2 Week view does not scroll on desktop (owner bug)

`frontend/src/portal/screens/SpecialistBooking.js` around line 476: the day
strip is `overflowX: 'auto'` with `scrollbarWidth: 'none'`, so a desktop
mouse has no way to scroll it (touch works). Fix in whatever shared WeekView
the toggle work produces: visible thin scrollbar on pointer devices, prev/next
buttons, and vertical wheel mapped to horizontal scroll; test at desktop and
375px.

### 4.3 Performance ("slow to load, laggy, not responsive")

Measured: delivery is fine (Cloudflare, brotli, main JS 795 KB raw / 239 KB
transferred, immutable caching, TTFB 0.15-0.3 s). Suspects: one un-split
795 KB bundle (no route code splitting, FullCalendar + Google Calendar plugin
+ Firebase in the initial bundle); ~950 sessions now in Firestore that screens
may load in full; heavy hooks in `hooks/index.js` (4,100 lines). Next: profile
a signed-in session against the emulator seeded with the real season
(`npm run sync:emulator -- --from 2026-11-03 --to 2027-02-27`), fix the
biggest costs (route-level `React.lazy`, narrower session queries), keep
behaviour identical, full jest + build.

### 4.4 One-time single token (ships Oct 7, NOT with the email)

Owner rulings: one-time $65; each paid checkout = one token
`graceTokens/single_{checkoutSessionId}`; valid through Sat 2027-02-27;
repeat purchases allowed; refunds manual (void, never delete). Built and
gate-green on branch `single/integration` (`e79c8dc`, worktree
`../wt-single-int`): 16 functions unit files, check-exports (14 functions),
lint, frontend 44 suites / 235 tests, build all pass. Remaining:

1. Run the emulator harnesses one at a time on the isolated emulator
   (`firebase.functions-lane.json`, ports 8082/5001; stop other emulators
   first): `functions/test/verify-single.js`, `verify-stripe-launch.js`,
   `verify-lane.js`, `verify-calendly.js`, `verify-sweep.js`,
   `verify-notifications.js`, `verify-family.js`; then
   `scripts/verify-rules.mjs` passes A and B.
2. Fix the review findings: 1 major (TokenMeter.js:106 - a single athlete is
   never told where a spent token went) and 19 minor (listed in the workflow
   output; notable: rules re-book `rebookedAt` only enforced for single;
   `onSingleTokenSpent` has no retry/backstop; payment-pending single athlete
   sees "No session token" with no Pay button; ops comp + waitlist counted
   twice).
3. Merge the toggle and perf work into it (conflicts expected in
   BookSession.js / SpecialistBooking.js).
4. Emulator TEST-mode rehearsal with the real restricted key and
   `stripe listen` (the spec's `stripeRehearsal`).
5. Deploy order (spec): LIVE one-time single price pasted first ->
   `functions:stripeWebhook` -> firestore rules -> push -> all functions ->
   one live $65 smoke purchase, refunded and voided. Hard stop Oct 9: if not
   ready, keep `840ed77`'s refusal and sell no singles.

**Update 2026-10-01 - merged onto develop on branch `single/merge`
(`../wt-single-merge`), and a new owner ruling.** Single tokens are NOT
available until booking opens, Sat, Oct 10, 2026 at 7:00 AM Chicago. The
sale opens by the clock on both sides (`functions/portal/single.js`
`saleOpen`, `frontend/src/portal/data/singleToken.js` `saleOpen` - both are
the booking gate, no second date), so the code deploys before Oct 10 and
nothing is flipped on the day. `SINGLE_ON_SALE` (section 9) is gone. What
changes in the list above:

- Item 3 is done by the merge. The major finding in item 2 is fixed (the
  token meter names the session each bought token was used on and carries
  the Buy button).
- Item 4 cannot be run on the merged code before Oct 10 - checkout refuses
  `single-not-open`. Use `node scripts/check-stripe-key.mjs` (it now
  rehearses the single token's payment-mode session with the TEST key) or
  rehearse from `../wt-single-int`. RUNBOOK 10.1.
- Item 5 is now: all functions (15) -> firestore rules -> push; the live
  smoke purchase is at 7:00 AM on Oct 10, not before. RUNBOOK 10.3 and 10.4
  have the order and what a family sees between steps.
- Waitlist: the sweep mints nothing for anyone (section 3.6, item 10);
  the single branch's "no bonus for a single-only athlete" branch was
  dropped in the merge.

## 5. Worktrees and teardown

`../wt-single-int`, `../wt-single-l1`, `../wt-single-l2`, `../wt-single-l3`
(and `../wt-toggle*` when created) each have junctions to the main
checkout's `frontend/node_modules` and `functions/node_modules`. Teardown:
remove the junction first (`cmd /c rmdir <wt>\frontend\node_modules`, never a
recursive delete through it), then `git worktree remove`.

## 6. Local environment

The combined emulator runs from `rypacad` (Firestore 8080, Auth 9099,
Functions 5001) and a dev server on :3003 with emulators and a stand-in
Calendly URL. Emulator rules changes need an emulator restart for the probe
project.

## 7. Self-test on the local emulator (2026-09-30, code = production)

PASSED: all six functions harnesses (stripe-launch, family, calendly with
`node --env-file=.env.local`, lane, sweep, notifications); the 40-family
sign-up burst (double taps, email races, claim race, 79 simultaneous Stripe
confirmations); UI sign-up with verification, 5-step registration, future-DOB
and guardian-email refusals, double-tap submit = one family, receipt,
simulated payment -> active + 6 prepaid November tokens, Elite parent booking,
token athlete gated until Oct 10, Phil booking, cancel with confirm releases
the spot, invited child claims on a fresh sign-in and books for themself,
Calendly booking appears on My Schedule at the right Chicago time, no
horizontal overflow at 375px.

ISSUES FOUND (sent to a UX review for a verdict; see section 8):
1. Token athlete sees "Booking opens Sat, Oct 10 at 7 AM" AND "Booking for
   Tuesday, Nov 3 opens 7 AM on Sunday, Oct 4." (window date ignores the gate).
2. Invited child: after creating a login, "Continue to sign-up" opens the
   parent/18+ registration; no "My parent enrolled me" path; the invite is only
   claimed after signing out and back in.
3. No same-time double-booking guard (training 4 PM + Phil 4 PM, same athlete).
4. Training books on one tap; Phil needs a Reserve confirm (inconsistent).
5. Booking confirmation drops AM/PM ("Tuesday, Nov 3 · 4:00").
6. "A confirmation is on its way to <email>" while SMTP is off.
7. Phil/Yannick day strip opens on today (empty until Nov 3) and cannot be
   scrolled on desktop.
8. Yannick copy says "spends one token" to Elite families.
9. Reservations tags Elite bookings "NEXT PERIOD".
10. Package cards say "/ period" though billing is monthly.

## 8. Background work started 2026-09-30 evening

- UX review (workflow ux-launch-review): verdict + must-fix list before the email.
- Performance fixes (workflow perf-launch-fixes): 8 items from the verified
  plan (preconnect auth origins, router transitions, ChunkLoadError reload,
  route prefetch; fewer/parallel Firestore reads) on branches perf/wave-a,
  perf/wave-b merged to perf/launch (worktree ../wt-perf). Route code
  splitting was ALREADY live (26 chunks); do not redo it.
- Month/Week toggle (workflow calendar-week-toggle, resumed after the usage
  limit): branch ui/view-toggle (../wt-toggle); its gate also fixes the desktop
  week-strip scrolling.
- Testing guide (workflow launch-testing-guide): scratchpad testing-guide.html.
Merge order when all are green: perf/launch, ui/view-toggle, UX fixes, then
full jest + build + a browser pass on a production build against the
emulator, then the owner pushes.

## 9. Shipped in the 2026-09-30 evening push (portal/r3 8000608)

- Performance: auth preconnects, router transitions (no black screen),
  one reload on a stale chunk after a deploy, route prefetch, fewer and
  parallel Firestore reads (family home, child profile, booking, coaching).
- Month/Week toggle on Book a Session, coach Sessions, Commitment Contract,
  Coaching (Phil/Yannick, week default) and the season calendar; the
  desktop-unscrollable day strip is gone.
- The 9 UX must-fixes (single token greyed "On sale before Oct 10" via
  SINGLE_ON_SALE=false in data/packages.js - flip it when one-time checkout
  ships; package step auto-advance + error naming missing athletes; invited
  child routed to the verify screen; verify-again retry at Pay; "/ month"
  and token explainer; receipt directions and pay terms; consent line;
  locked day says Sat Oct 10; phone footer + 16px inputs).
- Elite daily cap is per type: one training, one tournament, one Phil a day
  (Saturday 9 AM training + tournament now both bookable).
- "What's next" card after a confirmed payment (token vs Elite; none for
  the facility add-on, which now returns with &product=facility).
- Checkout allows promotion codes: sibling code SIBLING, 10% off, forever,
  all products (Phil creates it in Stripe test and live).
- Needs: functions deploy of createCheckoutSession, then the push. No rules
  change. Owner decisions still open: billing after Feb 27, injury waiver,
  training one-tap vs Reserve, same-time bookings, cancellation rule.
- Separate: the one-time single token build (single/integration) is not in
  this push; it targets Oct 7.
