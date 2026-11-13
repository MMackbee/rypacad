import React from 'react';
import Button from '../Button';
import StaffSheet from './StaffSheet';
import AthleteSearch from './AthleteSearch';
import { CLOSE, athletePickerTitle } from '../../data/staffBookingCopy';

/**
 * The roster's "Add an athlete to {Training block}, {Tue Nov 17, 4:00 PM}"
 * sheet (spec 01-spec-admin-booking.md 10.3, 10.5): the athlete search,
 * loaded at once, with the athletes already on the session ("On this
 * session") and test athletes ("Test") shown but not tappable, and Close.
 * A pick hands over searchAthletes' row; the caller opens the add sheet.
 *
 * @param {{id, date, time, label}} session
 * @param {string[]} onSessionIds  The athletes already on the session.
 */
export default function AthletePicker({ session, onSessionIds = [], onPick, onClose }) {
  return (
    <StaffSheet
      title={athletePickerTitle(session.label, session.date, session.time)}
      onClose={onClose}
      footer={
        <Button variant="outline" height={44} style={{ boxShadow: 'none' }} onClick={onClose}>
          {CLOSE}
        </Button>
      }
    >
      <div style={{ marginTop: 14 }}>
        <AthleteSearch armed disableTest disabledIds={onSessionIds || []} onPick={onPick} />
      </div>
    </StaffSheet>
  );
}
