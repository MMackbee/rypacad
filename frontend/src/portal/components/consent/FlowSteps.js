import React, { useEffect, useRef } from 'react';
import { format, parseISO } from 'date-fns';
import { color, font, radius, tint } from '../../tokens';
import Button from '../Button';
import Checkbox from '../Checkbox';
import Field from '../Field';
import { Banner, Body, Card, ScreenTitle, SectionLabel } from '../Primitives';
import {
  ADULT_CLOSING, ADULT_INTRO, ADULT_TERMS, ASSENT_CLOSING, ASSENT_INTRO, ASSENT_POINTS, CONTACT_LINE, DRIVING_LABEL, LOCATION_OPTIONS,
  PARENT_ACKNOWLEDGEMENTS, PARENT_CLOSING, PARENT_INTRO, PARENT_SESSIONS_LABEL, TERMS,
} from '../../data/mentalConsentTerms';
import { nameMatches } from '../../data/consentFlow';
import { monthDayLabel, shortDate, utcTodayISO } from '../../data/mentalConsent';
import { ageOnDate } from '../../data/signup';

/**
 * The consent flow's step bodies (spec 4.2, plan Task 11): presentational,
 * the flow's state and a `set(path, value)` dispatcher as props, so
 * screens/MentalConsentFlow.js owns the reducer and the save. The form text
 * comes from data/mentalConsentTerms.js, which only the lazy consent screens
 * import (this file is one of them), so the agreement stays out of the main
 * bundle. Every tap target is a real button: the location options and
 * the driving answer by their text, the paired answers and the ticks as
 * Checkboxes by their label.
 */

export const firstOf = (s) => String(s || '').trim().split(/\s+/)[0] || '';
const stack = (gap) => ({ display: 'flex', flexDirection: 'column', gap });
const listStyle = { margin: '8px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 7 };
const strong = { font: `600 15px ${font.body}`, color: color.text };

function Section({ label, children }) {
  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 10 }}>{label}</SectionLabel>
      <div style={stack(10)}>{children}</div>
    </Card>
  );
}

/** A Checkbox with its words beside it; the whole row is the tap target. `role` 'radio' inside an AnswerPair. */
export function TickRow({ label, checked, onChange, role }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, cursor: 'pointer' }}>
      <Checkbox checked={checked} onChange={onChange} label={label} role={role} />
      <span style={{ font: `500 14px/1.4 ${font.body}`, color: color.text }}>{label}</span>
    </label>
  );
}

/** Two ticks that answer one question: `value` true, false or null (not answered); a radio group named by `question`. */
function AnswerPair({ question, value, yes, no, onPick }) {
  return (
    <div role="radiogroup" aria-label={question} style={stack(2)}>
      <TickRow role="radio" label={yes} checked={value === true} onChange={() => onPick(true)} />
      <TickRow role="radio" label={no} checked={value === false} onChange={() => onPick(false)} />
    </div>
  );
}

/** A choice whose text is its label (a location, the driving Yes / No). */
function OptionButton({ label, on, onClick, style }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      style={{
        minHeight: 46, padding: '10px 14px', textAlign: 'left', borderRadius: radius.input, cursor: 'pointer',
        border: `1px solid ${on ? color.primary : color.border}`, background: on ? tint.green : 'transparent',
        font: `${on ? 600 : 500} 14px ${font.body}`, color: color.text, ...style,
      }}
    >
      {label}
    </button>
  );
}

/** Emergency contact (spec 4.2 step 1): required at 18+; a minor's parent may tick Same as parent. */
export function ContactFields({ contact, set, minor }) {
  const same = minor && contact.sameAsParent;
  return (
    <Section label="Emergency contact">
      <Body size={12}>
        {minor
          ? "Who the coach calls if a parent can't be reached. Tick Same as parent, or leave it blank, if that's you."
          : 'Who the coach contacts in a crisis (section 11). Required at 18.'}
      </Body>
      {minor ? <TickRow label="Same as parent" checked={same} onChange={(v) => set('contact.sameAsParent', v)} /> : null}
      {same ? null : (
        <>
          <Field label="Emergency contact name" value={contact.name} onChange={(v) => set('contact.name', v)} />
          <Field label="Emergency contact mobile" type="tel" value={contact.phone} onChange={(v) => set('contact.phone', v)} />
          <Field label="Relationship (optional)" value={contact.relationship} onChange={(v) => set('contact.relationship', v)} />
        </>
      )}
    </Section>
  );
}

