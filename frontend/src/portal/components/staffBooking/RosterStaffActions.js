import React, { useState } from 'react';
import Button from '../Button';
import StaffCancelSheet from '../StaffCancelSheet';
import AthletePicker from './AthletePicker';
import StaffAddSheet from './StaffAddSheet';
import StaffMoveSheet from './StaffMoveSheet';
import StaffRowActions from './StaffRowActions';
import { academyDateISO } from '../../data/calendar';
import { periodFor } from '../../data/packages';
import { rosterMembers, rosterRowToStaffRow, staffMayBook, staffMovable } from '../../data/staffBooking';
import { ADD_ATHLETE } from '../../data/staffBookingCopy';
import { firstOf, staffCancellable } from '../../data/staffCancel';

/**
 * Staff booking on the session roster (owner 2026-11-13, spec
 * 01-spec-admin-booking.md 10.3): the owner or ops adds an athlete to the
 * session, and moves or cancels one athlete's booking. Every piece of logic
 * lives here, so screens/Roster.js only mounts these two and hands each
 * `onDone` its sticky status line. The server decides every charge, seat and
 * email (functions/portal/staff-book.js, moveBooking's staff mode,
 * staffCancelBooking).
 */

/**
 * Add athlete (outline, 44px, an equal half beside Cancel session), then the
 * athlete picker, then the add confirm on this fixed session. Nothing unless
 * `staffMayBook(role)` and the roster does not hide it (`hidden`: a
 * cancelled or mental session, a held Calendly slot, a typed URL, seed mode).
 * A past session still offers it: the server judges the period.
 * @param {{id: string, date: ?string, time: ?string, type: ?string, label: ?string}} session
 * @param {Array<object>} rows  The roster's rows (confirmed, attended and no-show bookings).
 * @param {() => void} [onOpen]  Called as the picker opens: the roster clears
 *   its sticky status line there, which would otherwise paint over the sheet.
 * @param {(line: string) => void} onDone  The success line.
 */
export function RosterAddAthlete({ role, session, rows, hidden, onOpen, onDone }) {
  const [step, setStep] = useState(null); // null | 'pick' | { athleteId, name }
  if (!staffMayBook(role) || hidden) return null;
  const openPicker = () => {
    if (onOpen) onOpen();
    setStep('pick');
  };
  return (
    <>
      <Button variant="outline" height={44} style={{ boxShadow: 'none', flex: '1 1 0%' }} onClick={openPicker}>
        {ADD_ATHLETE}
      </Button>
      {step === 'pick' ? (
        <AthletePicker
          session={session}
          onSessionIds={(rows || []).map((r) => r.athleteId)}
          onPick={(athlete) => setStep({ athleteId: athlete.athleteId, name: athlete.name ?? null })}
          onClose={() => setStep(null)}
        />
      ) : null}
      {step && step !== 'pick' ? (
        <StaffAddSheet
          athleteId={step.athleteId}
          name={step.name}
          sessionId={session.id}
          onClose={() => setStep(null)}
          onDone={(line) => {
            setStep(null);
            onDone(line);
          }}
        />
      ) : null}
    </>
  );
}

/**
 * The start of the household's current period, from the row's own period
 * key: its day is the household anchor (plan decision 14). Null without one,
 * which leaves the period to the server.
 */
function periodStartOf(row, now) {
  if (!row.periodKey) return null;
  return periodFor(academyDateISO(now), Number(row.periodKey.slice(8, 10))).periodKey;
}

/**
 * Move and Cancel under one roster row ("Move Jordan", "Cancel Jordan's
 * booking"), on a Booked or No-show booking of a period that is not over,
 * never on a cancelled session. Nothing unless `staffMayBook(role)` and the
 * screen has the row's booking (seed mode and a typed URL have none). It
 * owns the move and cancel sheets; the cancel sheet's brothers and sisters
 * are the household's own rows on this roster.
 * @param {?object} row  The roster row (liveSessionAttendance, with the staff fields).
 * @param {() => void} [onOpen]  Called as either sheet opens (the roster
 *   clears its sticky status line, as for Add athlete).
 * @param {(line: string) => void} onDone  The success line.
 */
export function RosterRowActions({ role, row, rows, session, sessionCancelled, onOpen, onDone, now = new Date() }) {
  const [open, setOpen] = useState(null); // null | 'move' | 'cancel'
  if (!row || !staffMayBook(role) || sessionCancelled) return null;
  const staffRow = rosterRowToStaffRow(row, session);
  const periodStart = periodStartOf(row, now);
  const shown = staffMovable(staffRow, { periodStart }) || staffCancellable(staffRow, { periodStart });
  const openSheet = (which) => {
    if (onOpen) onOpen();
    setOpen(which);
  };
  const finish = (line) => {
    setOpen(null);
    onDone(line);
  };
  return (
    <>
      {shown ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
          <StaffRowActions
            row={staffRow}
            first={firstOf(row.name)}
            periodStart={periodStart}
            onMove={() => openSheet('move')}
            onCancel={() => openSheet('cancel')}
          />
        </div>
      ) : null}
      {open === 'move' ? <StaffMoveSheet row={staffRow} name={row.name} onClose={() => setOpen(null)} onDone={finish} /> : null}
      {open === 'cancel' ? (
        <StaffCancelSheet
          row={staffRow}
          member={{ athleteId: row.athleteId, name: row.name }}
          members={rosterMembers(rows, row.householdId, session)}
          onClose={() => setOpen(null)}
          onCancelled={finish}
        />
      ) : null}
    </>
  );
}
