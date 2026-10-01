import React from 'react';
import { color } from '../tokens';
import PayButton from './PayButton';
import { Body, Card, SectionLabel } from './Primitives';
import { facilityLine, facilityName, facilityOfferBody, facilityOfferLabel, facilityStillBilledLine, familyFacilityCard } from '../data/billingCopy';

/**
 * The $300/month FAMILY facility add-on (spec 4.5; owner ruling 2026-09-30):
 * ONE card for the household, never one per child. Offered once a 6, 12 or
 * 16 token membership is paid and billed on that athlete; never offered
 * while a live Elite membership covers the family. The waiver stays ops-
 * verified: "paid - waiver pending" until consent is on file.
 * `members` are the household's hub members. `self` (the adult who is their
 * own household) drops the word "family". `offer` false is for a login that
 * cannot see the whole household (a child's own): it shows access it can
 * see and never offers an add-on the family may already have.
 */
export default function FacilityCard({ members, email = null, readOnly = false, self = false, offer = true, style }) {
  const card = familyFacilityCard(members);
  if (!card || (card.state === 'offer' && !offer && !readOnly)) return null;
  const { state } = card;
  return (
    <Card large style={style}>
      <SectionLabel style={{ marginBottom: 8 }}>{facilityName(self)}</SectionLabel>
      {state === 'offer' ? (
        <>
          {card.lapsed ? <Body size={12} tone={color.secondary} style={{ marginBottom: 8 }}>{facilityLine('lapsed', self)}</Body> : null}
          <Body size={12}>
            {readOnly ? `No ${self ? '' : 'family '}facility access add-on.` : facilityOfferBody(self)}
          </Body>
          {readOnly ? null : (
            <PayButton athleteId={card.holder.athleteId} product="facility" label={facilityOfferLabel(self)} variant="secondary" height={44} email={email} style={{ marginTop: 12 }} />
          )}
        </>
      ) : (
        <>
          <Body size={12} tone={state === 'active' || state === 'elite' ? color.primary : color.secondary}>{facilityLine(state, self)}</Body>
          {/* Elite and a live add-on together (review 2026-09-30): told to the payer and to staff, never to a child's own login. */}
          {state === 'elite' && card.holder && (offer || readOnly) ? (
            <Body size={12} tone={color.secondary} style={{ marginTop: 8 }}>{facilityStillBilledLine(self, readOnly)}</Body>
          ) : null}
        </>
      )}
    </Card>
  );
}