function whoSigns({ branch, viewer, signerName, first }) {
  if (branch === 'minor') return `${signerName || 'You'} sign${signerName ? 's' : ''} as ${first}'s parent, then ${first} agrees`;
  if (viewer === 'athlete') return 'You are 18 or older and sign for yourself';
  return `${first} is 18 or older and signs for themself`;
}

/** Step 1: who this is for, who signs, the emergency contact and the form's purpose. */
export function WhoStep({ state, set, data }) {
  const { athlete, signerName, signerEmail, viewer } = data;
  const first = firstOf(athlete.name);
  const age = ageOnDate(athlete.dob, utcTodayISO());
  const handover = state.branch === 'adult-handover';
  return (
    <div style={stack(14)}>
      <ScreenTitle>Who this is for</ScreenTitle>
      <Card large>
        <div style={strong}>{athlete.name}</div>
        {athlete.dob ? <Body size={13} style={{ marginTop: 4 }}>Born {format(parseISO(athlete.dob), 'MMM d, yyyy')}{age != null ? ` · ${age} years old` : ''}</Body> : null}
      </Card>
      <Card large>
        <SectionLabel style={{ marginBottom: 8 }}>{handover ? 'On this login' : 'Signing'}</SectionLabel>
        {signerName ? <div style={strong}>{signerName}</div> : null}
        {signerEmail ? <Body size={13}>{signerEmail}</Body> : null}
        <Body size={13} tone={color.text} style={{ marginTop: 10 }}>{whoSigns({ branch: state.branch, viewer, signerName, first })}</Body>
      </Card>
      <ContactFields contact={state.contact} set={set} minor={state.branch === 'minor'} />
      <Body size={12}>{TERMS.purpose}</Body>
    </div>
  );
}

/** Step 2: sections 2-8 verbatim, one card each; the step counts as read once the end scrolls into view. */
export function AgreementStep({ state, onRead }) {
  const end = useRef(null);
  useEffect(() => {
    // Where the API is missing the step counts as read at mount (plan "Decided here" 4).
    if (typeof window.IntersectionObserver !== 'function' || !end.current) {
      onRead();
      return undefined;
    }
    const io = new window.IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) onRead();
    });
    io.observe(end.current);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div style={stack(12)}>
      {state.notice ? <Banner tone="yellow">{state.notice}</Banner> : null}
      <ScreenTitle>The agreement</ScreenTitle>
      <Body size={13}>Yannick's form, sections 2 to 8, as written. Continue turns on at the end.</Body>
      {TERMS.sections.map((s) => (
        <Card key={s.id} large>
          <div style={{ font: `600 14px ${font.body}`, color: color.text }}>{s.heading}</div>
          {s.paragraphs.map((p, i) => <Body key={i} size={13} style={{ marginTop: 8 }}>{p}</Body>)}
        </Card>
      ))}
      <div ref={end} aria-hidden="true" style={{ height: 1 }} />
    </div>
  );
}

