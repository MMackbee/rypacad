import React from 'react';
import { color, font } from '../../tokens';
import { SkeletonBar } from '../Skeleton';
import { Body, Card, SectionLabel } from '../Primitives';
import { useConsentTracker } from '../../hooks/mentalConsentStaff';
import { monthDayLabel, sessionDateLabel } from '../../data/mentalConsent';

const rowButton = {
  display: 'block', width: '100%', minHeight: 44, padding: '10px 0', background: 'none', border: 'none', borderTop: `1px solid ${color.rowRule}`,
  textAlign: 'left', font: `400 13px/1.4 ${font.body}`, color: color.text, cursor: 'pointer',
};

/** `Reese Whitfield · Thu, Nov 12 · Not signed`, or `· last Oct 29 ·` when no 1:1 is ahead. */
function lineFor(r) {
  const when = r.nextMental ? sessionDateLabel(r.nextMental) : r.lastMental ? `last ${monthDayLabel(r.lastMental)}` : null;
  return [r.name, when, r.label].filter(Boolean).join(' · ');
}

/**
 * The Admin dashboard's "Mental consent" card for ops and the owner (spec
 * 5, plan Task 15): every athlete with a mental 1:1, past or ahead - not
 * signed with a 1:1 ahead first, then the other not signed, then signed.
 * A row opens the athlete's admin card, where a paper signature is recorded.
 */
export default function ConsentTrackerCard({ onOpenAthlete }) {
  const { data, loading, error } = useConsentTracker();
  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 4 }}>Mental consent</SectionLabel>
      <Body size={12} style={{ marginBottom: 8 }}>Yannick's consent form, for every athlete with a 1:1.</Body>
      {loading ? (
        <SkeletonBar width="70%" height={12} />
      ) : error ? (
        <Body size={12}>The consent list didn't load. Check your connection and try again.</Body>
      ) : !data?.length ? (
        <Body size={12}>No athlete has a mental 1:1 yet.</Body>
      ) : (
        data.map((r) => (
          <button key={r.athleteId} type="button" onClick={() => onOpenAthlete?.(r.athleteId)} style={rowButton}>
            {lineFor(r)}
          </button>
        ))
      )}
    </Card>
  );
}
