import React, { useState } from 'react';
import { color, font } from '../../tokens';
import Button from '../Button';
import PaperSignatureSheet from './PaperSignatureSheet';
import { Body, Card, SectionLabel } from '../Primitives';
import { useStaffConsent } from '../../hooks/mentalConsentStaff';
import { isLive } from '../../hooks/live';

const SAVE_FAILED = "This couldn't be saved. Check your connection and try again.";
const ALREADY = 'Already signed, so nothing was recorded. The card shows the record on file.';
const outline = { boxShadow: 'none', font: `600 14px ${font.body}` };

/**
 * Yannick's consent on the athlete admin card, for ops and the owner (spec
 * 5, plan Task 15): the status line and "Record a paper signature" (no
 * record yet, or the section 11 re-sign of an athlete now 18), and for the
 * owner alone on a paper record not yet re-signed at 18 "Correct the paper
 * record". A portal record, or a re-signed one (its section 11 answers are
 * the athlete's), is never edited here (that is an Admin SDK job). A paper
 * entry that loses a race with a portal signature keeps the sheet open and
 * says nothing was recorded. `demoPaperOpen` opens the
 * paper sheet at mount (the review harness's; live mode ignores it).
 */
export default function StaffConsentDetail({ athleteId, role, demoPaperOpen = false }) {
  const { data, error, recordPaper, correctPaper } = useStaffConsent(athleteId);
  const [sheet, setSheet] = useState(demoPaperOpen && !isLive() ? 'record' : null); // 'record' | 'correct' | null
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  if (error) {
    return (
      <Card>
        <SectionLabel style={{ marginBottom: 6 }}>Mental performance consent</SectionLabel>
        <Body size={12}>Consent status unavailable</Body>
      </Card>
    );
  }
  if (!data) return null;
  const { athlete, record, summary } = data;
  const canRecord = !record || summary.status === 'needs-adult';
  const canCorrect = role === 'owner' && record?.method === 'paper' && !record.adultSignature;
  const close = () => { setSheet(null); setSaveError(null); };
  const save = async (input) => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await (sheet === 'correct' ? correctPaper(input) : recordPaper(input));
      if (res?.status === 'already') {
        setSaveError(ALREADY);
        return;
      }
      setSheet(null);
    } catch (err) {
      setSaveError(SAVE_FAILED);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
        <SectionLabel>Mental performance consent</SectionLabel>
        <span style={{ font: `600 12px ${font.body}`, color: summary.status === 'signed' ? color.primary : color.secondary }}>{summary.label}</span>
      </div>
      <Body size={12} style={{ overflowWrap: 'anywhere' }}>{summary.summary ?? 'Not signed yet.'}</Body>
      {canRecord || canCorrect ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          {canRecord ? <Button variant="outline" height={44} style={outline} onClick={() => setSheet('record')}>Record a paper signature</Button> : null}
          {canCorrect ? <Button variant="outline" height={44} style={outline} onClick={() => setSheet('correct')}>Correct the paper record</Button> : null}
        </div>
      ) : null}
      {sheet ? (
        <PaperSignatureSheet
          key={sheet}
          open
          athlete={athlete}
          record={record}
          mode={sheet}
          saving={saving}
          error={saveError}
          onSave={save}
          onClose={close}
        />
      ) : null}
    </Card>
  );
}
