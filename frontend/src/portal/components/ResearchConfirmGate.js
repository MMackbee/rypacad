import React, { useState } from 'react';
import { color } from '../tokens';
import Button from './Button';
import PhoneFrame from './PhoneFrame';
import ResearchChoice from './ResearchChoice';
import ResearchSheet from './ResearchSheet';
import { Body, Card, ErrorNotice, ScreenTitle } from './Primitives';
import useAuthSession from '../hooks/useAuthSession';
import { isLive } from '../hooks/live';
import { saveResearchConsent, useResearchConfirm } from '../hooks/researchConsent';
import { SLOW_SAVE_MS } from '../hooks/assessmentSaves';
import { researchConfirmSkipped, skipResearchConfirm } from '../hooks/researchSkip';
import { RESEARCH_CONFIRM_TITLE, RESEARCH_SAVE_LABEL, confirmBody, firstName, researchAnswer } from '../data/researchConsent';
import { joinNames } from '../data/signup';

/**
 * The one-time research confirm (assessments spec 7): a family whose
 * athletes have no research answer recorded sees the same checkboxes once,
 * before their home, and "Save my answer" records them (unticked saves as
 * no). Never a trap (Review Focus 5): a read that fails or is still loading
 * shows the home; a refused save says so, retries only what failed, and
 * offers "Skip for now" - the question returns at the next sign-in. A save
 * the server has not acknowledged in 8 s (offline: the write neither lands
 * nor fails) says so and offers "Skip for now" too, the save still running
 * (review 2026-10-28).
 */
export default function ResearchConfirmGate({ children }) {
  const live = isLive();
  const { user } = useAuthSession(live ? undefined : { variant: 'idle' });
  const { data } = useResearchConfirm(live ? user : null);
  const [done, setDone] = useState(false);
  const [, setSkipTick] = useState(0);
  const pending = data?.pending ?? [];
  if (!live || !user || done || researchConfirmSkipped(user.uid) || pending.length === 0) return children;
  return (
    <ResearchConfirm
      pending={pending}
      onDone={() => setDone(true)}
      onSkip={() => { skipResearchConfirm(user.uid); setSkipTick((n) => n + 1); }}
    />
  );
}

function ResearchConfirm({ pending, onDone, onSkip }) {
  const [answers, setAnswers] = useState(() => Object.fromEntries(pending.map((p) => [p.id, { ticked: false, assent: false }])));
  const [saved, setSaved] = useState([]);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [slow, setSlow] = useState(false);
  const [sheet, setSheet] = useState(null);

  const save = async () => {
    setSaving(true);
    setFailed(false);
    setSlow(false);
    const timer = setTimeout(() => setSlow(true), SLOW_SAVE_MS);
    const now = [...saved];
    for (const p of pending.filter((x) => !saved.includes(x.id))) {
      try {
        await saveResearchConsent({ athleteId: p.id, answer: researchAnswer({ ...answers[p.id], minor: p.minor }) });
        now.push(p.id);
      } catch (err) {
        setFailed(true);
      }
    }
    clearTimeout(timer);
    setSlow(false);
    setSaved(now);
    setSaving(false);
    if (now.length === pending.length) onDone();
  };

  return (
    <PhoneFrame
      bare
      header={<div style={{ padding: '18px 22px 8px' }}><ScreenTitle size={22}>{RESEARCH_CONFIRM_TITLE}</ScreenTitle></div>}
      footer={
        <div style={{ borderTop: `1px solid ${color.frameRule}`, padding: '12px 22px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Button height={52} loading={saving} onClick={save}>{RESEARCH_SAVE_LABEL}</Button>
          {failed || slow ? <Button variant="outline" height={46} disabled={saving && !slow} style={{ boxShadow: 'none' }} onClick={onSkip}>Skip for now</Button> : null}
        </div>
      }
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 12, position: 'relative' }}>
        <Body size={13}>{confirmBody(joinNames(pending.map((p) => firstName(p.name))))}</Body>
        {pending.map((p) => {
          const name = firstName(p.name);
          return (
            <Card key={p.id} large>
              <ResearchChoice
                name={name}
                self={p.self}
                minor={p.minor}
                ticked={answers[p.id].ticked}
                assent={answers[p.id].assent}
                onChange={(next) => setAnswers((all) => ({ ...all, [p.id]: next }))}
                onReadMore={() => setSheet({ name })}
              />
              {saved.includes(p.id) ? <Body size={11} tone={color.primary} style={{ marginTop: 8 }}>Saved</Body> : null}
            </Card>
          );
        })}
        {failed ? (
          <ErrorNotice title="Not saved">
            Your answer was not saved. Check the connection and try again, or skip for now: we will ask again the next time you sign in.
          </ErrorNotice>
        ) : slow ? (
          <ErrorNotice title="Not saved yet">
            Your answer is not saved yet. Check the connection, or skip for now: we will ask again the next time you sign in.
          </ErrorNotice>
        ) : null}
      </div>
      {sheet ? <ResearchSheet name={sheet.name} onClose={() => setSheet(null)} /> : null}
    </PhoneFrame>
  );
}
