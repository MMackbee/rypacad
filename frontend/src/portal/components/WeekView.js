import React from 'react';
import { color, font } from '../tokens';
import { longDayLabel } from '../data/calendar';
import { datePill } from '../data/season';
import { isTappableDay, weekDaysISO } from '../data/calendarViews';

/**
 * ContractCalendar's state palette (CALENDAR_CSS), so a day reads the same in
 * Month and Week. Unknown states fall back to the weekend look.
 *
 * Two deliberate differences (toggle review 2026-09-30). The week row has no
 * column headers - the weekday lives in the pill - so a day without sessions
 * ('weekend') is drawn in textTertiary (4.9:1 on the card, not #3a3a3a's
 * 1.5:1) with a visible outline, apart from the blank out-of-range cells.
 * And 'full' (slots, none open) is dashed and muted, not green, but tappable.
 */
const PALETTE = {
  logged: { background: color.primary, borderColor: 'transparent', color: '#000' },
  missed: { background: 'rgba(255,68,68,.1)', borderColor: 'rgba(255,68,68,.45)', color: color.error },
  open: { background: color.dimmed, borderColor: color.ruleFaint, color: color.textTertiary },
  future: { background: color.dimmed, borderColor: color.ruleFaint, color: color.textTertiary },
  weekend: { background: 'transparent', borderColor: color.rule, color: color.textTertiary },
  available: { background: 'rgba(0,175,81,.12)', borderColor: color.primary, color: color.text },
  full: { background: 'transparent', borderColor: color.primary, borderStyle: 'dashed', color: color.textSecondary },
};

/** The selected bookable day: a solid green fill (the old DatePill idiom), not just a ring on a green outline. */
const SELECTED = { background: color.primary, borderColor: color.primary, borderStyle: 'solid', color: '#000' };

const CELL_MIN_HEIGHT = 52;

/**
 * The shared week layout (owner request 2026-09-30): one Monday-Sunday row
 * of day pills - SpecialistBooking's weekday-over-date pill painted with the
 * month grid's state colours. It emits exactly what ContractCalendar emits
 * ({ iso, day, state }) under the same tappable rule, so a screen hands the
 * SAME onSelectDay to both views.
 *
 * @param {string} weekStart   Monday ISO of the row.
 * @param {object} dayStates   iso -> state; a missing day paints 'weekend'.
 * @param {'contract'|'booking'} [variant]
 * @param {string} [selected]  iso drawn with the selection ring.
 * @param {(day) => void} [onSelectDay]
 * @param {string} [visibleFrom] / [visibleTo]  Days outside render as blank
 *   placeholders (the month grid's showNonCurrentDates=false).
 */
export default function WeekView({
  weekStart,
  dayStates = {},
  variant = 'contract',
  selected,
  onSelectDay,
  visibleFrom,
  visibleTo,
}) {
  return (
    <div
      className="ryp-week-view"
      style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 5 }}
    >
      {weekDaysISO(weekStart).map((iso) => {
        if ((visibleFrom && iso < visibleFrom) || (visibleTo && iso > visibleTo)) {
          return <div key={iso} aria-hidden="true" style={{ minHeight: CELL_MIN_HEIGHT }} />;
        }
        // Same rule as ContractCalendar: no 'closed' state on the grid.
        const raw = dayStates[iso] ?? 'weekend';
        const state = raw === 'closed' ? 'open' : raw;
        const tappable = Boolean(onSelectDay) && isTappableDay(variant, state);
        const isSelected = Boolean(selected) && iso === selected;
        const base = PALETTE[state] || PALETTE.weekend;
        const paint = isSelected && tappable && variant === 'booking' ? { ...base, ...SELECTED } : base;
        const pill = datePill(iso);
        const style = {
          boxSizing: 'border-box',
          width: '100%',
          minWidth: 0,
          minHeight: CELL_MIN_HEIGHT,
          margin: 0,
          padding: '6px 0',
          borderRadius: 6,
          border: `1px ${paint.borderStyle || 'solid'} ${paint.borderColor}`,
          background: paint.background,
          color: paint.color,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          textAlign: 'center',
          cursor: tappable ? 'pointer' : 'default',
          boxShadow: isSelected ? `0 0 0 2px ${color.primary}` : 'none',
        };
        const content = (
          <>
            <span style={{ font: `500 10px ${font.body}`, textTransform: 'uppercase' }}>{pill.dow}</span>
            <span style={{ font: `700 17px ${font.head}` }}>{pill.date}</span>
          </>
        );
        if (tappable) {
          return (
            <button
              key={iso}
              type="button"
              data-date={iso}
              data-state={state}
              aria-label={state === 'full' ? `${longDayLabel(iso)}, full - waitlist only` : longDayLabel(iso)}
              aria-pressed={variant === 'booking' ? iso === selected : undefined}
              onClick={() => onSelectDay({ iso, day: Number(iso.slice(8)), state })}
              style={style}
            >
              {content}
            </button>
          );
        }
        return (
          <div key={iso} data-date={iso} data-state={state} style={style}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
