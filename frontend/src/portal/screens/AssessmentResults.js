import React, { useMemo, useState } from 'react';
import AssessmentFrame, { useLayoutClass } from '../components/AssessmentFrame';
import WindowCard from '../components/assessments/WindowCard';
import ResultsTable from '../components/assessments/ResultsTable';
import { BackLink, Body, ErrorNotice, ScreenTitle } from '../components/Primitives';
import { useAthleteAssessments } from '../hooks/assessments';
import { saveWindowFields } from '../hooks/assessmentsLive';
import { assessmentAccess } from '../data/assessmentAccess';
import { buildResults } from '../data/assessmentResults';
import { CONSENT_LABEL, shortDate } from '../data/assessmentWindows';
import { academyDateISO } from '../data/calendar';

const SEX_LABEL = { male: 'Male', female: 'Female' };

/**
 * One athlete's results (spec 5 "Results (coach)"): every window, newest
 * first, as data/assessmentResults.js builds it; on desktop the table of
 * every window above the cards. Every coach reads it; staff (Phil,
 * assessors, ops, owner) mark a window complete or reopen it and run a
 * McGill block it is missing. The athlete record itself may be refused to
 * a golf coach outside their sessions; the results still show, under the
 * name the list passed.
 */
export default function AssessmentResults({ bare = false, athleteId, viewer, fallbackName = null, onBack, onRunMcgill, today = academyDateISO() }) {
  const layout = useLayoutClass();
  const { data, loading, error } = useAthleteAssessments(athleteId);
  const staff = assessmentAccess(viewer) === 'staff';
  const [status, setStatus] = useState({});
  const [busy, setBusy] = useState(null);
  const [failed, setFailed] = useState(null);
  const results = useMemo(() => (data ? buildResults({ athleteId, ...data, today }) : null), [athleteId, data, today]);
  const name = results?.name ?? fallbackName ?? 'Athlete';

  const setWindowStatus = async (windowId, next) => {
    setBusy(windowId);
    setFailed(null);
    try {
      await saveWindowFields({ athleteId, windowId, fields: { status: next } });
      setStatus((all) => ({ ...all, [windowId]: next }));
    } catch (err) {
      setFailed(windowId);
    } finally {
      setBusy(null);
    }
  };

  const about = results
    ? [CONSENT_LABEL[results.consent], results.firstTestDate ? `First test ${shortDate(results.firstTestDate)}` : null, SEX_LABEL[results.sex] ?? null].filter(Boolean).join(' · ')
    : null;
  const header = (
    <div style={{ padding: '4px 22px 12px' }}>
      <BackLink onClick={onBack}>‹ Back</BackLink>
      <ScreenTitle size={21} style={{ marginTop: 8 }}>{name}</ScreenTitle>
      {about ? <Body size={12} style={{ marginTop: 3 }}>{about}</Body> : null}
    </div>
  );

  return (
    <AssessmentFrame bare={bare} layout={layout} header={header}>
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {error && !data ? <ErrorNotice>The results didn't load. Check your connection and try again.</ErrorNotice> : null}
        {loading && !data ? <Body size={12}>Loading results…</Body> : null}
        {results && results.windows.length === 0 ? <Body size={13}>No assessments yet.</Body> : null}
        {results && results.windows.length && layout === 'desktop' ? <ResultsTable windows={results.windows} /> : null}
        {results
          ? results.windows.map((r) => (
              <WindowCard
                key={r.id}
                result={r}
                status={status[r.id] ?? r.status}
                staff={staff}
                busy={busy === r.id}
                failed={failed === r.id}
                onStatus={(next) => setWindowStatus(r.id, next)}
                onRunMcgill={r.wave && onRunMcgill ? () => onRunMcgill(r.wave.id) : null}
              />
            ))
          : null}
      </div>
    </AssessmentFrame>
  );
}
