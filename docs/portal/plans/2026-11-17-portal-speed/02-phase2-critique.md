# Portal speed phase 2: design critique

An independent critic reviewed [01-phase2-spec.md](01-phase2-spec.md) on 2026-11-17. Its problems must be fixed in the spec before building. Line and commit references are as of that day (develop 365ac4c; phase 1 not yet merged).

## Verdict

Not ready to build as written. The rules side holds up, but the cache lifecycle (§11-§12) and fault handling (§8.4) need rework before release step 5 (persistent mode), and several of the phase-1 seams in §4 are out of date.

What holds: I re-checked G4 against the rules myself. Every gate is the same as or narrower than the rule clause behind it:
- athletes, firestore.rules:404-412
- households, :2299-2303
- bookings, :1624-1631
- sessions, :1238
- enrollmentRequests, :2519
- doorEvents, :3126-3131
- users (self), :324-325

So no listener the store opens should be refused as a whole for any role it lets through. These spec claims also match the SDK (firebase 9.23.0, @firebase/firestore 3.13.0) at the cited lines:
- connectFirestoreEmulator drops localCache (index.esm2017.js:17782-17788 against :17649).
- A getDocs on the same query reuses an open listener (Vc, :15093-15106).
- clearIndexedDbPersistence needs the instance to be unstarted or terminated (:18504; `_initialized` is `_settingsFrozen`, so the call at module load is legal).
- A failed persistent-cache start falls back to memory (:17173-17195).

Facts in the spec that are stale:
- develop is now 365ac4c, not af32bcc.
- firestore.rules changed after c67b9ee (9b9e35a, billingPortalLimits). This is harmless here, and the cited line numbers still hold.
- The SWR cache is committed in perf/auth-cache 14d3500. perf/startup-speed is now 14fa9e1, which merges both phase-1 branches.

Build order I recommend:
1. Lanes A and B can build with both flags unset, as planned.
2. Fix problems 1-4 and 9 before release step 4.
3. Fix problems 5, 6, 8 and 12 before release step 5 (persistent mode).

Cost holds: every scenario stays at cents to about $2 per 30 days. Correctness and privacy are the real risks.

## Problems

### 1. [high] Sign-out can run twice in the same tab, and the tab can reload before the cache is cleared

Sign-out can run twice in the same tab, and the tab can reload before the cache is cleared. Each route wrapper mounts its own useAuthSession, and each one's onAuthStateChanged listener runs the signed-out branch (§11.4) while signOut() is still awaiting firebaseSignOut (§11.3 step 4). §11.4 then runs endFirestoreSession and reloads, racing step 5's terminate/clear. The spec never defines "this page had a user". After step 2's resetSession() the scope is already null, so builders will guess. If §11.4 reloads first, the IndexedDB delete is cut off. Step 5 never sets the purge flag, ryp.fsCacheUid is left behind, and the next load runs in mode off (the hint was cleared), so nothing purges it. Minors' data stays on the device after a normal sign-out.

**Fix:** In firestoreSession.js, keep one module-level promise so endFirestoreSession runs once, and have one reload owner. signOut() sets a `signingOut` flag before step 1. The signed-out branch (all N instances) skips the reload when that flag is set, or awaits the same promise. Set the purge flag BEFORE starting the clear and remove it only after the clear succeeds. Add a T6 case: signOut() with 3 mounted sessions must make exactly one terminate, one clear and one location.replace, and the reload must come after the clear settles.

### 2. [high] Caches are left on the device whenever the mode resolves to 'off'

Caches are left on the device whenever the mode resolves to 'off'. deviceCacheMode checks LIVE_STAFF/CACHE (step 1) before the purge flag (step 2), and needs a staff hint (step 3). Four cases leave an IndexedDB copy of athletes and households (and every other read) on disk with no path that ever clears it: (a) kill switch #1 (LIVE_STAFF unset), where even CACHE=purge does nothing; (b) a departed coach demoted to parent, whose hint becomes 'parent' after the next verified read; (c) users doc deleted, where resolveProfile's NOT_FOUND path runs clearRoleHint (useAuthSession.js); (d) a device not opened during the one-week purge window. Under "no shared devices", demotion is the realistic offboarding path, and staff never sign out of a PWA.

**Fix:** Treat the purge flag and a leftover ryp.fsCacheUid as purge regardless of the flags or the hint. Check them first in deviceCacheMode, before the LIVE_STAFF test. When a verified profile arrives that is not staff (or NOT_FOUND) and the mode is persistent or the marker exists, set the purge flag and reload once. Make purge-on-leftover-marker permanent instead of a one-week CACHE=purge window. Add T5 cases: LIVE_STAFF unset plus marker gives purge; hint 'parent' plus marker gives purge.

