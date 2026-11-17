import React from 'react';
import { useNavigate } from 'react-router-dom';
import AthleteSearch from './AthleteSearch';
import { Body, Card, SectionLabel } from '../Primitives';
import { FIND_FAMILY_BODY, FIND_FAMILY_CARD_LABEL, FIND_FAMILY_LABEL, familyPagePath } from '../../data/staffFamily';

/**
 * Find a family on the Admin screen, right after Outstanding, for the owner
 * and ops (2026-11-16, the single family page; it was "Manage bookings",
 * spec 01-spec-admin-booking.md 10.2): search by an athlete's name, the
 * family's or the parent's, and open the FAMILY PAGE on that athlete, where
 * staff book, move, cancel and change everything else. The households
 * directory loads on the field's first focus, not on every Admin open
 * (AthleteSearch). A test athlete stays tappable here: the page says why it
 * cannot be booked.
 */
export default function ManageBookingsCard() {
  const navigate = useNavigate();
  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 6 }}>{FIND_FAMILY_CARD_LABEL}</SectionLabel>
      <Body size={12} style={{ marginBottom: 12 }}>
        {FIND_FAMILY_BODY}
      </Body>
      <AthleteSearch label={FIND_FAMILY_LABEL} onPick={(a) => navigate(familyPagePath(a.householdId, a.athleteId))} />
    </Card>
  );
}
