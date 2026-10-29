import React, { useState } from 'react';
import { color } from '../../tokens';
import Button from '../Button';
import Choice from './Choice';
import { Body } from '../Primitives';
import { recordResearchChange } from '../../hooks/researchConsent';
import { researchAnswer } from '../../data/researchConsent';
import { shortDate, toISODate } from '../../data/assessmentWindows';

const dated = (r) => {
  const d = toISODate(r?.recordedAt);
  return d ? shortDate(d) : null;
};

/** "Research: yes since Oct 15", "Research: no (recorded Nov 2)", "Research: not answered". */
export function researchStatus(research) {
  if (!research || typeof research.value !== 'boolean') return 'Research: not answered';
  const when = dated(research);
  return research.value ? `Research: yes since ${when ?? 'an unknown date'}` : `Research: no${when ? ` (recorded ${when})` : ''}`;
}

/**
 * The athlete's research answer on the results screen (spec 4.3): the
 * answer, its date and what came before. The owner records a change the
 * family asked for by email ("You can change your answer at any time by
 * emailing ..."); it applies from today, and the earlier answer stays on
 * the history so earlier windows keep theirs. Under 18 a yes needs the
 * athlete's assent too.
 */
export default function ResearchLine({ athleteId, research, minor, canChange }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(false);
  const [assent, setAssent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const history = Array.isArray(research?.history) ? research.history : [];

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await recordResearchChange({ athleteId, answer: researchAnswer({ ticked: value, assent, minor }), current: research ?? null });
      setEditing(false);
      setValue(false);
      setAssent(false);
    } catch (err) {
      setError('The change was not saved. Check the connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
      <Body size={12}>{researchStatus(research)}</Body>
      {history.length ? (
        <Body size={11} tone={color.textTertiary}>
          Earlier: {history.map((h) => `${h.value ? 'yes' : 'no'} from ${dated(h) ?? 'an unknown date'}`).join('; ')}.
        </Body>
      ) : null}
      {canChange && !editing ? (
        <Button variant="outline" height={36} style={{ width: 'auto', padding: '0 14px', boxShadow: 'none', alignSelf: 'flex-start' }} onClick={() => setEditing(true)}>
          Record a change
        </Button>
      ) : null}
      {canChange && editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Choice label="Research answer" value={value} options={[[true, 'Yes'], [false, 'No']]} onChange={setValue} />
          {minor && value ? <Choice label="Athlete assent" value={assent} options={[[true, 'Given'], [false, 'Not given']]} onChange={setAssent} /> : null}
          <Body size={11} tone={color.textTertiary}>Record what the family asked for. It applies from today; earlier windows keep the answer they ran under.</Body>
          {error ? <Body size={12} tone={color.error}>{error}</Body> : null}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button height={40} loading={saving} style={{ width: 'auto', padding: '0 16px' }} onClick={save}>Save change</Button>
            <Button variant="outline" height={40} disabled={saving} style={{ width: 'auto', padding: '0 16px', boxShadow: 'none' }} onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
