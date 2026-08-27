import React from 'react';
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

      <Route path="schedule" element={<MySchedule bare onBook={go('/portal/book')} />} />
      <Route path="book" element={<BookSession bare onBack={go('/portal/schedule')} />} />

      <Route path="family" element={<ParentDashboard bare />} />

      <Route
        path="coach"
        element={<CoachDashboard bare onOpenRoster={go('/portal/roster')} />}
      />
      <Route path="roster" element={<Roster bare onBack={go('/portal/coach')} />} />
      <Route path="capture" element={<DiagnosticCapture bare onCancel={go('/portal/coach')} />} />
    </Routes>
  );
}
