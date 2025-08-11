import { db } from './config';
import {
  doc, collection, getDoc, getDocs, setDoc, updateDoc, addDoc, deleteDoc, onSnapshot, QuerySnapshot, DocumentData
} from 'firebase/firestore';

const appId = 'ryp-academy';

// User profile
export const userProfileRef = (userId: string) => doc(db, `artifacts/${appId}/users/${userId}/profile/data`);
export const userEnrollmentsRef = (userId: string) => collection(db, `artifacts/${appId}/users/${userId}/enrollments`);

// Programs & Events
export const programsRef = collection(db, `artifacts/${appId}/public/data/programs`);
export const eventsRef = collection(db, `artifacts/${appId}/public/data/events`);

// Admin: all users
export const usersColRef = collection(db, `artifacts/${appId}/users`);

// Real-time listeners
export const listenDoc = (ref: any, cb: (data: any) => void, err: (e: any) => void) => onSnapshot(ref, (snap) => cb(snap.exists() ? snap.data() : null), err);
export const listenCol = (ref: any, cb: (data: any[]) => void, err: (e: any) => void) => onSnapshot(ref, (snap: QuerySnapshot<DocumentData>) => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))), err);

// CRUD helpers (add, update, delete)
export { getDoc, getDocs, setDoc, updateDoc, addDoc, deleteDoc, doc, collection }; 