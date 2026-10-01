import React from 'react';
import { color, font, radius, tint } from '../tokens';
import Button from './Button';
import { Body, ScreenTitle, SectionLabel } from './Primitives';

/**
 * The three ways to book (owner feedback, 2026-09-16): a golf block, a
 * performance session with Phil, a mental game session with Yannick. The
 * same chooser sits on both home screens, and a parent tapping a kid's
 * "Book a session" gets it as a sheet - the kid is chosen first, the session
 * type second. Every option spends one token (contract v2.0); the blurb
 * says what the option is, never what it costs.
 *
 * "1-on-1 coaching" is retired as an entry point: Phil's sessions are small
 * groups, and a parent should not have to know who runs what to book.
 */
export const BOOK_OPTIONS = [
  {
    id: 'golf',
    title: 'Golf session',
    blurb: 'Training blocks and Tour events',
    path: '/portal/book',
    specialistId: null,
  },
  {
    id: 'phil',
    title: 'Performance session',
    blurb: 'Strength, speed and athleticism with Phil — small group',
    path: '/portal/coaching',
    specialistId: 'phil',
  },
  {
    id: 'mental',
    title: 'Mental game session',
    blurb: 'One-on-one with Yannick',
    path: '/portal/coaching',
    specialistId: 'mental',
  },
];

/**
 * Where an option goes, as `[path, navigateOptions]`. The routes read
 * `athleteId` (book-for-kid) and `specialistId` (skip the coaching picker)
 * off navigation state; nothing rides the URL.
 */
export function bookNavigation(option, athleteId) {
  const state = {};
  if (athleteId) state.athleteId = athleteId;
  if (option.specialistId) state.specialistId = option.specialistId;
  return [option.path, Object.keys(state).length ? { state } : undefined];
}

function OptionButton({ option, onPick }) {
  return (
    <button
      type="button"
      onClick={() => onPick(option)}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 16px',
        textAlign: 'left',
        background: color.surface,
        border: `1px solid ${color.border}`,
        borderRadius: radius.card,
        cursor: 'pointer',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: `600 14px ${font.body}`, color: color.text }}>{option.title}</div>
        <div style={{ font: `400 11px ${font.body}`, color: color.textTertiary, marginTop: 3 }}>{option.blurb}</div>
      </div>
      <span aria-hidden="true" style={{ font: `400 18px ${font.body}`, color: color.textTertiary, flex: 'none' }}>
        ›
      </span>
    </button>
  );
}

/** Inline chooser: a section label and the three options in a column. */
export default function BookChooser({ title = 'Book a session', onPick, style }) {
  return (
    <div style={style}>
      <SectionLabel style={{ marginBottom: 10 }}>{title}</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {BOOK_OPTIONS.map((option) => (
          <OptionButton key={option.id} option={option} onPick={onPick} />
        ))}
      </div>
    </div>
  );
}

/**
 * The same three options as a bottom sheet, opened from a kid's own "Book a
 * session" on the parent home. Same overlay idiom as CancelSheet: tapping
 * the scrim closes it.
 */
export function BookChooserSheet({ open, athleteName, unlimited = false, onPick, onClose }) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{ position: 'absolute', inset: 0, background: tint.overlay, display: 'flex', alignItems: 'flex-end' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          background: color.surface,
          borderTop: `1px solid ${color.border}`,
          borderRadius: `${radius.cardLarge} ${radius.cardLarge} 0 0`,
          padding: '20px 22px 26px',
        }}
      >
        <ScreenTitle size={19}>{athleteName ? `Book for ${athleteName}` : 'Book a session'}</ScreenTitle>
        {/* Elite holds no tokens (tester Mike 2026-09-30): no token line for that athlete. */}
        {unlimited ? null : (
          <Body size={12} style={{ marginTop: 6 }}>
            Every session spends one token from this athlete's period.
          </Body>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
          {BOOK_OPTIONS.map((option) => (
            <OptionButton key={option.id} option={option} onPick={onPick} />
          ))}
          <Button variant="outline" height={46} style={{ boxShadow: 'none', marginTop: 4 }} onClick={onClose}>
            Not now
          </Button>
        </div>
      </div>
    </div>
  );
}
