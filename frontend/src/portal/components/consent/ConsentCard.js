import React, { useState } from 'react';
import { color, font } from '../../tokens';
import Button from '../Button';
import ConfirmSheet from './ConfirmSheet';
import { Body, Card, SectionLabel } from '../Primitives';
import { countersignConsent, sendConsentReminder, withdrawRecording } from '../../hooks/mentalConsent';

/** The callable's refusals (plan Global Constraints) in Yannick's words; anything else is a plain retry line. */
function refusalCopy(err, firstName) {
  switch (err?.reason) {
    case 'test-household': return 'This is a test family; reminders never go to test families.';
    case 'disabled': return 'Reminders are off until the academy turns them on.';
    case 'already-signed': return 'Already signed.';
    case 'no-dob': return `Add ${firstName}'s date of birth first (ops can add it).`;
    case 'no-household': return `No family on file for ${firstName} (ops can fix it).`;
    default: return "Couldn't send the reminder. Try again.";
  }
}

const SAVE_FAILED = "This couldn't be saved. Check your connection and try again.";
const outline = { boxShadow: 'none', font: `600 14px ${font.body}` };

/**
 * Yannick's Consent card on an athlete's page (spec 5, plan Task 14),
 * between Intake and Sessions: the status, the summary line, and his three
 * actions - Countersign (until he has), Send a reminder (while Not signed or
 * Needs 18+; "Sent", or "Sent today" when the once-a-day guard answers) and
 * Recording withdrawn (a minor's own answer, one way). `consent = { record,
 * summary, unavailable }` from useMentalAthlete; `familyLabel` names the
 * household recipient (the guardian), else "the family". The server decides
 * who a reminder reaches; the sheet says who it will as far as Yannick's
 * role can read.
 */
export default function ConsentCard({ athleteId, firstName, familyLabel = null, consent }) {
  const [sheet, setSheet] = useState(null); // 'remind' | 'withdraw' | null
  const [busy, setBusy] = useState(false);
  const [sheetError, setSheetError] = useState(null);
  const [sent, setSent] = useState(null); // 'sent' | 'duplicate'
  const [countersigned, setCountersigned] = useState(false);
  const [withdrawn, setWithdrawn] = useState(false);
  const [failed, setFailed] = useState(null);
  const summary = consent?.summary;

  if (!consent) return null;
  if (consent.unavailable || !summary) {
    return (
      <Card large>
        <SectionLabel style={{ marginBottom: 8 }}>Consent</SectionLabel>
        <Body size={12}>Consent status unavailable</Body>
      </Card>
    );
  }

  const label = countersigned ? 'Complete' : summary.label;
  const recipient = summary.audience === 'athlete' ? firstName : familyLabel || 'The family';
  const remindText = summary.audience === 'athlete'
    ? `Send ${firstName} a reminder to sign? ${firstName} gets an email and a push.`
    : `Send ${firstName}'s family a reminder to sign? ${recipient} gets an email and a push.`;
  const close = () => { setSheet(null); setSheetError(null); };

  const run = async (action) => {
    setBusy(true);
    setSheetError(null);
    try {
      await action();
      close();
    } catch (err) {
      setSheetError(sheet === 'remind' ? refusalCopy(err, firstName) : SAVE_FAILED);
    } finally {
      setBusy(false);
    }
  };
  const remind = () => run(async () => {
    const res = await sendConsentReminder(athleteId);
    setSent(res?.status === 'duplicate' ? 'duplicate' : 'sent');
  });
  const withdraw = () => run(async () => {
    await withdrawRecording(athleteId);
    setWithdrawn(true);
  });
  const countersign = async () => {
    setFailed(null);
    try {
      await countersignConsent(athleteId);
      setCountersigned(true);
    } catch (err) {
      setFailed(SAVE_FAILED);
    }
  };

  return (
    <Card large>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
        <SectionLabel>Consent</SectionLabel>
        <span style={{ font: `600 12px ${font.body}`, color: summary.status === 'signed' ? color.primary : color.secondary }}>{label}</span>
      </div>
      <Body size={12} style={{ overflowWrap: 'anywhere' }}>{summary.summary ?? `Not signed yet · ${summary.recording}`}</Body>
      {failed ? <Body size={12} tone={color.error} style={{ marginTop: 8 }}>{failed}</Body> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
        {summary.canCountersign && !countersigned ? <Button variant="outline" height={44} style={outline} onClick={countersign}>Countersign</Button> : null}
        {summary.canRemind ? (
          sent ? (
            <Body size={12} tone={color.primary} style={{ font: `600 12px ${font.body}` }}>{sent === 'duplicate' ? 'Sent today' : 'Sent'}</Body>
          ) : (
            <Button variant="outline" height={44} style={outline} onClick={() => setSheet('remind')}>Send a reminder</Button>
          )
        ) : null}
        {summary.canWithdraw && !withdrawn ? <Button variant="outline" height={44} style={outline} onClick={() => setSheet('withdraw')}>Recording withdrawn</Button> : null}
      </div>
      {sheet === 'remind' ? <ConfirmSheet text={remindText} confirmLabel="Send" busy={busy} error={sheetError} onConfirm={remind} onClose={close} /> : null}
      {sheet === 'withdraw' ? (
        <ConfirmSheet
          text={`Record that ${firstName} withdrew the recording answer? Recording stops until the family changes it.`}
          confirmLabel="Record it"
          cancelFirst
          busy={busy}
          error={sheetError}
          onConfirm={withdraw}
          onClose={close}
        />
      ) : null}
    </Card>
  );
}
