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
import ParentDashboard from './screens/ParentDashboard';
import CoachDashboard from './screens/CoachDashboard';
import Roster, { SessionAttendance } from './screens/Roster';
import { CaptureFlow } from './screens/DiagnosticCapture';
import AthleteDashboard from './screens/AthleteDashboard';
import SeasonSchedule from './screens/SeasonSchedule';
import CommitmentContract from './screens/CommitmentContract';
import AthleteDetail from './screens/AthleteDetail';
import Billing from './screens/Billing';
import NotificationPreferences from './screens/NotificationPreferences';
import AdminDashboard from './screens/AdminDashboard';
import StaffRoles from './screens/StaffRoles';
import NewsletterComposer from './screens/NewsletterComposer';

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
    return <Navigate to={LANDING_BY_ROLE[user.role] || '/portal/not-provisioned'} replace />;
  }
  return children;
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
 */
function AthleteDetailRoute({ onBack }) {
  const { athleteId } = useParams();
  return <AthleteDetail bare athleteId={athleteId} onBack={onBack} />;
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
  return <Navigate to={LANDING_BY_ROLE[user.role] || '/portal/not-provisioned'} replace />;
}

/**
 * Book a Session needs to know whether the caller is a parent (child selector,
 * Sprint 6) — resolved from the live session the same disciplined way
 * RequireRole does it; seed mode stays the athlete flow.
 */
function BookSessionRoute({ onBack }) {
  const live = isLive();
  const { user } = useAuthSession(live ? undefined : { variant: 'idle' });
  const role = live && user?.role === 'parent' ? 'parent' : 'athlete';
  return <BookSession bare role={role} onBack={onBack} />;
}

/**
 * The coach's tapped block travels to the attendance screen as navigation
 * state — CoachDashboard hands `{ ...block, blockIndex }` to onOpenRoster,
 * and SessionAttendance takes `sessionId` (live) / `blockIndex` (seed).
 * Without this thread-through every tap landed on the default block (QA #6).
 */
function CoachDashboardRoute({ onSignOut }) {
  const navigate = useNavigate();
  return (
    <CoachDashboard
      bare
      onSignOut={onSignOut}
      onOpenRoster={(block) =>
        navigate('/portal/attendance', {
          state: { blockIndex: block?.blockIndex ?? null, sessionId: block?.sessionId ?? null },
        })
      }
    />
  );
}

function SessionAttendanceRoute({ onBack }) {
  const { state } = useLocation();
  return (
    <SessionAttendance
      bare
      onBack={onBack}
      blockIndex={state?.blockIndex ?? undefined}
      sessionId={state?.sessionId ?? undefined}
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
function StaffScreen() {
  const [adding, setAdding] = useState(false);
  return (
    <StaffRoles
      bare
      variant={adding ? 'add' : 'populated'}
      onAdd={() => setAdding(true)}
      onBack={() => setAdding(false)}
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
          // The person finishing enrollment is a guardian by definition, so
          // the walkthrough opens on the parent track rather than the chooser.
          <Registration bare onBack={go('/portal/signin')} onFinish={go('/portal/welcome?track=parent')} />
        }
      />
      {/* Onboarding walkthrough (Sprint 3) — frontend lane's one route line, per the PM exception in TEAM.md. */}
      <Route path="welcome" element={<OnboardingWelcomeRoute />} />
      {/* Signed in with a real Google account but no users/{uid} doc yet — the
          guard's landing for unprovisioned accounts. Public by necessity: the
          people sent here are exactly those with no role. Screen is the
          frontend lane's pinned NotProvisioned (Sprint 4). */}
      <Route path="not-provisioned" element={<NotProvisioned bare />} />

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
            <ParentDashboard bare onOpenAthlete={openAthlete} onSignOut={onSignOut} />
          </RequireRole>
        }
      />
      {/* Athlete detail is routed by id (Sprint 5): parents reach their own
          household's athletes; staff (ops/owner/mental) reach any athlete —
          admin names link to profiles from the same route. */}
      <Route
        path="athlete/:athleteId"
        element={
          <RequireRole roles={['parent', 'ops', 'owner', 'mental']}>
            <AthleteDetailRoute onBack={go('/portal/family')} />
          </RequireRole>
        }
      />
      {/* The old bare /portal/athlete has no id to resolve — redirect rather
          than render a screen that can no longer pick an athlete for itself. */}
      <Route path="athlete" element={<Navigate to="/portal/family" replace />} />
      <Route
        path="billing"
        element={
          <RequireRole roles={['parent']}>
            <Billing bare />
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
            <CoachDashboardRoute onSignOut={onSignOut} />
          </RequireRole>
        }
      />
      <Route
        path="roster"
        element={
          <RequireRole roles={['coach']}>
            <Roster bare onBack={go('/portal/coach')} />
          </RequireRole>
        }
      />
      <Route
        path="attendance"
        element={
          <RequireRole roles={['coach']}>
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
            <AdminDashboard bare onOpenAthlete={openAthlete} onSignOut={onSignOut} />
          </RequireRole>
        }
      />
      <Route
        path="staff"
        element={
          <RequireRole roles={['owner']}>
            <StaffScreen />
          </RequireRole>
        }
      />
      <Route
        path="newsletter"
        element={
          <RequireRole roles={['ops', 'owner']}>
            <NewsletterComposer bare />
          </RequireRole>
        }
      />
    </Routes>
  );
}
