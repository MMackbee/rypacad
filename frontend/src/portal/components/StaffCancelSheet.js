import React, { useId, useRef, useState } from 'react';
import { color, font, radius } from '../tokens';
import CancelSheet from './CancelSheet';
import CancelReasonPicker from './CancelReasonPicker';
import { Tick } from './Primitives';
import { cancelReasonOf } from '../data/bookingChanges';
import { sessionStarted } from '../data/sessionStart';
import {
  siblingsFor,
  staffCancelLine,
  staffCancelOutcome,
  staffCancelQuestion,
  staffCancelSummary,
  staffConfirmLabel,
  staffStatusLabel,
} from '../data/staffCancel';
import { staffCancelBookings } from '../hooks/staffCancel';

/**
 * The owner's or ops' cancel on the Billing staff view (owner approved
 * 2026-11-12): CancelSheet with the family's reason picker, asked in the
 * past tense once the session has started ("Why couldn't Jordan make it?" -
 * the no-show case), and under it the brothers and sisters booked on the
 * same session, one tick each, UNTICKED. Confirm cancels the tapped booking
 * and every ticked one in one call (hooks/staffCancel.js), all or nothing;
 * its label says whether tokens come back (none for a free comp or Elite).
 *
 * Who is on the session is read once, when the sheet opens: a reload of
 * the page behind it (after a refusal) never changes what is being asked.
 * While the call runs the ticks and the reasons are frozen and the confirm
 * is busy - one call per tap. A refusal stays on the sheet with its words
 * (CancelSheet never closes on failure); the call has already reloaded the
 * page's data.
 *
 * @param {object} row  The tapped billing hub row (data/billingHub.js periodRows).
 * @param {object} member  Its athlete's hub member (athleteId, name).
 * @param {Array<object>} members  Every hub member of the household.
 * @param {() => void} onClose  Keep it, or the overlay tap.
 * @param {(line: string) => void} onCancelled  After the cancel went through,
 *   with the line the page shows ("Cancelled · Sick - token back for Jordan.").
 * @param {Date} [now]  The clock, for the question's tense (tests pin it).
 */
export default function StaffCancelSheet({ row, member, members, onClose, onCancelled, now }) {
  const [siblings] = useState(() => siblingsFor(row, member.athleteId, members));
  const [ticked, setTicked] = useState(() => new Set());
  const [value, setValue] = useState({ category: null, note: '' });
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const line = useRef(null);
  const reason = cancelReasonOf(value);
  const chosen = [{ athleteId: member.athleteId, name: member.name, row }, ...siblings.filter((s) => ticked.has(s.athleteId))];
  const started = sessionStarted({ date: row.date, time: row.time }, now ?? new Date());

  const toggle = (athleteId) => {
    if (sending.current) return;
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(athleteId)) next.delete(athleteId);
      else next.add(athleteId);
      return next;
    });
  };

  const confirm = async () => {
    if (sending.current || !reason) return;
    sending.current = true;
    setBusy(true);
    try {
      const result = await staffCancelBookings({ bookingIds: chosen.map((c) => c.row.id), reason });
      line.current = staffCancelLine(reason, staffCancelOutcome(result, chosen));
    } catch (err) {
      sending.current = false;
      setBusy(false);
      throw err;
    }
  };

  return (
    <CancelSheet
      title="Cancel this booking?"
      summary={staffCancelSummary(row, member.name)}
      confirmLabel={staffConfirmLabel(chosen.map((c) => c.row))}
      chooser={
        <>
          <CancelReasonPicker
            name={member.name}
            question={staffCancelQuestion(member.name, started)}
            value={value}
            onChange={setValue}
            disabled={busy}
          />
          <SiblingTicks siblings={siblings} ticked={ticked} onToggle={toggle} disabled={busy} />
        </>
      }
      ready={reason != null}
      onClose={onClose}
      onConfirm={confirm}
      onCancelled={() => onCancelled(line.current)}
    />
  );
}

/**
 * "Also cancel for" - one 44px line per brother or sister: a round tick,
 * first name and status. The heading names the group, so a screen reader
 * hears each tick as an extra cancel, like the picker's "Reason" group.
 */
function SiblingTicks({ siblings, ticked, onToggle, disabled }) {
  const headingId = useId();
  if (!siblings.length) return null;
  return (
    <div role="group" aria-labelledby={headingId} style={{ marginTop: 16 }}>
      <div id={headingId} style={{ font: `600 13px ${font.body}`, color: color.text, marginBottom: 4 }}>Also cancel for</div>
      {siblings.map((s) => {
        const on = ticked.has(s.athleteId);
        const first = String(s.name ?? '').trim().split(/\s+/)[0] || 'Athlete';
        return (
          <button
            key={s.athleteId}
            type="button"
            role="checkbox"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onToggle(s.athleteId)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              width: '100%',
              minHeight: 44,
              padding: 0,
              background: 'none',
              border: 'none',
              textAlign: 'left',
              font: `500 14px ${font.body}`,
              color: color.text,
              cursor: disabled ? 'default' : 'pointer',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 26,
                height: 26,
                flex: 'none',
                borderRadius: radius.pill,
                background: on ? color.primary : 'transparent',
                border: on ? 'none' : `1.5px solid ${color.faintText}`,
                display: 'grid',
                placeItems: 'center',
                boxSizing: 'border-box',
              }}
            >
              {on ? <Tick size={11} /> : null}
            </span>
            <span>
              {first} · {staffStatusLabel(s.row.status)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
