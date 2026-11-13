import React, { useState } from 'react';
import { color, font } from '../tokens';
import BottomTabBar from '../components/BottomTabBar';
import Button from '../components/Button';
import PhoneFrame from '../components/PhoneFrame';
import SkeletonCard from '../components/Skeleton';
import StaffCancelSheet from '../components/StaffCancelSheet';
import StatusBadge from '../components/StatusBadge';
import StaffAddSheet from '../components/staffBooking/StaffAddSheet';
import StaffMoveSheet from '../components/staffBooking/StaffMoveSheet';
import StaffRowActions from '../components/staffBooking/StaffRowActions';
import { BackLink, Banner, Body, Card, ErrorNotice, ScreenTitle, SectionLabel } from '../components/Primitives';
import { staffCancellable } from '../data/staffCancel';
import { staffMayBook } from '../data/staffBooking';
import {
  ATHLETE_NOT_ON_FILE,
  BACK_TO_ADMIN,
  BOOK_A_SESSION,
  CANCEL_IN_CALENDLY,
  FAMILY_BILLING,
  LATER_LABEL,
  NOTHING_BOOKED,
  STAFF_VIEW_LABEL,
  athleteSubline,
  groupLabel,
  rowWhen,
  testAthleteLine,
  tokenLine,
} from '../data/staffBookingCopy';
import { useStaffAthlete } from '../hooks/staffBooking';

/**
 * The athlete's bookings, staff view (spec 01-spec-admin-booking.md 10.2,
 * plan 04-plan-admin-booking.md Task E5): /portal/admin/athletes/:athleteId/bookings,
 * opened from the Admin screen's Manage bookings card, for the owner and ops.
 *
 * One athlete's standing and every booking from this period on: the token
 * line (or why they add Free only), Book a session (StaffAddSheet, opening
 * on its day and session picker) and Family billing, then the rows grouped
 * this period, next period and later (data/staffAthlete.js), each with its
 * badge and the Move (StaffMoveSheet) and Cancel (StaffCancelSheet) it
 * allows. A Calendly 1:1 points to Calendly; attended rows, 1:1s booked in
 * the portal and waitlist places have no actions.
 *
 * A test athlete (or one in a test household) gets a card saying why there
 * is no Book, and its rows offer Cancel only: the server refuses a test
 * athlete's move and allows the cancel (plan decision 6).
 *
 * Each sheet takes what it needs when it opens, so the page reloading behind
 * it (every call reloads the lists) never unmounts it mid-call. Its line
 * shows above the groups until another sheet opens.
 *
 * @param {string} athleteId
 * @param {'owner'|'ops'} role  The signed-in staff role (the tab bar; owner and ops act).
 * @param {() => void} onBack  Back to Admin.
 * @param {(householdId: string) => void} onOpenHousehold  The family's staff Billing.
 * @param {boolean} [bare]
 * @param {Date} [now]  The clock the sheets read (tests pin it).
 */
export default function StaffAthleteBookings({ athleteId, role, onBack, onOpenHousehold, bare = false, now }) {
  const { data: model, loading, error } = useStaffAthlete(athleteId);
  const [sheet, setSheet] = useState(null); // null | { kind: 'add' | 'move' | 'cancel', ... }
  const [line, setLine] = useState(null);
  const may = staffMayBook(role);
  // hooks/live.js ERR.NOT_FOUND
  const missing = error?.code === 'not-found';

  const open = (next) => {
    setLine(null);
    setSheet(next);
  };
  const close = () => setSheet(null);
  const done = (text) => {
    setSheet(null);
    setLine(text);
  };

  const test = model?.test === true;
  const name = model?.name ?? null;
  const onBook = may && model && !test ? () => open({ kind: 'add', athleteId: model.athleteId, name }) : null;
  const onMove = may && model && !test ? (row) => open({ kind: 'move', row, name }) : null;
  const onCancel = may && model
    ? (row) => open({ kind: 'cancel', row, member: { athleteId: model.athleteId, name }, members: cancelMembers(model) })
    : null;

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '8px 22px 14px' }}>
          <BackLink onClick={onBack}>{BACK_TO_ADMIN}</BackLink>
          <SectionLabel style={{ marginTop: 8, marginBottom: 4 }}>{STAFF_VIEW_LABEL}</SectionLabel>
          {model ? (
            <>
              <ScreenTitle size={22}>{model.name}</ScreenTitle>
              <Body size={12} tone={color.textTertiary} style={{ marginTop: 4 }}>
                {athleteSubline(model.householdName, model.packageName)}
              </Body>
            </>
          ) : null}
        </div>
      }
      footer={<BottomTabBar role={role} active="admin" />}
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {model ? (
          <>
            <div style={{ font: `600 14px ${font.body}`, color: color.text }}>{tokenLine(model)}</div>
            {onBook ? (
              <Button variant="primary" height={50} onClick={onBook}>
                {BOOK_A_SESSION}
              </Button>
            ) : null}
            {model.householdId ? (
              <Button variant="outline" height={44} onClick={() => onOpenHousehold(model.householdId)}>
                {FAMILY_BILLING}
              </Button>
            ) : null}
            {test ? (
              <Card>
                <Body size={13}>{testAthleteLine(model.first)}</Body>
              </Card>
            ) : null}
          </>
        ) : null}
        {/* Above the loading branch: it stays while the lists reload after a change. */}
        {line ? (
          <div role="status">
            <Banner tone="green">{line}</Banner>
          </div>
        ) : null}
        {loading ? (
          <SkeletonCard large height={180} />
        ) : missing ? (
          <Card>
            <Body size={13}>{ATHLETE_NOT_ON_FILE}</Body>
          </Card>
        ) : error ? (
          <ErrorNotice />
        ) : model ? (
          <BookingGroups model={model} onMove={onMove} onCancel={onCancel} />
        ) : null}
      </div>
      {sheet?.kind === 'add' ? (
        <StaffAddSheet athleteId={sheet.athleteId} name={sheet.name} onClose={close} onDone={done} now={now} />
      ) : null}
      {sheet?.kind === 'move' ? <StaffMoveSheet row={sheet.row} name={sheet.name} onClose={close} onDone={done} now={now} /> : null}
      {sheet?.kind === 'cancel' ? (
        <StaffCancelSheet row={sheet.row} member={sheet.member} members={sheet.members} onClose={close} onCancelled={done} now={now} />
      ) : null}
    </PhoneFrame>
  );
}

