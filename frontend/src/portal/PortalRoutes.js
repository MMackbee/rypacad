import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';

import useAuthSession from './hooks/useAuthSession';
import { isLive } from './hooks/live';
import { contractEnabled } from './data/contractFlag';
import SignIn, { LANDING_BY_ROLE } from './screens/SignIn';
import SignUp from './screens/SignUp';
import NotProvisioned from './screens/NotProvisioned';
import Registration from './screens/Registration';
// Sprint 9 pin (specialist 1-on-1 booking) - the frontend lane builds this
// screen in a parallel worktree; imported normally here (per TEAM.md's
// process for exactly this situation, first done for TourStandings/Sprint
// 7) so the route is real the moment both branches merge.
import ParentDashboard from './screens/ParentDashboard';
import AthleteDashboard from './screens/AthleteDashboard';
import { bump } from './hooks/invalidate';

/*
 * Code splitting (2026-09-29): every screen used to ship in one 1.2 MB
 * bundle. The first-visit path stays eager - SignIn, SignUp, Registration,
 * NotProvisioned and the two home dashboards - and everything behind it
 * loads as its own chunk when first routed to. RequireRole renders nothing
 * while the session resolves, so a null Suspense fallback shows no flash.
 * Named exports go through a `.then` that re-exports them as `default`.
 */
const named = (load, name) => lazy(() => load().then((m) => ({ default: m[name] })));
// The review harness imports every screen, so it must be lazy too or it
// drags the whole app back into the first bundle.
const StatesHarness = lazy(() => import('./StatesHarness'));
// One loader per screen module, shared by lazy() and the warm-up below, so
// both hit the same chunk (and webpack's cache) - no new chunk boundaries.
const loadOnboarding = () => import('./screens/OnboardingFlow');
const loadMySchedule = () => import('./screens/MySchedule');
const loadBook = () => import('./screens/BookSession');
const loadCoaching = () => import('./screens/SpecialistBooking');
const loadCoachDashboard = () => import('./screens/CoachDashboard');
const loadRoster = () => import('./screens/Roster');
const loadCapture = () => import('./screens/DiagnosticCapture');
const loadSeason = () => import('./screens/SeasonSchedule');
const loadContract = () => import('./screens/CommitmentContract');
const loadAthleteDetail = () => import('./screens/AthleteDetail');
const loadMembership = () => import('./screens/Membership');
const loadBilling = () => import('./screens/Billing');
const loadSettings = () => import('./screens/NotificationPreferences');
const loadReservations = () => import('./screens/Reservations');
const loadAdmin = () => import('./screens/AdminDashboard');
const loadAdminSignups = () => import('./screens/AdminSignups');
const loadStaff = () => import('./screens/StaffRoles');
const loadTour = () => import('./screens/TourStandings');
const loadSpecialistDay = () => import('./screens/SpecialistDay');

const OnboardingWelcomeRoute = named(loadOnboarding, 'OnboardingWelcomeRoute');
const MySchedule = lazy(loadMySchedule);
const BookSession = lazy(loadBook);
const SpecialistBooking = lazy(loadCoaching);
const CoachDashboard = lazy(loadCoachDashboard);
const Roster = lazy(loadRoster);
const SessionAttendance = named(loadRoster, 'SessionAttendance');
const CaptureFlow = named(loadCapture, 'CaptureFlow');
const SeasonSchedule = lazy(loadSeason);
const CommitmentContract = lazy(loadContract);
const AthleteDetail = lazy(loadAthleteDetail);
const Membership = lazy(loadMembership);
const Billing = lazy(loadBilling);
const NotificationPreferences = lazy(loadSettings);
const Reservations = lazy(loadReservations);
const AdminDashboard = lazy(loadAdmin);
const AdminSignups = lazy(loadAdminSignups);
const StaffRoles = lazy(loadStaff);
const TourStandings = lazy(loadTour);
const SpecialistDay = lazy(loadSpecialistDay);

/*
 * Chunk warm-up (live mode only), keyed on the segment after /portal/.
 * CURRENT: the screen a deep link opens, fetched at mount so its chunk
 * downloads in parallel with auth instead of after RequireRole resolves.
 * NEXT: where a member usually goes from here, fetched 2.5 s after landing
 * (skipped under Save-Data) so the first tap renders without a chunk fetch.
 * Never the review harness or /welcome. A failed fetch is dropped: webpack
 * forgets a failed chunk, so lazy() fetches it again when actually routed.
 */
