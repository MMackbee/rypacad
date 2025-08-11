import { useEffect, useState } from 'react';
import { getDocs, getDoc, usersColRef, doc, eventsRef } from '../firebase/firestore';

export type CoachStudent = {
  uid: string;
  email: string;
  displayName: string;
  role: string;
};

export type CoachEvent = {
  id: string;
  name: string;
  date: string;
  type: string;
  participants?: string[];
};

const appId = 'ryp-academy';

export default function useCoachData() {
  const [students, setStudents] = useState<CoachStudent[]>([]);
  const [relevantEvents, setRelevantEvents] = useState<CoachEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    // Fetch all users' profiles and filter for students
    getDocs(usersColRef).then(async (usersSnap) => {
      const userIds: string[] = [];
      usersSnap.forEach((docSnap) => userIds.push(docSnap.id));
      const userProfiles = await Promise.all(
        userIds.map((uid) =>
          getDoc(doc(usersColRef.firestore, `artifacts/${appId}/users/${uid}/profile/data`)).then((profileSnap) => ({ uid, ...profileSnap.data() }))
        )
      );
      const students = userProfiles.filter((u: any) => u.role === 'student') as CoachStudent[];
      setStudents(students);
      // Fetch all events
      getDocs(eventsRef).then((eventsSnap) => {
        const events = eventsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as CoachEvent[];
        // Relevant events: any event where participants include a student userId
        const studentIds = students.map((s) => s.uid);
        const relevant = events.filter((e) => (e.participants || []).some((id) => studentIds.includes(id)));
        setRelevantEvents(relevant);
        setLoading(false);
      });
    });
  }, []);

  return { students, relevantEvents, loading };
} 