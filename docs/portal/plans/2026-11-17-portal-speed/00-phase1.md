# Portal speed, phase 1: startup and re-reads

On 2026-11-17 the owner said the admin side was "running so slow" and asked to "reduce the polling rate or set up pushes".

Status: **merged into local develop 2026-11-18 (merge 6625909); not pushed yet.** It is frontend only: no functions, rules or index changes.

## What was measured first (read-only, production plus emulator)

**The app does not poll.** An idle Admin screen made 0 reads in 60 s. The only timer is the 5 s payment check after a Stripe checkout. The console noise the owner saw came from browser extensions.

The real causes:
- **Every screen re-read from scratch, and nothing was kept between screens.**
  - Opening Admin ran 22 queries, about 590 docs and 440 KB. Athletes were read 4 times and households 3 times.
  - All of it ran again on every return to the screen.
- **Cold start was serial:** auth init, then `users/{uid}` once per `useAuthSession` instance (3 at start), then role routing, then the lazy chunk, then the screen's queries.
- **The Sessions tab fanned out** to about 360 requests in 3 rounds: one bookings query per Phil session.
- **Other costs, not addressed in phase 1:**
  - `main.js` is 332 KB gzipped, with no vendor split.
  - Callable cold starts have a median of 4.2 s: the first Book, Cancel, Move or Door press after a quiet spell.

## What phase 1 changed

**Sign-in and launch**
- **One shared `users/{uid}` read per sign-in** (`hooks/sessionStore.js`).
  - It is re-read when the tab becomes visible and after a 5-minute TTL.
  - Callers that write the whole profile back ask for `{ fresh: true }` (notification preferences).
- **A UI-only role hint in localStorage** (`hooks/roleHint.js`).
  - The launch renders the right landing screen while the profile is still loading.
  - It is cleared on sign-out and for unknown roles.
  - It is suppressed after a failed users read, so there is no redirect loop.
  - It is never used for access: rules and the verified profile decide.
- **Launch splash.**
  - An inline HTML splash shows in `index.html`, then `LaunchSplash` / `LaunchRedirect` take over, so there is no blank or sign-in-form frame on launch or on redirects.
  - Fonts no longer block rendering.
  - The manifest's `start_url` is `/portal`.

**Keeping screen data between visits**
- **A uid-scoped in-memory stale-while-revalidate cache** (`useSeedResource` with an opt-in `cacheKey`, `resourceCache`).
  - A revisit paints the last result at once and re-reads in the background.
  - It is cleared when the signed-in user changes.
  - A global read sequence stops an older read from overwriting a newer one.
- **Controls that act on billing data wait while it re-reads.**
  - The Billing hub is held in a disabled fieldset; the Manage billing buttons stay outside it.
  - `PendingBanner` takes `held` on the parent Home.

**Staff screens**
- **Sessions tab:** bookings are read by type in parallel (`fetchBookingsByType`), and status and date are filtered on the client. No new index was needed.
- **Admin:** cards render as each section's data arrives, and a section that is still loading is never shown as zero.
- **Direct staff family links:** Admin and the consent tracker link straight to `/portal/admin/households/<id>?athlete=<id>`, skipping the redirect read.

**When the account read fails**
- If the account read fails (offline, unavailable or refused), the sign-in page shows "Your account didn't load" with **Try again** (`components/AccountRetry.js`).
  - It retries once by itself when the browser comes back online.
  - The sign-in form stays below it, for a different account.
- A sign-in for the account that is already signed in now resolves. Firebase 9 does not emit an auth change for an unchanged uid, so the hook refreshes itself.

**Coach Today**
- Shows a skeleton (`components/CoachDayPending.js`) until the day loads, never a false "Off today".

## Measurements (emulator with 100 ms round trips on Firestore)

| | Before | After |
|---|---|---|
| Owner cold launch to Admin | ~830 ms (3 users reads) | ~350 ms (1) |
| Admin revisit | ~280 ms | 7 ms (cache) |
| Sessions tab requests | 21 targets (production ~362 requests) | 3 targets (+ athletes) |
| Today tab | 4 targets | 1 |
| Staff family page, first visit | ~550 ms | unchanged (its 7-round load is a later item) |

## Reviews

**Round 1** (independent auth, data and browser checks) found 8 problems, all fixed test-first:
- the dead-end sign-in after a failed read;
- raw SDK error text shown to families;
- Pay now enabled on stale Home data;
- out-of-order cache writes;
- notification preferences built from a stale profile;
- blank frames on redirects;
- a false "Off today";
- stale household ids on staff links.

**Round 2** found that two of those fixes had made things worse, so **both were put back as they were**:
- **Door Pause** waited for a "fresh" family list that could fail (endless spinner), could be stale anyway, and read as empty when offline. Pause again pauses the household of the row staff picked.
- **The family-page redirect** for an `?athlete=` not in the household could bounce staff off the page on a dropped connection. It was removed.

Round 2 also fixed:
- Try again now shows progress at once.
- A sign-out during a retry no longer leaves an error on the empty form.
- A plain profile read no longer waits on a background re-read.

A third review of the final commits found nothing.

**Known, accepted risk (rare):** after a script moves an athlete to another household, staff screens painted from the cache can still show the old household for one re-read. In that window:
- a direct family link can open the old family's page;
- Door Pause can pause the old household.

Both clear on the next re-read. Before this work, the family links resolved the household fresh.

## Release (owner)

Frontend only:
1. `git push origin develop`.
2. On staging (rypacad.ryptest.com), check:
   - cold launch from the home-screen icon as staff and as a parent;
   - sign out, then sign in as someone else;
   - Phil's Sessions tab;
   - Billing's Manage billing button;
   - Door Pause and Unpause.
3. `git push origin develop:main`.

## Not done (candidates for later)

- Phase 2: live staff screens and an on-device cache. See [01-phase2-spec.md](01-phase2-spec.md) and [02-phase2-critique.md](02-phase2-critique.md).
- The staff family page's first-visit load (7 rounds).
- Bundle split (needs craco).
- Callable cold starts:
  - first try `preferRest` and more memory;
  - `minInstances` (about $4-5/month per function) only if cold staff calls still exceed about 1.5 s.
- Google sign-in on phones: auth init without the popup resolver.