/** A booking row, never a waitlist place. */
const isBooking = (r) => r.kind === 'booking';

/**
 * StaffCancelSheet's household: the athlete alone, with the bookings of
 * this period and the next (its brothers and sisters are on Billing).
 */
function cancelMembers(model) {
  const { thisPeriod, nextPeriod } = model.groups;
  return [
    {
      athleteId: model.athleteId,
      name: model.name,
      spent: [...thisPeriod, ...nextPeriod].filter(isBooking),
      reserved: [],
      period: { start: model.period.start },
    },
  ];
}

/** This period, next period, and Later only when it has rows. */
function BookingGroups({ model, onMove, onCancel }) {
  const { groups } = model;
  const shared = { first: model.first, periodStart: model.period.start, onMove, onCancel };
  return (
    <>
      <Group which="this" label={groupLabel('this', model.period)} rows={groups.thisPeriod} {...shared} />
      <Group which="next" label={groupLabel('next', model.nextPeriod)} rows={groups.nextPeriod} {...shared} />
      {groups.later.length ? <Group which="later" label={LATER_LABEL} rows={groups.later} {...shared} /> : null}
    </>
  );
}

function Group({ which, label, rows, ...rowProps }) {
  return (
    <section data-staff-group={which} aria-label={label}>
      <Card large>
        <SectionLabel style={{ marginBottom: 4 }}>{label}</SectionLabel>
        {rows.length ? (
          rows.map((row, i) => <BookingRow key={row.id} row={row} last={i === rows.length - 1} {...rowProps} />)
        ) : (
          <Body size={12} tone={color.textTertiary} style={{ marginTop: 6 }}>
            {NOTHING_BOOKED}
          </Body>
        )}
      </Card>
    </section>
  );
}

/** The badge tones TokenMeter's rows use (components/TokenMeterRows.js). */
const BADGE_TONES = {
  Attended: 'green',
  'No-show': 'red',
  Waitlist: 'yellow',
  'Session token': 'green',
  'Bonus token': 'yellow',
  Free: 'neutral',
  Booked: 'neutral',
};

/**
 * A Calendly 1:1 the staff would otherwise cancel here (Booked or No-show,
 * this period on): it changes in Calendly, so the row says so instead.
 */
function inCalendly(row, periodStart) {
  return isBooking(row) && row.source === 'calendly' && staffCancellable({ ...row, source: null, type: null }, { periodStart });
}

/**
 * One row: "Tue Nov 17 · 4:00 PM", the session, the badge, then Move and
 * Cancel where data/staffBooking.js staffMovable and data/staffCancel.js
 * staffCancellable allow them. One athlete on the screen, so the labels name
 * only the athlete ("Move Jordan").
 */
function BookingRow({ row, last, first, periodStart, onMove, onCancel }) {
  return (
    <div
      data-staff-row={row.id}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 0',
        borderBottom: last ? 'none' : `1px solid ${color.ruleSoft}`,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: `500 12px ${font.body}`, color: color.text }}>{rowWhen(row.date, row.time)}</div>
        <div style={{ font: `400 11px ${font.body}`, color: color.textTertiary, marginTop: 2 }}>{row.label}</div>
        {inCalendly(row, periodStart) ? (
          <div style={{ font: `500 11px ${font.body}`, color: color.textSecondary, marginTop: 2 }}>{CANCEL_IN_CALENDLY}</div>
        ) : null}
      </div>
      <StatusBadge tone={BADGE_TONES[row.badge] || 'neutral'}>{row.badge}</StatusBadge>
      <StaffRowActions row={row} first={first} periodStart={periodStart} onMove={onMove} onCancel={onCancel} />
    </div>
  );
}
