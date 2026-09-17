import React from 'react';
import { color, font } from '../tokens';
import Button from './Button';
import { Body, Card, SectionLabel } from './Primitives';
import { usePush } from '../hooks';

/**
 * "Push notifications" on Settings (contract v2.3, Sprint 15): the phone
 * channel is a browser push, not a text. One card, one button - the state
 * copy does the explaining, because the failure modes are all about the
 * device (Safari on iPhone needs the portal on the Home Screen first; a
 * browser that blocked notifications has to unblock them itself).
 */
const STATE_COPY = {
  unsupported: "This browser can't receive push notifications. Email notices still arrive.",
  'ios-install':
    'On iPhone, add the portal to your Home Screen first (Share → Add to Home Screen), then open it from there and turn on push.',
  unconfigured: "Push isn't switched on for this site yet. Email notices still arrive.",
  blocked: 'Notifications are blocked for this site in your browser settings. Allow them there, then reload.',
};

export default function PushCard({ style }) {
  const { support, enabled, busy, error, enable, disable } = usePush();

  let body;
  let action = null;
  if (support === null) {
    body = 'Checking this device…';
  } else if (enabled && support === 'ready') {
    body = 'On for this device. Bookings, reminders and membership notices will buzz here.';
    action = (
      <Button variant="outline" height={40} loading={busy} onClick={disable} style={{ boxShadow: 'none', marginTop: 12 }}>
        Turn off on this device
      </Button>
    );
  } else if (support === 'ready') {
    body = 'Get a buzz on this device for bookings, reminders and membership notices.';
    action = (
      <Button height={44} loading={busy} onClick={enable} style={{ marginTop: 12, font: `600 14px ${font.body}` }}>
        Turn on push
      </Button>
    );
  } else {
    body = STATE_COPY[support] || STATE_COPY.unsupported;
  }

  return (
    <Card large style={style}>
      <SectionLabel style={{ marginBottom: 10 }}>Push notifications</SectionLabel>
      <Body size={12} tone={color.textSecondary}>
        {body}
      </Body>
      {error ? (
        <Body size={12} tone={color.error} style={{ marginTop: 8 }}>
          {error}
        </Body>
      ) : null}
      {action}
    </Card>
  );
}
