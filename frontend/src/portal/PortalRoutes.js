import React, { useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';

import useAuthSession from './hooks/useAuthSession';
import { isLive } from './hooks/live';
import StatesHarness from './StatesHarness';
import SignIn, { LANDING_BY_ROLE } from './screens/SignIn';
import NotProvisioned from './screens/NotProvisioned';
import Registration from './screens/Registration';
import { OnboardingWelcomeRoute } from './screens/OnboardingFlow';
import MySchedule from './screens/MySchedule';
import BookSession from './screens/BookSession';
// Sprint 9 pin (specialist 1-on-1 booking) - the frontend lane builds this
// screen in a parallel worktree; imported normally here (per TEAM.md's
// process for exactly this situation, first done for TourStandings/Sprint
// 7) so the route is real the moment both branches merge.
import SpecialistBooking from './screens/SpecialistBooking';
import ParentDashboard from './screens/ParentDashboard';
import CoachDashboard from './screens/CoachDashboard';
import Roster, { SessionAttendance } from './screens/Roster';
import { CaptureFlow } from './screens/DiagnosticCapture';
import AthleteDashboard from './screens/AthleteDashboard';
import SeasonSchedule from './screens/SeasonSchedule';
import CommitmentContract from './screens/CommitmentContract';
import AthleteDetail from './screens/AthleteDetail';
import NotificationPreferences from './screens/NotificationPreferences';
import AdminDashboard from './screens/AdminDashboard';
import StaffRoles from './screens/StaffRoles';
import NewsletterComposer from './screens/NewsletterComposer';
import TourStandings from './screens/TourStandings';
import SpecialistDay from './screens/SpecialistDay';

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
 */
export function RequireRole({ roles, children }) {
  const live = isLive();
  const { user, provisioned, loading } = useAuthSession(live ? undefined : { variant: 'idle' });

  if (!live) return children;

  if (loading) return null;
  if (!user) return <Navigate to="/portal/signin" replace />;
  if (!provisioned) return <Navigate to="/portal/not-provisioned" replace />;
  if (!roles.includes(user.role)) {
    return <Navigate to={landingFor(user)} replace />;
  }
  return children;
}

/**
 * Signed-in-only guard, for routes that must NOT be reachable signed out but
 * that every signed-in account may reach regardless of role or provisioned
 * status (Sprint 10, contract v1.8 A): /portal/register. Unlike RequireRole
 * this never checks `provisioned` or a role list — an unprovisioned account
 * is exactly who this route exists for (the whole point of the enrollment
 * self-serve path), and a provisioned parent reaches it too, deliberately
 * (NotificationPreferences' existing "Link another athlete" row already
 * navigates here for that account).
 *
 * DEVIATION FLAGGED: /portal/register was previously reachable signed OUT
 * (no guard at all) - submit() would have failed anyway (it requires
 * requireUser()), but the page itself rendered for anyone. This tightens it
 * to match the pin's "A new family signs in..., is unprovisioned, and is
 * routed to /portal/register" framing (sign-in comes first), consistent
 * with useEnrollment()'s own identity requirement.
 */
function RequireSignedIn({ children }) {
  const live = isLive();
  const { user, loading } = useAuthSession(live ? undefined : { variant: 'idle' });
  if (!live) return children;
  if (loading) return null;
  if (!user) return <Navigate to="/portal/signin" replace />;
  return children;
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
  const back = live && user?.role === 'coach' ? '/portal/roster' : '/portal/family';
  return <AthleteDetail bare athleteId={athleteId} onBack={() => navigate(back)} />;
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
function BookSessionRoute({ onBack }) {
  const live = isLive();
  const { user } = useAuthSession(live ? undefined : { variant: 'idle' });
  const { state } = useLocation();
  const role = live && user?.role === 'parent' ? 'parent' : 'athlete';
  return (
    <BookSession
      bare
      role={role}
      initialAthleteId={state?.athleteId ?? undefined}
      onBack={onBack}
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
function AdminRoute({ onOpenAthlete, onSignOut }) {
  const live = isLive();
  const { user } = useAuthSession(live ? undefined : { variant: 'idle' });
  const role = (live && user?.role) || 'owner';
  return <AdminDashboard bare role={role} onOpenAthlete={onOpenAthlete} onSignOut={onSignOut} />;
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
  if (live && !specialistId && !canSwitch) return <Navigate to="/portal/coach" replace />;
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
    />
  );
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

  return (
    <Routes>
      <Route index element={<PortalIndex />} />

      <Route
        path="signin"
        element={<SignIn bare onStartEnrollment={go('/portal/register')} />}
      />
      <Route
        path="register"
        element={
          // Sprint 10 (contract v1.8, A): signed-in-only now (RequireSignedIn
          // above) — an unprovisioned account reaches this from
          // NotProvisioned's "start enrollment" CTA (below), and a
          // provisioned parent reaches it from Settings' existing "Link
          // another athlete" row. The person finishing enrollment is a
          // guardian by definition, so the walkthrough opens on the parent
          // track rather than the chooser.
          <RequireSignedIn>
            <Registration bare onBack={go('/portal/signin')} onFinish={go('/portal/welcome?track=parent')} />
          </RequireSignedIn>
        }
      />
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
            <BookSessionRoute onBack={go('/portal/schedule')} />
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
      <Route
        path="contract"
        element={
          <RequireRole roles={['athlete']}>
            <CommitmentContract bare />
          </RequireRole>
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
              // Book-for-kid deep link (Sprint 7 pin): each kid card's Book
              // action carries the chosen athleteId as navigation state, so
              // BookSessionRoute can pass it through as initialAthleteId
              // instead of BookSession defaulting to the household's first
              // child. Many kids never get their own login - this is the
              // first-class path for a parent booking on their behalf.
              onBookFor={(athleteId) => navigate('/portal/book', { state: { athleteId } })}
              // Sprint 9: one full-width coaching action under the kid
              // cards; SpecialistBooking carries its own child selector.
              onBookCoaching={() => navigate('/portal/coaching')}
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
      {/* Billing is parked (Sprint 7 owner ruling: energy goes to features,
          not billing, for now). The route survives only as a redirect so an
          old bookmark or the Stripe return URL still lands somewhere real;
          the screen itself stays in the harness for that eventual Stripe
          return, imported there directly rather than from here (no
          RequireRole needed - a bare redirect, same as the legacy
          bare-/portal/athlete redirect above). */}
      <Route path="billing" element={<Navigate to="/portal/family" replace />} />
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
          <RequireRole roles={['parent']}>
            {/* Link-another-athlete opens enrollment until screen 08·L (the
                add-a-child-to-this-household flow) is built — swap then. */}
            <NotificationPreferences
              bare
              onSignOut={onSignOut}
              onLinkAthlete={go('/portal/register')}
            />
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
          is owner-only; the newsletter is ops/owner. */}
      <Route
        path="admin"
        element={
          <RequireRole roles={['ops', 'owner', 'mental']}>
            <AdminRoute onOpenAthlete={openAthlete} onSignOut={onSignOut} />
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
      <Route
        path="newsletter"
        element={
          <RequireRole roles={['ops', 'owner']}>
            {/* Parked (Sprint 10): stays out of every tab set (frontend's
                TABS), but a direct hit still gets a working sign-out. */}
            <NewsletterComposer bare onSignOut={onSignOut} />
          </RequireRole>
        }
      />
    </Routes>
  );
}
