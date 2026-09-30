import React from 'react';
import { color, font } from '../tokens';
import { Body, Card } from '../components/Primitives';
import { FACILITY_ACCESS } from '../data/packages';
import { facilityOptionFor } from '../data/signup';
import { Checkbox } from './RegistrationConsent';

export const FACILITY_ADD_ON_TITLE = `Add 24/7 facility access · $${FACILITY_ACCESS.price}/month`;
export const FACILITY_ADD_ON_LINE =
  'Come in and practice any time outside coached sessions. Billed monthly with the membership, starts once the membership is paid.';
export const FACILITY_INCLUDED = '24/7 facility access · Included with Elite';

/**
 * The facility add-on under the package cards (owner request, Mike
 * 2026-09-30: "a check box below the packages" - families never found it in
 * Billing). One per athlete: PackageStep renders it for the athlete whose
 * tab is open, sign-up and link mode alike. A token package gets the tick,
 * stored on the form entry as `facilityRequested`; Elite reads "Included";
 * the single token and no pick yet show nothing (data/signup.js
 * facilityOptionFor). Kept out of RegistrationSteps.js for the 500-line
 * rule and re-exported from there, like RegistrationConsent.js.
 * @param {object} athlete  The form entry (`key`, `packageId`, `facilityRequested`).
 * @param {string} name     How the tabs name this athlete ('Nico', 'Athlete 2').
 * @param {(key: string, patch: object) => void} onUpdate
 */
export function FacilityAddOn({ athlete, name, onUpdate }) {
  const option = facilityOptionFor(athlete.packageId);
  if (option === 'included') {
    return (
      <Card large>
        <div style={{ font: `600 14px ${font.body}`, color: color.text }}>{FACILITY_INCLUDED}</div>
      </Card>
    );
  }
  if (option !== 'offer') return null;
  return (
    <Card large>
      <div style={{ display: 'flex', gap: 13 }}>
        <Checkbox
          checked={athlete.facilityRequested === true}
          onChange={(v) => onUpdate(athlete.key, { facilityRequested: v })}
          label={`Add 24/7 facility access for ${name}`}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: `600 14px ${font.body}`, color: color.text }}>{FACILITY_ADD_ON_TITLE}</div>
          <Body size={12} style={{ marginTop: 6 }}>{FACILITY_ADD_ON_LINE}</Body>
        </div>
      </div>
    </Card>
  );
}
