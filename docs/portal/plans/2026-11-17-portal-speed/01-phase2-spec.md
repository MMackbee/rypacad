# Phase 2 build spec: live staff screens and an on-device cache (F10 + F13)

> **Status (2026-11-18): design only, NOT built.** Read [02-phase2-critique.md](02-phase2-critique.md) first: its verdict is "not ready to build as written". Phase 1 has since merged into develop, so every branch, commit and line reference below that points at perf/startup-speed, perf/auth-cache or af32bcc must be re-based on develop before building. See [00-phase1.md](00-phase1.md) for what phase 1 changed.


2026-11-17. Design only; nothing is built. Two builder lanes (A: core + Admin, B: other staff screens) can work from this without asking.
Base: develop **after** phase 1 merges: perf/auth-cache (f762ca4: shared users read, role hint), perf/staff-reads (d682089: Sessions tab by type, progressive Admin, coach roster skip) and perf/startup-speed (F5 SWR cache, not committed yet). develop is af32bcc; firestore.rules and firestore.indexes.json are unchanged since c67b9ee. SDK: firebase 9.23.0, @firebase/firestore 3.13.0 (frontend/package.json pins ^9.22.0).

## 1. The owner's answers and what they decide

Owner, 2026-11-17: **"no shared devices, yes live updates"**.

- **Yes live updates.** Build F10: staff screens listen with onSnapshot. F11 (Firestore Lite) is dropped for good, because Lite cannot listen.
- **No shared devices.** F13's blocker is gone, so an on-device Firestore cache is allowed on staff devices. We still clear it at sign-out, because rules cannot protect documents already on a device. We never turn it on for family devices, which gain nothing from it (their screens stay one-shot, and getDocs waits for the server anyway).

## 2. Goals

- **G1.** A booking, cancel, move, attendance mark or enrollment made anywhere (a family, other staff, a Cloud Function) shows on open staff screens within about 1-2 s, with no reload.
- **G2.** Returning to a live screen paints from memory and opens 0 new server targets.
- **G3.** In persistent mode, a cold open on a staff device paints cached data before the server answers.
- **G4.** No listener ever opens for a role whose rules would refuse the query as a whole (the Nov 4 lesson). This is enforced by gates plus a rules contract test.
- **G5.** With the flag off, behaviour is exactly today's. One Railway variable is the kill switch.
- **G6.** In persistent mode, reads/day are not above today's ~104k (expected ~89k).

## 3. Non-goals

- Family and athlete screens stay one-shot plus phase-1 SWR: Book seat counts, My bookings, Billing, Membership, Contract and MySchedule. Optional later: `sessions.bookable` behind its own REACT_APP_LIVE_SEATS.
- These staff screens also stay one-shot: the staff family page, Staff & Roles, Scholarships, Assessments, Tour, Combine and Settings.
- No firestore.rules change. This includes the optional parent graceTokens/tokenPeriods household clause.
- Not in scope: offline writes or offline UX, a service worker, push notifications, F7/F8/F9/F12, and removing invalidate.js.

## 4. Phase-1 seams this builds on (read them before starting)

- `hooks/sessionStore.js`: setSessionScope, resetSession, onSessionReset(hook), loadProfile, publishSessionUser, subscribeSessionUser.
- `hooks/roleHint.js`: readRoleHint() / roleHintFor(uid) give {uid, role, specialistId}. Used here to pick the cache mode at boot and to open listeners provisionally.
- `hooks/useAuthSession.js`: toUser, applyUser(user) (runs after every verified read), revalidate(fbUser), onVisible, signOut.
- `hooks/adminSections.js`: adminWindow, adminRoster, adminWeek, adminMetrics, groupStatus. In index.js: adminOutstanding, adminRosterReads and adminCallsReads.
- `hooks/specialistSessions.js` (liveSpecialistSessions, rowFor) and `hooks/specialistLive.js` (fetchBookingsByType: type equality only, no index).
- F5 SWR cache: assumed to register its clear with onSessionReset. If it lands differently, lane A calls its clear from endFirestoreSession.

## 5. Architecture

A module-level store holds ref-counted onSnapshot listeners on named **live sets**. It uses no React context, the same shape as invalidate.js and sessionStore.js.

- Each set has a role gate equal to or **narrower** than firestore.rules. It is built from role clauses only, never the specialistId or assessor attribute clauses.
- At sign-in the store pins the landing screen's sets. Other sets open on demand and linger 10 min after the last screen leaves.
- Hooks read through `useLive` / `useLiveOr`. When a set is `off`, `not-for-role` or `unsupported`, the hook runs its existing one-shot path unchanged.
- Each set's query comes from the same builder the one-shot fetcher uses. So a getDocs in a hook that is not converted yet rides an open, synced listener with the identical query and opens no server target (code-read; check this in M2).
- invalidate.js and every `bump()` in live.js stay, for one-shot consumers. A converted hook drops only the `useInvalidation` subscriptions its live path no longer needs.

## 6. Files and lane ownership