### 3. [high] Purge mode can hang the whole app

Purge mode can hang the whole app. firebase.js calls clearIndexedDbPersistence(db) at module load. That call is queued on db._queue (index.esm2017.js:18505-18513) and awaits indexedDB.deleteDatabase, which has no onblocked handling (:1643). Every later Firestore operation in the tab, including the first getDocs, runs on the same serialized AsyncQueue (enqueue/ta, :18050-18110). If another same-origin tab still holds the database and cannot run JS, for example a frozen Android Chrome tab sharing storage with the WebAPK, the delete blocks and every read in the new tab waits forever, with no error. That blocked-tab situation is also the likeliest reason step 5's 3 s clear failed and set the purge flag. The failures are linked, so the next load hangs too.

**Fix:** Delete the database outside the SDK queue: indexedDB.deleteDatabase('firestore/[DEFAULT]/<projectId>/main') with onsuccess, onerror, onblocked and a 3 s timeout. Keep the purge flag on failure and never block db initialisation on the delete. Do the same for sign-out step 5 after terminate. Add a T5 test with a fake indexedDB whose delete never settles: the first getDocs must still run.

### 4. [high] The IndexedDB fault handling in §8.4 watches for something the SDK never sends

The IndexedDB fault handling in §8.4 watches for something the SDK never sends. After a successful start, an IndexedDB failure goes to RemoteStore, which disables the network, sets the state Offline and retries in the background (oc(), :14587-14605). Listeners only see fromCache:true snapshots, never an error with 'IndexedDB' in it. A fatal AsyncQueue failure logs 'INTERNAL UNHANDLED ERROR' (:18126), and every later call then throws synchronously (Zc→O, :18068). Error callbacks never fire. So the '2 faults → memory' downgrade never triggers, and persistent-mode screens on iOS can stay stale with no signal. §8.4 also lists 'unavailable' and 'IndexedDB message' as separate rows that can overlap.

**Fix:** Detect faults three ways: (1) a watchdog: any open entry still fromCache for more than 20 s while document.visibilityState is visible and navigator.onLine counts as a fault; (2) window 'error'/'unhandledrejection' handlers matching /INTERNAL ASSERTION FAILED|AsyncQueue is already failed|IndexedDB/; (3) try/catch around listen() in subscribeLive. On an AsyncQueue failure, downgrade and reload on the first occurrence, because the instance is dead. Add T1 cases for each signal.

### 5. [medium] Other tabs are left dead after a purge or cache-owner reload

Other tabs are left dead after a purge or cache-owner reload. Any database delete makes other tabs' clients terminate themselves (setDatabaseDeletedListener → terminate, :11660-11664, :17156). §11.4 reloads only on a signed-out emission. A purge from the kill switch, a cache-owner mismatch (§11.5) or a downgrade does not sign anyone out, so other open tabs (an owner's desktop Admin tab) throw 'client has already been terminated' on every read. The §12 claim that 'ErrorBoundary reloads them' is false: ErrorBoundary.js:16,59 auto-reloads only on ChunkLoadError and does not catch async listener or getDocs errors.

**Fix:** In the live store, catch a terminated-client error (code 'failed-precondition' / message /terminated/) from listen() and from the SDK callbacks, and reload once (guarded in sessionStorage). Or broadcast 'fs-cache-cleared' over localStorage or BroadcastChannel before deleting, and have every tab reload on it. Fix the ErrorBoundary sentence in §12.

### 6. [medium] Freshness after an iOS PWA resume is never measured

Freshness after an iOS PWA resume is never measured. M8 checks only billing (addTarget resume:true), and it runs against the emulator, whose resume-token handling may not match production. The §19 trigger for the disable/enable-network nudge is 'entries stuck fromCache'. The dangerous case is the opposite: a silently dead stream after suspension leaves the SDK 'Online', so entries show fromCache:false while stale. G1 would fail with no indicator.

**Fix:** Add M9 on a real iPhone home-screen PWA (staging, persistent and memory-lru): background the app for 5 min, 40 min and overnight; meanwhile make a booking from another device; on resume, record the seconds until it shows and the fromCache transitions. Pass: 5 s or less. If it fails, make the nudge unconditional: when the tab has been hidden for more than 60 s, call disableNetwork() then enableNetwork() once on visible.

