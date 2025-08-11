import React from 'react';
import Card from '../Card';

export type Event = {
  id: string;
  name: string;
  date: string;
  type: string;
  link?: string;
};

type EventsCalendarProps = {
  events: Event[];
};

const EventsCalendar: React.FC<EventsCalendarProps> = ({ events }) => (
  <Card>
    <h3 className="font-semibold mb-2">Events Calendar</h3>
    <ul>
      {events.map((e) => (
        <li key={e.id} className="mb-2">
          <span className="font-bold">{e.name}</span> - {e.date}{' '}
          <span className="text-xs text-gray-500">{e.type}</span>
          {e.link && (
            <a
              href={e.link}
              className="ml-2 text-blue-500 underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Join
            </a>
          )}
        </li>
      ))}
    </ul>
  </Card>
);

export default EventsCalendar; 