const CURRENT_ROUTE_CHUNKS = {
  schedule: [loadMySchedule],
  book: [loadBook],
  coaching: [loadCoaching],
  'my-sessions': [loadSpecialistDay],
  contract: [loadContract],
  season: [loadSeason],
  athlete: [loadAthleteDetail],
  billing: [loadBilling],
  // A parent's /membership redirects to Billing; an athlete's stays.
  membership: [loadMembership, loadBilling],
  reservations: [loadReservations],
  tour: [loadTour],
  settings: [loadSettings],
  coach: [loadCoachDashboard],
  roster: [loadRoster],
  attendance: [loadRoster],
  capture: [loadCapture],
  admin: [loadAdmin],
  staff: [loadStaff],
};
const NEXT_ROUTE_CHUNKS = {
  family: [loadBook, loadCoaching, loadBilling, loadAthleteDetail, loadReservations, loadSettings, loadTour],
  home: [loadBook, loadMySchedule, loadContract, loadMembership, loadCoaching, loadSeason, loadSettings, loadTour],
  coach: [loadRoster, loadCapture, loadAthleteDetail, loadTour],
  'my-sessions': [loadRoster],
  admin: [loadAdminSignups, loadBilling, loadAthleteDetail, loadStaff],
};
const NEXT_WARM_DELAY_MS = 2500;
// Own keys only: a junk URL like /portal/constructor must not reach Object.prototype.
// The Contract chunk stays cold while the contract is hidden (data/contractFlag.js).
const routeChunks = (map, segment) =>
  (Object.prototype.hasOwnProperty.call(map, segment) ? map[segment] : [])
    .filter((load) => load !== loadContract || contractEnabled());
const warm = (loads) => loads.forEach((load) => load().catch(() => {}));


/**
 * Portal route tree, mounted under /portal.
 *
 * Screens render with `bare` so they fill the viewport - the 390x812 device
 * bezel in StatesHarness is a review affordance, not part of the app.
 *
 * Routes are role-guarded by <RequireRole> below (Sprint 4). The handoff is
 * explicit that route guarding is not a substitute for server-side checks:
 * every request must re-check the caller's role *and* row-level ownership —
 * firestore.rules is the actual boundary, this is navigation UX.
 */

// Where each role lands lives in ONE place - SignIn exports it (both lanes
// built identical copies in parallel; two role maps is exactly the drift the
// review exists to catch). PortalRoutes already imports SignIn, so the named
// import adds no cycle.

/**
 * Role guard for portal routes: `<RequireRole roles={['athlete', ...]}>`.
 *
 * Live mode: loading → nothing (no flash of a redirect while the session is
 * still resolving); unauthenticated → /portal/signin; signed-in but not
 * provisioned (real Google account, no users/{uid} doc) → the Not Provisioned
 * screen; provisioned with a role this route does not accept → that role's own
 * home, so a shared or stale link lands somewhere useful. An unknown role
 * falls back to Not Provisioned - the account exists but cannot be routed.
 *
 * Seed/demo compatibility: when REACT_APP_PORTAL_LIVE_DATA is not 'true' the
 * portal is the review scaffold - the harness and every screen must keep
 * rendering with no emulator, no network and no signed-in user, so the guard
 * passes everyone through unguarded. Real guarding activates exactly when
 * live data does; the isLive() check is explicit so that coupling is visible.
 * The variant passed below keeps useAuthSession in its demo mode in that
 * case (no auth subscription, no Firestore read); isLive() is a build-time
 * constant, so the hook's mode never flips across renders.
 *
 * `selfManaged` also admits a self-managed athlete (Mike S6 2026-09-30: the
 * 18+ member who signed up for themselves, user.selfManaged) to a payer
 * route; a child's athlete login still gets the role redirect.
 */
export function RequireRole({ roles, selfManaged = false, children }) {
  const live = isLive();
  const { user, provisioned, loading } = useAuthSession(live ? undefined : { variant: 'idle' });

  if (!live) return children;

  if (loading) return null;
  if (!user) return <Navigate to="/portal/signin" replace />;
  if (!provisioned) return <Navigate to="/portal/not-provisioned" replace />;
  const payer = selfManaged && user.role === 'athlete' && user.selfManaged === true;
  if (!roles.includes(user.role) && !payer) {
    return <Navigate to={landingFor(user)} replace />;
  }
  return children;
}

/**
 * Sprint 20 (spec 2.1): /portal/register is instant and signed-in. A
 * provisioned account is redirected to its landing - except a parent who
 * arrived from Settings' "Link another athlete" (navigation state `link`),
 * who gets the athletes-only flow that calls addAthletes.
 */