| File | New/changed | Lane | What |
|---|---|---|---|
| frontend/src/firestoreCache.js | new | A | flag parsing, `deviceCacheMode()`, storage keys (pure, guarded storage) |
| frontend/src/firebase.js | changed | A | `initializeFirestore` with `firestoreSettings()`; emulator host in settings (§12) |
| portal/hooks/liveSets.js | new | A | registry (§7); no React |
| portal/hooks/liveStore.js | new | A | listener lifecycle (§8, §9); no React |
| portal/hooks/useLive.js | new | A | useLive, useLiveOr, useAcademyDay |
| portal/hooks/firestoreSession.js | new | A | endFirestoreSession, cache-owner check, IndexedDB fault counter |
| hooks/live.js, specialistLive.js, mentalLive.js, doorAdmin.js | changed | A | exported query builders `q*(fs = db, ...)`; the fetchers call them (no behaviour change) |
| hooks/sessionStore.js, useAuthSession.js | changed | A | `acceptProfile(uid, value)`, users.me feed, setLiveProfile, sign-out order (§11) |
| firestore.indexes.json | changed | A | two (type, date) indexes (§13.4) |
| hooks/liveSets.rules.test.js (fallback: scripts/live-rules-contract.mjs) | new | A | T8 rules contract |
| hooks/adminLive.js; index.js useAdminDashboard, useEnrollmentQueue; billing.js useHouseholdsDirectory; signups.js | new + changed | A | Admin, enrollment queue, Households, Sign-ups |
| hooks/athleteNames.js | new | B | `useAthleteNames(ids)` (§10) |
| hooks/coachDayLive.js; index.js useCoachDay, useSessionAttendance, useSpecialistSessions; specialistSessions.js | new + changed | B | Today, roster, Sessions tab / My sessions |
| hooks/mental.js, mentalConsentStaff.js, doorAdmin.js useDoorAdmin | changed | B | mental roster, consent tracker, door activity |

- Lane A's first commit (**A1**) is the core: firestoreCache, firebase.js, liveSets, liveStore, useLive, the builders, the auth wiring, the indexes and tests T1-T8. Lane B branches from A1, not from develop.
- Only hooks/index.js is shared, and each lane edits only its own functions. New derivation code goes in new files so index.js does not grow.
- Every new file stays under 500 lines. Worktrees follow the worktree sprint setup, with their own emulator ports.

## 7. Live sets (liveSets.js)

Each entry is `{ allowed(profile), resolve(input) -> params, target(fs, params) -> Query | DocumentReference, map(docSnap) -> row }`.

- **Key:** `name + '|' + stableJSON(resolved params)`. sessions.window therefore re-keys daily and noshowSince monthly.
- **Default map:** `d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })`. enrollmentRequests also adds `uid: d.id`.

| Set | Target (builder) | Input → params | Gate | Prod docs 11-17 | Consumers |
|---|---|---|---|---|---|
| users.me | doc users/{uid} | uid | self, any role (pinned for staff only) | 1 | profile feed (§11.1) |
| athletes.all | qAllAthletes: collection athletes | none | owner, ops, mental | 103 | Admin, Households, Sign-ups, consent tracker, mental roster, names; assessments.js:100 rides it |
| households.all | qAllHouseholds | none | owner, ops, mental | 90 | Admin, Households, Sign-ups, consent tracker, mental roster |
| sessions.window | qSessionsInRange(from,to): date>=from, date<=to, orderBy date | {today} → from = Monday of today's week, to = today+27 | coach, mental, ops, owner | ~200 | Admin week + fitness rows, coach Today |
| sessions.byType | qSessionsByTypeInRange: type==T, date>=from, date<=to, orderBy date (**new index**) | {type, today} → from = today, to = openThrough(new Date(), MAX_WINDOW_MONTHS) | coach, mental, ops, owner | phil 256, mental ~6 | Sessions tab / My sessions |
| sessions.doc | doc sessions/{id} | {sessionId} | coach, mental, ops, owner | 1 | roster header |
| enrollmentRequests.pending | qPendingEnrollment: status=='pending' | none | owner, ops | 0 | Admin Outstanding, enrollment queue |
| bookings.noshowSince | qNoShowSince: status=='noshow', date>=since | {today} → since = month start | owner, ops | ~10 | Admin Outstanding |
| bookings.byType | qBookingsByType: type==T (no index) | {type} | coach, mental, ops, owner | mental 9 | consent tracker, mental roster (mental only) |
| bookings.upcomingByType | qBookingsByTypeFrom: type==T, date>=from (**new index**) | {type, today} | coach, mental, ops, owner | phil 125 | Sessions tab / My sessions |
| bookings.bySession | qBookingsBySession: sessionId==S, status in [confirmed, attended, noshow] | {sessionId} | coach, mental, ops, owner | 1-12 | roster |
| doorEvents.recent | qRecentDoorEvents: orderBy atMs desc, limit EVENTS_SHOWN (50) | none | owner, ops | 4 | Door activity |

Notes on the table:

- There is **no bookings date-window set.** No staff screen reads bookings by date (Admin reads noshow by status, rosters by session, specialists by type, and seat counts come from sessions.booked). A window set would cost 218-481 reads per load and serve nothing.
- Fetchers and sets must build identical queries: same filters, same order and no extra orderBy. Otherwise the getDocs sharing in §5 is lost.

**Pins**, opened at profile publish when the flag is on (§8.1); the first matching row wins:

