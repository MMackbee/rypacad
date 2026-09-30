import React, { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { color, font, radius } from '../tokens';
import StatusBadge from './StatusBadge';
import { GraceLine } from './AllowancePools';
import { Body, Card, SectionLabel } from './Primitives';
import { longDayLabel } from '../data/calendar';

/**
 * One athlete's tokens on the Billing hub (contract v2.4, Sprint 16): the
 * number that matters, big; the bar behind it; and, on demand, the
 * evidence — every session that spent a token this period, every waitlist
 * spot holding one, the bonus tokens on file, when the period resets and
 * what the next one grants. Every value comes from `hubMemberFor`
 * (data/billingHub.js), which runs the same `tokensFor` the booking gate
 * runs; this component never counts anything itself.
 */

function toneFor(left) {
  if (left === 0) return color.error;
  if (left === 1) return color.secondary;
  return color.primary;
}

function shortDay(iso) {
  return iso ? format(parseISO(iso), 'EEE, MMM d') : '';
}

function priceLine(pkg) {
  if (!pkg || pkg.price == null) return null;
  // The single token is a one-time purchase, never a per-period price.
  if (pkg.kind === 'single') return `$${pkg.price} per session token${pkg.pending ? ' · pending' : ''}`;
  return `$${pkg.price} / period${pkg.pending ? ' · pending' : ''}`;
}

const STATUS_BADGE = {
  attended: { tone: 'green', label: 'Attended' },
  confirmed: { tone: 'neutral', label: 'Booked' },
  noshow: { tone: 'red', label: 'No-show' },
  waitlisted: { tone: 'yellow', label: 'Waitlist' },
};

function Row({ row, last }) {
  const badge = row.viaGrace ? { tone: 'yellow', label: 'Bonus token' } : STATUS_BADGE[row.status] || STATUS_BADGE.confirmed;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 0',
        borderBottom: last ? 'none' : `1px solid ${color.ruleSoft}`,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: `500 12px ${font.body}`, color: color.text }}>
          {shortDay(row.date)}
          {row.time ? ` · ${row.time}` : ''}
        </div>
        <div style={{ font: `400 11px ${font.body}`, color: color.textTertiary, marginTop: 2 }}>{row.label}</div>
      </div>
      <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
    </div>
  );
}

function Chip({ tone, children }) {
  return (
    <span
      style={{
        font: `500 10px ${font.body}`,
        letterSpacing: '.04em',
        textTransform: 'uppercase',
        color: tone,
        border: `1px solid ${color.ruleFaint}`,
        borderRadius: radius.badge,
        padding: '3px 8px',
      }}
    >
      {children}
    </span>
  );
}

function Evidence({ member }) {
  const { spent, reserved, nextPeriod, lastPeriod, tokens } = member;
  const rows = [...spent, ...reserved];
  return (
    <div style={{ marginTop: 12, borderTop: `1px solid ${color.ruleSoft}`, paddingTop: 6 }}>
      {rows.length ? (
        rows.map((row, i) => <Row key={row.id} row={row} last={i === rows.length - 1} />)
      ) : (
        <Body size={11} tone={color.textTertiary} style={{ padding: '8px 0' }}>
          Nothing booked in this period yet.
        </Body>
      )}
      <Body size={11} tone={color.textTertiary} style={{ marginTop: 10 }}>
        Next period from {longDayLabel(nextPeriod.start)}:{' '}
        {tokens.unlimited ? 'unlimited' : `${nextPeriod.granted} token${nextPeriod.granted === 1 ? '' : 's'}`}
        {nextPeriod.booked ? ` · ${nextPeriod.booked} already booked` : ''}
        {nextPeriod.reserved ? ` · ${nextPeriod.reserved} on a waitlist` : ''}
      </Body>
      {lastPeriod && !tokens.unlimited ? (
        <Body size={11} tone={color.textTertiary} style={{ marginTop: 4 }}>
          Last period ({shortDay(lastPeriod.start)} – {shortDay(lastPeriod.end)}): used {lastPeriod.used} of {lastPeriod.granted}
        </Body>
      ) : null}
    </div>
  );
}

function Toggle({ open, onToggle, count }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      style={{
        background: 'none',
        border: 'none',
        padding: '10px 0 2px',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        font: `500 12px ${font.body}`,
        color: color.primary,
        cursor: 'pointer',
      }}
    >
      <span>This period{count ? ` · ${count} ${count === 1 ? 'session' : 'sessions'}` : ''}</span>
      <span aria-hidden="true" style={{ color: color.textTertiary }}>
        {open ? '▴' : '▾'}
      </span>
    </button>
  );
}

