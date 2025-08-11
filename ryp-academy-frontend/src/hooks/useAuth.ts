import { useEffect, useState } from 'react';
import { auth } from '../firebase/config';
import { onAuthStateChanged, User } from 'firebase/auth';

export default function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setUserId(firebaseUser?.uid || null);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  return { user, userId, loading };
} 