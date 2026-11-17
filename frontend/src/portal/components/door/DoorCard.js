import React, { useEffect, useRef, useState } from 'react';
import { color, font } from '../../tokens';
import Button from '../Button';
import { Body, Card, SectionLabel } from '../Primitives';
import HoldToUnlock from './HoldToUnlock';
import DoorRulesSheet from './DoorRulesSheet';
import { useDoorPress, useDoorStatus } from '../../hooks/door';
import { CARD_REASONS, DIDNT_OPEN, LOCATION_NOTE, cardShows, doorCopy, refusalCopy } from '../../data/doorRules';

/** The staff screen's line when the check itself failed (families see no card then). */
export const STAFF_CHECK_FAILED = "The door check didn't load. Reload the page to try again.";

/**
 * The facility door card (docs/portal/plans/2026-11-17-door-button/00-spec.md 7)
 * on the family and athlete homes: hold Unlock at the academy door.
 *
 * Shows when the check says Unlock is open, or for the four reasons a family
 * can act on or should know (sign-rules with a "Sign the door rules" button,
 * guardian-rules, under-16, paused); hidden for every other reason, while
 * checking, on a failed check, and in seed and practice modes (useDoorStatus
 * never calls there). A press refused for one of those four switches the card
 * to that state; any other refusal is said under the button, which stays.
 *
 * `staffScreen` (the Facility door admin screen): the same control for owner
 * and ops, shown whatever the check said (the switch being Off says so), and
 * rechecked whenever `recheckKey` changes (the switch, the location).
 *
 * @param {boolean} [practice]  The onboarding walkthrough: nothing.
 * @param {boolean} [selfWording]  An adult athlete's own login: the rules in the second person.
 * @param {string} [label]  The card's heading.
 */
export default function DoorCard({ practice = false, selfWording = false, staffScreen = false, recheckKey = null, label = 'Facility door', style }) {
  const { status, error, recheck } = useDoorStatus({ practice });
  // A press refused for a reason the card shows as a state (sign-rules after the version moved on, paused meanwhile).
  const [stateReason, setStateReason] = useState(null);
  const [signing, setSigning] = useState(false);
  // A press that switched the card took the button away: focus goes to
  // what the card now says (review 2026-11-17 app-7).
  const stateRef = useRef(null);
  const switchedByPress = useRef(false);
  const pressing = useDoorPress({
    staff: status?.staff === true,
    openSeconds: status?.openSeconds,
    onReason: (reason) => {
      if (CARD_REASONS.includes(reason)) {
        switchedByPress.current = true;
        setStateReason(reason);
      }
    },
  });
  useEffect(() => {
    if (!stateReason || !switchedByPress.current) return;
    switchedByPress.current = false;
    if (stateRef.current) stateRef.current.focus();
  }, [stateReason]);

  // Recheck only when the key really changed: comparing with the last key
  // (not a "first run" flag) stays right when StrictMode runs effects twice.
  const lastKey = useRef(recheckKey);
  useEffect(() => {
    if (Object.is(lastKey.current, recheckKey)) return;
    lastKey.current = recheckKey;
    setStateReason(null);
    recheck();
  }, [recheckKey, recheck]);

  const view = stateReason ? { canUnlock: false, reason: stateReason, staff: false } : status;
  if (staffScreen ? !status && !error : !view || !cardShows(view.reason, view.canUnlock)) return null;

  let body;
  if (!view) {
    body = <Body size={13}>{STAFF_CHECK_FAILED}</Body>;
  } else if (view.canUnlock) {
    body = (
      <>
        <HoldToUnlock onUnlock={pressing.press} busy={pressing.busy} />
        <PressMessage result={pressing.result} left={pressing.left} busy={pressing.busy} staff={view.staff} />
      </>
    );
  } else if (view.reason === 'sign-rules') {
    body = (
      <>
        <StateMessage ref={stateRef}>{doorCopy('sign-rules')}</StateMessage>
        <Button height={46} onClick={() => setSigning(true)} style={{ marginTop: 12, font: `600 15px ${font.body}` }}>
          Sign the door rules
        </Button>
      </>
    );
  } else {
    body = <StateMessage ref={stateRef}>{refusalCopy(view.reason, '')}</StateMessage>;
  }

  return (
    <Card large style={style}>
      <SectionLabel style={{ marginBottom: 12 }}>{label}</SectionLabel>
      {body}
      {signing ? (
        <DoorRulesSheet
          selfWording={selfWording}
          onClose={() => setSigning(false)}
          onSigned={() => {
            setSigning(false);
            setStateReason(null);
            recheck();
          }}
        />
      ) : null}
    </Card>
  );
}

/** What the card says instead of the button: a status a press can move focus to. */
const StateMessage = React.forwardRef(function StateMessage({ children }, ref) {
  return (
    <div ref={ref} tabIndex={-1} role="status" style={{ outline: 'none' }}>
      <Body size={13} tone={color.text}>
        {children}
      </Body>
    </div>
  );
});

/**
 * Under the button: the location line before the first press (a family's
 * login only), then what the last press did. An opened door counts its open
 * seconds down, then offers another go. The words are a polite live region;
 * the ticking seconds are not read out.
 */
function PressMessage({ result, left, busy, staff }) {
  let words = null;
  let tone = color.textSecondary;
  let after = null;
  if (busy) {
    words = null;
  } else if (!result) {
    words = staff ? null : LOCATION_NOTE;
    tone = color.textTertiary;
  } else if (result.kind === 'outcome') {
    words = doorCopy(result.outcome) || refusalCopy(null);
    tone = color.text;
    if (result.outcome === 'opened' && left > 0) {
      tone = color.primary;
      after = `Open for ${left} s`;
    } else if (result.outcome === 'opened') {
      // The door has locked again.
      words = DIDNT_OPEN;
      tone = color.textSecondary;
    }
  } else {
    words = refusalCopy(result.reason, result.message);
    tone = color.error;
  }
  return (
    <div style={{ marginTop: 14, textAlign: 'center' }}>
      <div role="status" aria-live="polite" style={{ font: `500 13px/1.5 ${font.body}`, color: tone }}>
        {words}
      </div>
      {after ? (
        <div aria-hidden="true" style={{ marginTop: 4, font: `600 12px ${font.body}`, color: color.textSecondary }}>
          {after}
        </div>
      ) : null}
    </div>
  );
}