| Profile | Pinned (plus users.me) | Docs |
|---|---|---|
| owner, ops | athletes.all, households.all, sessions.window, enrollmentRequests.pending, bookings.noshowSince | ~405 (one Admin open today is ~593) |
| has specialistId (Phil = coach/phil, Yannick = mental/mental) | sessions.byType{own}, bookings.upcomingByType{own} | Phil ~381 + ≤22 name gets; Yannick ~15 |
| plain coach | sessions.window | ~200 |
| parent, athlete | nothing; users.me is not opened | 0 |

## 8. Store behaviour (liveStore.js)

### 8.1 Profile and gating

- **The profile.** `setLiveProfile(p)` takes `{ uid, role, specialistId, verified }` or null. Gates read only `role`; pins also read `specialistId`.
- **Provisional profile.** On the auth emission, when there is no known user but `roleHintFor(uid)` exists, call `setLiveProfile({ ...hint, verified: false })`. Pinned sets open alongside the users read, so a persistent cache can paint before it lands. This is not security-relevant: rules check every listen, and a wrong hint costs one refused listen.
- **Verified profile.** `applyUser` calls `setLiveProfile(toLiveProfile(user))` with `verified: true`.
- **Null or a different uid:** `closeAllLive`. This is also registered via `onSessionReset`.
- **Same uid, new role or specialistId:** re-gate. Close the entries the new gate refuses (status `not-for-role`, rows dropped), re-pin, and re-open once any errored entries the new gate now allows.
- **A refused set:** subscribing to a set the gate refuses opens **no** listener. The entry is `not-for-role` and the hook falls back to its one-shot path. This is the Nov 4 guard.
- **No profile yet:** status `waiting`. The hook shows loading and does **not** start its one-shot fallback, so there is no double read on cold start.

### 8.2 Ref-count, linger, pins

- The first subscriber opens `onSnapshot(target, { includeMetadataChanges: true }, next, error)`.
- The last unsubscribe starts LINGER_MS = 10 min, and a re-subscribe cancels it. So React 18 StrictMode's mount/unmount/mount never re-opens a listener.
- A pin is a permanent ref until the profile changes or the user signs out.
- In development, console.warn when more than 40 entries are open (leak detector).

### 8.3 Snapshots

- The store keeps a `Map<id,row>` patched from `docChanges()`, so unchanged rows keep their identity. `rows` follows `snap.docs` order; `byId` is the Map.
- A metadata-only event changes only `fromCache` and `pending` (from hasPendingWrites). It produces a new entry object with the same `rows` reference.
- Every change makes a new frozen entry, so `useSyncExternalStore` sees stable snapshots between changes.
- Each open has a generation number, and events from a closed listener are ignored.
- `syncedAt` is set on the first `fromCache: false` snapshot.

### 8.4 Errors (the SDK reconnects normal network drops by itself and emits fromCache snapshots meanwhile)

| Code | Store action | Hook sees |
|---|---|---|
| permission-denied while provisional | keep `loading`; when the verified profile arrives, re-gate and re-open if still allowed | loading |
| permission-denied while verified | drop rows; status `error`; call the refresher useAuthSession registered (`setProfileRefresher(() => revalidate(auth.currentUser))`) once. No retry until the role or specialistId changes. The listener is dead (§13.5). | error + retry button → `retryLive(key)` |
| failed-precondition (missing index) | status `unsupported`; console.error with the message (it contains the index link) | the one-shot fallback (phase-1 type-only query, no index needed) |
| unavailable, internal, unknown, deadline-exceeded, resource-exhausted, aborted | keep rows, `stale: true`; retry on RETRY_MS [1, 4, 15, 60 s] (max 4); retry at once on visibilitychange→visible and on `online` | data, stale |
| unauthenticated | closeAllLive | (auth handles it) |
| An error message matching /IndexedDB/i (persistent mode) | count it; after 2 in one page: localStorage `ryp.fsCache = 'memory'` and reload once (sessionStorage `ryp.fsDowngraded` guard) | — |

### 8.5 Day rollover

- One store timer fires at the next local midnight plus 5 s and re-pins with the new day.
- `useAcademyDay()` re-renders its consumers at the same moment, so day-keyed params change and the old keys linger out.
- Use `todayISO()` (data/calendar.js:31, device-local), which is what the one-shot hooks use, so the queries match exactly.

### 8.6 Writes

- **Client writes** (IN/OUT, noshow reason, session note, cancelBooking) appear at once through latency compensation (`pending: true`). A rules rejection rolls back in the listener. live.js keeps every bump().
- **Callable writes** (staffBookSession, callMoveBooking, callStaffCancelBooking, cancelSession, approve/decline enrollment) arrive from the server in about 1 s. Lane B: the roster's staff Add, Move and Cancel sheets `await waitForLive(key, predicate, { timeoutMs: 4000 })` before closing, and close anyway on timeout.

## 9. API

