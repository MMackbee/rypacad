import React, { useState } from 'react';
import { Program } from '../student/ProgramCatalog';

type AdminProgramsProps = {
  programs: Program[];
  onAdd: (program: Partial<Program>) => void;
  onUpdate: (id: string, updates: Partial<Program>) => void;
  onDelete: (id: string) => void;
};

const emptyForm: Partial<Program> = {
  name: '',
  description: '',
  type: '',
  price: '',
  capacity: '',
  duration: '',
  schedule_details: '',
  isActive: true,
};

const AdminPrograms: React.FC<AdminProgramsProps> = ({ programs, onAdd, onUpdate, onDelete }) => {
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Program>>(emptyForm);

  const handleEdit = (p: Program) => {
    setEditing(p.id);
    setForm({ ...p });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      onUpdate(editing, form);
    } else {
      onAdd(form);
    }
    setEditing(null);
    setForm(emptyForm);
  };

  return (
    <div>
      <h3 className="font-semibold mb-2">{editing ? 'Edit Program' : 'Add Program'}</h3>
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-2 mb-4">
        <input
          className="border rounded px-2 py-1"
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <input
          className="border rounded px-2 py-1"
          placeholder="Type"
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
          required
        />
        <input
          className="border rounded px-2 py-1"
          placeholder="Price"
          value={form.price}
          onChange={(e) => setForm({ ...form, price: e.target.value })}
        />
        <input
          className="border rounded px-2 py-1"
          placeholder="Capacity"
          value={form.capacity}
          onChange={(e) => setForm({ ...form, capacity: e.target.value })}
        />
        <input
          className="border rounded px-2 py-1"
          placeholder="Duration"
          value={form.duration}
          onChange={(e) => setForm({ ...form, duration: e.target.value })}
        />
        <input
          className="border rounded px-2 py-1"
          placeholder="Schedule Details"
          value={form.schedule_details}
          onChange={(e) => setForm({ ...form, schedule_details: e.target.value })}
        />
        <input
          className="col-span-2 border rounded px-2 py-1"
          placeholder="Description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <label className="col-span-2 flex items-center space-x-2">
          <input
            type="checkbox"
            checked={!!form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
          />
          <span>Active</span>
        </label>
        <button
          className="col-span-2 bg-yellow-400 rounded px-3 py-1 font-bold"
          type="submit"
        >
          {editing ? 'Update' : 'Add'}
        </button>
      </form>
      <h3 className="font-semibold mb-2">All Programs</h3>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Price</th>
            <th>Active</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {programs.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td>{p.type}</td>
              <td>{p.price}</td>
              <td>{p.isActive ? 'Yes' : 'No'}</td>
              <td>
                <button
                  className="text-blue-500 underline mr-2"
                  onClick={() => handleEdit(p)}
                >
                  Edit
                </button>
                <button
                  className="text-red-500 underline"
                  onClick={() => onDelete(p.id!)}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default AdminPrograms; 