### 7. [medium] The waitForLive change in §8.6 would slow the staff family page

The waitForLive change in §8.6 would slow the staff family page. StaffAddSheet, StaffMoveSheet and StaffCancelSheet are shared with Billing.js (the staff family page, which stays one-shot; Billing.js:12-14,243-266). If they await waitForLive(rosterKey), every staff action on Billing waits the full 4 s timeout, because no roster entry is open there. These files (components/staffBooking/*, components/StaffCancelSheet.js, RosterStaffActions.js) are also not in the §6 table, which contradicts §20 ('no tracked file outside §6 is changed').

**Fix:** Put the wait only in RosterStaffActions' finish(). Make waitForLive resolve false immediately when the key has no open, ready entry. Add RosterStaffActions.js (and only that file) to §6 for lane B, with a test that Billing's sheet closes without waiting.

### 8. [medium] The persistent cache holds every document any screen reads, not just the live sets

The persistent cache holds every document any screen reads, not just the live sets. That includes Yannick's private mental notes and check-ins (mental.js fetchAllMentalEntries), mental consent forms with signatures, scholarship applications on owner devices, staff family billing (tokenPeriods, graceTokens), and athletes' dob and billing ids (rules:385-390). The owner's 'no shared devices' answer was about sharing a device. It did not cover these records sitting on personal phones, a lost phone, or departed staff, and §19 lists only 'minors' and billing data'.

**Fix:** Before release step 5, get an explicit owner ruling that lists the categories above. Alternatively, limit persistent mode to owner/ops (role in [ops, owner] in deviceCacheMode step 4) and keep coach and mental on memory-lru. Combined with the fix for problem 2, a demotion then purges the cache.

### 9. [medium] The phase-1 seams in §4 do not match the phase-1 code (perf/startup-speed 14fa9e1, perf/auth-cache c13a27a)

The phase-1 seams in §4 do not match the phase-1 code (perf/startup-speed 14fa9e1, perf/auth-cache c13a27a). (a) There is no onSessionReset in sessionStore.js, yet §4, §8.1, §10 and §11 all register through it. (b) The SWR cache is committed (14d3500, resourceCache.js) and clears through setCacheScope inside setSessionScope, not onSessionReset. (c) revalidate() swallows every error (`.catch(() => {})`), so §11.1 'Doc missing: revalidate(fbUser), the existing NOT_FOUND path' does nothing. The NOT_FOUND path lives in each instance's resolveProfile. (d) The 'develop line' references are wrong for the phase-1 base: useAdminDashboard is at 3710, useSessionAttendance 3942, useCoachDay 2627, useEnrollmentQueue 2570, useSpecialistSessions 1636.

**Fix:** Spec onSessionReset(fn) as a lane-A addition to sessionStore.js, fired from setSessionScope when the scope changes to null or another uid, next to setCacheScope. For a missing users doc in the feed: setLiveProfile(null), clearRoleHint, forgetSessionUser, then run the problem-2 purge check. Re-base §4 and the line references on perf/startup-speed 14fa9e1.

### 10. [medium] The T8 rules contract (the Nov 4 guard) does not run anywhere automatically, and its command fails on the owner's machine

The T8 rules contract (the Nov 4 guard) does not run anywhere automatically, and its command fails on the owner's machine. The repo has no CI, so the §19 claim 'T8 in CI' is false, and T9 runs it skipped. emulators:exec spawns its command with shell:true (firebase-tools lib/emulator/commandUtils.js:244-246), which is cmd.exe on Windows, so `CI=true LIVE_RULES_EMULATOR=1 npx ...` fails there. The config uses 'a copy of firestore.rules', so a stale copy hides later rule changes. Its fixtures live in a temp scratchpad (rules-audit/probe.mjs) that another session may not have.

**Fix:** Point the lane firebase.json `firestore.rules` at the repo file instead of a copy. Export the environment variables in the outer Git Bash command (`CI=true LIVE_RULES_EMULATOR=1 npx firebase-tools emulators:exec ... "npm --prefix frontend test -- --watchAll=false liveSets.rules"`). Commit the probe's 8 callers and fixtures into the repo next to the test. Make T8 a required item in the PM merge gate in TEAM.md and at release step 3.

### 11. [medium] On the Sessions tab, re-typed slots go stale under the live path

On the Sessions tab, re-typed slots go stale under the live path. In liveSpecialistSessions (specialistSessions.js), a slot whose seat counter exceeds the bookings found by type (a slot the calendar re-typed) is read one-shot. §10 keys that read by the short slot ids only. If a family cancels on such a slot, the live sessions.byType update lowers `booked`, but the slot is still short, so the key does not change and the read does not re-run. The roster keeps showing the cancelled athlete, which breaks G1.

**Fix:** Read short slots through the existing live set bookings.bySession{S} (it is gated for all staff and indexed on sessionId+status), using one useLive per short id through a small subscribe-many helper. Or include `booked` in the key. Add a T3 case: cancel on a re-typed slot.

### 12. [medium] Several parts of the design can make the app slower, and the M1 pass criteria do not catch it

Several parts of the design can make the app slower, and the M1 pass criteria do not catch it. (1) An owner's ~405 pinned docs open at profile publish and share the single watch stream with the landing screen's one-shot reads, so the screen's own results can queue behind them on a phone connection. (2) In persistent mode, every server result is written to IndexedDB before its snapshot is raised, including all one-shot staff screens, which adds work on phones. (3) memory-lru keeps every one-shot result in the JS heap until 16 MB of proto size, so the heap grows larger than that for long owner sessions. M1's pass for persistent mode is only 'first card before the server answers', with no bound on when fresh data paints.

**Fix:** Add pass criteria: fromCache:false paint within 10% of BEFORE for Admin, a one-shot staff screen (staff family page) and a non-Admin landing, in both AFTER modes, using a mobile CPU and network profile. Open the pins after the landing's first paint or at idle, except the landing's own sets. Use 4-8 MB for memory-lru, or keep eager GC for 'memory-lru' until night-check data shows resume tokens pay off.

### 13. [low] The provisional profile and repeated profile calls can misbehave

The provisional profile and repeated profile calls can misbehave. If resolveProfile ends in NOT_FOUND or an error, applyUser never runs, so the provisional profile stays; a provisional permission-denied keeps hooks in 'loading' forever. Each mounted useAuthSession calls the provisional setLiveProfile and applyUser, so a late provisional call could downgrade a verified profile.

**Fix:** Call setLiveProfile(null) on the NOT_FOUND and error outcomes. Make setLiveProfile idempotent for the same uid, role and specialistId, and never replace verified with provisional for the same uid. Add T1 and T6 cases.

### 14. [low] §5 says a converted hook drops the useInvalidation subscriptions its live path no longer needs

§5 says a converted hook drops the useInvalidation subscriptions its live path no longer needs. But §10 says the fallback (not-for-role or unsupported, e.g. a missing index) runs 'today's code with today's deps', and that fallback needs those generation counters to refresh after writes.

**Fix:** Keep every useInvalidation call (the rules of hooks require this anyway). Pass the generation counters only to the one-shot fallback's useSeedResource.

### 15. [low] useAthleteNames opens athletes.all whenever the gate allows it

useAthleteNames opens athletes.all whenever the gate allows it. For Yannick, where it is allowed but not pinned, a one-athlete roster opens a 103-doc listener instead of making one get.

**Fix:** Use byId only when athletes.all is already open and ready (check without subscribing). Otherwise do the per-id gets.

### 16. [low] Smaller spec defects

Smaller spec defects. (1) sessions.window hard-codes to = today+27, while adminWindow uses FITNESS_WINDOW_DAYS-1 (adminSections.js), so the two drift if that constant changes. (2) failed-precondition is classified by error code alone, so a multi-tab failed-precondition would mark a set 'unsupported' for good. (3) getLiveEntry for a key with no entry must return a cached object, or useSyncExternalStore loops. (4) signupOrder must copy Firestore's ordering across value types (null < numbers < timestamps < strings), not just sort Timestamp millis. (5) With the real-module mocks the existing tests use, firestoreCacheMode is undefined, and it must be treated as 'off', or useAuthSession tests will call terminate().

**Fix:** (1) Derive the window from FITNESS_WINDOW_DAYS. (2) Mark 'unsupported' only when the message matches /requires an index/. (3) Return a frozen WAITING or OFF constant for absent keys. (4) Add a mixed-type case to T3. (5) Add T4: signOut under the existing mocks makes zero terminate calls.

### 17. [low] Cost is presented only for persistent mode

Cost is presented only for persistent mode. Release step 6 (production memory-lru for 3 days) is expected at about 117-164k reads/day, above the 104k baseline the G6 goal is measured against. Staging with LIVE_STAFF on also bills against the production database. Monitoring could be misread as a regression.

**Fix:** State the expected range for steps 4 and 6 in §18 (memory: about 117-164k/day; persistent: about 89-123k/day), and keep a $5 budget alert as an owner action.
