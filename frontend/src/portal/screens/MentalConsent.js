import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { color, font } from '../tokens';
import BottomTabBar from '../components/BottomTabBar';
import Button from '../components/Button';
import PhoneFrame from '../components/PhoneFrame';
import SkeletonCard from '../components/Skeleton';
import ConfirmSheet from '../components/consent/ConfirmSheet';
import { Body, Card, ErrorNotice, ScreenTitle } from '../components/Primitives';
import { useFamilyConsents, withdrawRecording } from '../hooks/mentalConsent';
import { familyLine } from '../data/mentalConsent';
import { CONTACT_LINE } from '../data/mentalConsentTerms';

const OPENS_FLOW = new Set(['sign', 'continue', 'restart']);
const SAVE_FAILED = "This couldn't be saved. Check your connection and try again.";

/**
 * One athlete: name, the family line and its action - the flow, Change
 * choices, or a minor login's own "Stop recording my sessions" (plan Task
 * 12; one way: only the parent's hand-the-phone change turns it back on).
 */
function ConsentRow({ row, onOpen, navigate, onWithdraw }) {
  const line = familyLine(row);
  let action = null;
  let label = line.label;
  if (OPENS_FLOW.has(line.action)) action = () => onOpen?.(row.athleteId);
  else if (line.action === 'change') action = () => navigate(line.href);
  else if (line.action === 'withdraw') {
    action = () => onWithdraw(row.athleteId);
    label = 'Stop recording my sessions';
  }
  return (
    <Card large>
      <div style={{ font: `600 15px ${font.body}`, color: color.text }}>{row.name}</div>
      <Body size={13} style={{ marginTop: 4 }}>{line.text}</Body>
      {action ? (
        <Button variant={line.action === 'change' || line.action === 'withdraw' ? 'outline' : 'primary'} height={46} onClick={action} style={{ marginTop: 12, boxShadow: 'none' }}>
          {label}
        </Button>
      ) : null}
    </Card>
  );
}

/**
 * Yannick's consent, the family's list (spec 4.1, plan Task 11), at
 * /portal/consent/mental - where every consent notice links. One row per
 * athlete this login sees, with its status line; a household with one
 * athlete goes straight into that athlete's flow (`onOpen(id, { replace:
 * true })`) unless `autoOpen` is off (back from the flow, or `?withdraw=1`)
 * or the row's action is the athlete's own withdrawal. `?withdraw=1` (the
 * athlete home's "Stop recording") opens the Stop recording sheet at once,
 * one tap instead of two, and is dropped from the URL as it is used.
 * `demoDraft` is the review harness's (seed only).
 */
export default function MentalConsent({ bare = false, autoOpen = true, onOpen, demoDraft = null }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // Came for the withdrawal: never auto-open the flow on this visit, even once the param is gone.
  const withdrawVisit = useRef(searchParams.has('withdraw'));
  const { data, loading, error } = useFamilyConsents({ demoDraft });
  const rows = data?.rows ?? null;
  const opened = useRef(false);
  const [withdrawing, setWithdrawing] = useState(null); // { athleteId, busy, error } while the sheet is open

  useEffect(() => {
    if (opened.current || !autoOpen || withdrawVisit.current || !rows || rows.length !== 1) return;
    if (familyLine(rows[0]).action === 'withdraw') return;
    opened.current = true;
    onOpen?.(rows[0].athleteId, { replace: true });
  }, [autoOpen, rows, onOpen]);

  useEffect(() => {
    if (!rows || !searchParams.has('withdraw')) return;
    const own = rows.find((r) => familyLine(r).action === 'withdraw');
    if (own) setWithdrawing({ athleteId: own.athleteId, busy: false, error: null });
    const rest = new URLSearchParams(searchParams);
    rest.delete('withdraw');
    setSearchParams(rest, { replace: true });
  }, [rows, searchParams, setSearchParams]);

  const viewer = data?.viewer === 'athlete' ? 'athlete' : 'parent';
  const confirmWithdraw = async () => {
    const id = withdrawing.athleteId;
    setWithdrawing({ athleteId: id, busy: true, error: null });
    try {
      await withdrawRecording(id);
      setWithdrawing(null);
    } catch (err) {
      setWithdrawing({ athleteId: id, busy: false, error: SAVE_FAILED });
    }
  };
  return (
    <PhoneFrame bare={bare} footer={<BottomTabBar role={viewer} />}>
      <div style={{ padding: '22px 20px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <ScreenTitle>Mental performance consent</ScreenTitle>
        <Body size={13}>Yannick's consent form, signed once per athlete before their 1:1 sessions.</Body>
        {loading ? <SkeletonCard large height={110} /> : null}
        {error ? <ErrorNotice>Yannick's consent didn't load. Check your connection and try again.</ErrorNotice> : null}
        {rows && !rows.length ? <Body size={13}>No athletes on this login.</Body> : null}
        {(rows || []).map((row) => (
          <ConsentRow key={row.athleteId} row={row} onOpen={onOpen} navigate={navigate} onWithdraw={(athleteId) => setWithdrawing({ athleteId, busy: false, error: null })} />
        ))}
        <Body size={12} style={{ marginTop: 6 }}>{CONTACT_LINE}</Body>
      </div>
      {withdrawing ? (
        <ConfirmSheet
          text="Stop recording? Yannick won't record your sessions until your parent changes it with you."
          confirmLabel="Yes, stop recording"
          cancelLabel="Keep it"
          cancelFirst
          busy={withdrawing.busy}
          error={withdrawing.error}
          onConfirm={confirmWithdraw}
          onClose={() => setWithdrawing(null)}
        />
      ) : null}
    </PhoneFrame>
  );
}