function RegistrationRoute() {
  const live = isLive();
  const { user, provisioned, loading, refresh } = useAuthSession(live ? undefined : { variant: 'idle' });
  const { state } = useLocation();
  const navigate = useNavigate();
  const linkMode = Boolean(state?.link);
  if (live && loading) return null;
  if (live && !user) return <Navigate to="/portal/signin" replace />;
  if (live && provisioned && !(linkMode && user.role === 'parent')) return <Navigate to={landingFor(user)} replace />;
  return (
    <Registration
      bare
      mode={linkMode ? 'link' : 'signup'}
      account={live ? user : null}
      verifySent={linkMode ? null : state?.verifySent ?? null}
      onRefresh={live ? refresh : undefined}
      onBack={() => navigate(linkMode ? '/portal/settings' : '/portal/signin')}
      onFinish={(path) => navigate(path, { replace: true })}
    />
  );
}

/**
 * Where a signed-in user lands (Sprint 9 amendment v1.7.1): a specialist —
 * any account whose users doc carries specialistId (Yannick, Phil) — lands
 * on their own My Sessions day view; everyone else keeps the Sprint 4
 * role mapping. SignIn.js applies the same override post-login.
 */
function landingFor(user) {
  if (user?.specialistId) return '/portal/my-sessions';
  return LANDING_BY_ROLE[user?.role] || '/portal/not-provisioned';
}

/**
 * The sign-out affordance every signed-in role screen gets (Sprint 5 pin),
 * wired once here rather than copy-pasted per route. Live mode signs out via
 * useAuthSession() and lands on /portal/signin; when the portal is not live
 * this returns undefined, so the demo/harness screens hide the affordance
 * instead of wiring a no-op.
 *
 * Same rules-of-hooks discipline as RequireRole above: isLive() is a
 * build-time constant, so useAuthSession's demo/real mode never flips across
 * renders even though which branch of `live` we act on does.
 */
function useSignOutHandler() {
  const live = isLive();
  const { signOut } = useAuthSession(live ? undefined : { variant: 'idle' });
  const navigate = useNavigate();
  if (!live) return undefined;
  return async () => {
    await signOut();
    navigate('/portal/signin');
  };
}

/**
 * Athlete detail is routed by id (Sprint 5): PortalRoutes reads the param
 * here and passes `athleteId` in as a prop - screens never read route
 * params directly, per the pattern StaffScreen below already follows for
 * local view state.
 *
 * Sprint 10 (pin I): coach joins this route's roles ("Coach roster rows tap
 * through to AthleteDetail" — firestore.rules already scopes a coach's
 * athlete read to their own assigned roster, no rules change needed). Back
 * target is now role-aware, same pattern CoachingRoute already uses below —
 * a coach arriving from Roster must return to /portal/roster, not
 * /portal/family (which every OTHER role here still uses; ops/owner/mental
 * hitting /portal/family bounce via RequireRole's own role-mismatch
 * redirect, a pre-existing wrinkle this change does not touch).
 */
function AthleteDetailRoute() {
  const { athleteId } = useParams();
  const live = isLive();
  const { user } = useAuthSession(live ? undefined : { variant: 'idle' });
  const navigate = useNavigate();
  // Sprint 11 integration: the screen needs the real role (its staff-only
  // membership editor and its tab bar key off it), and staff arrive from a
  // work surface rather than the family home - the back link names it.
  const role = live ? user?.role ?? 'parent' : 'parent';
  const [back, backLabel] =
    role === 'coach'
      ? user?.specialistId
        ? ['/portal/my-sessions', 'My sessions']
        : ['/portal/roster', 'Roster']
      : role === 'ops' || role === 'owner'
      ? ['/portal/admin', 'Admin']
      : role === 'mental'
      ? ['/portal/my-sessions', 'My sessions']
      : ['/portal/family', null];
  return (
    <AthleteDetail
      bare
      athleteId={athleteId}
      role={role}
      backLabel={backLabel}
      onBack={() => navigate(back)}
    />
  );
}

/**
 * Bare /portal: the component-states harness is a REVIEW tool and belongs to
 * seed mode only. In live mode the index redirects like any signed-in
 * surface — role's own landing, or sign-in (QA re-sweep N3: the harness was
 * reachable from the real app shell).
 */
function PortalIndex() {
  const live = isLive();
  const { user, provisioned, loading } = useAuthSession(live ? undefined : { variant: 'idle' });
  if (!live) return <StatesHarness />;
  if (loading) return null;
  if (!user || !provisioned) return <Navigate to="/portal/signin" replace />;
  return <Navigate to={landingFor(user)} replace />;
}