```js
// liveStore.js
export const LINGER_MS = 600000;
export const RETRY_MS = [1000, 4000, 15000, 60000];
export const OFF_ENTRY; // frozen { status: 'off', rows: null, ... }
export function liveKey(name, input) {}              // resolves params through the set; string
export function subscribeLive(key, notify) {}        // ref-counted; lazily creates the entry; returns unsubscribe
export function getLiveEntry(key) {}                 // LiveEntry (OFF_ENTRY when the flag is off)
export function setLiveProfile(profile) {}           // { uid, role, specialistId, verified } | null
export function setProfileRefresher(fn) {}           // useAuthSession registers its revalidate; used once per verified denial
export function closeAllLive(reason) {}
export function retryLive(key) {}
export function waitForLive(key, predicate, { timeoutMs = 4000 } = {}) {} // Promise<boolean>
export function liveDebug() {}                       // [{ key, status, refs, docs, fromCache }]; window.__rypLive in emulator builds only
export function __configureLiveStoreForTests({ listen, sets, now, lingerMs }) {}
// LiveEntry = { key, status: 'off'|'waiting'|'not-for-role'|'loading'|'ready'|'error'|'unsupported',
//               rows, byId, fromCache, pending, stale, error, version, syncedAt }

// useLive.js
export function useLive(name, input = null) {}
//   -> { live, status, data, byId, loading, error, fromCache, pending, stale, retry }
//   live = flag on && isLive() && status in waiting|loading|ready|error; loading = status in waiting|loading && rows == null
export function useLiveOr(name, input, seedValue, oneShot /* { source, deps } | undefined */) {}
//   Always calls useLive and useSeedResource(live ? null : seedValue, live ? undefined : oneShot): same shape either way
export function useAcademyDay() {}                    // todayISO(), re-renders at local midnight

// sessionStore.js (addition)
export function acceptProfile(uid, value) {}          // store as the shared profile, as loadProfile would (scope-checked)
// firestoreSession.js
export async function endFirestoreSession({ reason }) {} // §11.3 steps 3 and 5
```

## 10. Hook switches

All hooks take the live path only when `useLive(...).live`. Otherwise they run today's code with today's deps.

| Hook (develop line) | Live sets | Stays one-shot | Parity / notes |
|---|---|---|---|
| useAdminDashboard (index.js:3824 → adminLive.js) | roster ← athletes.all + households.all; week ← sessions.window filtered weekStart..weekEnd; calls ← enrollmentRequests.pending, bookings.noshowSince, sessions.window filtered today..fitnessTo | contractLogs since month start + assessment windows (`.catch(() => null)`), one resource with deps contractLogsGen, assessmentsGen | reuse adminRoster, adminWeek, adminOutstanding and groupStatus; window = weekStart..today+27 covers both ranges in the same order; status.roster/week/outstanding come per part |
| useEnrollmentQueue (index.js:2618) | enrollmentRequests.pending | — | approve/decline unchanged |
| useHouseholdsDirectory (billing.js:384) | athletes.all, households.all | — | extract the join at billing.js:257 as a pure `householdsDirectoryRows` |
| useSignups (signups.js:113) | athletes.all; households.all → `signupOrder()` | loginInvites, flagged bookings, Calendly (one resource) | `signupOrder` must match `orderBy('signup.at','desc')` (signups.js:44): keep docs where `signup.at` exists (orderBy drops only docs missing the field), sort desc (Timestamp millis), id as tiebreak |
| useConsentTracker (mentalConsentStaff.js:101) | athletes.all, households.all, bookings.byType{mental} | fetchAllConsents (deps consentsGen) | trackerRows unchanged |
| mental roster (mental.js:40) | athletes.all, households.all, bookings.byType{mental} | entries, consents | Yannick passes the gate as `mental` |
| useCoachDay (index.js:2675 → coachDayLive.js) | sessions.window | profile from the shared store | day = the first date ≥ today with any session in the window, then today's filter. If the window holds none: fall back to `fetchSessions(today, 1)` (pre-season). The live path keeps every session of that day, where the one-shot limit(12) can drop one on a 13-slot day; the test documents this as a fix |
| useSessionAttendance (index.js:4012) | bookings.bySession{S}; sessions.doc{S} replaces noteState's read; names via useAthleteNames | — | the row mapping (incl. staffRowFields) moves to a pure function both paths use; mark/setReason/setSessionNote/cancelSession unchanged |
| useSpecialistSessions (index.js:1687 + specialistSessions.js) | sessions.byType{type,today}, bookings.upcomingByType{type,today}; names via useAthleteNames | fetchBookingsBySession for "short" slots (seats counted > found, i.e. calendar-retyped), keyed by the short ids | export a pure `buildSpecialistRows(mine, typed, extraBySession, nameById, today)` used by both paths; filters (hidden, cancelled, unresolved) unchanged |
| useDoorAdmin events (doorAdmin.js:101) | doorEvents.recent | doorConfig, doorPauses, the visibility re-read at :134 | refreshEvents → retryLive |

**useAthleteNames(ids)** (athleteNames.js) returns `{ nameById, loading, error }`:

- If `athletes.all` is live for the profile, names come from `byId`. Otherwise (plain coach, Phil): per-id `fetchAthlete`, settled, for ids not yet known, cached in a module Map cleared through onSessionReset.
- It keeps the roster's rule (when every get fails, the refusal is thrown). **Never** use `documentId() in [...]` on athletes; it is refused whole for a plain coach (probe D5).

## 11. Auth wiring (useAuthSession.js, lane A)

### 11.1 Profile feed (users.me)

