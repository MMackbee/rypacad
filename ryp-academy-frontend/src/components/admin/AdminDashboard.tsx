import React, { useState } from 'react';
import Card from '../Card';
import { AdminUser, AdminEnrollment } from '../../hooks/useAdminData';
import { Program } from '../student/ProgramCatalog';
import AdminUsers from './AdminUsers';
import AdminPrograms from './AdminPrograms';
import AdminEnrollments from './AdminEnrollments';
import AdminEvents from './AdminEvents';

type AdminDashboardProps = {
  users: AdminUser[];
  programs: Program[];
  enrollments: AdminEnrollment[];
  events: any[];
  onRoleChange: (uid: string, newRole: string) => void;
  onAddProgram: (program: Partial<Program>) => void;
  onUpdateProgram: (id: string, updates: Partial<Program>) => void;
  onDeleteProgram: (id: string) => void;
  onAddEvent: (event: Partial<any>) => void;
  onUpdateEvent: (id: string, updates: Partial<any>) => void;
  onDeleteEvent: (id: string) => void;
};

const AdminDashboard: React.FC<AdminDashboardProps> = ({
  users,
  programs,
  enrollments,
  events,
  onRoleChange,
  onAddProgram,
  onUpdateProgram,
  onDeleteProgram,
  onAddEvent,
  onUpdateEvent,
  onDeleteEvent,
}) => {
  const [tab, setTab] = useState<'users' | 'programs' | 'enrollments' | 'events'>('users');
  return (
    <div>
      <h2 className="text-xl font-bold mb-2">Admin Dashboard</h2>
      <div className="flex space-x-2 mb-4">
        <button
          className={`px-3 py-1 rounded ${tab === 'users' ? 'bg-yellow-400 font-bold' : 'bg-gray-200 hover:bg-gray-300'}`}
          onClick={() => setTab('users')}
        >
          Users
        </button>
        <button
          className={`px-3 py-1 rounded ${tab === 'programs' ? 'bg-yellow-400 font-bold' : 'bg-gray-200 hover:bg-gray-300'}`}
          onClick={() => setTab('programs')}
        >
          Programs
        </button>
        <button
          className={`px-3 py-1 rounded ${tab === 'enrollments' ? 'bg-yellow-400 font-bold' : 'bg-gray-200 hover:bg-gray-300'}`}
          onClick={() => setTab('enrollments')}
        >
          Enrollments
        </button>
        <button
          className={`px-3 py-1 rounded ${tab === 'events' ? 'bg-yellow-400 font-bold' : 'bg-gray-200 hover:bg-gray-300'}`}
          onClick={() => setTab('events')}
        >
          Events
        </button>
      </div>
      {tab === 'users' && <Card><AdminUsers users={users} onRoleChange={onRoleChange} /></Card>}
      {tab === 'programs' && <Card><AdminPrograms programs={programs} onAdd={onAddProgram} onUpdate={onUpdateProgram} onDelete={onDeleteProgram} /></Card>}
      {tab === 'enrollments' && <Card><AdminEnrollments enrollments={enrollments} programs={programs} users={users} /></Card>}
      {tab === 'events' && <Card><AdminEvents events={events} onAdd={onAddEvent} onUpdate={onUpdateEvent} onDelete={onDeleteEvent} /></Card>}
    </div>
  );
};

export default AdminDashboard; 