import React from 'react';
import { color, font } from '../tokens';
import PayButton from './PayButton';
import { Body, Card, SectionLabel } from './Primitives';
import { PAY_NOW, PENDING_TITLE } from '../data/billingCopy';

/** One banner, one Pay now per athlete who needs a checkout - pending, or lapsed and re-subscribing (spec 4.4). `title` is the hub status title (the lapsed wording differs); renders nothing when nobody is listed. `renderRowExtra(athlete)` adds a line under a row's name (the family page's Change package link). */
export default function PendingBanner({ pendingAthletes, body, title = null, email = null, renderRowExtra = null, style }) {
  if (!pendingAthletes || pendingAthletes.length === 0) return null;
  return (
    <Card tone="yellow" large style={style}>
      <SectionLabel tone={color.secondary}>{title || PENDING_TITLE}</SectionLabel>
      {body ? <Body size={12} style={{ marginTop: 8 }}>{body}</Body> : null}
      {pendingAthletes.map((a) => (
        <div key={a.athleteId} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <div style={{ flex: 1, minWidth: 0, font: `600 13px ${font.body}`, color: color.text }}>
            {a.name}
            {renderRowExtra ? renderRowExtra(a) : null}
          </div>
          <PayButton athleteId={a.athleteId} product="tier" label={PAY_NOW} height={44} email={email} style={{ width: 132, flex: 'none' }} />
        </div>
      ))}
    </Card>
  );
}