- **When:** once per uid, when the flag is on and the verified role is coach, mental, ops or owner.
- **On each server snapshot** (`fromCache: false`): map the doc exactly as readUserDoc does (`{ uid, email: fbUser.email, ...data }`). If its JSON differs from the last accepted profile, run `acceptProfile(uid, profile)`, then `resolveSelfManaged`, then `applyUser(toUser(...))`, which re-renders every session and re-gates the store.
- **Doc missing:** `revalidate(fbUser)`, the existing NOT_FOUND path.
- **Feed error:** stop the feed and fall back to phase-1 TTL/visibility revalidation.
- **While the feed is open,** `onVisible` skips its revalidate (one users read saved per resume).
- **Stop:** via onSessionReset.

### 11.2 setLiveProfile call sites

- Provisional: in the auth listener after `setSessionScope`. Verified: in `applyUser`. null: via onSessionReset.
- `setProfileRefresher` is registered once at module load of useAuthSession.js.

### 11.3 signOut(), in this order

1. `closeAllLive('sign-out')` and stop the feed.
2. `resetSession()`.
3. If cache mode ≠ off: race `waitForPendingWrites(db)` against 2 s.
4. `firebaseSignOut(auth)`.
5. If cache mode ≠ off: race `terminate(db)` against 2 s; in persistent mode race `clearIndexedDbPersistence(db)` against 3 s and on failure set localStorage `ryp.fsCachePurge = '1'`; remove `ryp.fsCacheUid`; then `window.location.replace('/portal/signin')`.

With cache mode off, steps 3 and 5 are skipped and the flow is exactly today's.

### 11.4 Signed-out emission (another tab, a revoked token)

Run steps 1-2. If cache mode ≠ off and this page had a user, run `endFirestoreSession`, then reload to /portal/signin. If another tab already deleted the database, this tab's client has terminated itself (index.esm2017.js:11660-11664), which is why it must reload.

### 11.5 Cache-owner check (persistent mode)

After each verified profile, set `ryp.fsCacheUid = uid`. On the first signed-in emission, if a stored `ryp.fsCacheUid` differs from the uid, set the purge flag and reload once (sessionStorage `ryp.fsPurgeReload` guard). This covers a crash before sign-out.

## 12. firebase.js and the cache (lane A)

```js
// firebase.js (replaces getFirestore at :62 and connectFirestoreEmulator at :94; auth and functions emulators unchanged)
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache,
  memoryLruGarbageCollector, clearIndexedDbPersistence } from 'firebase/firestore';
import { deviceCacheMode, CACHE_BYTES, clearPurgeFlag } from './firestoreCache';
export function firestoreSettings({ mode, emulatorPort }) {
  // Not connectFirestoreEmulator: in 9.23 it rebuilds settings and drops localCache (index.esm2017.js:17782-17788).
  const s = emulatorPort ? { host: `127.0.0.1:${emulatorPort}`, ssl: false } : {};
  if (mode === 'persistent') s.localCache = persistentLocalCache({ tabManager: persistentMultipleTabManager(), cacheSizeBytes: CACHE_BYTES });
  if (mode === 'memory-lru') s.localCache = memoryLocalCache({ garbageCollector: memoryLruGarbageCollector({ cacheSizeBytes: CACHE_BYTES }) });
  return s; // 'off' and 'purge': SDK default (memory, eager GC), identical to getFirestore today
}
export const firestoreCacheMode = deviceCacheMode();
export const db = initializeFirestore(app, firestoreSettings({ mode: firestoreCacheMode, emulatorPort: useEmulators ? firestorePort : null }));
if (firestoreCacheMode === 'purge') clearIndexedDbPersistence(db).then(clearPurgeFlag, () => {}); // legal: client not started yet
```

`deviceCacheMode()` (firestoreCache.js), with every storage call in try/catch:

1. If `REACT_APP_LIVE_STAFF !== 'true'` or `REACT_APP_FIRESTORE_CACHE` is unset or 'off': return **off**.
2. If the flag is 'purge' or localStorage `ryp.fsCachePurge === '1'`: return **purge**.
3. If `readRoleHint()` is missing or its role is not coach, mental, ops or owner: return **off**. Family devices never cache, and a first-ever sign-in runs uncached until the next load.
4. If the flag is 'persistent', `typeof indexedDB !== 'undefined'` and `ryp.fsCache !== 'memory'`: return **persistent**.
5. Otherwise return **memory-lru**.

`CACHE_BYTES = 16 * 1048576`. The whole database is about 4,500 docs, under 10 MB; GC runs only above the threshold.

SDK facts this relies on (code-read in node_modules/@firebase/firestore/dist/index.esm2017.js unless marked):

- **getDocs still waits for the server when online** (waitForSync, :17324-17337). Only listeners, or a getDocs identical to a synced open listener, paint instantly.
- **onSnapshot emits the cached result first** (fromCache true) when the query has cached docs or synced before (:15197), then the server result.
- **Never use getDocsFromCache for first paint.** An uncached query returns empty with fromCache true, which looks the same as "none".
- **Cheap resume needs persistence.** Pricing docs: with persistence, a re-listen within 30 min bills only changed docs. Without persistence, every reconnect bills as a new query.
- **Start-up failures fall back to memory by themselves** (IndexedDB unusable, quota, private mode, failed-precondition, unimplemented), logging "Error using user provided cache. Falling back to memory cache" (:17173-17195). Later IndexedDB faults are handled by §8.4.
- **clearIndexedDbPersistence needs an unstarted or terminated instance** (:18504).
- **persistentMultipleTabManager:** one primary tab holds the network targets, so a second Admin tab adds no listeners.
- **SDK upgrades:** an SDK bump migrates the IndexedDB schema, and old open tabs may error; ErrorBoundary reloads them.

