/**
 * The bookings read behind a specialist's own day (hooks/specialistSessions.js,
 * speed review F1, 2026-11-17): every booking of one session type in ONE
 * query, in place of one query per upcoming slot.
 *
 * A single-field equality on `type` rides the automatic index. Status and
 * dates are left to the caller on purpose: type + status-in or type + a date
 * range would each need a composite index this repo does not deploy.
 *
 * Rules (firestore.rules, bookings `allow read`): coach, mental, ops and
 * owner read any booking by role, so the list is provable for Phil (a coach
 * account), Yannick (mental) and the owner/ops switcher alike - the same
 * grant fetchAllMentalBookings (mentalLive.js) already reads under.
 */
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { ERR, LiveDataError, wrap } from './live';

export async function fetchBookingsByType(type) {
  if (!type) throw new LiveDataError(ERR.INVALID, 'fetchBookingsByType: type is required.');
  try {
    const snap = await getDocs(query(collection(db, 'bookings'), where('type', '==', type)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    throw wrap(err, 'fetchBookingsByType');
  }
}
