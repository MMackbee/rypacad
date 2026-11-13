import React, { useRef, useState } from 'react';
import { color } from '../../tokens';
import Button from '../Button';
import { Body } from '../Primitives';
import StaffSheet from './StaffSheet';
import StaffSessionPicker from './StaffSessionPicker';
import { staffMoveBooking, useStaffAthlete } from '../../hooks/staffBooking';
import { moveChargeKind, staffAddFacts } from '../../data/staffBooking';
import { firstOf } from '../../data/staffCancel';
import {
  ATHLETES_LOAD_FAILED,
  ATHLETE_NOT_ON_FILE,
  CLOSE,
  KEEP_IT,
  STAFF_CHANGE_UNCONFIRMED,
  moveChargeLine,
  moveConfirmLabel,
  moveSuccessLine,
  nothingChanged,
  refusalKind,
  staffMoveQuestion,
  staffMoveTitle,
  warningLine,
} from '../../data/staffBookingCopy';

/**
 * Move one booking to another session of the same kind, staff side (spec
 * 01-spec-admin-booking.md 10.5; moveBooking's staff mode, which the
 * caller's role picks). "Move Jordan to another Training block": the day
 * and session picker (same kind only, never the booking's own session)
 * with Close, then "Move Jordan from Tue Nov 17, 4:00 PM to Thu Nov 19,
 * 4:00 PM?" (or, on a full session, "... is full (12 of 12) - move Jordan
 * anyway?"), what happens to the token, the warnings of an add, and Move /
 * Keep it. No Free switch: a move keeps its payment.
 *
 * Every fact is read without the row being moved (the server leaves it
 * out too), so a same-day move never shows a false one-a-day warning.
 * One call per tap; it carries allowFull when the question was the full
 * one. Success hands the page its line and the caller closes the sheet.
 * A refusal: full turns into the question with the server's count; one
 * about the new session goes back to the picker, reloaded, under "...
 * Nothing was changed."; anything else ends with its line and Close; no
 * answer at all hands the page the unconfirmed line.
 *
 * @param {object} row  A billing hub row: id, athleteId, sessionId, date,
 *   time, type, label, chargedFrom, graceTokenId, comp.
 * @param {Date} [now]  The clock (tests pin it).
 */
export default function StaffMoveSheet({ row, name = null, onClose, onDone, now }) {
  const clock = now ?? new Date();
  const athlete = useStaffAthlete(row.athleteId);
  const [target, setTarget] = useState(null);
  const [pickedDay, setPickedDay] = useState(null); // the picker reopens on it
  const [asked, setAsked] = useState(null); // the server's full count, after a full refusal
  const [notice, setNotice] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [final, setFinal] = useState(null);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);

  const model = athlete.data;
  const moveModel = model ? { ...model, bookings: (model.bookings || []).filter((b) => b && b.id !== row.id) } : null;
  const first = model?.first ?? firstOf(name);
  const facts = moveModel && target ? staffAddFacts(target, moveModel, clock) : null;
  const full = Boolean(asked) || Boolean(facts?.full);

  const pick = (s) => {
    setNotice(null);
    setAsked(null);
    setTarget(s);
    setPickedDay(s.date ?? null);
  };

  /** What the sheet does with a refusal; true when the sheet is done with. */
  const refuse = (err) => {
    const kind = refusalKind(err?.reason, 'move');
    const line = err?.message || STAFF_CHANGE_UNCONFIRMED;
    if (kind === 'unconfirmed') {
      onDone(STAFF_CHANGE_UNCONFIRMED);
      return true;
    }
    if (kind === 'full') {
      const d = err.details;
      setAsked(d && d.taken != null && d.capacity != null ? { taken: d.taken, capacity: d.capacity } : { taken: facts.taken, capacity: facts.capacity });
    } else if (kind === 'session') {
      setTarget(null);
      setAsked(null);
      setNotice(nothingChanged(line));
      setReloadKey((k) => k + 1);
    } else {
      setFinal(line);
    }
    return false;
  };

  const confirm = async () => {
    if (sending.current || !target) return;
    sending.current = true;
    setBusy(true);
    try {
      await staffMoveBooking({ bookingId: row.id, toSessionId: target.id, allowFull: full }, { first });
      onDone(moveSuccessLine(first, target.date, target.time));
      return; // the caller closes the sheet; it stays busy until then
    } catch (err) {
      if (refuse(err)) return;
    }
    sending.current = false;
    setBusy(false);
  };

  const title = staffMoveTitle(first, row.type);
  const close = (
    <Button variant="outline" height={44} style={{ boxShadow: 'none' }} onClick={onClose}>
      {CLOSE}
    </Button>
  );
  const sheet = (body, footer = close) => (
    <StaffSheet title={title} onClose={busy ? null : onClose} footer={footer}>
      {body}
    </StaffSheet>
  );

  if (final) return sheet(<Line>{final}</Line>);
  if (athlete.error) return sheet(<Line>{athlete.error.code === 'not-found' ? ATHLETE_NOT_ON_FILE : ATHLETES_LOAD_FAILED}</Line>);
  if (!moveModel) return sheet(null);
  if (!target) {
    return sheet(<StaffSessionPicker model={moveModel} mode="move" fromRow={row} onPick={pick} notice={notice} reloadKey={reloadKey} initialDay={pickedDay} now={clock} />);
  }

  const charge = moveChargeLine(moveChargeKind(row, target, model));
  const buttons = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Button height={50} loading={busy} onClick={confirm}>
        {moveConfirmLabel({ full, busy })}
      </Button>
      <Button variant="outline" height={50} disabled={busy} style={{ boxShadow: 'none' }} onClick={onClose}>
        {KEEP_IT}
      </Button>
    </div>
  );
  return sheet(
    <>
      <Line>{staffMoveQuestion(first, row, target, full ? { full: true, ...(asked || facts) } : { full: false })}</Line>
      {charge ? <Line>{charge}</Line> : null}
      {facts.warnings.map((w) => (
        <Line key={w.kind} tone={color.secondary}>
          {warningLine(first, w)}
        </Line>
      ))}
    </>,
    buttons
  );
}

/** One line of the sheet's text. */
function Line({ tone, children }) {
  return (
    <Body size={12} tone={tone} style={{ marginTop: 10 }}>
      {children}
    </Body>
  );
}
