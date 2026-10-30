import React, { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { color, font, radius } from '../tokens';
import AthleteRow from '../components/AthleteRow';
import BottomTabBar from '../components/BottomTabBar';
import Field from '../components/Field';
import PhoneFrame from '../components/PhoneFrame';
import SkeletonCard from '../components/Skeleton';
import { Body, Card, ErrorNotice, ScreenTitle, SectionLabel, SignOutButton } from '../components/Primitives';
import { useMentalAthletes } from '../hooks';
import { familyHint } from '../data/athleteLabel';

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
 */
export default function MentalAthletes({ bare = false, onOpenAthlete, onSignOut }) {
  const { data, loading, error } = useMentalAthletes();
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const all = data ?? [];
  const rows = all.filter((r) => String(r.name || '').toLowerCase().includes(needle));
  const open = (id) => onOpenAthlete && onOpenAthlete(id);

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
            <Body size={12}>{needle ? `No athlete matches "${q.trim()}"` : 'No athletes yet.'}</Body>
          </div>
        ) : (
          <Card large>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {rows.map((row, i) => (
                <div
                  key={row.athleteId}
                  role="button"
                  tabIndex={0}
                  aria-label={row.name}
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
                    divider={i < rows.length - 1}
                    trailing={
                      row.hasIntake ? (
                        <Body size={11} tone={color.primary} style={{ font: `600 11px ${font.body}` }}>Intake</Body>
                      ) : (
                        <Body size={11} tone={color.textTertiary}>No intake</Body>
                      )
                    }
                  >
                    {row.latestNoteDate ? (
                      <Body size={11} tone={color.textTertiary} style={{ marginTop: 2 }}>
                        Note {day(row.latestNoteDate)}
                      </Body>
                    ) : null}
                  </AthleteRow>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </PhoneFrame>
  );
}
