import React, { useState } from 'react';
import { color, font, radius, tint } from '../../tokens';
import Button from '../Button';
import Field from '../Field';
import { Body, ScreenTitle, SectionLabel } from '../Primitives';
import { CONSENT_VERSION, LOCATION_SHORT, msOf, paperDateToStamp } from '../../data/mentalConsent';
import { academyClock, academyDateISO } from '../../data/calendar';

const FIRST_DATE = '2026-01-01';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const bool = (v) => (typeof v === 'boolean' ? v : null);
const orNull = (s) => (String(s || '').trim() ? String(s).trim() : null);

/** A choice whose text is its label; tapping the chosen one again clears it (not on the paper). */
function Pick({ label, on, onClick, disabled = false }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      style={{
        minHeight: 44, padding: '8px 12px', borderRadius: radius.input, cursor: disabled ? 'default' : 'pointer', textAlign: 'left',
        border: `1px solid ${on ? color.primary : color.border}`, background: on ? tint.green : 'transparent',
        font: `${on ? 600 : 500} 13px ${font.body}`, color: disabled ? color.faintText : color.text,
      }}
    >
      {label}
    </button>
  );
}
const row = { display: 'flex', flexWrap: 'wrap', gap: 8 };

/** The form's starting values: the record's own for a correction, blank for a new paper record (a re-sign is section 11). */
function initial({ mode, record, resign }) {
  if (mode === 'correct' && record) {
    const c = record.choices || {};
    const ec = c.emergencyContact || {};
    const ms = msOf(record.signedAt);
    return {
      date: ms == null ? '' : academyClock(new Date(ms)).date, section: record.adult ? '11' : '10', version: record.version ?? CONSENT_VERSION,
      signerName: record.signer?.name ?? '', assentName: record.assent?.name ?? '', assentAudio: bool(record.assent?.audio),
      location: c.location ?? null, audio: bool(c.audio), driving: bool(c.driving), parentSessions: bool(c.parentSessions), parentName: c.parentName ?? '',
      ecName: ec.name ?? '', ecPhone: ec.phone ?? '', ecRel: ec.relationship ?? '',
    };
  }
  return {
    date: '', section: resign ? '11' : null, version: CONSENT_VERSION, signerName: '', assentName: '', assentAudio: null,
    location: null, audio: null, driving: null, parentSessions: null, parentName: '', ecName: '', ecPhone: '', ecRel: '',
  };
}

/** The button's reason while the form cannot be saved (null: plain Save, disabled). */
function check(v) {
  const today = academyDateISO();
  if (!DATE_RE.test(v.date) || v.date < FIRST_DATE || v.date > today || !paperDateToStamp(v.date)) return { ok: false, reason: 'Use the date on the paper form' };
  if (!v.section || !v.signerName.trim() || (v.section === '10' && !v.assentName.trim())) return { ok: false, reason: null };
  return { ok: true, reason: null };
}

/**
 * Ops and the owner type in a paper consent form (spec 5, plan Task 15):
 * the date signed (Chicago midnight of it; not in the future, not before
 * 2026), the section (10 with the athlete's assent name and recording
 * answer, or 11), the version, the signer and the choices as far as the
 * paper shows them - blanks are null. `mode 'correct'` (owner only, a paper
 * record) starts from the record; a withdrawn recording answer cannot be
 * turned back on here. A new record on an athlete's minor-era record is the
 * section 11 re-sign. `onSave(input)`, `input = { signedAt, section,
 * version, signerName, assentName, assentAudio, choices }`.
 */
