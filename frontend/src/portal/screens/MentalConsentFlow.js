import React, { useEffect, useReducer, useRef, useState } from 'react';
import { color, font } from '../tokens';
import Button from '../components/Button';
import Field from '../components/Field';
import PhoneFrame from '../components/PhoneFrame';
import SkeletonCard from '../components/Skeleton';
import { BackLink, Banner, Body, ErrorNotice, ScreenTitle } from '../components/Primitives';
import {
  AgreementStep, AssentStep, ChoicesForm, ContactFields, DoneScreen, HandOver, SignatureStep, WhoStep, firstOf,
} from '../components/consent/FlowSteps';
import { useConsentFlow } from '../hooks/mentalConsent';
import { canContinue, choicesFromFlow, consentExit, flowReducer, initialFlow, progressLabel, savesHere } from '../data/consentFlow';
import { isAdultRecord } from '../data/mentalConsent';
import { adultFieldsChanged } from '../data/mentalConsentWrites';
import { academyDateISO } from '../data/calendar';

const SIGNABLE_BRANCHES = ['minor', 'adult', 'adult-handover'];
const isAdultBranch = (branch) => branch === 'adult' || branch === 'adult-handover';
const SAVE_FAILED = "This couldn't be saved. Check your connection and try again.";
const linkStyle = { background: 'none', border: 'none', minHeight: 44, font: `500 14px ${font.body}`, color: color.textSecondary, textDecoration: 'underline', cursor: 'pointer' };
const progressStyle ={ font: `500 12px ${font.body}`, letterSpacing: '.04em', color: color.textTertiary };

