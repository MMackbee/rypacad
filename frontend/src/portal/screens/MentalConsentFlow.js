import React, { useEffect, useReducer, useRef, useState } from 'react';
import { color, font } from '../tokens';
import Button from '../components/Button';
import PhoneFrame from '../components/PhoneFrame';
import SkeletonCard from '../components/Skeleton';
import { BackLink, Banner, Body, ErrorNotice, ScreenTitle } from '../components/Primitives';
import {
  AgreementStep, AssentStep, ChoicesForm, DoneScreen, HandOver, SignatureStep, WhoStep, firstOf,
} from '../components/consent/FlowSteps';
import { useConsentFlow } from '../hooks/mentalConsent';
import { canContinue, consentExit, flowReducer, initialFlow, progressLabel, savesHere } from '../data/consentFlow';
import { academyDateISO } from '../data/calendar';

const SIGNABLE_BRANCHES = ['minor', 'adult', 'adult-handover'];
const isAdultBranch = (branch) => branch === 'adult' || branch === 'adult-handover';
const SAVE_FAILED = "This couldn't be saved. Check your connection and try again.";
const progressStyle = { font: `500 12px ${font.body}`, letterSpacing: '.04em', color: color.textTertiary };

/** The frame every state of the screen shares: the back link and progress on top, the action pinned below. */
function Frame({ bare, onBack, progress, footer, children }) {
  const header = (
    <div style={{ padding: '14px 20px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
      {onBack ? <BackLink onClick={onBack}>Back</BackLink> : <span />}
      {progress ? <span style={progressStyle}>{progress}</span> : null}
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
  const set = (path, value) => dispatch({ type: 'set', path, value });
  const adult = isAdultBranch(state.branch);

  useEffect(() => {
    top.current?.scrollIntoView?.({ block: 'start' });
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
        <button
          type="button"
          onClick={() => dispatch({ type: 'back' })}
          style={{ background: 'none', border: 'none', minHeight: 44, font: `500 14px ${font.body}`, color: color.textSecondary, textDecoration: 'underline', cursor: 'pointer' }}
        >
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
  return <SignFlow bare={bare} data={data} sign={hook.sign} saveDraft={hook.saveDraft} exit={exit} onDone={onDone} onBack={onBack} change={change} />;
}
