import React, { useRef, useState } from 'react';
import { color } from '../../tokens';
import Button from '../Button';
import ToggleRow from '../Toggle';
import { Body } from '../Primitives';
import StaffSheet from './StaffSheet';
import StaffSessionPicker from './StaffSessionPicker';
import { staffBookSession, useSessionWaitlistCount, useStaffAthlete, useStaffSession } from '../../hooks/staffBooking';
import { staffAddFacts } from '../../data/staffBooking';
import { sessionLabel } from '../../data/billingHub';
import { firstOf } from '../../data/staffCancel';
import {
  ATHLETES_LOAD_FAILED,
  ATHLETE_NOT_ON_FILE,
  BACK,
  BOOK_A_SESSION,
  CLOSE,
  FREE_LABEL,
  STAFF_CHANGE_UNCONFIRMED,
  addConfirmLabel,
  addSuccessLine,
  addSummary,
  addTitle,
  chargeLine,
  nothingChanged,
  refusalKind,
  staffRefusalLine,
  waitlistCountLine,
  warningLine,
} from '../../data/staffBookingCopy';

/**
 * Add one athlete to one session, staff side (spec 01-spec-admin-booking.md
 * 10.5). With neither `session` nor `sessionId` it opens on the day and
 * session picker (StaffSessionPicker) with Close; otherwise the session is
 * fixed (the roster) and it opens on the confirm.
 *
 * The confirm: "Add Jordan to this session?" (or, on a full session, "This
 * session is full (12 of 12) - add anyway?"), the summary, one charge line
 * (data/staffBooking.js staffAddFacts predicts it; the server decides), the
 * Free switch - hidden for Elite, on and locked when the athlete is not
 * paid up, and needed before the confirm when no tokens are left - the
 * warnings for each limit staff skip, and on a full session how many
 * others wait. One call per tap; the first call already carries allowFull
 * when the title was the full question.
 *
 * Success hands the page its line (onDone) and the caller closes the sheet;
 * it stays busy until then. A refusal never claims more than it knows
 * (data/staffBookingCopy.js refusalKind): full turns into the question with
 * the server's count; no tokens turns the charge to "none"; not paid turns
 * it to Free only; a refusal about the session goes back to the picker,
 * reloaded, under "... Nothing was changed." (with a fixed session it ends
 * there); anything else ends with its line and Close; no answer at all
 * hands the page the unconfirmed line.
 *
 * @param {Date} [now]  The clock (tests pin it).
 */
