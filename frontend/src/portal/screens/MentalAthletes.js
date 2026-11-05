import React, { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { color, font, radius, tint } from '../tokens';
import AthleteRow from '../components/AthleteRow';
import BottomTabBar from '../components/BottomTabBar';
import Field from '../components/Field';
import PhoneFrame from '../components/PhoneFrame';
import SkeletonCard from '../components/Skeleton';
import { Body, Card, ErrorNotice, ScreenTitle, SectionLabel, SignOutButton } from '../components/Primitives';
import { useMentalAthletes } from '../hooks';
import { familyHint } from '../data/athleteLabel';
import { STAFF_STATUS_LABEL } from '../data/mentalConsent';

const day = (iso) => format(parseISO(iso), 'MMM d');

/**
 * `Age 14 · Next 1:1 Nov 17`, `Age 14 · Last 1:1 Nov 10` or `Age 9 · No 1:1
 * yet`; no age part without a dob. A first-name-only athlete gets the family
 * name first (`Erickson family · Age 10 · …`) so two "Brooks" tell apart.
 */
function metaFor(row) {
  const session = row.nextSession
    ? `Next 1:1 ${day(row.nextSession)}`
    : row.lastSession
    ? `Last 1:1 ${day(row.lastSession)}`
    : 'No 1:1 yet';
  return [familyHint(row.name, row.familyName), row.age != null ? `Age ${row.age}` : null, session].filter(Boolean).join(' · ');
}

/**
 * Athletes - Yannick's list (2026-10-28, spec 5.1): every athlete, with
 * age, the next or last mental 1:1, whether the intake note exists and the
 * latest note's date. Role 'mental' only (the route and firestore.rules).
 *
 * Each row is wrapped in a role="button" div named by the athlete: the
 * AthleteRow itself is a plain div whose text runs name, meta and trailing
 * together, so the wrapper is what a screen reader (and the tests) reach.
 *
 * Consent (2026-10-30 spec 5): each row says Signed / Not signed / Needs 18+
 * / No date of birth under its intake line (nothing when the consent read
 * failed); the rows with a 1:1 ahead and no signature come first under
 * "Needs consent before a session", and the Needs consent chip shows only
 * them.
 */
export default function MentalAthletes({ bare = false, onOpenAthlete, onSignOut }) {
  const { data, loading, error } = useMentalAthletes();
  const [q, setQ] = useState('');
  const [onlyNeeds, setOnlyNeeds] = useState(false);
  const needle = q.trim().toLowerCase();
  const all = data ?? [];
  const found = all.filter((r) => String(r.name || '').toLowerCase().includes(needle));
  const needing = found.filter((r) => r.needsConsent);
  const rest = onlyNeeds ? [] : found.filter((r) => !r.needsConsent);
  const rows = [...needing, ...rest];
  const anyNeeds = all.some((r) => r.needsConsent);
  const open = (id) => onOpenAthlete && onOpenAthlete(id);
  const list = (group) => (
    <Card large>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {group.map((row, i) => <MentalAthleteRow key={row.athleteId} row={row} divider={i < group.length - 1} open={open} />)}
      </div>
    </Card>
  );

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '8px 22px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <SectionLabel style={{ marginBottom: 4 }}>Mental game</SectionLabel>
              <ScreenTitle size={22}>Athletes</ScreenTitle>
            </div>
            <SignOutButton onSignOut={onSignOut} />
          </div>
        </div>
      }
      footer={<BottomTabBar role="mental" active="athletes" />}
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Search athletes" value={q} placeholder="Name" onChange={setQ} />
        {anyNeeds || onlyNeeds ? (
          <button type="button" aria-pressed={onlyNeeds} onClick={() => setOnlyNeeds((v) => !v)} style={chip(onlyNeeds)}>Needs consent</button>
        ) : null}
        {loading ? (
          <>
            <SkeletonCard large height={72} />
            <SkeletonCard large height={72} />
          </>
        ) : error ? (
          <ErrorNotice title="Athletes didn't load" />
        ) : rows.length === 0 ? (
          <div
            style={{
              border: `1px dashed ${color.border}`,
              borderRadius: radius.cardLarge,
              padding: '24px 22px',
              textAlign: 'center',
            }}
          >
            <Body size={12}>{needle ? `No athlete matches "${q.trim()}"` : onlyNeeds ? 'Nobody needs consent before a session.' : 'No athletes yet.'}</Body>
          </div>
        ) : (
          <>
            {needing.length ? <SectionLabel tone={color.secondary}>Needs consent before a session</SectionLabel> : null}
            {needing.length ? list(needing) : null}
            {needing.length && rest.length ? <SectionLabel style={{ marginTop: 4 }}>Everyone else</SectionLabel> : null}
            {rest.length ? list(rest) : null}
          </>
        )}
      </div>
    </PhoneFrame>
  );
}

const chip = (on) => ({
  alignSelf: 'flex-start', minHeight: 36, padding: '0 14px', borderRadius: radius.pill, cursor: 'pointer',
  border: `1px solid ${on ? color.secondary : color.border}`, background: on ? tint.yellow : 'transparent',
  font: `600 12px ${font.body}`, color: on ? color.secondary : color.textSecondary,
});

/** One athlete, a tap target named by the athlete and described by its consent status; the trailing column is the intake and the consent status. */
function MentalAthleteRow({ row, divider, open }) {
  const consent = row.consentStatus ? STAFF_STATUS_LABEL[row.consentStatus] : null;
  const consentId = consent ? `consent-${row.athleteId}` : undefined;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={row.name}
      aria-describedby={consentId}
      onClick={() => open(row.athleteId)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open(row.athleteId);
        }
      }}
      style={{ cursor: 'pointer' }}
    >
      <AthleteRow
        name={row.name}
        meta={metaFor(row)}
        avatarSize={42}
        nameSize={16}
        divider={divider}
        trailing={
          <div style={{ textAlign: 'right' }}>
            {row.hasIntake ? (
              <Body size={11} tone={color.primary} style={{ font: `600 11px ${font.body}` }}>Intake</Body>
            ) : (
              <Body size={11} tone={color.textTertiary}>No intake</Body>
            )}
            {consent ? (
              <div id={consentId}>
                <Body size={11} tone={row.consentStatus === 'signed' ? color.textTertiary : color.secondary} style={{ marginTop: 2 }}>{consent}</Body>
              </div>
            ) : null}
          </div>
        }
      >
        {row.latestNoteDate ? (
          <Body size={11} tone={color.textTertiary} style={{ marginTop: 2 }}>
            Note {day(row.latestNoteDate)}
          </Body>
        ) : null}
      </AthleteRow>
    </div>
  );
}