## 13. Rules and indexes

### 13.1 No rule change is needed

Evidence: a scratch emulator audit of 71 queries and doc reads × 8 callers, each run as REST list/GET and as a real onSnapshot from the app's own SDK. The two methods agreed on all 568 cells. Files: scratchpad/live-design/rules-audit (probe.mjs, run1.log, results.json).

The 8 callers were owner, ops, plain coach, Phil, Yannick, mental without assessor, parent and athlete. Production staff today are 3 owners, 6 plain coaches, Phil and Yannick; there is no ops account.

### 13.2 Gates vs measured rules (Y allowed, N refused as a whole; the gate is what the store opens)

| Set | owner | ops | coach | Phil | Yannick | parent | athlete | Gate |
|---|---|---|---|---|---|---|---|---|
| users.me (T4) | Y | Y | Y | Y | Y | Y | Y | self |
| athletes.all (A1) | Y | Y | N | Y* | Y | N | N | owner, ops, mental |
| households.all (A2) | Y | Y | N | N | Y | N | N | owner, ops, mental |
| sessions.window / byType / doc | Y | Y | Y | Y | Y | Y | Y | staff (rule: signedIn(), firestore.rules:1238) |
| enrollmentRequests.pending (A4) | Y | Y | N | N | N | N | N | owner, ops |
| bookings.noshowSince / byType (D2b) / upcomingByType (D2) / bySession | Y | Y | Y | Y | Y | N | N | owner, ops for noshow; staff for the rest |
| doorEvents.recent (X3) | Y | Y | N | N | N | N | N | owner, ops |

\* Phil passes only through the specialistId clause (rules:409). The gate refuses him deliberately, so his names come from per-id gets (the `allow get` at rules:396).

### 13.3 Shapes that must never be listened to

athletes or households lists for a plain coach; `documentId() in` on athletes; waitlist by sessionId for families (P5b); a parent's bookings by athleteId alone (F3b); a parent's graceTokens or tokenPeriods by householdId (F5 / F6c).

### 13.4 Indexes (new; production has none, and the D2 probe returned FAILED_PRECONDITION)

```json
{ "collectionGroup": "bookings", "queryScope": "COLLECTION", "fields": [ { "fieldPath": "type", "order": "ASCENDING" }, { "fieldPath": "date", "order": "ASCENDING" } ] },
{ "collectionGroup": "sessions", "queryScope": "COLLECTION", "fields": [ { "fieldPath": "type", "order": "ASCENDING" }, { "fieldPath": "date", "order": "ASCENDING" } ] }
```

The emulator does not enforce indexes, so T7 checks the file. After the deploy, a read-only production probe (limit 1, scripts/lib/firestore-rest.mjs, as rules-audit/prod-checks.mjs did) must return rows or an empty result for both shapes, not FAILED_PRECONDITION.

### 13.5 Revocation (emulator, probe2.mjs / run2.log)

An open ops households listener errored with permission-denied on the next matching write after the role changed, and a new listen was refused. An SDK error callback is terminal. Hence §8.4 (treat permission-denied as final) and §11.1 (the feed drives re-gating). Production is assumed to behave the same; see the open questions.

## 14. Flags

| Variable | Values | Default | Effect |
|---|---|---|---|
| REACT_APP_LIVE_STAFF | 'true' or unset | unset | Unset: no onSnapshot anywhere, every hook takes today's one-shot path, and the cache mode is forced off. |
| REACT_APP_FIRESTORE_CACHE | unset/'off', 'memory-lru', 'persistent', 'purge' | unset | Staff-hinted devices only (§12). 'purge' deletes each device's cache on its next load and runs without one. |

- Both are read at call time (the data/contractFlag.js pattern), but CRA bakes them at build. A Railway variable change takes the rebuild Railway runs on change. Set them per Railway environment (Staging, Production).
- Local QA sets the variables in the lane's launch config env, never in or by reading frontend/.env. Tests set and restore `process.env` in beforeEach/afterEach.

## 15. Test plan

**T1 liveStore unit tests** (jest, fake timers, `__configureLiveStoreForTests({ listen: fake.listen, sets: fakeSets })`; the fake sets return plain tokens, so no SDK runs). Cases: two subscribers share one listen; the last unsubscribe lingers 10 min and then unsubscribes exactly once, and a re-subscribe inside the linger reuses the listener; a refused gate makes 0 listens and gives `not-for-role`; no profile gives `waiting` and 0 listens; a provisional permission-denied waits for the verified profile; a verified permission-denied drops rows, makes one profile refresh request and does not loop; failed-precondition gives `unsupported`; unavailable keeps rows stale, retries on the backoff, and visibility retries at once; `setLiveProfile(null)` unsubscribes everything and ignores late events; a uid change closes and re-opens; a role change re-gates and re-pins; metadata-only events keep the `rows` reference; `waitForLive` resolves on a match and returns false on timeout; midnight re-keys and the old key lingers out; pins by role match §7.

