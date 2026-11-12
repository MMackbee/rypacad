import React from 'react';
import { color, font, radius } from '../tokens';
import { CANCEL_CATEGORIES, CANCEL_NOTE_MAX, CANCEL_NOTE_PLACEHOLDER, cancelQuestion } from '../data/bookingChanges';

/**
 * Why the family cannot make it (spec 2026-11-11 §4): "Why can't Jordan make
 * it?" over the five reasons as chips (the tour/TourFilters.js ChipRow look),
 * and with Other a short note (the FeedbackSheet.js box). It only reports
 * what was picked - `{ category, note }` - and MemberCancelSheet decides when
 * that is a usable reason (data/bookingChanges.js cancelReasonOf).
 *
 * @param {?string} name  The athlete's name; none (an athlete's own login)
 *   asks "you".
 * @param {{ category: ?string, note: string }} value
 * @param {(value: { category: string, note: string }) => void} onChange
 * @param {boolean} [disabled]  While the cancel runs.
 * @param {string} [question]  Asked instead of cancelQuestion(name): the
 *   staff cancel (StaffCancelSheet.js) asks "Why couldn't Jordan make it?"
 *   about a session that has started or passed. Families never pass it.
 */
export default function CancelReasonPicker({ name, value, onChange, disabled = false, question }) {
  const category = value?.category ?? null;
  const note = value?.note ?? '';
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ font: `600 13px ${font.body}`, color: color.text, marginBottom: 8 }}>{question || cancelQuestion(name)}</div>
      <div role="group" aria-label="Reason" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {CANCEL_CATEGORIES.map((c) => {
          const on = c.id === category;
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              disabled={disabled}
              onClick={() => onChange({ category: c.id, note })}
              style={{
                height: 44,
                padding: '0 14px',
                borderRadius: radius.pill,
                border: `1px solid ${on ? color.primary : color.border}`,
                background: on ? color.primary : 'transparent',
                color: on ? '#000' : color.textSecondary,
                font: `600 13px ${font.body}`,
                cursor: disabled ? 'default' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {c.label}
            </button>
          );
        })}
      </div>
      {category === 'other' ? (
        <textarea
          aria-label={CANCEL_NOTE_PLACEHOLDER}
          placeholder={CANCEL_NOTE_PLACEHOLDER}
          maxLength={CANCEL_NOTE_MAX}
          rows={2}
          value={note}
          disabled={disabled}
          onChange={(e) => onChange({ category, note: e.target.value })}
          style={{
            width: '100%',
            marginTop: 10,
            background: color.track,
            border: `1px solid ${color.rule}`,
            borderRadius: radius.input,
            padding: 11,
            font: `400 16px ${font.body}`, // 16px: no iOS zoom on focus
            color: color.text,
            resize: 'none',
            boxSizing: 'border-box',
          }}
        />
      ) : null}
    </div>
  );
}
