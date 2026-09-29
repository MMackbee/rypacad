import React from 'react';
import { color } from '../tokens';
import PayButton from './PayButton';
import { Body, Card, SectionLabel } from './Primitives';
import { FACILITY_ACCESS } from '../data/packages';
import { facilityCardState, facilityLine } from '../data/billingCopy';

/**
 * The $300/month facility-access add-on (spec 4.5): bought per athlete once
 * the tier is active, never for Elite (included). The waiver stays ops-
 * verified: "paid - waiver pending" until consent is on file.
 */
export default function FacilityCard({ member, email = null, readOnly = false, style }) {
  const state = facilityCardState(member);
  if (!state) return null;
  return (
    <Card large style={style}>
      <SectionLabel style={{ marginBottom: 8 }}>Facility access</SectionLabel>
      {state === 'offer' ? (
        <>
          <Body size={12}>
            {readOnly ? 'No facility access add-on.' : `24/7 facility access for ${member.name} - $${FACILITY_ACCESS.price}/month, billed with the membership. The signed waiver is checked by the academy before the door opens.`}
          </Body>
          {readOnly ? null : (
            <PayButton athleteId={member.athleteId} product="facility" label="Add facility access" variant="secondary" height={44} email={email} style={{ marginTop: 12 }} />
          )}
        </>
      ) : (
        <Body size={12} tone={state === 'active' ? color.primary : color.secondary}>{facilityLine(state)}</Body>
      )}
    </Card>
  );
}