export default function TokenMeter({ member, defaultOpen = false, showPrices = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const { package: pkg, tokens, period, expiryNudge, spent, reserved } = member;
  // v2.0.1 (Sprint 18): catalogue prices are withheld from parents and
  // athletes; the staff view passes showPrices.
  const price = showPrices ? priceLine(pkg) : null;
  const count = spent.length + reserved.length;

  if (!pkg) {
    return (
      <Card large>
        <SectionLabel style={{ marginBottom: 6 }}>Tokens</SectionLabel>
        <Body size={12}>No package on file — ask the academy to assign one before booking.</Body>
      </Card>
    );
  }

  if (tokens.unlimited) {
    return (
      <Card large tone="green">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <SectionLabel style={{ flex: 1 }}>Tokens</SectionLabel>
          <span style={{ font: `400 11px ${font.body}`, color: color.textTertiary }}>{price}</span>
        </div>
        <div style={{ font: `700 28px ${font.head}`, color: color.primary, marginTop: 8 }}>Unlimited</div>
        <Body size={12} tone={color.textSecondary} style={{ marginTop: 4 }}>
          {pkg.name}
          {pkg.access247 ? ' · 24/7 access' : ''}
          {pkg.windowDays ? ` · books ${pkg.windowDays} days out` : ''}
        </Body>
        {member.attendance && member.attendance.booked ? (
          <Body size={12} tone={color.textSecondary} style={{ marginTop: 6 }}>
            {`${member.attendance.attended} attended`}
            {` · ${member.attendance.booked} booked this period`}
            {member.attendance.noShows ? ` · ${member.attendance.noShows} no-show${member.attendance.noShows === 1 ? '' : 's'}` : ''}
          </Body>
        ) : null}
        <Toggle open={open} onToggle={() => setOpen((v) => !v)} count={count} />
        {open ? <Evidence member={member} /> : null}
      </Card>
    );
  }

  const tone = toneFor(tokens.left);
  const granted = tokens.granted || 0;
  const usedPct = granted ? Math.min(100, (tokens.used / granted) * 100) : 0;
  const reservedPct = granted ? Math.min(100 - usedPct, (tokens.reserved / granted) * 100) : 0;
  const bonus = tokens.grace.length;

  return (
    <Card large>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <SectionLabel style={{ flex: 1 }}>Tokens</SectionLabel>
        <span style={{ font: `400 11px ${font.body}`, color: color.textTertiary }}>
          {pkg.name}
          {price ? ` · ${price}` : ''}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 8 }}>
        <span style={{ font: `700 44px/1 ${font.head}`, color: tone }}>{tokens.left}</span>
        <span style={{ font: `500 13px ${font.body}`, color: color.textSecondary }}>
          of {granted} left
        </span>
      </div>

      <div style={{ height: 8, background: color.track, borderRadius: 4, overflow: 'hidden', display: 'flex', marginTop: 10 }}>
        <div style={{ width: `${usedPct}%`, background: tone }} />
        <div style={{ width: `${reservedPct}%`, background: color.secondary, opacity: 0.7 }} />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
        <Chip tone={color.textSecondary}>Used {tokens.used}</Chip>
        {tokens.reserved ? <Chip tone={color.secondary}>Waitlist {tokens.reserved}</Chip> : null}
        {bonus ? <Chip tone={color.secondary}>Bonus {bonus}</Chip> : null}
      </div>
      <GraceLine tokens={tokens} />

      <Body size={11} tone={color.textTertiary} style={{ marginTop: 8 }}>
        Resets {longDayLabel(period.resetsOn)} · {period.daysLeft} {period.daysLeft === 1 ? 'day' : 'days'} left in this period
      </Body>
      {expiryNudge ? (
        <Body size={12} tone={color.secondary} style={{ marginTop: 6 }}>
          {expiryNudge.left} {expiryNudge.left === 1 ? 'token expires' : 'tokens expire'} {longDayLabel(expiryNudge.on)} — book before then.
        </Body>
      ) : null}

      <Toggle open={open} onToggle={() => setOpen((v) => !v)} count={count} />
      {open ? <Evidence member={member} /> : null}
    </Card>
  );
}
