import React from 'react';
import { color, font } from '../tokens';
import { Body, Card } from '../components/Primitives';
import { FACILITY_COVERS } from '../data/billingCopy';
import { FACILITY_ACCESS } from '../data/packages';
import { familyFacilityOption } from '../data/signup';
import { Checkbox } from './RegistrationConsent';

/* `self` is the adult signing up for themselves: the same thing without "family". */
export const facilityAddOnTitle = (self = false) => `Add 24/7 ${self ? '' : 'family '}facility access · $${FACILITY_ACCESS.price}/month`;
export const facilityAddOnLine = (self = false) => (self
  ? 'Come in and practice any time outside coached sessions. Billed monthly, starts once your membership is paid.'
  : `${FACILITY_COVERS} Billed monthly, starts once a membership is paid.`);
export const facilityIncluded = (self = false) => `24/7 facility access · Included ${self ? '' : 'for your whole family '}with Elite`;

/**
 * The facility add-on under the package cards (owner request, Mike
 * 2026-09-30: "a check box below the packages" - families never found it in
 * Billing). It is a FAMILY add-on (owner ruling 2026-09-30): ONE tick for
 * the whole form, the same whichever athlete's tab is open, sign-up and link
 * mode alike - `form.facilityRequested`, never a field of one athlete. With
 * someone on a 6, 12 or 16 token package it is the tick; with anyone on
 * Elite it reads "Included" for the whole family; otherwise nothing
 * (data/signup.js familyFacilityOption). Kept out of RegistrationSteps.js
 * for the 500-line rule and re-exported from there, like
 * RegistrationConsent.js.
 * @param {Array} athletes  The form's entries (`packageId`).
 * @param {boolean} checked  The family tick.
 * @param {(v: boolean) => void} onChange
 * @param {boolean} [self]  Form mode 'athlete'.
 * @param {?Array} [household]  Link mode: the athletes already in the family.
 */
export function FacilityAddOn({ athletes, checked, onChange, self = false, household = null }) {
  const option = familyFacilityOption(athletes, household);
  if (option === 'included') {
    return (
      <Card large>
        <div style={{ font: `600 14px ${font.body}`, color: color.text }}>{facilityIncluded(self)}</div>
      </Card>
    );
  }
  if (option !== 'offer') return null;
  return (
    <Card large>
      <div style={{ display: 'flex', gap: 13 }}>
        <Checkbox
          checked={checked === true}
          onChange={onChange}
          label={`Add 24/7 ${self ? '' : 'family '}facility access`}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: `600 14px ${font.body}`, color: color.text }}>{facilityAddOnTitle(self)}</div>
          <Body size={12} style={{ marginTop: 6 }}>{facilityAddOnLine(self)}</Body>
        </div>
      </div>
    </Card>
  );
}
