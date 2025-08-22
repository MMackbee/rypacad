// src/App.js

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { UserProvider } from './contexts/UserContext';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import Navbar from './components/Navbar';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import CoachDashboardPage from './pages/CoachDashboardPage';
import ParentDashboard from './components/ParentDashboard';
import ProgramListPage from './pages/ProgramListPage';
import ProgramDetailPage from './pages/ProgramDetailPage';
import BookingPage from './pages/BookingPage';
import AdminWaitlistPage from './pages/AdminWaitlistPage';
import ProfilePage from './pages/ProfilePage';
import VideosPage from './pages/VideosPage';
import MyBookingsPage from './pages/MyBookingsPage';
import SessionsPage from './pages/SessionsPage';
import MentalPerformancePage from './pages/MentalPerformancePage';
import DataUploadPage from './pages/DataUploadPage';
import SMSTestPage from './pages/SMSTestPage';
import UnauthorizedPage from './pages/UnauthorizedPage';
import DrivingTestPage from './pages/DrivingTestPage';
import RegistrationPage from './pages/RegistrationPage';

function App() {
  return (
    <ErrorBoundary>
      <UserProvider>
        <Router>
          <div className="App">
            <Navbar />
            <Routes>
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegistrationPage />} />
              <Route path="/unauthorized" element={<UnauthorizedPage />} />
              
              {/* Protected Routes */}
              <Route 
                path="/dashboard" 
                element={
                  <ProtectedRoute>
                    <DashboardPage />
                  </ProtectedRoute>
                } 
              />
              
              <Route 
                path="/admin" 
                element={
                  <ProtectedRoute requiredRole="admin">
                    <AdminDashboardPage />
                  </ProtectedRoute>
                } 
              />
              
              <Route 
                path="/coach" 
                element={
                  <ProtectedRoute requiredRole="coach">
                    <CoachDashboardPage />
                  </ProtectedRoute>
                } 
              />
              
              <Route 
                path="/parent" 
                element={
                  <ProtectedRoute>
                    <ParentDashboard />
                  </ProtectedRoute>
                } 
              />
              
              <Route path="/programs" element={<ProgramListPage />} />
              <Route path="/programs/:id" element={<ProgramDetailPage />} />
              
              {/* Removed legacy Package Builder route; Programs is the hub */}
              
              <Route 
                path="/booking" 
                element={
                  <ProtectedRoute>
                    <BookingPage />
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
                path="/my-bookings" 
                element={
                  <ProtectedRoute>
                    <MyBookingsPage />
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