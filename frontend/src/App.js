// src/App.js

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { UserProvider } from './contexts/UserContext';
import ErrorBoundary from './components/ErrorBoundary';
import Navbar from './components/Navbar';
import LoginPage from './pages/LoginPage';
import UnauthorizedPage from './pages/UnauthorizedPage';
import PortalRoutes from './portal/PortalRoutes';

/**
 * The portal ships its own chrome — a bottom tab bar per role, and a header
 * inside each 390pt frame. Rendering the desktop Navbar above it would give a
 * phone screen two navigations, so it is suppressed under /portal.
 */
function ChromeNavbar() {
  const { pathname } = useLocation();
  if (pathname === '/portal' || pathname.startsWith('/portal/')) return null;
  return <Navbar />;
}

function App() {
  return (
    <ErrorBoundary>
      <UserProvider>
        <Router>
          <div className="App">
            <ChromeNavbar />
            <Routes>
              {/* Member portal — the Phase 1 scaffold. See docs/portal/design-handoff.md. */}
              <Route path="/portal/*" element={<PortalRoutes />} />

              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/unauthorized" element={<UnauthorizedPage />} />

              {/*
                The 2025 surfaces are gone — the portal supersedes them. Paths
                with a portal equivalent redirect, so a bookmark or an emailed
                link lands somewhere sensible instead of on a blank router
                miss. Retired paths with no equivalent (/videos, /profile,
                /sessions, /mental-performance, /data-upload, /driving-test,
                /sms-test, /admin/waitlist) simply fall away.
              */}
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
      </UserProvider>
    </ErrorBoundary>
  );
}

export default App;