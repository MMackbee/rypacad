import React, { useState } from 'react';
import { Route, Routes, useNavigate } from 'react-router-dom';

import StatesHarness from './StatesHarness';
import SignIn from './screens/SignIn';
import Registration from './screens/Registration';
import MySchedule from './screens/MySchedule';
import BookSession from './screens/BookSession';
import ParentDashboard from './screens/ParentDashboard';
import CoachDashboard from './screens/CoachDashboard';
import Roster from './screens/Roster';
import DiagnosticCapture from './screens/DiagnosticCapture';
import AthleteDashboard from './screens/AthleteDashboard';
import PracticeDNA from './screens/PracticeDNA';
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
 * These routes are deliberately unguarded for now. Wiring them behind the
 * existing ProtectedRoute is part of the integration pass, and the handoff is
 * explicit that route guarding is not a substitute for server-side checks:
 * every request must re-check the caller's role *and* row-level ownership.
 */

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

  return (
    <Routes>
      <Route index element={<StatesHarness />} />

      <Route
        path="signin"
        element={<SignIn bare onStartEnrollment={go('/portal/register')} />}
      />
      <Route
        path="register"
        element={<Registration bare onBack={go('/portal/signin')} onFinish={go('/portal/family')} />}
      />

      {/* Athlete */}
      <Route
        path="home"
        element={
          <AthleteDashboard bare onLog={go('/portal/contract')} onBook={go('/portal/book')} />
        }
      />
      <Route path="schedule" element={<MySchedule bare onBook={go('/portal/book')} />} />
      <Route path="book" element={<BookSession bare onBack={go('/portal/schedule')} />} />
      <Route path="contract" element={<CommitmentContract bare />} />
      <Route path="dna" element={<PracticeDNA bare />} />

      {/* Parent */}
      <Route
        path="family"
        element={<ParentDashboard bare onOpenAthlete={() => navigate('/portal/athlete')} />}
      />
      <Route path="athlete" element={<AthleteDetail bare onBack={go('/portal/family')} />} />
      <Route path="billing" element={<Billing bare />} />
      <Route path="settings" element={<NotificationPreferences bare />} />

      {/* Coach */}
      <Route
        path="coach"
        element={<CoachDashboard bare onOpenRoster={go('/portal/roster')} />}
      />
      <Route path="roster" element={<Roster bare onBack={go('/portal/coach')} />} />
      <Route path="capture" element={<DiagnosticCapture bare onCancel={go('/portal/coach')} />} />

      {/* Ops / owner */}
      <Route path="admin" element={<AdminDashboard bare />} />
      <Route path="staff" element={<StaffScreen />} />
      <Route path="newsletter" element={<NewsletterComposer bare />} />
    </Routes>
  );
}