**T2 Hook tests** (renderHook): `useLive` and `useLiveOr` cover the live, waiting, not-for-role, unsupported and off paths; `useLiveOr` never starts the one-shot while `waiting`.

**T3 Parity tests:** the live and one-shot inputs from one fixture give identical output for: Admin on index.adminProgressive.golden.json (`data` and `status` once all parts land); the Households directory; `signupOrder`, including a household with no signup.at and one with `at: null`; coach Today, including a 13-slot day (documented difference) and the pre-season fallback; specialist rows on the specialistSessions.test.js fixture with a retyped slot; roster rows.

**T4 Flag-off guard:** with REACT_APP_LIVE_STAFF unset, the converted hooks render with a listen spy and make 0 listen calls. The existing suites (about 50 files mock ../../firebase) stay untouched and green.

**T5 firestoreCache / firestoreSettings:** the mode matrix over flag × hint × storage × indexedDB. The emulator settings carry host and ssl and keep `localCache`, and `connectFirestoreEmulator` is never called. This is the regression test for the 9.23 drop.

**T6 Auth wiring** (mocked SDK): signOut runs §11.3 in order; a failed clear sets the purge flag; a cache-owner mismatch purges and reloads exactly once; a feed role change re-gates; a feed error falls back to revalidate; onVisible skips its read while the feed is open.

**T7 Index contract** (node): firestore.indexes.json holds both (type, date) entries, and every set with equality plus a range on another field has a matching entry.

**T8 Rules contract**, `frontend/src/portal/hooks/liveSets.rules.test.js`:

- It uses `@jest-environment node` and is skipped unless `LIVE_RULES_EMULATOR=1`.
- Run it with `npx firebase-tools emulators:exec --config <lane-scratch>/firebase.json --only firestore --project demo-live-contract "cd frontend && CI=true LIVE_RULES_EMULATOR=1 npx react-scripts test --watchAll=false liveSets.rules"`.
- The config uses a copy of firestore.rules, the lane's own port and `ui.enabled: false`. Never use 8080/8181/8183 while other runs hold them, and never `--project rypacad`.
- Seed the 8 callers and fixtures of rules-audit/probe.mjs with `Bearer owner`.
- For every set × caller, open the real target through the builders with a per-caller Firestore instance (`connectFirestoreEmulator` with mockUserToken is fine here, since there is no cache).
- Assert (a) gate allowed ⇒ ALLOWED, which is the Nov 4 guard, and (b) the full matrix equals §13.2, so any rules change in either direction fails until the table is updated on purpose.
- If jest cannot load the real SDK in the node environment, run the same assertions as scripts/live-rules-contract.mjs, a plain node script shaped like rules-audit/probe.mjs, under the same emulators:exec command.

**T9 Full gate:** `cd frontend && CI=true npm test -- --watchAll=false` and `CI=false npm run build`.

## 16. Measurement plan (emulator, before and after)

**Setup**

- Use one lane worktree with its own emulators and the QA seed (or the real-family copy sandbox for production-like sizes).
- Copy scratchpad/speed/fsproxy.mjs into the lane scratch and change its hard-coded TARGET port 8080 to the lane's Firestore port. Run it with `LATENCY=100` (100 ms RTT, the investigation's setting) and its own `PROXY_PORT`, and point REACT_APP_FIRESTORE_EMULATOR_PORT at the proxy.
- Inject scratchpad/speed/instrument.js (DOM-mutation timing) through the browser tool.
- Build the same commit three ways: **BEFORE** (flags unset), **AFTER-M** (LIVE_STAFF=true, CACHE=memory-lru) and **AFTER-P** (LIVE_STAFF=true, CACHE=persistent).
- Run each scenario 3 times and take the median.

| # | Scenario | Record | Pass (AFTER) |
|---|---|---|---|
| M1 | Owner cold-opens /portal/admin (second load, so the hint exists) | first and last card ms; targets; docs | P: first card before the server answers; M: within 10% of BEFORE |
| M2 | Admin → Households → Admin → Sessions (Phil) → Admin | per step: new targets, docs, ms to paint | 0 new targets for live sets on each return; paint < 100 ms |
| M3 | Parent in tab B books, then cancels, a session this week | ms from write ack to change on owner's Admin bars, roster, Sessions tab | ≤ 1.5 s, no reload |
| M4 | Coach marks IN/OUT on the roster | ms to row change; reads per tap | immediate; 0 re-reads |
| M5 | Phil opens My sessions cold, leaves, returns | requests, docs, ms | first open ≤ 3 targets + new-name gets; return 0 targets |
| M6 | Owner's users doc set to coach while Admin is open | listener closes, store re-gates, no retry loop | one notice, no loop |
| M7 | AFTER-P: sign out in tab A with tab B open | `indexedDB.databases()` holds no firestore entry; tab B on /portal/signin; then a purge build's first query succeeds (no failed-precondition) | yes |
| M8 | AFTER-P: tab hidden 40 s, then visible; then a reload within 1 min | proxy log shows addTarget `resume: true`, no full re-query | yes |

The before/after table goes in each lane's merge notes, with seed doc counts scaled by the production counts in §7.

**Production** (read-only, after each release step):

