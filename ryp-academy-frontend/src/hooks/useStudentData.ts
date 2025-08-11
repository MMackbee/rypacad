import { useEffect, useState } from 'react';
import { Enrollment } from '../components/student/StudentDashboard';
import { Program } from '../components/student/ProgramCatalog';

export type Event = {
  id: string;
  name: string;
  date: string;
  type: string;
};

declare global {
  interface Window {
    firebase?: any;
  }
}

export default function useStudentData(userId: string | null) {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    // Helper to get Firebase ID token
    const getToken = async () => {
      const user = window.firebase?.auth?.currentUser;
      return user ? await user.getIdToken() : null;
    };
    // Fetch all data from backend API
    (async () => {
      const token = await getToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      try {
        const [enrRes, progRes, evtRes] = await Promise.all([
          fetch(`/api/enrollments`, { headers }),
          fetch(`/api/programs`, { headers }),
          fetch(`/api/events`, { headers })
        ]);
        const [enr, prog, evt] = await Promise.all([
          enrRes.json(), progRes.json(), evtRes.json()
        ]);
        setEnrollments(enr);
        setPrograms(prog);
        setEvents(evt);
      } catch (e) {
        // Optionally handle error
      }
      setLoading(false);
    })();
  }, [userId]);

  return { enrollments, programs, events, loading };
} 