/**
 * Staff cancel on the Billing staff view (owner approved 2026-11-12): the
 * owner or ops cancels the tapped booking and any ticked brothers and
 * sisters on the same session in ONE call to the staffCancelBooking callable
 * - one server transaction, all or nothing; the server checks the role, the
 * bookings and the billing period again. New code kept out of the
 * grandfathered live.js and index.js (the move.js precedent). Which rows,
 * and every word, are data/staffCancel.js.
 */
import { bump } from './invalidate';
import { isLive } from './live';
import { callStaffCancelBooking } from './callables';
import { staffCancelRefusal } from '../data/staffCancel';

/** Every list that shows bookings, seats or waitlist places (a cancel opens a seat). */
function reloadBookings() {
  bump('bookings');
  bump('sessions');
  bump('waitlist');
}

/**
 * Cancel `bookingIds` for `reason` (`{ category, note }`, data/bookingChanges.js
 * cancelReasonOf; a note goes only with Other). Resolves with the callable's
 * `{ sessionId, cancelled: [{ bookingId, athleteId, cancelledFrom, tokenBack }] }`
 * and reloads the lists. Practice mode calls nothing and echoes a simulated
 * result without tokenBack (the rows decide; data/staffCancel.js
 * staffCancelOutcome). A failure rejects with an Error whose `message` is
 * the staff words for its `reason` (staffCancelRefusal) - and reloads the
 * lists too: a refusal means the page showed something that changed, and no
 * answer at all may mean it went through.
 */
export async function staffCancelBookings({ bookingIds, reason }) {
  const ids = [...new Set(bookingIds || [])];
  if (!isLive()) return { simulated: true, sessionId: null, cancelled: ids.map((bookingId) => ({ bookingId })) };
  const note = reason?.category === 'other' && reason.note ? { note: reason.note } : {};
  let result;
  try {
    result = await callStaffCancelBooking({ bookingIds: ids, category: reason?.category, ...note });
  } catch (err) {
    reloadBookings();
    const why = (err && err.reason) || null;
    throw Object.assign(new Error(staffCancelRefusal(why, err)), { reason: why, cause: err });
  }
  reloadBookings();
  return result;
}
