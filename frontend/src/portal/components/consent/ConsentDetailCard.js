import React from 'react';
import { Card } from '../Primitives';
import ConsentLine from './ConsentLine';
import { useFamilyConsents } from '../../hooks/mentalConsent';

/** The parent's view on the athlete page: the row's line, from the household's own read. */
function FamilyConsentDetail({ athleteId }) {
  const { data } = useFamilyConsents();
  const row = data?.byId?.[athleteId];
  if (!row) return null;
  return (
    <Card>
      <ConsentLine row={row} />
    </Card>
  );
}

/**
 * Yannick's consent on AthleteDetail (spec 4.1 and 5, plan Task 13): a
 * switch that calls no hook itself, so a role that resolves after the first
 * render remounts the right branch instead of changing the hook order.
 * Parent -> the family line; ops and owner -> the staff status and paper
 * signatures (Task 15); every other role (coach, mental) -> nothing.
 * `demoPaperOpen` is the review harness's (seed only).
 */
export default function ConsentDetailCard({ athleteId, role }) {
  if (role === 'parent') return <FamilyConsentDetail key="parent" athleteId={athleteId} />;
  return null;
}