export default function StaffAddSheet({ athleteId, name = null, session = null, sessionId = null, onClose, onDone, now }) {
  const clock = now ?? new Date();
  const athlete = useStaffAthlete(athleteId);
  const fetched = useStaffSession(session ? null : sessionId);
  const fixed = Boolean(session || sessionId);
  const [step, setStep] = useState(fixed ? 'confirm' : 'pick');
  const [picked, setPicked] = useState(null);
  const [pickedDay, setPickedDay] = useState(null); // the picker reopens on it
  const [free, setFree] = useState(false);
  const [asked, setAsked] = useState(null); // the server's full count, after a full refusal
  const [turned, setTurned] = useState(null); // the charge after a no-tokens or not-paid refusal
  const [refused, setRefused] = useState(null); // that refusal's line
  const [notice, setNotice] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [final, setFinal] = useState(null);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);

  const model = athlete.data;
  const first = model?.first ?? firstOf(name);
  const target = fixed ? session || fetched.data : picked;
  const facts = model && target ? staffAddFacts(target, model, clock) : null;
  const full = Boolean(asked) || Boolean(facts?.full);
  const waiting = useSessionWaitlistCount(target?.id ?? null, { athleteId, enabled: step === 'confirm' && full });

  const charge = turned ?? facts?.charge ?? null;
  const freeOnly = charge?.kind === 'free-only';
  const freeOn = freeOnly || free;
  const blocked = charge?.kind === 'none' && !freeOn;

  const resetConfirm = () => {
    setFree(false);
    setAsked(null);
    setTurned(null);
    setRefused(null);
  };
  const toPicker = () => {
    resetConfirm();
    setPicked(null);
    setStep('pick');
  };
  const pick = (s) => {
    resetConfirm();
    setNotice(null);
    setPicked(s);
    setPickedDay(s.date ?? null);
    setStep('confirm');
  };

  /** What the sheet does with a refusal; true when the sheet is done with. */
  const refuse = (err) => {
    const kind = refusalKind(err?.reason, 'add');
    const line = err?.message || STAFF_CHANGE_UNCONFIRMED;
    if (kind === 'unconfirmed') {
      onDone(STAFF_CHANGE_UNCONFIRMED);
      return true;
    }
    if (kind === 'full') {
      const d = err.details;
      setAsked(d && d.taken != null && d.capacity != null ? { taken: d.taken, capacity: d.capacity } : { taken: facts.taken, capacity: facts.capacity });
    } else if (kind === 'none-row') {
      setTurned({ kind: 'none', next: Boolean(facts?.charge?.next) });
      setFree(false);
    } else if (kind === 'free-only') {
      setTurned({ kind: 'free-only' });
      setRefused(line);
    } else if (kind === 'session' && !fixed) {
      toPicker();
      setNotice(nothingChanged(line));
      setReloadKey((k) => k + 1);
    } else {
      setFinal(kind === 'session' ? nothingChanged(line) : line);
    }
    return false;
  };

  const confirm = async () => {
    if (sending.current || !target || blocked) return;
    sending.current = true;
    setBusy(true);
    setRefused(null);
    try {
      const result = await staffBookSession({ athleteId, sessionId: target.id, free: freeOn, allowFull: full }, { first });
      onDone(addSuccessLine({ first, date: target.date, time: target.time, result, predicted: charge }));
      return; // the caller closes the sheet; it stays busy until then
    } catch (err) {
      if (refuse(err)) return;
    }
    sending.current = false;
    setBusy(false);
  };

  const close = (
    <Button variant="outline" height={44} style={{ boxShadow: 'none' }} onClick={onClose}>
      {CLOSE}
    </Button>
  );
  const sheet = (title, body, footer = close) => (
    <StaffSheet title={title} onClose={busy ? null : onClose} footer={footer}>
      {body}
    </StaffSheet>
  );
  const plainTitle = addTitle(first, { full: false });

  if (final) return sheet(plainTitle, <Line>{final}</Line>);
  if (athlete.error) return sheet(plainTitle, <Line>{athlete.error.code === 'not-found' ? ATHLETE_NOT_ON_FILE : ATHLETES_LOAD_FAILED}</Line>);
  if (!model) return sheet(BOOK_A_SESSION, null);

  if (step === 'pick') {
    return sheet(
      BOOK_A_SESSION,
      <>
        <Line>{model.name}</Line>
        <StaffSessionPicker model={model} mode="add" onPick={pick} notice={notice} reloadKey={reloadKey} initialDay={pickedDay} now={clock} />
      </>
    );
  }

  if (fixed && !session && fetched.loading) return sheet(plainTitle, null);
  if (!target) return sheet(plainTitle, <Line>{staffRefusalLine('session-missing', { action: 'add', first })}</Line>);

  const title = addTitle(first, full ? { full: true, ...(asked || facts) } : { full: false });
  const others = full && waiting.data > 0 ? waiting.data : 0;
  const buttons = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Button height={50} loading={busy} disabled={blocked} onClick={confirm}>
        {addConfirmLabel(first, { free: freeOn || charge?.kind === 'none', full, busy })}
      </Button>
      <Button variant="outline" height={50} disabled={busy} style={{ boxShadow: 'none' }} onClick={fixed ? onClose : toPicker}>
        {BACK}
      </Button>
    </div>
  );
  return sheet(
    title,
    <>
      <Line>{addSummary(model.name, target.date, target.time, sessionLabel(target, target.type))}</Line>
      <Line>{chargeLine(first, charge, { freeOn })}</Line>
      {charge?.kind === 'elite' ? null : (
        <ToggleRow
          label={FREE_LABEL}
          checked={freeOn}
          onChange={(on) => {
            if (!freeOnly && !sending.current) setFree(on);
          }}
          style={{ marginTop: 6 }}
        />
      )}
      {facts.warnings.map((w) => (
        <Line key={w.kind} tone={color.secondary}>
          {warningLine(first, w)}
        </Line>
      ))}
      {others ? <Line tone={color.secondary}>{waitlistCountLine(others)}</Line> : null}
      {refused ? <Line tone={color.error}>{refused}</Line> : null}
    </>,
    buttons
  );
}

/** One line of the sheet's text. */
function Line({ tone, children }) {
  return (
    <Body size={12} tone={tone} style={{ marginTop: 10 }}>
      {children}
    </Body>
  );
}
