import React from 'react';
import { AdminUser } from '../../hooks/useAdminData';

type AdminUsersProps = {
  users: AdminUser[];
  onRoleChange: (uid: string, newRole: string) => void;
};

const AdminUsers: React.FC<AdminUsersProps> = ({ users, onRoleChange }) => (
  <div>
    <h3 className="font-semibold mb-2">User Management</h3>
    <table className="w-full text-sm">
      <thead>
        <tr>
          <th className="text-left">UID</th>
          <th className="text-left">Name</th>
          <th className="text-left">Email</th>
          <th className="text-left">Role</th>
          <th className="text-left">Change Role</th>
        </tr>
      </thead>
      <tbody>
        {users.map((u) => (
          <tr key={u.uid}>
            <td>{u.uid}</td>
            <td>{u.displayName}</td>
            <td>{u.email}</td>
            <td>{u.role}</td>
            <td>
              <select
                value={u.role}
                onChange={(e) => onRoleChange(u.uid, e.target.value)}
                className="border rounded px-2 py-1"
              >
                <option value="student">Student</option>
                <option value="coach">Coach</option>
                <option value="admin">Admin</option>
              </select>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default AdminUsers; 