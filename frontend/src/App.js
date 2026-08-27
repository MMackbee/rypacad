// src/App.js

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { UserProvider } from './contexts/UserContext';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import Navbar from './components/Navbar';
import LoginPage from './pages/LoginPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import AdminWaitlistPage from './pages/AdminWaitlistPage';
import ProfilePage from './pages/ProfilePage';
import VideosPage from './pages/VideosPage';
import SessionsPage from './pages/SessionsPage';
import MentalPerformancePage from './pages/MentalPerformancePage';
import DataUploadPage from './pages/DataUploadPage';
import SMSTestPage from './pages/SMSTestPage';
import UnauthorizedPage from './pages/UnauthorizedPage';
import DrivingTestPage from './pages/DrivingTestPage';
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
                The 2025 enrollment, booking, dashboard and programs routes are
                gone — the portal supersedes them. /programs in particular was
                live, serving Starter / Developer / Elite / Champion at
                $200-$680: programs that no longer exist, at prices that were
                never 26/27 pricing.

                Redirected rather than dropped, so a bookmark or an emailed link
                lands somewhere sensible instead of on a blank router miss.
              */}
              <Route path="/register" element={<Navigate to="/portal/register" replace />} />
              <Route path="/dashboard" element={<Navigate to="/portal/schedule" replace />} />
              <Route path="/coach" element={<Navigate to="/portal/coach" replace />} />
              <Route path="/parent" element={<Navigate to="/portal/family" replace />} />
              <Route path="/booking" element={<Navigate to="/portal/book" replace />} />
              <Route path="/my-bookings" element={<Navigate to="/portal/schedule" replace />} />
              <Route path="/programs" element={<Navigate to="/portal/register" replace />} />
              <Route path="/programs/:id" element={<Navigate to="/portal/register" replace />} />

              {/* Protected Routes */}
              <Route
                path="/admin"
                element={
                  <ProtectedRoute requiredRole="admin">
                    <AdminDashboardPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/profile" 
                element={
                  <ProtectedRoute>
                    <ProfilePage />
                  </ProtectedRoute>
                } 
              />
              
              <Route 
                path="/videos" 
                element={
                  <ProtectedRoute>
                    <VideosPage />
                  </ProtectedRoute>
                } 
              />
              
              <Route
                path="/driving-test"
                element={
                  <ProtectedRoute>
                    <DrivingTestPage />
                  </ProtectedRoute>
                } 
              />
              
              <Route 
                path="/sessions" 
                element={
                  <ProtectedRoute>
                    <SessionsPage />
                  </ProtectedRoute>
                } 
              />
              
              <Route 
                path="/mental-performance" 
                element={
                  <ProtectedRoute>
                    <MentalPerformancePage />
                  </ProtectedRoute>
                } 
              />
              
              <Route 
                path="/data-upload" 
                element={
                  <ProtectedRoute>
                    <DataUploadPage />
                  </ProtectedRoute>
                } 
              />
              
              <Route 
                path="/sms-test" 
                element={
                  <ProtectedRoute requiredRole="admin">
                    <SMSTestPage />
                  </ProtectedRoute>
                } 
              />
              
              <Route 
                path="/admin/waitlist" 
                element={
                  <ProtectedRoute requiredRole="admin">
                    <AdminWaitlistPage />
                  </ProtectedRoute>
                } 
              />
            </Routes>
          </div>
        </Router>
      </UserProvider>
    </ErrorBoundary>
  );
}

export default App;