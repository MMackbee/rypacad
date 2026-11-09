import React from 'react';
import { Card } from '../Primitives';
import ConsentLine from './ConsentLine';
import { useFamilyConsents } from '../../hooks/mentalConsent';
import { familyLine } from '../../data/mentalConsent';

/**
 * The athlete's own home (spec 4.1, plan Task 13): the consent line for an
 * 18+ athlete (who signs it), and for a minor only the "Stop recording" a
 * minor's own login may use; nothing else for a minor, whose parent signs.
 * Nothing in the onboarding walkthrough (`practice`).
 */
export default function ConsentAthleteHomeLine({ practice = false }) {
  const { data } = useFamilyConsents({ as: 'athlete', practice });
  const row = data?.rows?.[0];
  if (!row || !(row.adultToday || familyLine(row).action === 'withdraw')) return null;
  return (
    <Card>
      <ConsentLine row={row} />
    </Card>
  );
}
