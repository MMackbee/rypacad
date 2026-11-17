// src/App.js

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import PortalRoutes from './portal/PortalRoutes';
import { isLive } from './portal/hooks/live';
import { LaunchRedirect } from './portal/components/LaunchSplash';

/**
 * The portal IS the app. The 2025 shell (Navbar, LoginPage, UnauthorizedPage,
 * UserContext) is retired — the portal ships its own chrome and its own auth
 * seam (portal/hooks/useAuthSession), and every legacy path redirects
 * somewhere sensible so a bookmark or an emailed link never lands on a blank
 * router miss.
 */
function App() {
  return (
    <ErrorBoundary>
      {/* Navigations run as React transitions: the current screen stays up
          while a lazy route's chunk loads, instead of the Suspense fallback
          (the launch splash) in PortalRoutes. */}
      <Router future={{ v7_startTransition: true }}>
        <div className="App">
          <Routes>
            {/* Member portal — Phase 1. See docs/portal/design-handoff.md. */}
            <Route path="/portal/*" element={<PortalRoutes />} />

            {/* The home-screen icon opens '/' (speed work 2026-11-17): live, the
                portal index sends a signed-in account straight to its landing
                instead of through sign-in; the review scaffold keeps sign-in.
                The launch splash stays up through the redirect. */}
            <Route path="/" element={<LaunchRedirect to={isLive() ? '/portal' : '/portal/signin'} />} />

            {/* Legacy entry points, all superseded by the portal. */}
            <Route path="/login" element={<Navigate to="/portal/signin" replace />} />
            <Route path="/unauthorized" element={<Navigate to="/portal/signin" replace />} />
            <Route path="/register" element={<Navigate to="/portal/register" replace />} />
            <Route path="/dashboard" element={<Navigate to="/portal/schedule" replace />} />
            <Route path="/coach" element={<Navigate to="/portal/coach" replace />} />
            <Route path="/parent" element={<Navigate to="/portal/family" replace />} />
            <Route path="/booking" element={<Navigate to="/portal/book" replace />} />
            <Route path="/my-bookings" element={<Navigate to="/portal/schedule" replace />} />
            <Route path="/programs" element={<Navigate to="/portal/register" replace />} />
            <Route path="/programs/:id" element={<Navigate to="/portal/register" replace />} />
            <Route path="/admin" element={<Navigate to="/portal/admin" replace />} />
          </Routes>
        </div>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
