import React, { useEffect, useId, useRef } from 'react';
import { color, font, glow, radius } from '../../tokens';
import Button from '../Button';
import { Body, Card, SectionLabel } from '../Primitives';
import { useEvents } from '../../hooks/events';
import { srOnly } from '../door/HoldToUnlock';
import { CARD_HEADING, NEW_TAB_HINT } from '../../data/events';

/** Tap targets: at least 44 px. */
const TAP = 46;
const WRAP = { overflowWrap: 'anywhere' };
/** One id for each button of one card: useId's key plus the action. */
const idOf = (key, action) => `${key}-${action}`;

/**
 * The workshop card (hq card 5, 2026-11-19): one card for each academy event
 * held online, on the parent and athlete homes. "I'm coming" signs the account
 * up; "Join on Google Meet" shows only to an account that signed up, once the
 * owner has put the link in, until the event's end; after the end the card goes,
 * unless the owner set a recording link. What each state shows is decided in
 * data/events.js (eventView); what is read and written is hooks/events.js.
 *
 * Looks: "Join on Google Meet" alone has the green fill and glow (it is what a signed-up person came
 * for); "I'm coming" and "Watch the recording" are the quiet `secondary` look, so the card does not
 * outshout a payment banner. While a write runs only the tapped button shows the app's loading look; the
 * card's other buttons are disabled. Every button and link points at the card's title (aria-describedby).
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
  const { view, busy, error, note } = card;
  const statusRef = useRef(null);
  const pendingFocus = useRef(null);
  const key = useId();
  const titleId = `${key}-title`;
  const buttonId = (action) => idOf(key, action);
  // A button that is busy is disabled, and a disabled button drops focus; a tap that swaps the button away
  // drops it too. When the work ends, focus goes back to the same button if it is still on the card, else to
  // what the card now says - and only if the page lost focus (a person who moved on keeps theirs).
  useEffect(() => {
    if (busy || !pendingFocus.current) return;
    const action = pendingFocus.current;
    pendingFocus.current = null;
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    if (active && active !== document.body && active.isConnected) return;
    const same = document.getElementById(idOf(key, action));
    (same || statusRef.current || { focus() {} }).focus();
  }, [busy, key]);
  const tap = async (action) => {
    pendingFocus.current = action;
    await run(action);
  };
  const { primary } = view;
  const describe = { 'aria-describedby': titleId };
  return (
    <Card large style={style}>
      <SectionLabel style={{ marginBottom: 12 }}>{CARD_HEADING}</SectionLabel>
      <h3 id={titleId} style={{ margin: 0, fontFamily: font.head, fontSize: 16, fontWeight: 700, lineHeight: 1.3, color: color.text, ...WRAP }}>{view.title}</h3>
      {view.timeLine ? <Body size={13} tone={color.text} style={{ marginTop: 6, ...WRAP }}>{view.timeLine}</Body> : null}
      {view.summary ? <Body size={13} style={{ marginTop: 8, ...WRAP }}>{view.summary}</Body> : null}
      {view.status ? (
        <div ref={statusRef} tabIndex={-1} role="status" style={{ marginTop: 12, outline: 'none' }}>
          <Body size={13} tone={color.text} style={WRAP}>{view.status}</Body>
        </div>
      ) : null}
      {primary && primary.href ? <LinkButton href={primary.href} fill={primary.fill} describe={titleId}>{primary.label}</LinkButton> : null}
      {primary && !primary.href ? (
        <Button id={buttonId(primary.action)} variant="secondary" height={TAP} loading={busy === 'signup'} disabled={Boolean(busy) && busy !== 'signup'}
          onClick={() => tap(primary.action)} style={{ marginTop: 14, font: `600 15px ${font.body}` }} {...describe}>
          {primary.label}
        </Button>
      ) : null}
      {view.quiet.map((q) => (
        <Button key={q.action} id={buttonId(q.action)} variant="outline" height={TAP} loading={busy === q.action} disabled={Boolean(busy) && busy !== q.action}
          onClick={() => tap(q.action)} style={{ marginTop: 10, font: `600 14px ${font.body}` }} {...describe}>
          {q.label}
        </Button>
      ))}
      <div role="status" style={{ marginTop: error || note ? 10 : 0 }}>
        {error ? <Body size={13} tone={color.error} style={WRAP}>{error}</Body> : null}
        {!error && note ? <Body size={13} tone={color.textSecondary} style={WRAP}>{note}</Body> : null}
      </div>
      {view.notice ? <Body size={12} tone={color.textTertiary} style={{ marginTop: 14, ...WRAP }}>{view.notice}</Body> : null}
    </Card>
  );
}

/**
 * A link that opens in a new tab, shaped like a button (Button is a <button>; this one needs an address):
 * the green fill and glow when `fill`, else the secondary look. Says "(opens in a new tab)" to a screen reader.
 */
function LinkButton({ href, fill, describe, children }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-describedby={describe}
      style={{
        boxSizing: 'border-box', width: '100%', height: TAP, marginTop: 14, padding: '0 16px', textDecoration: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: radius.input,
        font: `600 15px ${font.body}`,
        ...(fill
          ? { background: color.primary, border: `1px solid ${color.primary}`, color: '#000', boxShadow: glow.buttonPrimary }
          : { background: color.surface, border: `1px solid ${color.border}`, color: color.text }),
      }}
    >
      {children}
      <span style={srOnly}>{NEW_TAB_HINT}</span>
    </a>
  );
}