/** The frame every state of the screen shares: the back link and progress on top, the action pinned below. */
function Frame({ bare, onBack, progress, footer, children }) {
  const header = (
    <div style={{ padding: '14px 20px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
      {onBack ? <BackLink onClick={onBack}>Back</BackLink> : <span />}
      {progress ? <span aria-live="polite" style={progressStyle}>{progress}</span> : null}
    </div>
  );
  return (
    <PhoneFrame bare={bare} header={header} footer={footer ? <div style={{ padding: '10px 20px 18px' }}>{footer}</div> : null}>
      <div style={{ padding: '8px 20px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
    </PhoneFrame>
  );
}

/** Why this login cannot sign here (spec 3): no date of birth, an 18+ athlete with their own login, a minor's own login. */
function blockedCopy(data) {
  const first = firstOf(data.athlete.name);
  if (data.branch === 'no-dob') {
    return data.viewer === 'athlete'
      ? ['Add your date of birth first', 'The academy adds it to your profile; then you can sign here.']
      : [`Add ${first}'s date of birth first`, `The academy adds it to ${first}'s profile; then you can sign here.`];
  }
  if (data.branch === 'adult-elsewhere') return [`${first} signs this on their own login`, `${first} is 18 or older and has their own login, so ${first} signs and manages this there.`];
  return ['Your parent signs this', 'Your parent signs Yannick\'s consent on their login, then hands you the phone for your part.'];
}

/** One athlete's sign flow (spec 4.2): the five steps, the hand-over lock, the device draft and the one save. */
function SignFlow({ bare, data, sign, saveDraft, exit, onDone, onBack }) {
  const first = firstOf(data.athlete.name);
  const signerFirst = firstOf(data.signerName);
  const [state, dispatch] = useReducer(flowReducer, data, (d) => initialFlow({
    branch: d.branch, drivingAsked: d.drivingAsked, under13: d.under13, firstName: first, contact: d.emergencyContact,
    parentName: d.selfManaged ? '' : d.guardianName ?? '', draft: d.draft, draftState: d.draftState,
  }));
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [result, setResult] = useState(data.status === 'signed' ? { status: 'already', record: data.record } : null);
  const top = useRef(null);
  const shown = useRef(false);
  const set = (path, value) => dispatch({ type: 'set', path, value });
  const adult = isAdultBranch(state.branch);

  useEffect(() => {
    top.current?.scrollIntoView?.({ block: 'start' });
    // A new step (or the Done screen) takes the focus at its title, so a screen reader starts there; not on the first render.
    if (!shown.current) {
      shown.current = true;
      return;
    }
    const title = top.current?.parentElement?.querySelector('h1');
    if (title) {
      title.setAttribute('tabindex', '-1');
      title.focus({ preventScroll: true });
    }
  }, [state.step, result]);

  if (result) {
    const next = data.nextAthleteId ? () => onDone?.({ to: `/portal/consent/mental/${data.nextAthleteId}`, state: null }) : null;
    return (
      <Frame bare={bare}>
        <div ref={top} />
        <DoneScreen firstName={first} viewer={data.viewer} result={result} todayISO={academyDateISO()} nextName={data.nextName} onNext={next} onDone={() => onDone?.(exit)} />
      </Frame>
    );
  }

  if (!SIGNABLE_BRANCHES.includes(data.branch)) {
    const [title, body] = blockedCopy(data);
    return (
      <Frame bare={bare} onBack={() => onBack?.(exit)}>
        <ScreenTitle>{title}</ScreenTitle>
        <Body size={13}>{body}</Body>
      </Frame>
    );
  }

  const check = canContinue(state);
  const saves = savesHere(state);
  const label = check.reason ?? (state.step === 'handover' ? 'Hand over' : saves ? 'Done' : 'Continue');
  const lockedStep = state.branch === 'minor' && (state.step === 'handover' || state.step === 'assent');
  const back = state.step === state.steps[0] ? () => onBack?.(exit) : () => dispatch({ type: 'back' });

  const next = async () => {
    if (!saves) {
      dispatch({ type: 'next' });
      return;
    }
    setSaving(true);
    setFailed(false);
    try {
      setResult((await sign(state)) || { status: 'signed' });
    } catch (err) {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };
  const away = () => {
    saveDraft(state);
    onDone?.(exit);
  };

  let body;
  if (state.step === 'who') body = <WhoStep state={state} set={set} data={data} />;
  else if (state.step === 'agreement') body = <AgreementStep state={state} onRead={() => dispatch({ type: 'readToEnd' })} />;
  else if (state.step === 'choices') body = <ChoicesForm state={state} set={set} adult={adult} drivingAsked={state.drivingAsked} />;
  else if (state.step === 'signature') body = <SignatureStep state={state} set={set} adult={adult} firstName={first} />;
  else if (state.step === 'handover') {
    body = adult
      ? <HandOver adult firstName={first} />
      : <HandOver firstName={first} signerFirst={signerFirst} onAway={away} onGiveBack={() => dispatch({ type: 'unlock' })} />;
  } else {
    body = (
      <>
        <AssentStep state={state} set={set} firstName={first} under13={state.under13} />
        <button type="button" onClick={() => dispatch({ type: 'back' })} style={linkStyle}>
          {`Give the phone back to ${signerFirst || 'the parent'}`}
        </button>
      </>
    );
  }

  return (
    <Frame
      bare={bare}
      onBack={lockedStep ? null : back}
      progress={progressLabel(state)}
      footer={<Button variant="pinned" height={56} disabled={!check.ok} loading={saving} onClick={next}>{saving ? 'Saving' : label}</Button>}
    >
      <div ref={top} />
      {state.notice && state.step !== 'agreement' ? <Banner tone="yellow">{state.notice}</Banner> : null}
      {failed ? <Banner tone="red">{SAVE_FAILED}</Banner> : null}
      {body}
    </Frame>
  );
}

/**
 * Which Change choices form a record gets, or null (the sign flow then
 * shows the signed or blocked screen): 'adult' (a section 11 record),
 * 'minor' (under 18: the athlete's own answer through the hand-over), or
 * 'minor-18' (a minor-era record of an athlete now 18: the parent may still
 * change location, driving and the contact until the re-sign, never the
 * athlete's own answer; plan "Decided here" 13). A claimed adult's parent
 * and a minor's own login change nothing here.
 */
function changeMode(data) {
  if (!data.record || ['no-dob', 'minor-login', 'adult-elsewhere'].includes(data.branch)) return null;
  if (data.status === 'signed') return isAdultRecord(data.record) ? 'adult' : 'minor';
  if (data.status === 'needs-adult' && data.viewer === 'parent') return 'minor-18';
  return null;
}

/** The change form's state: the flow's shape, at the choices step, filled from the record. */
function changeState(data, mode) {
  const c = data.record.choices || {};
  const ec = c.emergencyContact || {};
  const adult = mode === 'adult';
  const driving = mode === 'minor-18' ? typeof c.driving === 'boolean' : data.drivingAsked;
  const base = initialFlow({ branch: adult ? 'adult' : 'minor', drivingAsked: driving, firstName: firstOf(data.athlete.name) });
  const bool = (v) => (typeof v === 'boolean' ? v : null);
  return {
    ...base,
    step: 'choices',
    contact: { name: ec.name ?? '', phone: ec.phone ?? '', relationship: ec.relationship ?? '', sameAsParent: !adult && !ec.name && !ec.phone },
    choices: {
      location: c.location ?? null, audio: bool(c.audio), driving: bool(c.driving), parentSessions: bool(c.parentSessions),
      parentName: c.parentName ?? (adult && !data.selfManaged ? data.guardianName ?? '' : ''),
    },
  };
}

/**
 * Why Change choices cannot save yet, as the pinned button says it (null: plain Save), top to bottom. A paper
 * record may have no location, and an athlete who turned 16 after signing now owes the driving answer; the
 * rules need both on every family change (canContinue's 'choices' check, which has no words of its own).
 */
function changeMissing({ state, adult, contactReason, needsConfirm, confirmName, confirmLabel }) {
  const c = state.choices;
  if (c.location == null) return 'Choose a location';
  if (!adult && state.drivingAsked && typeof c.driving !== 'boolean') return 'Answer the driving question';
  if (typeof c.audio !== 'boolean') return 'Answer the recording question';
  if (adult && typeof c.parentSessions !== 'boolean') return 'Answer the parent sessions question';
  if (adult && c.parentSessions && !String(c.parentName || '').trim()) return 'Add the parent/guardian name';
  if (contactReason) return contactReason;
  if (needsConfirm && !confirmName.trim()) return confirmLabel;
  return null;
}

/**
 * Change choices (spec 4.3, plan Task 12): the choices alone, prefilled;
 * the signature is never re-done. An adult record's recording, contact or
 * parent-session change needs the athlete's typed name; a minor's own
 * recording answer changes only through the hand-over. Save sends
 * `change({ choices, assentAudio?, adultConfirmName? })`; the hook appends
 * the old values to the history.
 */
function ChangeChoices({ bare, data, mode, change, exit, onDone, onBack }) {
  const first = firstOf(data.athlete.name);
  const adult = mode === 'adult';
  const [state, dispatch] = useReducer(flowReducer, null, () => changeState(data, mode));
  const [athletePart, setAthletePart] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const set = (path, value) => dispatch({ type: 'set', path, value });
  const choices = choicesFromFlow(state);
  const needsConfirm = adult && adultFieldsChanged(data.record.choices, choices);

  const contactCheck = canContinue({ ...state, step: 'who' });
  const choicesCheck = canContinue({ ...state, step: 'choices' });
  // The hand-over hides the parent's form, so it waits for the form to be complete.
  const ready = contactCheck.ok && choicesCheck.ok;
  let ok = ready && (!needsConfirm || confirmName.trim() !== '');
  if (athletePart) ok = ok && typeof state.assent.audio === 'boolean' && state.assent.name.trim() !== '';
  const confirmLabel = data.viewer === 'athlete' ? 'Type your name to confirm' : `${first} types their name to confirm`;
  const reason = changeMissing({ state, adult, contactReason: contactCheck.reason, needsConfirm, confirmName, confirmLabel });

  const save = async () => {
    const edits = { choices };
    if (athletePart) edits.assentAudio = state.assent.audio;
    if (needsConfirm) edits.adultConfirmName = confirmName.trim();
    setSaving(true);
    setFailed(false);
    try {
      await change(edits);
      onDone?.(exit);
    } catch (err) {
      setFailed(true);
      setSaving(false);
    }
  };
  const giveBack = () => {
    setAthletePart(false);
    set('assent', { audio: null, agreed: false, name: '', readAloud: false });
  };

  return (
    <Frame
      bare={bare}
      onBack={athletePart ? null : () => onBack?.(exit)}
      footer={<Button variant="pinned" height={56} disabled={!ok} loading={saving} onClick={save}>{saving ? 'Saving' : reason ?? 'Save'}</Button>}
    >
      {failed ? <Banner tone="red">{SAVE_FAILED}</Banner> : null}
      {athletePart ? (
        <>
          <HandOver firstName={first} note={`${first} answers for themself: their own recording answer and their name.`} />
          <AssentStep state={state} set={set} firstName={first} answerOnly />
          <button type="button" onClick={giveBack} style={linkStyle}>{`Give the phone back to ${firstOf(data.signerName) || 'the parent'}`}</button>
        </>
      ) : (
        <>
          <ChoicesForm state={state} set={set} adult={adult} drivingAsked={state.drivingAsked} title="Change choices" />
          <ContactFields contact={state.contact} set={set} minor={!adult} />
          {needsConfirm ? (
            <Field
              label={confirmLabel}
              value={confirmName}
              onChange={(v) => setConfirmName(v.slice(0, 120))}
              hint="Recording, the emergency contact and parent sessions are the athlete's own decisions."
            />
          ) : null}
          {mode === 'minor' && data.viewer === 'parent' ? (
            <>
              <Button variant="outline" height={48} disabled={!ready} onClick={() => setAthletePart(true)} style={{ boxShadow: 'none' }}>{`Change ${first}'s own answer`}</Button>
              {ready ? null : <Body size={12}>{`Finish the choices above before handing the phone to ${first}.`}</Body>}
            </>
          ) : null}
          <Body size={12}>The signature stays as it is; the old choices are kept in the record's history.</Body>
        </>
      )}
    </Frame>
  );
}

/**
 * Yannick's consent for one athlete (spec 4.2, plan Task 11), at
 * /portal/consent/mental/:athleteId. The flow keeps the payload it opened
 * with: a save re-reads the hook (briefly null, then signed), and the Done
 * screen must not flicker back to step 1. `onDone(exit)` and `onBack(exit)`
 * take `consentExit`'s `{ to, state }` (or the next athlete's flow).
 * `demoViewer` and `demoNoRecord` are the review harness's (seed only).
 */
export default function MentalConsentFlow({ bare = false, athleteId, change = false, onDone, onBack, demoViewer = null, demoNoRecord = false }) {
  const hook = useConsentFlow(athleteId, { demoViewer, demoNoRecord });
  const held = useRef(null);
  if (!held.current && hook.data) held.current = hook.data;
  const data = held.current;

  if (!data) {
    const leave = () => onBack?.({ to: '/portal', state: null });
    if (hook.loading) return <Frame bare={bare}><SkeletonCard large height={120} /><SkeletonCard large height={220} /></Frame>;
    if (hook.error) return <Frame bare={bare} onBack={leave}><ErrorNotice>Yannick's consent didn't load. Check your connection and try again.</ErrorNotice></Frame>;
    return (
      <Frame bare={bare} onBack={leave}>
        <ScreenTitle>Not on this login</ScreenTitle>
        <Body size={13}>This athlete isn't on your account.</Body>
      </Frame>
    );
  }

  const exit = consentExit({ viewer: data.viewer, listCount: data.listCount });
  const mode = change ? changeMode(data) : null;
  if (mode) return <ChangeChoices bare={bare} data={data} mode={mode} change={hook.change} exit={exit} onDone={onDone} onBack={onBack} />;
  return <SignFlow bare={bare} data={data} sign={hook.sign} saveDraft={hook.saveDraft} exit={exit} onDone={onDone} onBack={onBack} />;
}
