import React from 'react';
import { color, font, radius, tint } from '../tokens';
import Button from './Button';
import { capReachedCopy, reasonCopy } from './BookingReasons';
import { Banner, Body, Card, SectionLabel } from './Primitives';
import { calendlyLinkFor, CALENDLY_NOTE, CALENDLY_NOTE_UNLIMITED } from '../data/calendly';
import { attendeeContact, calendlyBlockReason } from '../data/specialistGate';

/** Yannick via Calendly (spec 6.1): one button, gated exactly like an in-app booking, opening a prefilled link in a new tab. */
export default function CalendlyPanel({ data, tokens, capReached, attendee, onAttendee, householdId, open = (url) => window.open(url, '_blank', 'noopener') }) {
  const reason = calendlyBlockReason({ billingStatus: data.billingStatus, bookingOpen: data.bookingOpen, tokens, capReached });
  const contact = attendeeContact({ attendee, athlete: data.athlete, guardian: data.guardian });
  const link = calendlyLinkFor({ url: data.calendlyUrl, athleteId: data.athlete?.id ?? '', athleteName: data.athlete?.name ?? '', householdId: householdId ?? '', ...contact });
  return (
    <Card large>
      <SectionLabel>Who is attending?</SectionLabel>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        {[['athlete', 'The athlete'], ['parent', 'A parent']].map(([value, label]) => {
          const on = attendee === value;
          return (
            <button key={value} type="button" aria-pressed={on} onClick={() => onAttendee(value)}
              style={{ flex: 1, minHeight: 44, cursor: 'pointer', borderRadius: radius.input, border: `1px solid ${on ? color.primary : color.controlBorder}`, background: on ? tint.green : 'transparent', color: on ? color.primary : color.textSecondary, font: `600 13px ${font.body}` }}>
              {label}
            </button>
          );
        })}
      </div>
      {reason ? (
        <Banner tone="yellow" title="Not yet" style={{ marginTop: 14 }}>{reason === 'cap-reached' ? capReachedCopy() : reasonCopy(reason)}</Banner>
      ) : (
        <Button height={50} onClick={() => open(link)} style={{ marginTop: 14 }}>Book with Yannick</Button>
      )}
      <Body size={11} tone={color.textTertiary} style={{ marginTop: 10 }}>{tokens?.unlimited ? CALENDLY_NOTE_UNLIMITED : CALENDLY_NOTE}</Body>
    </Card>
  );
}
