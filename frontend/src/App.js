// src/App.js

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import PortalRoutes from './portal/PortalRoutes';

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
      <Router>
        <div className="App">
          <Routes>
            {/* Member portal — Phase 1. See docs/portal/design-handoff.md. */}
            <Route path="/portal/*" element={<PortalRoutes />} />

            {/* Legacy entry points, all superseded by the portal. */}
            <Route path="/" element={<Navigate to="/portal/signin" replace />} />
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