/** Step 3 (and Change choices): location, driving at 16+ for a minor, recording, and at 18+ the parent-session permission. */
export function ChoicesForm({ state, set, adult, drivingAsked, title = 'Your choices' }) {
  const c = state.choices;
  return (
    <div style={stack(12)}>
      {title ? <ScreenTitle>{title}</ScreenTitle> : null}
      <Section label="Location preference">
        {LOCATION_OPTIONS.map((o) => <OptionButton key={o.id} label={o.label} on={c.location === o.id} onClick={() => set('choices.location', o.id)} />)}
      </Section>
      {!adult && drivingAsked ? (
        <Section label="Driving permission">
          <Body size={13} tone={color.text}>{DRIVING_LABEL}</Body>
          <div style={{ display: 'flex', gap: 10 }}>
            <OptionButton label="Yes" on={c.driving === true} onClick={() => set('choices.driving', true)} style={{ flex: 1, textAlign: 'center' }} />
            <OptionButton label="No" on={c.driving === false} onClick={() => set('choices.driving', false)} style={{ flex: 1, textAlign: 'center' }} />
          </div>
        </Section>
      ) : null}
      <Section label={adult ? 'Audio recording of my sessions' : 'Audio recording of athlete sessions'}>
        {adult ? <Body size={12}>Never parent/guardian sessions.</Body> : null}
        <AnswerPair
          question={adult ? 'Audio recording of my sessions' : 'Audio recording of athlete sessions'}
          value={c.audio}
          yes={adult ? 'I consent' : 'I/We consent'}
          no={adult ? 'I do not consent' : 'I/We do not consent'}
          onPick={(v) => set('choices.audio', v)}
        />
        <Body size={12}>May be changed at any time.</Body>
      </Section>
      {adult ? (
        <Section label="Parent and joint sessions">
          <Body size={13} tone={color.text}>{PARENT_SESSIONS_LABEL}</Body>
          <AnswerPair question="Parent and joint sessions" value={c.parentSessions} yes="I give permission" no="I do not give permission" onPick={(v) => set('choices.parentSessions', v)} />
          {c.parentSessions ? <Field label="Parent/guardian name" value={c.parentName} onChange={(v) => set('choices.parentName', v)} /> : null}
        </Section>
      ) : null}
    </div>
  );
}

/** Step 4: section 10's acknowledgements (a minor) or section 11 (18+), one tick and the typed full name. */
export function SignatureStep({ state, set, adult, firstName }) {
  return (
    <div style={stack(12)}>
      <ScreenTitle>{adult ? 'Section 11 · 18 or older' : 'Your signature'}</ScreenTitle>
      <Card large>
        <Body size={13} tone={color.text}>{adult ? ADULT_INTRO : PARENT_INTRO}</Body>
        <ul style={listStyle}>
          {(adult ? ADULT_TERMS : PARENT_ACKNOWLEDGEMENTS).map((line, i) => <li key={i}><Body size={13}>{line}</Body></li>)}
        </ul>
        <Body size={13} style={{ marginTop: 10 }}>{adult ? ADULT_CLOSING : PARENT_CLOSING}</Body>
      </Card>
      <Card large>
        <TickRow
          label={adult ? 'I confirm I am 18 or older and agree' : 'I have read and agree to all of the above'}
          checked={state.signature.agreed}
          onChange={(v) => set('signature.agreed', v)}
        />
        <Field label="Full legal name" value={state.signature.name} onChange={(v) => set('signature.name', v)} style={{ marginTop: 10 }} />
        <Body size={12} style={{ marginTop: 10 }}>
          {adult ? 'Typing your name signs this agreement, dated today.' : `Typing your name signs this agreement for ${firstName}, dated today.`}
        </Body>
      </Card>
    </div>
  );
}

const linkButton = {
  background: 'none', border: 'none', padding: '0 4px', minHeight: 44, font: `500 14px ${font.body}`, color: color.textSecondary,
  textDecoration: 'underline', cursor: 'pointer', alignSelf: 'center',
};

/** The hand-over confirm: a minor's (the parent's answers lock) or the 18+ athlete's on the parent's phone. */
export function HandOver({ adult, firstName, signerFirst, onAway, onGiveBack, note }) {
  return (
    <div style={stack(14)}>
      <ScreenTitle>{adult ? `Hand the phone to ${firstName}` : `Hand the phone to ${firstName} — your answers are locked`}</ScreenTitle>
      <Body size={13}>
        {note ?? (adult
          ? `${firstName} reads the agreement and signs for themself. Take the phone back when ${firstName} is done.`
          : `${firstName} reads section 9, gives their own recording answer and types their name. Done saves everything.`)}
      </Body>
      {onAway ? <Button variant="outline" height={48} onClick={onAway}>{`${firstName} isn't here`}</Button> : null}
      {onGiveBack ? <button type="button" onClick={onGiveBack} style={linkButton}>{`Give the phone back to ${signerFirst || 'the parent'}`}</button> : null}
    </div>
  );
}

