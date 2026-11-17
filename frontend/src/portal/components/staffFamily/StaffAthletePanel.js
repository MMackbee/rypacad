import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { color, font, radius } from '../../tokens';
import { StaffMembershipEditor } from '../AthleteMembershipCard';
import HandicapCard from '../HandicapCard';
import ConsentDetailCard from '../consent/ConsentDetailCard';
import StaffLaterBookings from './StaffLaterBookings';
import { Body, Card } from '../Primitives';
import { useAthleteDetail } from '../../hooks';
import { loginStatusLine } from '../../data/billingCopy';
import { ATHLETE_LOAD_FAILED, ATHLETE_LOADING, COACHING_VIEW, OPEN_COMBINE, OPEN_RESULTS, manageLabel } from '../../data/staffFamily';

/**
 * One athlete's staff section on the family page (owner 2026-11-16: one page,
 * every action on it). Under the athlete's token meter and Book a session:
 * a "Manage {first name}" toggle, and inside it everything that used to live
 * on the athlete page or the athlete-bookings screen - package and facility
 * access, Issue tokens, handicap, Yannick's consent, the child-login line,
 * bookings further out than next period (Move, Cancel), and the links to the
 * athlete's assessment results, combine and coaching view.
 *
 * Closed by default so a family of four is not four screens long; it starts
 * open, and scrolls into view, when the page was opened on this athlete
 * (`focus`: a search result, an Outstanding or consent row). The athlete's
 * record is read only once the section opens.
 *
 * @param {object} member  The hub's member row ({ athleteId, name, ... }).
 * @param {'owner'|'ops'} role
 * @param {boolean} [focus]  The page was opened on this athlete.
 * @param {(row: object) => void} [onMoveRow]  The page's Move sheet.
 * @param {(row: object) => void} [onCancelRow]  The page's Cancel sheet.
 */
export default function StaffAthletePanel({ member, role, focus = false, onMoveRow = null, onCancelRow = null }) {
  const [open, setOpen] = useState(focus);
  const ref = useRef(null);
  useEffect(() => {
    if (focus && ref.current && typeof ref.current.scrollIntoView === 'function') {
      ref.current.scrollIntoView({ block: 'start' });
    }
  }, [focus]);
  const label = manageLabel(member.name);
  return (
    <div ref={ref} data-staff-manage={member.athleteId}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          minHeight: 44,
          padding: '0 14px',
          boxSizing: 'border-box',
          background: color.surface,
          border: `1px solid ${color.border}`,
          borderRadius: radius.input,
          font: `600 13px ${font.body}`,
          color: color.text,
          cursor: 'pointer',
        }}
      >
        <span>{label}</span>
        <span aria-hidden="true" style={{ color: color.textTertiary }}>
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open ? <PanelBody member={member} role={role} onMoveRow={onMoveRow} onCancelRow={onCancelRow} /> : null}
    </div>
  );
}

function PanelBody({ member, role, onMoveRow, onCancelRow }) {
  const athleteId = member.athleteId;
  const navigate = useNavigate();
  const { data, loading, error } = useAthleteDetail({ athleteId });
  // The record reloads through "no athlete" after every save here (the
  // package, the handicap and Issue tokens all bump it): the last one loaded
  // stays up meanwhile, so an editor never unmounts on its own save and
  // loses its "saved" note (HandicapCard does the same for itself).
  const last = useRef(null);
  if (data?.athlete) last.current = data.athlete;
  const athlete = data?.athlete ?? last.current;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
      {!athlete && error ? (
        <Body size={12} tone={color.error}>
          {ATHLETE_LOAD_FAILED}
        </Body>
      ) : !athlete && loading ? (
        <Body size={12} tone={color.textTertiary}>
          {ATHLETE_LOADING}
        </Body>
      ) : null}
      {athlete ? <StaffMembershipEditor athleteId={athleteId} athlete={athlete} /> : null}
      <HandicapCard athleteId={athleteId} athlete={athlete} role={role} />
      <ConsentDetailCard athleteId={athleteId} role={role} />
      {/* The child-login state, when the record carries one (legacy athletes have neither field). */}
      {athlete && 'loginEmail' in athlete ? (
        <Card>
          <Body size={12}>{loginStatusLine(athlete)}</Body>
        </Card>
      ) : null}
      {/* With no package the meter above lists nothing: every booking is listed here instead. */}
      <StaffLaterBookings athleteId={athleteId} all={!member.package} onMove={onMoveRow} onCancel={onCancelRow} />
      <Card>
        <LinkRow label={OPEN_RESULTS} onClick={() => navigate(`/portal/assessments/athlete/${athleteId}`, { state: { name: member.name ?? null } })} />
        <LinkRow label={OPEN_COMBINE} onClick={() => navigate(`/portal/combine/${athleteId}`)} />
        <LinkRow label={COACHING_VIEW} onClick={() => navigate(`/portal/athlete/${athleteId}`)} last />
      </Card>
    </div>
  );
}

/** A green row that leaves the page: read-only views of this athlete. */
function LinkRow({ label, onClick, last = false }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        borderBottom: last ? 'none' : `1px solid ${color.ruleSoft}`,
        padding: '0 2px',
        width: '100%',
        minHeight: 44,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        font: `500 13px ${font.body}`,
        color: color.primary,
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <span>{label}</span>
      <span aria-hidden="true" style={{ color: color.textTertiary }}>
        ›
      </span>
    </button>
  );
}
