import React, { useState } from 'react';
import AuthForm from './components/AuthForm';
import useAuth from './hooks/useAuth';
import useUserProfile from './hooks/useUserProfile';
import useStudentData from './hooks/useStudentData';
import LoadingScreen from './components/layout/LoadingScreen';
import AppLayout from './components/layout/AppLayout';
import Modal from './components/Modal';
import StudentDashboard from './components/student/StudentDashboard';
import ProgramCatalog from './components/student/ProgramCatalog';
import EventsCalendar from './components/student/EventsCalendar';
import CompetitivePlay from './components/student/CompetitivePlay';
import AdminDashboard from './components/admin/AdminDashboard';
import useAdminData from './hooks/useAdminData';
import CoachDashboard from './components/coach/CoachDashboard';
import useCoachData from './hooks/useCoachData';

declare global {
  interface Window {
    firebase?: any;
  }
}

const appId = 'ryp-academy';

const RootApp: React.FC = () => {
  const { user, userId, loading: authLoading } = useAuth();
  const { profile, role, loading: profileLoading } = useUserProfile(userId);
  const { enrollments, programs, events, loading: studentLoading } = useStudentData(userId);
  const adminData = role === 'admin' ? useAdminData(appId) : null;
  const coachData = role === 'coach' ? useCoachData() : null;
  const [modal, setModal] = useState<{ open: boolean; title: string; message: React.ReactNode }>({ open: false, title: '', message: '' });

  const getToken = async () => {
    const user = window.firebase?.auth?.currentUser;
    return user ? await user.getIdToken() : null;
  };

  const handleLogout = async () => {
    try {
      await window.firebase?.auth?.signOut();
    } catch (err: any) {
      setModal({ open: true, title: 'Logout Error', message: err.message });
    }
  };

  const handleEnroll = async (program: any) => {
    if (!userId) return;
    try {
      const token = await getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`/api/enrollments`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          userId,
          programId: program.id,
          programName: program.name
        })
      });
      if (!res.ok) throw new Error(await res.text());
      setModal({ open: true, title: 'Enrollment Successful', message: `You have enrolled in ${program.name}.` });
    } catch (err: any) {
      setModal({ open: true, title: 'Enrollment Error', message: err.message });
    }
  };

  const handleRoleChange = async (uid: string, newRole: string) => {
    try {
      const token = await getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`/api/users/${uid}/role`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ role: newRole })
      });
      if (!res.ok) throw new Error(await res.text());
      setModal({ open: true, title: 'Role Updated', message: `User role updated to ${newRole}.` });
    } catch (err: any) {
      setModal({ open: true, title: 'Role Update Error', message: err.message });
    }
  };

  const handleAddProgram = async (program: any) => {
    try {
      const token = await getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`/api/programs`, {
        method: 'POST',
        headers,
        body: JSON.stringify(program)
      });
      if (!res.ok) throw new Error(await res.text());
      setModal({ open: true, title: 'Program Added', message: `Program ${program.name} added successfully.` });
    } catch (err: any) {
      setModal({ open: true, title: 'Add Program Error', message: err.message });
    }
  };

  const handleUpdateProgram = async (id: string, updates: any) => {
    try {
      const token = await getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`/api/programs/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updates)
      });
      if (!res.ok) throw new Error(await res.text());
      setModal({ open: true, title: 'Program Updated', message: `Program updated successfully.` });
    } catch (err: any) {
      setModal({ open: true, title: 'Update Program Error', message: err.message });
    }
  };

  const handleDeleteProgram = async (id: string) => {
    try {
      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`/api/programs/${id}`, {
        method: 'DELETE',
        headers
      });
      if (!res.ok) throw new Error(await res.text());
      setModal({ open: true, title: 'Program Deleted', message: `Program deleted successfully.` });
    } catch (err: any) {
      setModal({ open: true, title: 'Delete Program Error', message: err.message });
    }
  };

  const handleAddEvent = async (event: any) => {
    try {
      const token = await getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`/api/events`, {
        method: 'POST',
        headers,
        body: JSON.stringify(event)
      });
      if (!res.ok) throw new Error(await res.text());
      setModal({ open: true, title: 'Event Added', message: `Event ${event.name} added successfully.` });
    } catch (err: any) {
      setModal({ open: true, title: 'Add Event Error', message: err.message });
    }
  };

  const handleUpdateEvent = async (id: string, updates: any) => {
    try {
      const token = await getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`/api/events/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updates)
      });
      if (!res.ok) throw new Error(await res.text());
      setModal({ open: true, title: 'Event Updated', message: `Event updated successfully.` });
    } catch (err: any) {
      setModal({ open: true, title: 'Update Event Error', message: err.message });
    }
  };

  const handleDeleteEvent = async (id: string) => {
    try {
      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`/api/events/${id}`, {
        method: 'DELETE',
        headers
      });
      if (!res.ok) throw new Error(await res.text());
      setModal({ open: true, title: 'Event Deleted', message: `Event deleted successfully.` });
    } catch (err: any) {
      setModal({ open: true, title: 'Delete Event Error', message: err.message });
    }
  };

  if (authLoading || profileLoading || studentLoading) return <LoadingScreen />;
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-golfgreen to-yellow-400 flex flex-col items-center justify-center">
        <div className="text-3xl font-bold mb-4 text-white">RYP Academy Portal</div>
        <AuthForm />
        <Modal open={modal.open} title={modal.title} message={modal.message} onClose={() => setModal({ ...modal, open: false })} />
      </div>
    );
  }

  return (
    <AppLayout userId={userId!} role={role} onLogout={handleLogout}>
      {role === 'admin' && adminData && (
        <AdminDashboard
          users={adminData.users}
          programs={adminData.programs}
          enrollments={adminData.enrollments}
          events={adminData.events}
          onRoleChange={handleRoleChange}
          onAddProgram={handleAddProgram}
          onUpdateProgram={handleUpdateProgram}
          onDeleteProgram={handleDeleteProgram}
          onAddEvent={handleAddEvent}
          onUpdateEvent={handleUpdateEvent}
          onDeleteEvent={handleDeleteEvent}
        />
      )}
      {role === 'student' && (
        <>
          <StudentDashboard enrollments={enrollments} events={events} />
          <ProgramCatalog programs={programs} onEnroll={handleEnroll} />
          <EventsCalendar events={events} />
          <CompetitivePlay events={events} setModal={setModal} />
        </>
      )}
      {role === 'coach' && coachData && !coachData.loading && (
        <CoachDashboard students={coachData.students} relevantEvents={coachData.relevantEvents} />
      )}
      {role === 'coach' && coachData && coachData.loading && <LoadingScreen />}
      <Modal open={modal.open} title={modal.title} message={modal.message} onClose={() => setModal({ ...modal, open: false })} />
    </AppLayout>
  );
};

export default RootApp; 