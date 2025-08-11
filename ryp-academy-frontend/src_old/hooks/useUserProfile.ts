import { useEffect, useState } from 'react';
import { userProfileRef } from '../firebase/firestore';
import { onSnapshot } from 'firebase/firestore';

export type UserProfile = {
  uid: string;
  email: string;
  displayName: string;
  role: 'student' | 'admin' | 'coach';
  contactInfo?: string;
  dateJoined?: string;
};

export default function useUserProfile(userId: string | null) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<'student' | 'admin' | 'coach'>('student');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    const unsub = onSnapshot(userProfileRef(userId), (doc) => {
      if (doc.exists()) {
        const data = doc.data() as UserProfile;
        setProfile(data);
        setRole(data.role || 'student');
      }
      setLoading(false);
    });
    return () => unsub();
  }, [userId]);

  return { profile, role, loading };
} 