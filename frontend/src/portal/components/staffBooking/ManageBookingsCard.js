import React from 'react';
import { useNavigate } from 'react-router-dom';
import AthleteSearch from './AthleteSearch';
import { Body, Card, SectionLabel } from '../Primitives';
import { MANAGE_BOOKINGS_BODY, MANAGE_BOOKINGS_LABEL } from '../../data/staffBookingCopy';

/**
 * Manage bookings on the Admin screen (spec 01-spec-admin-booking.md 10.2,
 * plan 04-plan-admin-booking.md Task E6), right after Outstanding, for the
 * owner and ops: find any athlete by name and open their bookings
 * (screens/StaffAthleteBookings.js), where staff add, move or cancel. The
 * households directory loads on the field's first focus, not on every
 * Admin open (AthleteSearch). A test athlete stays tappable here: its
 * screen says why it cannot be booked.
 */
export default function ManageBookingsCard() {
  const navigate = useNavigate();
  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 6 }}>{MANAGE_BOOKINGS_LABEL}</SectionLabel>
      <Body size={12} style={{ marginBottom: 12 }}>
        {MANAGE_BOOKINGS_BODY}
      </Body>
      <AthleteSearch onPick={(a) => navigate(`/portal/admin/athletes/${a.athleteId}/bookings`)} />
    </Card>
  );
}
