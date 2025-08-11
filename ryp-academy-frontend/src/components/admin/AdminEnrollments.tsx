import React, { useState } from 'react';
import { AdminEnrollment } from '../../hooks/useAdminData';
import { Program } from '../student/ProgramCatalog';
import { AdminUser } from '../../hooks/useAdminData';

type AdminEnrollmentsProps = {
  enrollments: AdminEnrollment[];
  programs: Program[];
  users: AdminUser[];
};

const AdminEnrollments: React.FC<AdminEnrollmentsProps> = ({ enrollments, programs, users }) => {
  const [programFilter, setProgramFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const filtered = enrollments.filter((e) =>
    (!programFilter || e.programId === programFilter) &&
    (!userFilter || e.userId === userFilter) &&
    (!statusFilter || e.status === statusFilter)
  );

  return (
    <div>
      <h3 className="font-semibold mb-2">Enrollment Management</h3>
      <div className="flex flex-wrap gap-2 mb-2">
        <select className="border rounded px-2 py-1" value={programFilter} onChange={e => setProgramFilter(e.target.value)}>
          <option value="">All Programs</option>
          {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="border rounded px-2 py-1" value={userFilter} onChange={e => setUserFilter(e.target.value)}>
          <option value="">All Users</option>
          {users.map(u => <option key={u.uid} value={u.uid}>{u.displayName}</option>)}
        </select>
        <select className="border rounded px-2 py-1" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th>User</th>
            <th>Program</th>
            <th>Status</th>
            <th>Payment</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((e) => (
            <tr key={e.id}>
              <td>{users.find(u => u.uid === e.userId)?.displayName || e.userId}</td>
              <td>{programs.find(p => p.id === e.programId)?.name || e.programId}</td>
              <td>{e.status}</td>
              <td>{e.paymentStatus}</td>
              <td>{e.enrollmentDate?.slice(0, 10)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default AdminEnrollments; 