/**
 * Book a Session needs to know whether the caller is a parent (child selector,
 * Sprint 6) — resolved from the live session the same disciplined way
 * RequireRole does it; seed mode stays the athlete flow.
 *
 * Book-for-kid deep link (Sprint 7 pin): a parent's per-kid "Book" action
 * (ParentDashboard's onBookFor, wired below in the route element) navigates
 * here with `{ state: { athleteId } }` so the child selector opens already
 * pointed at that kid instead of defaulting to whichever child sorts first.
 * Read from navigation state, never a route param — matches this file's
 * existing AthleteDetailRoute/SessionAttendanceRoute convention of resolving
 * routing-only facts here and passing plain props down.
 */
function BookSessionRoute() {
  const live = isLive();
  const { user } = useAuthSession(live ? undefined : { variant: 'idle' });
  const { state } = useLocation();
  const navigate = useNavigate();
  const role = live && user?.role === 'parent' ? 'parent' : 'athlete';
  // Back lands on the role's own home, not the athlete schedule for a parent.
  const back = role === 'parent' ? '/portal/family' : '/portal/schedule';
  return (
    <BookSession
      bare
      role={role}
      initialAthleteId={state?.athleteId ?? undefined}
      onBack={() => navigate(back)}
    />
  );
}

/**
 * Specialist 1-on-1 booking (Sprint 9 pin, contract v1.7) — athlete + parent
 * both reach this screen, same role resolution BookSessionRoute above uses
 * (seed mode stays the athlete flow; live mode reads the signed-in user's
 * real role). Parent deep link — a future ParentDashboard "Book 1-on-1
 * coaching" action (frontend lane) — carries `{ state: { athleteId } }`
 * exactly like /portal/book, so the child selector opens already pointed at
 * that kid instead of defaulting to whichever child sorts first.
 */
function CoachingRoute() {
  const live = isLive();
  const { user } = useAuthSession(live ? undefined : { variant: 'idle' });
  const { state } = useLocation();
  const navigate = useNavigate();
  const role = live && user?.role === 'parent' ? 'parent' : 'athlete';
  // Role-aware back (routing lane's flagged judgment call, resolved at PM
  // integration): a parent came from Family, an athlete from Home.
  const back = role === 'parent' ? '/portal/family' : '/portal/home';
  return (
    <SpecialistBooking
      bare
      role={role}
      initialAthleteId={state?.athleteId ?? undefined}
      initialSpecialist={state?.specialistId ?? undefined}
      onBack={() => navigate(back)}
    />
  );
}

/**
 * The specialist's own day view (Sprint 9 amendment v1.7.1). Identity comes
 * from the users doc: Yannick's specialistId is 'mental', Phil's 'phil'.
 * ops/owner have none and get the in-screen switcher instead. A coach with
 * no specialist link has no business here and goes to their own dashboard.
 * Tapping a session opens the SAME attendance screen coaches use, with the
 * session's real facts as navigation state and this view as the way back.
 */
/**
 * The admin dashboard picks its staff tab set from the signed-in role
 * (Sprint 10 pin F) — resolved here, the way every other role-aware route
 * in this file does it; seed mode stays the owner default.
 */
/**
 * Staff view of one household's Billing hub (Sprint 17, contract v2.5):
 * the same page the parent sees, read-only, for ops/owner.
 */
function StaffBillingRoute() {
  const { householdId } = useParams();
  const live = isLive();
  const { user } = useAuthSession(live ? undefined : { variant: 'idle' });
  const navigate = useNavigate();
  const role = (live && user?.role) || 'owner';
  return (
    <Billing
      bare
      staff
      role={role}
      householdId={householdId}
      onBack={() => navigate('/portal/admin')}
      onRetry={() => bump('billing')}
    />
  );
}

function AdminRoute({ onOpenAthlete, onSignOut }) {
  const live = isLive();
  const { user } = useAuthSession(live ? undefined : { variant: 'idle' });
  const navigate = useNavigate();
  const role = (live && user?.role) || 'owner';
  return (
    <AdminDashboard
      bare
      role={role}
      onOpenAthlete={onOpenAthlete}
      onOpenHousehold={(id) => navigate(`/portal/admin/households/${id}`)}
      onOpenSignups={() => navigate('/portal/admin/signups')}
      onSignOut={onSignOut}
    />
  );
}

