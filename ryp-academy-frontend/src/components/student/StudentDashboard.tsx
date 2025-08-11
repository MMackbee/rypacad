import React from 'react';
import Card from '../Card';

export type Enrollment = {
  id: string;
  userId: string;
  programId: string;
  programName: string;
  enrollmentDate: string;
  status: string;
  paymentStatus: string;
};

export type Event = {
  id: string;
  name: string;
  date: string;
  type: string;
};

type StudentDashboardProps = {
  enrollments: Enrollment[];
  events: Event[];
};

const StudentDashboard: React.FC<StudentDashboardProps> = ({ enrollments, events }) => (
  <div>
    <h2 className="text-xl font-bold mb-2">My Dashboard</h2>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <h3 className="font-semibold mb-2">My Enrollments</h3>
        {enrollments.length === 0 ? (
          <div>No enrollments yet.</div>
        ) : (
          <ul>
            {enrollments.map((enr) => (
              <li key={enr.id} className="mb-2">
                <span className="font-bold">{enr.programName}</span> - {enr.status} ({enr.paymentStatus})
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <h3 className="font-semibold mb-2">Upcoming Events</h3>
        <ul>
          {events
            .filter((e) => new Date(e.date) > new Date())
            .slice(0, 5)
            .map((e) => (
              <li key={e.id} className="mb-2">
                <span className="font-bold">{e.name}</span> - {e.date}
              </li>
            ))}
        </ul>
      </Card>
    </div>
  </div>
);

export default StudentDashboard; 