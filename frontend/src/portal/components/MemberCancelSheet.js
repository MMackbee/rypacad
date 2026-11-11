import React, { useState } from 'react';
import CancelSheet from './CancelSheet';
import CancelReasonPicker from './CancelReasonPicker';
import { cancelReasonOf } from '../data/bookingChanges';

/**
 * The family's own cancel (spec 2026-11-11 §4): CancelSheet with the reason
 * picker in it. Neither confirm works until a usable reason is picked (Other
 * needs a note), and a series is asked once: the same reason goes on every
 * week. Reservations (parents, with the athlete's name) and My Schedule (an
 * athlete's own login, no name) both use it; Roster and AdminScholarships
 * keep the plain CancelSheet. While a cancel runs the picker is off, so the
 * reason being sent cannot change under it (and a failure leaves it as sent).
 *
 * @param {React.ReactNode} summary  The session restated, as CancelSheet.
 * @param {?string} name  The athlete's name, or none for their own login.
 * @param {Array} [laterWeeks]  laterWeeks() for this booking.
 * @param {() => void} onClose
 * @param {(reason: { category: string, note: ?string }) => Promise<any>} onConfirm
 * @param {(reason: { category: string, note: ?string }) => Promise<object>} [onConfirmSeries]
 * @param {() => void} onCancelled
 */
export default function MemberCancelSheet({ summary, name, laterWeeks, onClose, onConfirm, onConfirmSeries, onCancelled }) {
  const [value, setValue] = useState({ category: null, note: '' });
  const [busy, setBusy] = useState(false);
  const reason = cancelReasonOf(value);
  const run = async (send) => {
    setBusy(true);
    try {
      return await send(reason);
    } finally {
      setBusy(false);
    }
  };
  return (
    <CancelSheet
      summary={summary}
      laterWeeks={laterWeeks}
      chooser={<CancelReasonPicker name={name} value={value} onChange={setValue} disabled={busy} />}
      ready={reason != null}
      onClose={onClose}
      onConfirm={() => run(onConfirm)}
      onConfirmSeries={onConfirmSeries ? () => run(onConfirmSeries) : undefined}
      onCancelled={onCancelled}
    />
  );
}
