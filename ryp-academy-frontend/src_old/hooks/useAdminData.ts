import { useEffect, useState } from 'react';

export type AdminUser = {
  uid: string;
  email: string;
  displayName: string;
  role: string;
};

export type AdminEnrollment = {
  id: string;
  userId: string;
  programId: string;
  programName: string;
  enrollmentDate: string;
  status: string;
  paymentStatus: string;
};

declare global {
  interface Window {
    firebase?: any;
  }
}

export default function useAdminData(appId: string) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [enrollments, setEnrollments] = useState<AdminEnrollment[]>([]);
  const [programs, setPrograms] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const getToken = async () => {
      const user = window.firebase?.auth?.currentUser;
      return user ? await user.getIdToken() : null;
    };
    (async () => {
      const token = await getToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      try {
        const [usersRes, enrRes, progRes, evtRes] = await Promise.all([
          fetch(`/api/users`, { headers }),
          fetch(`/api/enrollments/all`, { headers }),
          fetch(`/api/programs`, { headers }),
          fetch(`/api/events`, { headers })
        ]);
        const [usersData, enr, prog, evt] = await Promise.all([
          usersRes.json(), enrRes.json(), progRes.json(), evtRes.json()
        ]);
        setUsers(usersData);
        setEnrollments(enr);
        setPrograms(prog);
        setEvents(evt);
      } catch (e) {
        // Optionally handle error
      }
      setLoading(false);
    })();
  }, [appId]);

  return { users, enrollments, programs, events, loading };
} 