/** Sprint 20 (spec 7): the sign-ups report; a row opens that household's staff billing view. */
function SignupsRoute() {
  const live = isLive();
  const { user } = useAuthSession(live ? undefined : { variant: 'idle' });
  const navigate = useNavigate();
  return (
    <AdminSignups bare role={(live && user?.role) || 'owner'} onBack={() => navigate('/portal/admin')}
      onOpenHousehold={(id) => navigate(`/portal/admin/households/${id}`)} />
  );
}

function SpecialistDayRoute({ onSignOut }) {
  const live = isLive();
  const { user, loading } = useAuthSession(live ? undefined : { variant: 'idle' });
  const navigate = useNavigate();
  const specialistId = (live && user?.specialistId) || (!live ? 'mental' : null);
  const canSwitch = live && !user?.specialistId && ['ops', 'owner'].includes(user?.role ?? '');
  // This route's OWN auth subscription starts loading even after
  // RequireRole's finished — deciding (and redirecting) off a still-null
  // user looped Navigate against RequireRole's own redirect (integration
  // browser pass: "maximum update depth exceeded"). Wait like RequireRole.
  if (live && loading) return null;
  if (live && !specialistId && !canSwitch) return <Navigate to="/portal/tour" replace />;
  return (
    <SpecialistDay
      bare
      role={(live && user?.role) || 'mental'}
      specialistId={specialistId ?? undefined}
      canSwitch={canSwitch}
      onSignOut={onSignOut}
      onOpenSession={(s) =>
        navigate('/portal/attendance', {
          state: {
            sessionId: s.sessionId,
            backTo: '/portal/my-sessions',
            block: {
              date: s.date,
              time: s.time ?? null,
              type: s.type ?? null,
              name: null,
              meta: null,
              durationMinutes: s.durationMinutes ?? null,
            },
          },
        })
      }
    />
  );
}

/**
 * The Tour is the one route every role reaches, but TourStandings renders a
 * role-appropriate bottom tab bar (athlete and parent have one; staff roles
 * do not) — so the signed-in role has to reach it as a prop. Resolved from
 * the live session exactly the way BookSessionRoute above does it; seed mode
 * stays the athlete default the harness already exercises.
 */
function TourRoute({ onSignOut }) {
  const live = isLive();
  const { user } = useAuthSession(live ? undefined : { variant: 'idle' });
  const role = (live && user?.role) || 'athlete';
  // Sprint 8: an athlete's own athleteId (from their users doc) default-
  // selects their bracket and unlocks the "Your results" history card;
  // every other role browses brackets with no personal view.
  const athleteId = live && user?.role === 'athlete' ? user?.athleteId ?? undefined : undefined;
  return <TourStandings bare role={role} athleteId={athleteId} onSignOut={onSignOut} />;
}

/**
 * The coach's tapped block travels to the attendance screen as navigation
 * state — CoachDashboard hands `{ ...block, blockIndex }` to onOpenRoster,
 * and SessionAttendance takes `sessionId` (live) / `blockIndex` (seed).
 * Without this thread-through every tap landed on the default block (QA #6).
 */
function CoachDashboardRoute({ onSignOut, onOpenAthlete }) {
  const navigate = useNavigate();
  return (
    <CoachDashboard
      bare
      onSignOut={onSignOut}
      onOpenAthlete={onOpenAthlete}
      onOpenRoster={(block) =>
        navigate('/portal/attendance', {
          state: {
            blockIndex: block?.blockIndex ?? null,
            sessionId: block?.sessionId ?? null,
            // The tapped block's display facts, so the attendance header
            // describes the REAL session rather than the seed default
            // (QA 2026-09-08, blocker #1). Seed blocks (no sessionId) keep
            // the seed header via blockIndex.
            block: block?.sessionId
              ? {
                  date: block.date ?? String(block.sessionId).slice(0, 10),
                  time: block.time ?? null,
                  type: block.type ?? null,
                  name: block.name ?? null,
                  meta: block.meta ?? null,
                  durationMinutes: block.durationMinutes ?? null,
                }
              : null,
          },
        })
      }
    />
  );
}

function SessionAttendanceRoute({ onBack }) {
  const { state } = useLocation();
  const navigate = useNavigate();
  // Sprint 13 pin E: "Cancel session" is ops/owner-only, so the screen needs
  // the signed-in role (the coach default keeps every existing caller as is).
  const live = isLive();
  const { user } = useAuthSession(live ? undefined : { variant: 'idle' });
  const role = live ? user?.role ?? 'coach' : 'coach';
  // v1.7.1: a specialist arrives from /portal/my-sessions and must return
  // there, not to the golf coach's dashboard — the caller says so via
  // navigation state; the coach flow's fixed back target is unchanged.
  const back = state?.backTo ? () => navigate(state.backTo) : onBack;
  return (
    <SessionAttendance
      bare
      onBack={back}
      blockIndex={state?.blockIndex ?? undefined}
      sessionId={state?.sessionId ?? undefined}
      block={state?.block ?? undefined}
      role={role}
    />
  );
}


