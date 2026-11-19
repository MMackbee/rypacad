import React, { useRef } from 'react';
import { color, font, glow, radius } from '../../tokens';
import Button from '../Button';
import { Body, Card, SectionLabel } from '../Primitives';
import { useEvents } from '../../hooks/events';
import { CARD_HEADING } from '../../data/events';

/** Tap targets: at least 44 px. */
const TAP = 46;
const WRAP = { overflowWrap: 'anywhere' };

/**
 * The workshop card (hq card 5, 2026-11-19): one card for each academy event
 * held online, on the parent and athlete homes. "I'm coming" signs the account
 * up; "Join on Google Meet" shows only to an account that signed up, once the
 * owner has put the link in, until the event's end; after the end the card goes,
 * unless the owner set a recording link. What each state shows is decided in
 * data/events.js (eventView); what is read and written is hooks/events.js.
 *
 * Fails closed: nothing at all in seed mode, in the onboarding walkthrough
 * (`practice`), for a disabled or unreadable event and after a failed first
 * read. Text from the documents is rendered as text, never as HTML.
 *
 * @param {boolean} [practice]  The onboarding walkthrough: nothing.
 */
export default function EventCard({ practice = false, style }) {
  const { cards, signUp, takeBack, checkLink } = useEvents({ practice });
  const actions = { come: signUp, back: takeBack, check: checkLink };
  return (
    <>
      {cards.map((c) => (
        <OneEvent key={c.id} card={c} run={(action) => actions[action](c.id)} style={style} />
      ))}
    </>
  );
}

function OneEvent({ card, run, style }) {
  const { view, busy, error } = card;
  const statusRef = useRef(null);
  // A tap that swaps the button away would drop focus on the page: put it on what the card now says.
  const tap = async (action) => {
    await run(action);
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    if (statusRef.current && (!active || active === document.body || !active.isConnected)) statusRef.current.focus();
  };
  const { primary } = view;
  return (
    <Card large style={style}>
      <SectionLabel style={{ marginBottom: 12 }}>{CARD_HEADING}</SectionLabel>
      <h3 style={{ margin: 0, font: `700 18px/1.3 ${font.head}`, color: color.text, ...WRAP }}>{view.title}</h3>
      {view.timeLine ? <Body size={13} tone={color.text} style={{ marginTop: 6, ...WRAP }}>{view.timeLine}</Body> : null}
      {view.summary ? <Body size={13} style={{ marginTop: 8, ...WRAP }}>{view.summary}</Body> : null}
      {view.status ? (
        <div ref={statusRef} tabIndex={-1} role="status" style={{ marginTop: 12, outline: 'none' }}>
          <Body size={13} tone={color.text} style={WRAP}>{view.status}</Body>
        </div>
      ) : null}
      {primary && primary.href ? <LinkButton href={primary.href}>{primary.label}</LinkButton> : null}
      {primary && !primary.href ? (
        <Button height={TAP} loading={busy === 'signup'} disabled={Boolean(busy)} onClick={() => tap(primary.action)} style={{ marginTop: 14, font: `600 15px ${font.body}` }}>
          {primary.label}
        </Button>
      ) : null}
      {view.quiet.map((q) => (
        <Button key={q.action} variant="outline" height={TAP} loading={busy === q.action} disabled={Boolean(busy)} onClick={() => tap(q.action)}
          style={{ marginTop: 10, font: `600 14px ${font.body}` }}>
          {q.label}
        </Button>
      ))}
      <div role="status" style={{ marginTop: error ? 10 : 0 }}>
        {error ? <Body size={13} tone={color.error} style={WRAP}>{error}</Body> : null}
      </div>
      {view.notice ? <Body size={12} tone={color.textTertiary} style={{ marginTop: 14, ...WRAP }}>{view.notice}</Body> : null}
    </Card>
  );
}

/** The main button as a link that opens in a new tab (Button is a <button>; this one needs an address). */
function LinkButton({ href, children }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        boxSizing: 'border-box', width: '100%', height: TAP, marginTop: 14, padding: '0 16px', textDecoration: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: radius.input,
        font: `600 15px ${font.body}`, background: color.primary, border: `1px solid ${color.primary}`, color: '#000', boxShadow: glow.buttonPrimary,
      }}
    >
      {children}
    </a>
  );
}
