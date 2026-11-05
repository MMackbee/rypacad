import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { color, font } from '../tokens';
import BottomTabBar from '../components/BottomTabBar';
import Button from '../components/Button';
import PhoneFrame from '../components/PhoneFrame';
import SkeletonCard from '../components/Skeleton';
import { Body, Card, ErrorNotice, ScreenTitle } from '../components/Primitives';
import { useFamilyConsents } from '../hooks/mentalConsent';
import { familyLine } from '../data/mentalConsent';
import { CONTACT_LINE } from '../data/mentalConsentTerms';

const OPENS_FLOW = new Set(['sign', 'continue', 'restart']);

/** One athlete: name, the family line and its action (the flow, Change choices, or nothing). */
function ConsentRow({ row, onOpen, navigate }) {
  const line = familyLine(row);
  let action = null;
  if (OPENS_FLOW.has(line.action)) action = () => onOpen?.(row.athleteId);
  else if (line.action === 'change') action = () => navigate(line.href);
  return (
    <Card large>
      <div style={{ font: `600 15px ${font.body}`, color: color.text }}>{row.name}</div>
      <Body size={13} style={{ marginTop: 4 }}>{line.text}</Body>
      {action ? (
        <Button variant={line.action === 'change' ? 'outline' : 'primary'} height={46} onClick={action} style={{ marginTop: 12, boxShadow: 'none' }}>
          {line.label}
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
 * or the row's action is the athlete's own withdrawal. `demoDraft` is the
 * review harness's (seed only).
 */
export default function MentalConsent({ bare = false, autoOpen = true, onOpen, demoDraft = null }) {
  const navigate = useNavigate();
  const { data, loading, error } = useFamilyConsents({ demoDraft });
  const rows = data?.rows ?? null;
  const opened = useRef(false);

  useEffect(() => {
    if (opened.current || !autoOpen || !rows || rows.length !== 1) return;
    if (familyLine(rows[0]).action === 'withdraw') return;
    opened.current = true;
    onOpen?.(rows[0].athleteId, { replace: true });
  }, [autoOpen, rows, onOpen]);

  const viewer = data?.viewer === 'athlete' ? 'athlete' : 'parent';
  return (
    <PhoneFrame bare={bare} footer={<BottomTabBar role={viewer} />}>
      <div style={{ padding: '22px 20px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <ScreenTitle>Mental performance consent</ScreenTitle>
        <Body size={13}>Yannick's consent form, signed once per athlete before their 1:1 sessions.</Body>
        {loading ? <SkeletonCard large height={110} /> : null}
        {error ? <ErrorNotice>Yannick's consent didn't load. Check your connection and try again.</ErrorNotice> : null}
        {rows && !rows.length ? <Body size={13}>No athletes on this login.</Body> : null}
        {(rows || []).map((row) => <ConsentRow key={row.athleteId} row={row} onOpen={onOpen} navigate={navigate} />)}
        <Body size={12} style={{ marginTop: 6 }}>{CONTACT_LINE}</Body>
      </div>
    </PhoneFrame>
  );
}