/**
 * Membership is reachable by both parent and athlete (Sprint 11 pin D) —
 * same role resolution BookSessionRoute/CoachingRoute above use; back target
 * is role-aware the same way AthleteDetailRoute's is, mirroring this file's
 * own established precedent rather than inventing a new pattern.
 */
function MembershipRoute() {
  const live = isLive();
  const { user, loading } = useAuthSession(live ? undefined : { variant: 'idle' });
  const navigate = useNavigate();
  // Sprint 17 fix: decide the role only once the session has resolved - an
  // athlete arriving while the session user was still null was read as a parent,
  // redirected to Billing, and bounced home by that route's RequireRole.
  if (live && loading) return null;
  const role = live && user?.role === 'athlete' ? 'athlete' : 'parent';
  // Sprint 16: a parent's membership view IS the Billing hub.
  if (role === 'parent') return <Navigate to="/portal/billing" replace />;
  return <Membership bare role={role} selfManaged={live && user?.selfManaged === true} onBack={() => navigate('/portal/home')} />;
}

/**
 * Billing's payer: a parent, or a self-managed athlete (Mike S6 2026-09-30),
 * whose hub is their own one-member household under the athlete tab bar.
 * Waits for the session like MembershipRoute, so no parent tab bar flashes.
 */
function BillingRoute() {
  const live = isLive();
  const { user, loading } = useAuthSession(live ? undefined : { variant: 'idle' });
  if (live && loading) return null;
  const role = live && user?.role === 'athlete' ? 'athlete' : 'parent';
  return <Billing bare role={role} onRetry={() => bump('billing')} />;
}

/**
 * Settings is reachable by parent and athlete (Sprint 11 pin D: the
 * Membership row serves both) - same role resolution as MembershipRoute.
 */
function SettingsRoute({ onSignOut, onLinkAthlete }) {
  const live = isLive();
  const { user } = useAuthSession(live ? undefined : { variant: 'idle' });
  const role = live && user?.role === 'athlete' ? 'athlete' : 'parent';
  return <NotificationPreferences bare role={role} onSignOut={onSignOut} onLinkAthlete={onLinkAthlete} />;
}

/**
 * Staff & Roles flips between its list and add-member views in place - the add
 * view is a step of the same owner task, not a separate destination, so it is
 * local state rather than a route. Its back affordance previously pointed at
 * /portal/staff, which is this route: a self-navigation that could never leave
 * the view it was trying to leave.
 */
function StaffScreen({ onSignOut }) {
  const [adding, setAdding] = useState(false);
  return (
    <StaffRoles
      bare
      variant={adding ? 'add' : 'populated'}
      onAdd={() => setAdding(true)}
      onBack={() => setAdding(false)}
      onSignOut={onSignOut}
    />
  );
}

