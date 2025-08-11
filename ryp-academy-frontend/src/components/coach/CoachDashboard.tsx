import React from 'react';
import Card from '../Card';
import { CoachStudent, CoachEvent } from '../../hooks/useCoachData';

type CoachDashboardProps = {
  students: CoachStudent[];
  relevantEvents: CoachEvent[];
};

const CoachDashboard: React.FC<CoachDashboardProps> = ({ students, relevantEvents }) => (
  <div>
    <h2 className="text-xl font-bold mb-2">Coach Dashboard</h2>
    <Card>
      <h3 className="font-semibold mb-2">My Students</h3>
      <ul>
        {students.map((s) => (
          <li key={s.uid}>
            {s.displayName} ({s.email})
          </li>
        ))}
      </ul>
    </Card>
    <Card>
      <h3 className="font-semibold mb-2">Relevant Events</h3>
      <ul>
        {relevantEvents.map((e) => (
          <li key={e.id}>
            {e.name} - {e.date}
          </li>
        ))}
      </ul>
    </Card>
  </div>
);

export default CoachDashboard; 