/**
 * Step 5: section 9 in the athlete's voice, their recording answer, the
 * take-part tick and their typed name (soft-checked), the read-aloud tick
 * under 13. `answerOnly` (Change choices) asks only the recording answer
 * and the name.
 */
export function AssentStep({ state, set, firstName, under13, answerOnly = false }) {
  const a = state.assent;
  const mismatch = a.name.trim() !== '' && !nameMatches(a.name, firstName);
  return (
    <div style={stack(12)}>
      <ScreenTitle>{`${firstName}'s agreement`}</ScreenTitle>
      {answerOnly ? null : (
        <Card large>
          <Body size={13} tone={color.text}>{ASSENT_INTRO}</Body>
          <ul style={listStyle}>{ASSENT_POINTS.map((line, i) => <li key={i}><Body size={13}>{line}</Body></li>)}</ul>
        </Card>
      )}
      <Section label="Audio recording of my sessions">
        <AnswerPair question="Audio recording of my sessions" value={a.audio} yes="I agree" no="I do not agree" onPick={(v) => set('assent.audio', v)} />
      </Section>
      <Card large>
        {answerOnly ? null : (
          <>
            <Body size={13} tone={color.text}>{ASSENT_CLOSING}</Body>
            <div style={{ marginTop: 8 }}>
              <TickRow label="I agree to take part in mental performance coaching" checked={a.agreed} onChange={(v) => set('assent.agreed', v)} />
            </div>
          </>
        )}
        <Field label={`${firstName}'s name`} value={a.name} onChange={(v) => set('assent.name', v)} style={{ marginTop: 10 }} />
        {mismatch ? <Body size={12} tone={color.secondary} style={{ marginTop: 8 }}>{`That doesn't look like ${firstName}'s name — check it's ${firstName} typing.`}</Body> : null}
      </Card>
      {under13 && !answerOnly ? (
        <Card large>
          <Body size={12}>For the parent: tick this if you read section 9 aloud.</Body>
          <TickRow label={`I read this aloud to ${firstName}`} checked={a.readAloud} onChange={(v) => set('assent.readAloud', v)} />
        </Card>
      ) : null}
    </div>
  );
}

/** After the save, or opened on a record already there: what was recorded, and where to go next. */
export function DoneScreen({ firstName, viewer, result, todayISO, nextName, onNext, onDone }) {
  const rec = result?.status === 'already' ? result.record : null;
  const who = rec?.adultSignature?.name ?? rec?.signer?.name;
  const when = shortDate(rec?.adultSignature?.signedAt ?? rec?.signedAt);
  const own = viewer === 'athlete';
  return (
    <div style={stack(14)}>
      <ScreenTitle>{rec ? 'Already signed' : 'Signed'}</ScreenTitle>
      <Card large tone="green">
        <Body size={14} tone={color.text}>
          {rec
            ? `Already signed${who ? ` by ${who}` : ''}${when ? ` on ${when}` : ''}. Nothing more to do here.`
            : own
              ? `Signed · ${monthDayLabel(todayISO)}. Yannick will see this before your session. You can change the recording or location choice any time from your home screen.`
              : `Signed · ${monthDayLabel(todayISO)}. Yannick will see this before ${firstName}'s session. You can change the recording or location choice any time from ${firstName}'s card.`}
        </Body>
      </Card>
      {nextName && onNext ? <Button variant="outline" height={48} onClick={onNext}>{`Next: sign for ${nextName}`}</Button> : null}
      <Button onClick={onDone}>Done</Button>
      <Body size={12}>{CONTACT_LINE}</Body>
    </div>
  );
}