export default function PortalRoutes() {
  const navigate = useNavigate();
  const go = (path) => () => navigate(path);
  const onSignOut = useSignOutHandler();
  const openAthlete = (athleteId) => navigate(`/portal/athlete/${athleteId}`);
  const segment = useLocation().pathname.split('/')[2] || '';

  // Mount only: the chunk for the screen this page load opened on.
  useEffect(() => {
    if (isLive()) warm(routeChunks(CURRENT_ROUTE_CHUNKS, segment));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const next = routeChunks(NEXT_ROUTE_CHUNKS, segment);
    if (!next.length || !isLive() || navigator.connection?.saveData) return undefined;
    const timer = setTimeout(() => warm(next), NEXT_WARM_DELAY_MS);
    return () => clearTimeout(timer);
  }, [segment]);

  return (
    <Suspense fallback={null}>
    <Routes>
      <Route index element={<PortalIndex />} />

      <Route
        path="signin"
        element={<SignIn bare onStartEnrollment={go('/portal/signup')} />}
      />
      <Route path="signup" element={<SignUp bare onSignIn={go('/portal/signin')} />} />
      <Route path="register" element={<RegistrationRoute />} />
      {/* Onboarding walkthrough (Sprint 3) — frontend lane's one route line, per the PM exception in TEAM.md. */}
      <Route path="welcome" element={<OnboardingWelcomeRoute />} />
      {/* Signed in with a real Google account but no users/{uid} doc yet — the
          guard's landing for unprovisioned accounts. Public by necessity: the
          people sent here are exactly those with no role. Screen is the
          frontend lane's pinned NotProvisioned (Sprint 4); Sprint 10 (contract
          v1.8, A) has it read the caller's own enrollmentRequest state
          (useEnrollment(), routing-owned) and offer /portal/register as the
          "start enrollment" move — onStartEnrollment mirrors SignIn's
          existing onStartEnrollment prop below. */}
      <Route
        path="not-provisioned"
        element={<NotProvisioned bare onStartEnrollment={go('/portal/register')} />}
      />

      {/* Athlete — athlete-only, except Book a Session which parents also use
          to book for a linked athlete (Sprint 4 pin). */}
      <Route
        path="home"
        element={
          <RequireRole roles={['athlete']}>
            <AthleteDashboard
              bare
              onLog={go('/portal/contract')}
              onBook={go('/portal/book')}
              onSignOut={onSignOut}
            />
          </RequireRole>
        }
      />
      <Route
        path="schedule"
        element={
          <RequireRole roles={['athlete']}>
            <MySchedule bare onBook={go('/portal/book')} />
          </RequireRole>
        }
      />
      <Route
        path="book"
        element={
          <RequireRole roles={['athlete', 'parent']}>
            <BookSessionRoute />
          </RequireRole>
        }
      />
      {/* Specialist 1-on-1s (Sprint 9 pin): athlete Home's action card and
          ParentDashboard's full-width action both land here, same as
          /portal/book above - back is pinned to /portal/home for both
          entry roles, mirroring this file's existing precedent of one fixed
          back target regardless of which role's screen sent the caller
          (AthleteDetailRoute/BookSessionRoute do the same). */}
      <Route
        path="coaching"
        element={
          <RequireRole roles={['athlete', 'parent']}>
            <CoachingRoute />
          </RequireRole>
        }
      />
      {/* The specialist's own booked-session view (v1.7.1): Yannick and
          Phil land here after sign-in; ops/owner reach it with the
          in-screen specialist switcher. */}
      <Route
        path="my-sessions"
        element={
          <RequireRole roles={['coach', 'mental', 'ops', 'owner']}>
            <SpecialistDayRoute onSignOut={onSignOut} />
          </RequireRole>
        }
      />
      {/* Hidden until closer to launch (owner, 2026-09-30): a stale link
          goes through the index, which lands the account on its own home. */}
      <Route
        path="contract"
        element={
          contractEnabled() ? (
            <RequireRole roles={['athlete']}>
              <CommitmentContract bare />
            </RequireRole>
          ) : (
            <Navigate to="/portal" replace />
          )
        }
      />
      {/* Practice DNA is turned off for players (owner's call, 2026-09-01);
          the screen survives in the harness for the future staff flow. */}
      <Route path="dna" element={<Navigate to="/portal/home" replace />} />
      <Route
        path="season"
        element={
          <RequireRole roles={['athlete']}>
            <SeasonSchedule bare />
          </RequireRole>
        }
      />

      {/* Parent */}
      <Route
        path="family"
        element={
          <RequireRole roles={['parent']}>
            <ParentDashboard
              bare
              onOpenAthlete={openAthlete}
              onSignOut={onSignOut}
            />
          </RequireRole>
        }
      />
      {/* Athlete detail is routed by id (Sprint 5): parents reach their own
          household's athletes; staff (ops/owner/mental) reach any athlete —
          admin names link to profiles from the same route. */}
      <Route
        path="athlete/:athleteId"
        element={
          <RequireRole roles={['parent', 'coach', 'ops', 'owner', 'mental']}>
            <AthleteDetailRoute />
          </RequireRole>
        }
      />
      {/* The old bare /portal/athlete has no id to resolve — redirect rather
          than render a screen that can no longer pick an athlete for itself. */}
      <Route path="athlete" element={<Navigate to="/portal/family" replace />} />
      {/* Billing is still parked as its OWN concept (no Stripe, no amounts
          due) — but Sprint 11 pin D replaces it with Membership, a real
          screen showing what each package ENTITLES an athlete to. The
          redirect now lands there instead of /portal/family (superseding
          the Sprint 7 redirect); the Billing.js screen itself stays
          unrouted in the harness, untouched, per that same Sprint 7 ruling
          — this is a redirect-target change only, not a Billing revival. */}
      {/* Billing (Sprint 16, contract v2.4): the parents' hub - how many
          tokens are left, per athlete, and the membership's standing. Parent,
          plus the self-managed 18+ athlete who pays for themselves (Mike S6
          2026-09-30); a child's login keeps Membership below. */}
      <Route
        path="billing"
        element={
          <RequireRole roles={['parent']} selfManaged>
            <BillingRoute />
          </RequireRole>
        }
      />
      {/* Membership (Sprint 11 pin D, contract v1.9): parent + athlete both
          reach it — same role resolution this file's other dual-role routes
          use (BookSessionRoute, CoachingRoute). Screen: screens/Membership.js (frontend
          lane, merged at Sprint 11 integration). */}
      <Route
        path="membership"
        element={
          <RequireRole roles={['parent', 'athlete']}>
            <MembershipRoute />
          </RequireRole>
        }
      />
      {/* Family Reservations (Sprint 11 pin F, contract v1.9): parent only —
          the family-grouped view the owner's Life Time reference showed, one
          section per household member. Screen: screens/Reservations.js (frontend
          lane, merged at Sprint 11 integration). */}
      <Route
        path="reservations"
        element={
          <RequireRole roles={['parent']}>
            <Reservations bare onBook={go('/portal/book')} />
          </RequireRole>
        }
      />
      {/* RYP Tour (Sprint 7 pin): the weekend-tournament leaderboard, open to
          every signed-in portal role - standings are academy-public
          (contract v1.5), so this is the one route in this file with the
          full role list rather than a role-scoped subset. */}
      <Route
        path="tour"
        element={
          <RequireRole roles={['athlete', 'parent', 'coach', 'mental', 'ops', 'owner']}>
            <TourRoute onSignOut={onSignOut} />
          </RequireRole>
        }
      />
      <Route
        path="settings"
        element={
          <RequireRole roles={['parent', 'athlete']}>
            {/* Sprint 20 (spec 2.3): Link another athlete opens Registration's
                link mode (athletes -> package -> addAthletes). */}
            <SettingsRoute onSignOut={onSignOut} onLinkAthlete={() => navigate('/portal/register', { state: { link: true } })} />
          </RequireRole>
        }
      />

      {/* Coach. A block's "Start session" opens the IN/OUT attendance flow
          (SessionAttendance, handoff screen 13); the bottom tab's Roster is
          the full assigned-athlete list — two different jobs, two routes. */}
      <Route
        path="coach"
        element={
          <RequireRole roles={['coach']}>
            <CoachDashboardRoute onSignOut={onSignOut} onOpenAthlete={openAthlete} />
          </RequireRole>
        }
      />
      <Route
        path="roster"
        element={
          <RequireRole roles={['coach']}>
            <Roster bare onSignOut={onSignOut} onOpenAthlete={openAthlete} />
          </RequireRole>
        }
      />
      {/* v1.7.1: specialists (mental, and ops/owner oversight) run
          attendance on their own sessions through this same screen. */}
      <Route
        path="attendance"
        element={
          <RequireRole roles={['coach', 'mental', 'ops', 'owner']}>
            <SessionAttendanceRoute onBack={go('/portal/coach')} />
          </RequireRole>
        }
      />
      <Route
        path="capture"
        element={
          <RequireRole roles={['coach']}>
            {/* Roster-first: pick the kid, then capture (owner's flow). */}
            <CaptureFlow bare onCancel={go('/portal/coach')} />
          </RequireRole>
        }
      />

      {/* Staff — admin admits every staff role's read surface; Staff & Roles
          is owner-only. */}
      <Route
        path="admin"
        element={
          <RequireRole roles={['ops', 'owner']}>
            <AdminRoute onOpenAthlete={openAthlete} onSignOut={onSignOut} />
          </RequireRole>
        }
      />
      {/* Staff billing view (Sprint 17, contract v2.5): the same hub a
          parent sees, for any household, read-only. */}
      <Route
        path="admin/households/:householdId"
        element={
          <RequireRole roles={['ops', 'owner']}>
            <StaffBillingRoute />
          </RequireRole>
        }
      />
      <Route
        path="admin/signups"
        element={
          <RequireRole roles={['ops', 'owner']}>
            <SignupsRoute />
          </RequireRole>
        }
      />
      <Route
        path="staff"
        element={
          <RequireRole roles={['owner']}>
            {/* Sprint 10 (pin F): the scan found Staff & Roles with no
                sign-out affordance — the handler is threaded through here;
                rendering the button is the frontend lane's StaffRoles change. */}
            <StaffScreen onSignOut={onSignOut} />
          </RequireRole>
        }
      />
      {/* K18: an unknown path lands on the index, which sends a signed-in
          account home and everyone else to sign-in. */}
      <Route path="*" element={<Navigate to="/portal" replace />} />
    </Routes>
    </Suspense>
  );
}
