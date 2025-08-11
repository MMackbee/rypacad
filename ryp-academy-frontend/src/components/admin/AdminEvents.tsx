import React, { useState } from 'react';

type Event = {
  id?: string;
  name: string;
  type: string;
  date: string;
  time?: string;
  location?: string;
  host?: string;
  topic?: string;
  link?: string;
  participants?: string[];
  results?: string;
  status?: string;
  leaderboard?: string;
  schedule?: string;
  seasonDates?: string;
  clinicTopics?: string;
};

type AdminEventsProps = {
  events: Event[];
  onAdd: (event: Partial<Event>) => void;
  onUpdate: (id: string, updates: Partial<Event>) => void;
  onDelete: (id: string) => void;
};

const emptyForm: Partial<Event> = {
  name: '',
  type: '',
  date: '',
  time: '',
  location: '',
  host: '',
  topic: '',
  link: '',
  participants: [],
  results: '',
  status: '',
  leaderboard: '',
  schedule: '',
  seasonDates: '',
  clinicTopics: '',
};

const AdminEvents: React.FC<AdminEventsProps> = ({ events, onAdd, onUpdate, onDelete }) => {
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Event>>(emptyForm);

  const handleEdit = (e: Event) => {
    setEditing(e.id!);
    setForm({ ...e });
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
      <h3 className="font-semibold mb-2">{editing ? 'Edit Event' : 'Add Event'}</h3>
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-2 mb-4">
        <input className="border rounded px-2 py-1" placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
        <input className="border rounded px-2 py-1" placeholder="Type" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} required />
        <input className="border rounded px-2 py-1" placeholder="Date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required />
        <input className="border rounded px-2 py-1" placeholder="Time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} />
        <input className="border rounded px-2 py-1" placeholder="Location" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} />
        <input className="border rounded px-2 py-1" placeholder="Host" value={form.host} onChange={e => setForm({ ...form, host: e.target.value })} />
        <input className="border rounded px-2 py-1" placeholder="Topic" value={form.topic} onChange={e => setForm({ ...form, topic: e.target.value })} />
        <input className="border rounded px-2 py-1" placeholder="Link" value={form.link} onChange={e => setForm({ ...form, link: e.target.value })} />
        <input className="col-span-2 border rounded px-2 py-1" placeholder="Participants (comma separated userIds)" value={form.participants?.join(',') || ''} onChange={e => setForm({ ...form, participants: e.target.value.split(',').map(s => s.trim()) })} />
        <input className="col-span-2 border rounded px-2 py-1" placeholder="Results (JSON string)" value={form.results} onChange={e => setForm({ ...form, results: e.target.value })} />
        <input className="col-span-2 border rounded px-2 py-1" placeholder="Status" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} />
        <input className="col-span-2 border rounded px-2 py-1" placeholder="Leaderboard (JSON string)" value={form.leaderboard} onChange={e => setForm({ ...form, leaderboard: e.target.value })} />
        <input className="col-span-2 border rounded px-2 py-1" placeholder="Schedule (JSON string)" value={form.schedule} onChange={e => setForm({ ...form, schedule: e.target.value })} />
        <input className="col-span-2 border rounded px-2 py-1" placeholder="Season Dates" value={form.seasonDates} onChange={e => setForm({ ...form, seasonDates: e.target.value })} />
        <input className="col-span-2 border rounded px-2 py-1" placeholder="Clinic Topics" value={form.clinicTopics} onChange={e => setForm({ ...form, clinicTopics: e.target.value })} />
        <button className="col-span-2 bg-yellow-400 rounded px-3 py-1 font-bold" type="submit">{editing ? 'Update' : 'Add'}</button>
      </form>
      <h3 className="font-semibold mb-2">All Events</h3>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Date</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id}>
              <td>{e.name}</td>
              <td>{e.type}</td>
              <td>{e.date}</td>
              <td>{e.status}</td>
              <td>
                <button className="text-blue-500 underline mr-2" onClick={() => handleEdit(e)}>Edit</button>
                <button className="text-red-500 underline" onClick={() => onDelete(e.id!)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default AdminEvents; 