export default function PaperSignatureSheet({ open, athlete, record = null, mode = 'record', onSave, onClose, saving = false, error = null }) {
  const resign = mode === 'record' && Boolean(record);
  const [v, setV] = useState(() => initial({ mode, record, resign }));
  if (!open) return null;
  const set = (key) => (value) => setV((s) => ({ ...s, [key]: value }));
  const toggle = (key, value) => () => setV((s) => ({ ...s, [key]: s[key] === value ? null : value }));
  const adult = v.section === '11';
  const minorSection = v.section === '10';
  const withdrawn = Boolean(record?.assent?.withdrawnBy);
  const { ok, reason } = check(v);
  const first = String(athlete?.name || '').trim().split(/\s+/)[0] || 'the athlete';

  const save = () => onSave({
    signedAt: paperDateToStamp(v.date), section: v.section, version: v.version.trim() || CONSENT_VERSION, signerName: v.signerName.trim(),
    assentName: adult ? null : v.assentName.trim(), assentAudio: adult ? null : v.assentAudio === true,
    choices: {
      location: v.location, audio: v.audio === true, driving: adult ? null : v.driving,
      emergencyContact: { name: orNull(v.ecName), phone: orNull(v.ecPhone), relationship: orNull(v.ecRel) },
      parentSessions: adult ? v.parentSessions === true : null, parentName: adult && v.parentSessions ? orNull(v.parentName) : null,
    },
  });

  return (
    <div data-portal-overlay="" style={{ position: 'absolute', inset: 0, background: tint.overlay, overflowY: 'auto', zIndex: 5 }}>
      <div role="dialog" aria-modal="true" style={{ background: color.surface, borderTop: `1px solid ${color.border}`, borderRadius: `${radius.cardLarge} ${radius.cardLarge} 0 0`, marginTop: 40, padding: '20px 20px 26px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <ScreenTitle size={19}>{mode === 'correct' ? 'Correct the paper record' : `Paper consent · ${athlete?.name ?? ''}`}</ScreenTitle>
        <Body size={12}>Type what the paper form shows; leave out what it does not.</Body>
        <Field label="Date signed" type="date" value={v.date} onChange={set('date')} />
        {resign ? <Body size={12}>{`${first} is 18 now: this records section 11, the 18+ signature.`}</Body> : (
          <div style={row}>
            <Pick label="Section 10" on={v.section === '10'} onClick={() => set('section')('10')} />
            <Pick label="Section 11" on={v.section === '11'} onClick={() => set('section')('11')} />
          </div>
        )}
        <Field label="Version" value={v.version} onChange={set('version')} hint="The version printed on the form." />
        <Field label="Signer's name" value={v.signerName} onChange={set('signerName')} hint={adult ? "The athlete's name, 18 or older." : "The parent's name as written."} />
        {minorSection ? (
          <>
            <Field label="Athlete's name" value={v.assentName} onChange={set('assentName')} hint="The athlete's assent, section 9." />
            <div style={row}>
              <Pick label="Athlete recording: yes" on={v.assentAudio === true} disabled={withdrawn} onClick={toggle('assentAudio', true)} />
              <Pick label="Athlete recording: no" on={v.assentAudio === false} disabled={withdrawn} onClick={toggle('assentAudio', false)} />
            </div>
            {withdrawn ? <Body size={11}>{`${first} withdrew the recording answer; a correction never turns it back on.`}</Body> : null}
          </>
        ) : null}
        <SectionLabel style={{ marginTop: 6 }}>Choices on the paper</SectionLabel>
        <div style={row}>
          {Object.entries(LOCATION_SHORT).map(([id, label]) => <Pick key={id} label={label} on={v.location === id} onClick={toggle('location', id)} />)}
        </div>
        <div style={row}>
          <Pick label="Recording: yes" on={v.audio === true} onClick={toggle('audio', true)} />
          <Pick label="Recording: no" on={v.audio === false} onClick={toggle('audio', false)} />
        </div>
        {minorSection ? (
          <div style={row}>
            <Pick label="Driving: yes" on={v.driving === true} onClick={toggle('driving', true)} />
            <Pick label="Driving: no" on={v.driving === false} onClick={toggle('driving', false)} />
          </div>
        ) : null}
        {adult ? (
          <>
            <div style={row}>
              <Pick label="Parent sessions: yes" on={v.parentSessions === true} onClick={toggle('parentSessions', true)} />
              <Pick label="Parent sessions: no" on={v.parentSessions === false} onClick={toggle('parentSessions', false)} />
            </div>
            {v.parentSessions ? <Field label="Parent/guardian name" value={v.parentName} onChange={set('parentName')} /> : null}
          </>
        ) : null}
        <Field label="Emergency contact name" value={v.ecName} onChange={(x) => set('ecName')(x.slice(0, 120))} />
        <Field label="Emergency contact mobile" type="tel" value={v.ecPhone} onChange={(x) => set('ecPhone')(x.slice(0, 40))} />
        <Field label="Relationship (optional)" value={v.ecRel} onChange={(x) => set('ecRel')(x.slice(0, 60))} />
        {error ? <Body size={12} tone={color.error}>{error}</Body> : null}
        <Button height={48} disabled={!ok} loading={saving} onClick={save} style={{ boxShadow: 'none' }}>{reason ?? 'Save'}</Button>
        <Button variant="outline" height={46} disabled={saving} onClick={onClose} style={{ boxShadow: 'none', font: `600 14px ${font.body}` }}>Cancel</Button>
      </div>
    </div>
  );
}