- Cloud Monitoring `document/read_count` daily (ALIGN_SUM on 08:00Z boundaries) and `network/snapshot_listeners` / `active_connections` hourly max and mean, with the same queries as scratchpad/live-design/cost/mon.mjs. Baseline: 104k reads/day (Nov 3-16), listener mean 0.36.
- Owner-run night check on staging, when reads are 0-50 an hour: one staff login; background the phone 5 min, then 40 min; read read_count at 60 s alignment. This settles whether a no-change resume bills 1 read per target and how memory-lru resumes bill.

## 17. Cost estimate

Prices (nam5): $0.06 per 100k reads after 50k/day free. Writes, deletes, storage and egress stay $0 in every row.

| Scenario | Reads/day | $ per 30 days |
|---|---|---|
| Today, measured Nov 3-16 | 104k (25k-282k) | $1.02 |
| Phase 1 | ~100k | $0.95 |
| Phase 2, memory cache: realistic / heavy | ~117k / 164k | $1.24 / $2.06 |
| Phase 2, persistent on staff devices: realistic / heavy | ~89k / 123k | $0.75 / $1.35 |
| 10× today's reads | 1.04M | ~$18 |

- Per person, persistent: owner and ops ~8.7k/day each, coaches ~3.7k, Phil ~2.8k, Yannick ~1.6k. Churn is about 100-200 change reads per connected owner/ops client per day, plus up to ~300 on calendar-sync days.
- Persistent is cheaper because the memory cache re-reads the full set on every phone resume, while persistent mode re-reads only after gaps over 30 min.
- These rows are upper bounds: the model assumed a 602-doc owner/ops set with a 7-day bookings window, and this spec pins ~405. Cost does not decide anything here; correct gates and correct data do.

## 18. Release order (rules and indexes before the frontend)

0. Phase 1 is released (develop:main) and stable.
1. **Indexes.** The owner runs `npx firebase-tools deploy --only firestore:indexes --project rypacad`. If the CLI offers to delete production indexes missing from the file, answer **No**; never use `--force`. Wait until both are READY; Claude then confirms with the read-only probe in §13.4.
2. **Rules.** Nothing to deploy. If a later change ever adds a rule, it deploys here, before any frontend.
3. **Code, flags unset.** Merge lanes A and B into develop and run the full gate. The owner pushes `git push origin develop:main`. Production behaviour is unchanged; spot-check Admin and Book.
4. **Staging, memory-lru.** On Railway Staging set REACT_APP_LIVE_STAFF=true and REACT_APP_FIRESTORE_CACHE=memory-lru. The owner runs M2/M3-style checks on rypacad.ryptest.com for 1-2 days. Staging uses the production database: its reads are real (cents), and test writes go only through the test family.
5. **Staging, persistent.** Set CACHE=persistent and check sign-out clearing, two tabs, phone resume, and the night billing check.
6. **Production, memory-lru.** Set LIVE_STAFF=true and CACHE=memory-lru, then watch Monitoring for 3 days.
7. **Production, persistent.** Set CACHE=persistent.

**Kill switches:** unset LIVE_STAFF (rebuild) and every hook goes one-shot with the cache off; CACHE=purge (rebuild) makes every staff device delete its cache on its next load (unset it after a week).

## 19. Risks

| Risk | Mitigation |
|---|---|
| A set opens for a role whose rules refuse it, and the whole query is denied (Nov 4) | Gates ⊆ rules via role clauses only; T8 in CI; not-for-role falls back to one-shot |
| Rules narrowed later | T8's exact matrix fails |
| A role change ends listeners (certain on a demotion) | permission-denied is final; the users.me feed re-gates; one re-open, only after the profile changes |
| Index missing or still building in production | Indexes deploy first; `unsupported` falls back to the phase-1 type-only one-shot |
| Minors' and billing data cached on a staff device | Staff-hinted devices only; terminate + clear at sign-out; purge flag; cache-owner check; CACHE=purge |
| iOS Safari IndexedDB faults after backgrounding | SDK memory fallback at start; per-device downgrade after 2 faults |
| Stale first paint (fromCache) | The server snapshot replaces it within about 1 RTT. Staff actions go through callables and rules that re-check on the server. If M8 or staging shows entries stuck fromCache after a resume, add a one-time disableNetwork/enableNetwork nudge behind the flag. |
| Multi-tab with 1-16 deploys a day | Multi-tab manager; ErrorBoundary reload; the signed-out branch reloads terminated tabs |
| Double reads on cold start | `waiting` blocks the fallback until a profile exists |
| Live and one-shot derivations drift apart | Shared pure builders plus T3 parity tests |
| Pending writes lost at sign-out | Wait up to 2 s for pending writes before terminate |
| Phase-1 code changes under the lanes | Lanes start after phase 1 merges; §4 lists the exact seams |

## 20. Done means

- **Lane A:** A1 merged into lane B's base; T1, T2, T4-T8 green; Admin, enrollment queue, Households and Sign-ups switched with their T3 parity tests; M1, M2, M3 and M6-M8 recorded; full gate green.
- **Lane B:** Today, roster, My sessions / Sessions tab, mental roster, consent tracker and door activity switched with T3; waitForLive in the staff sheets; M3, M4 and M5 recorded; full gate green.
- **Both:** with flags unset, existing test files have no diff; no new file is over 500 lines; no tracked file outside §6 is changed.
