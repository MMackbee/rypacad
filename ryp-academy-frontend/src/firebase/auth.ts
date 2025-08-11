import { auth } from './config';
import { signInWithCustomToken, signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';

export const authenticate = async (customToken?: string) => {
  if (customToken) {
    await signInWithCustomToken(auth, customToken);
  } else {
    await signInAnonymously(auth);
  }
};

export const listenAuthState = (cb: (user: User | null) => void) => {
  return onAuthStateChanged(auth, cb);
}; 