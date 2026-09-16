import React from 'react';
import { color, font } from '../tokens';
import { Body, Card, SectionLabel } from './Primitives';
import { useRecentNotices } from '../hooks';

/**
 * The in-app inbox on Settings (contract v2.2, Sprint 14): the household's
 * newest notices, read straight off the notification ledger. Read-only by
 * design — a notice is a record of something the academy already sent by
 * email or text, not a message to act on here — so a row is a title, the
 * body as sent, and how long ago. Titles and bodies are stored as sent;
 * nothing is re-rendered from the underlying booking or session.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now" / "12 min ago" / "3 hr ago" / "2 days ago" / a short date. */
export function agoLabel(iso, now = new Date()) {
  const then = iso ? new Date(iso) : null;
  if (!then || Number.isNaN(then.getTime())) return '';
  const diff = now.getTime() - then.getTime();
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} hr ago`;
  if (diff < 7 * DAY) {
    const days = Math.floor(diff / DAY);
    return days === 1 ? 'yesterday' : `${days} days ago`;
  }
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function NoticeRow({ notice, last }) {
  return (
    <div
      style={{
        padding: '11px 0',
        borderBottom: last ? 'none' : `1px solid ${color.border}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0, font: `600 13px ${font.body}`, color: color.text }}>{notice.title}</div>
        <div style={{ flex: 'none', font: `400 11px ${font.body}`, color: color.textTertiary }}>
          {agoLabel(notice.createdAt)}
        </div>
      </div>
      {notice.body ? (
        <Body size={11} tone={color.textSecondary} style={{ marginTop: 3 }}>
          {notice.body}
        </Body>
      ) : null}
    </div>
  );
}

export default function RecentNotices({ style }) {
  const { data, loading, error } = useRecentNotices();
  const rows = data ?? [];

  let content;
  if (error) {
    content = (
      <Body size={12} tone={color.error}>
        Your notices didn't load. Check your connection and try again.
      </Body>
    );
  } else if (loading) {
    content = <Body size={12}>Loading…</Body>;
  } else if (rows.length === 0) {
    content = (
      <Body size={12} tone={color.textTertiary}>
        Nothing sent yet. Booking confirmations, reminders and membership notices will show here.
      </Body>
    );
  } else {
    content = (
      <Card>
        {rows.map((notice, i) => (
          <NoticeRow key={notice.id} notice={notice} last={i === rows.length - 1} />
        ))}
      </Card>
    );
  }

  return (
    <div style={style}>
      <SectionLabel style={{ marginBottom: 10 }}>Recent notices</SectionLabel>
      {content}
    </div>
  );
}
