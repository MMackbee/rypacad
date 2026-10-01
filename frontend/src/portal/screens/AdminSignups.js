import React, { useState } from 'react';
import { color, font } from '../tokens';
import * as hooks from '../hooks';
import BottomTabBar from '../components/BottomTabBar';
import PhoneFrame from '../components/PhoneFrame';
import Segmented from '../components/Segmented';
import StatusBadge from '../components/StatusBadge';
import { BackLink, Body, Card, ErrorNotice, ScreenTitle, SectionLabel } from '../components/Primitives';
import {
  SIGNUP_FILTERS, athleteLine, facilityAccessLabel, filterSignupRows, flagLabel, flaggedCount, loginLabel, paymentLabel, signedUpLabel, unresolvedLabel,
} from '../data/signupsReport';

/**
 * Sprint 20 (D14): useSignups() lands with routing Task 13, the last routing
 * merge; until then this screen renders an honest empty report. Namespace-
 * import + inert-fallback (Registration.js:27-35) - its own copy, never
 * imported from AdminDashboard.
 */
function useSignupsFallback() {
  return {
    data: { rows: [], counts: { all: 0, unpaid: 0, flagged: 0, unresolved: 0 }, unresolved: [] },
    loading: false,
    error: null,
  };
}
const useSignups = hooks.useSignups || useSignupsFallback;

/**
 * 21 · Sign-ups (Sprint 20, spec 7) - ops/owner. Every self-signed household,
 * newest first: parent contact, athletes (age, tier, handicap), payment per
 * athlete, child login, flags. Filters all / unpaid / flagged; a row opens
 * the household's staff billing view. Replaces the enrollment queue (2.4).
 * Calendly bookings the webhook could not match to an athlete have no
 * household to hang off, so they get their own card on All and Flagged and
 * count inside the Flagged pill (D16).
 */
export default function AdminSignups({ bare = false, role = 'owner', onBack, onOpenHousehold }) {
  const { data, loading, error } = useSignups();
  const [filter, setFilter] = useState('all');
  const rows = filterSignupRows(data?.rows ?? [], filter);
  const counts = data?.counts ?? { all: 0, unpaid: 0, flagged: 0, unresolved: 0 };
  const pill = { all: counts.all ?? 0, unpaid: counts.unpaid ?? 0, flagged: flaggedCount(counts) };
  const unresolved = filter === 'unpaid' ? [] : data?.unresolved ?? [];
  const empty = rows.length === 0 && unresolved.length === 0;
  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '8px 22px 14px' }}>
          {onBack ? <BackLink onClick={onBack}>‹ Admin</BackLink> : null}
          <ScreenTitle size={22} style={{ marginTop: onBack ? 8 : 0 }}>Sign-ups</ScreenTitle>
          <div style={{ marginTop: 12 }}>
            <Segmented value={filter} onChange={setFilter} options={SIGNUP_FILTERS.map(([k, l]) => [k, `${l} · ${pill[k]}`])} />
          </div>
        </div>
      }
      footer={<BottomTabBar role={role} active="admin" />}
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loading ? (
          <Body size={12}>Loading sign-ups…</Body>
        ) : error ? (
          <ErrorNotice title="Sign-ups didn't load">Check your connection and try again.</ErrorNotice>
        ) : (
          <>
            {unresolved.length ? <UnmatchedCard events={unresolved} /> : null}
            {empty ? (
              <Body size={12} tone={color.textTertiary}>Nothing here yet.</Body>
            ) : (
              rows.map((row) => (
                <SignupRow key={row.householdId} row={row} onOpen={onOpenHousehold ? () => onOpenHousehold(row.householdId) : undefined} />
              ))
            )}
          </>
        )}
      </div>
    </PhoneFrame>
  );
}

/** D16: unmatched Calendly bookings - no household row exists, so they sit in their own card. */
function UnmatchedCard({ events }) {
  return (
    <Card tone="red" large>
      <SectionLabel tone={color.error} style={{ marginBottom: 6 }}>Unmatched Calendly bookings · {events.length}</SectionLabel>
      <Body size={12} style={{ marginBottom: 8 }}>
        The webhook could not tie these to an athlete (no login with the invitee's email, and no portal link - or one for an athlete that email does not own).
        Find the family from Calendly's email and book it for them, or ask Yannick to cancel it.
      </Body>
      {events.map((e) => <Body key={e.id} size={12} tone={color.error}>{unresolvedLabel(e)}</Body>)}
    </Card>
  );
}

const TONE = { pending: 'yellow', active: 'green', past_due: 'yellow', lapsed: 'red' };

function SignupRow({ row, onOpen }) {
  // The family's, so every athlete of a covered household reads it (owner ruling 2026-09-30).
  const facility = facilityAccessLabel(row);
  return (
    <div role={onOpen ? 'button' : undefined} aria-label={row.name} onClick={onOpen} style={{ cursor: onOpen ? 'pointer' : 'default' }}>
      <Card large>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: `600 14px ${font.body}`, color: color.text }}>{row.name}</div>
            <div style={{ font: `400 11px ${font.body}`, color: color.textTertiary, marginTop: 2 }}>
              {signedUpLabel(row.signedUpAt)}{row.mode ? ` · ${row.mode === 'athlete' ? 'self (18+)' : 'parent'}` : ''}
            </div>
          </div>
          {row.unpaid ? <StatusBadge tone="yellow">Unpaid</StatusBadge> : null}
          {row.flagged ? <StatusBadge tone="red">Flagged</StatusBadge> : null}
        </div>
        <Body size={12} style={{ marginTop: 8 }}>{row.parent.name} · {row.parent.email} · {row.parent.phone}</Body>
        <SectionLabel style={{ marginTop: 12, marginBottom: 6 }}>Athletes</SectionLabel>
        {row.athletes.map((a) => (
          <div key={a.athleteId} style={{ padding: '6px 0', borderTop: `1px solid ${color.ruleSoft}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, font: `500 12px ${font.body}`, color: color.text }}>{athleteLine(a)}</div>
              <StatusBadge tone={TONE[a.billing] || 'neutral'}>{paymentLabel(a)}</StatusBadge>
            </div>
            <div style={{ font: `400 11px ${font.body}`, color: color.textTertiary, marginTop: 3 }}>{loginLabel(a)}{facility ? ` · ${facility}` : ''}</div>
          </div>
        ))}
        {row.flags.length ? (
          <>
            <SectionLabel tone={color.error} style={{ marginTop: 12, marginBottom: 6 }}>Flags</SectionLabel>
            {row.flags.map((f) => <Body key={f.id} size={12} tone={color.error}>{flagLabel(f)}</Body>)}
          </>
        ) : null}
      </Card>
    </div>
  );
}
