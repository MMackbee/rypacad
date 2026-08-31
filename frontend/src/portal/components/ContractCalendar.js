import React from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import { color } from '../tokens';

/**
 * The month grid, drawn by FullCalendar. Shared by the Commitment Contract
 * calendar (screen 07) and the Book a Session month calendar (screen 05,
 * Sprint 5 redesign) — one grid component, two domain vocabularies painted
 * onto it, per TEAM.md's instruction to extend rather than fork a second grid.
 *
 * FullCalendar owns everything calendrical — month shape, weekday offsets,
 * leap years, locale — replacing the hand-rolled Monday-first grid that
 * rendered a 28-cell February over whatever month it actually was. We supply
 * only the domain layer: a date→state map painted onto day cells, and the
 * handoff's visual language for each state.
 *
 * Read-only by design: tapping a logged/missed contract day or an available
 * booking day opens a sheet rather than editing inline, so a mis-tap while
 * walking or scrolling cannot silently change a record. Weekend cells are
 * visually recessive so the eye reads only the days that matter.
 *
 * When the academy's schedule moves into Google Calendar, this same component
 * takes @fullcalendar/google-calendar as an event source — the domain painting
 * stays, the feed changes.
 *
 * @param {string} start        First-of-month ISO date FullCalendar opens on.
 * @param {object} dayStates    iso -> state. Contract: logged/missed/open/
 *   weekend/future. Booking: available/open.
 * @param {(day) => void} [onSelectDay]  Fires for a tappable day.
 * @param {'contract'|'booking'} [variant]
 *   'contract' (default): only logged/missed days are tappable, matching the
 *   Commitment Contract's read-only-past-days rule. 'booking': any
 *   `available` day is tappable — every bookable day opens its session list.
 * @param {string} [selected]  Booking variant: the iso currently open below
 *   the grid, drawn with an extra ring so the tap target stays visible once
 *   its day sheet is showing.
 */
export default function ContractCalendar({ start, dayStates = {}, onSelectDay, variant = 'contract', selected }) {
  const stateFor = (date) => {
    // FullCalendar hands back a local Date; format without UTC shifting.
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate()
    ).padStart(2, '0')}`;
    // Sprint 5 pin: the contract calendar has no 'closed' state any more —
    // logging is legal on any date. A day tagged 'closed' upstream (a
    // closure still matters to booking) paints as an ordinary open day here.
    const raw = dayStates[iso] ?? 'weekend';
    return { iso, state: raw === 'closed' ? 'open' : raw };
  };

  const tappable = (state) =>
    variant === 'booking' ? state === 'available' : state === 'logged' || state === 'missed';

  // Plain event delegation instead of the interaction plugin: every day cell
  // carries data-date, so one listener on the wrapper covers the whole grid
  // and works for any click or tap the platform produces.
  const handleClick = (e) => {
    const cell = e.target.closest('[data-date]');
    if (!cell || !onSelectDay) return;
    const iso = cell.getAttribute('data-date');
    const { state } = stateFor(new Date(`${iso}T00:00:00`));
    if (tappable(state)) {
      onSelectDay({ iso, day: Number(iso.slice(8)), state });
    }
  };

  return (
    <div className="ryp-contract-cal" onClick={handleClick}>
      <style>{CALENDAR_CSS}</style>
      <FullCalendar
        plugins={[dayGridPlugin]}
        initialView="dayGridMonth"
        initialDate={start}
        headerToolbar={false}
        // Monday-first, single-letter headers, no filler rows — the handoff's grid.
        firstDay={1}
        dayHeaderFormat={{ weekday: 'narrow' }}
        fixedWeekCount={false}
        showNonCurrentDates={false}
        height="auto"
        dayCellClassNames={(arg) => {
          const { iso, state } = stateFor(arg.date);
          const classes = [`ryp-day-${state}`];
          if (tappable(state)) classes.push('ryp-day-tappable');
          if (selected && iso === selected) classes.push('ryp-day-selected');
          return classes;
        }}
      />
    </div>
  );
}

/**
 * The handoff's cell language over FullCalendar's structure. Colors match
 * DayGridCell so the legend chips stay truthful.
 */
const CALENDAR_CSS = `
.ryp-contract-cal .fc {
  --fc-border-color: transparent;
  --fc-page-bg-color: transparent;
  font-family: 'Work Sans', sans-serif;
}
.ryp-contract-cal .fc-theme-standard td,
.ryp-contract-cal .fc-theme-standard th,
.ryp-contract-cal .fc-scrollgrid { border: none; }
.ryp-contract-cal .fc-col-header-cell {
  font: 500 10px 'Work Sans', sans-serif;
  color: ${color.textTertiary};
  padding-bottom: 5px;
  text-transform: uppercase;
}
.ryp-contract-cal .fc-col-header-cell:nth-child(6),
.ryp-contract-cal .fc-col-header-cell:nth-child(7) { color: #4a4a4a; }
.ryp-contract-cal .fc-daygrid-day-frame {
  margin: 2.5px;
  border-radius: 6px;
  min-height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
}
.ryp-contract-cal .fc-daygrid-day-top {
  flex-direction: row;
  justify-content: center;
}
.ryp-contract-cal .fc-daygrid-day-number {
  font: 500 10px 'Work Sans', sans-serif;
  padding: 0;
  color: inherit;
  text-decoration: none;
}
.ryp-contract-cal .fc-daygrid-day-events, .ryp-contract-cal .fc-daygrid-day-bg { display: none; }
.ryp-contract-cal .fc-day-today { background: transparent !important; }

.ryp-contract-cal .ryp-day-logged .fc-daygrid-day-frame {
  background: ${color.primary}; color: #000; cursor: pointer;
}
.ryp-contract-cal .ryp-day-logged .fc-daygrid-day-number { font-weight: 600; }
.ryp-contract-cal .ryp-day-missed .fc-daygrid-day-frame {
  background: rgba(255,68,68,.1); border-color: rgba(255,68,68,.45);
  color: ${color.error}; cursor: pointer;
}
.ryp-contract-cal .ryp-day-open .fc-daygrid-day-frame,
.ryp-contract-cal .ryp-day-future .fc-daygrid-day-frame {
  background: ${color.dimmed}; border-color: ${color.ruleFaint}; color: ${color.textTertiary};
}
.ryp-contract-cal .ryp-day-weekend .fc-daygrid-day-frame {
  background: transparent; border-color: #1c1c1c; color: #3a3a3a;
}
/* Book a Session month calendar (Sprint 5): days with bookable sessions. */
.ryp-contract-cal .ryp-day-available .fc-daygrid-day-frame {
  background: rgba(0,175,81,.12); border-color: ${color.primary}; color: ${color.text};
}
.ryp-contract-cal .ryp-day-available .fc-daygrid-day-number { font-weight: 600; }
.ryp-contract-cal .ryp-day-tappable .fc-daygrid-day-frame { cursor: pointer; }
.ryp-contract-cal .ryp-day-selected .fc-daygrid-day-frame {
  box-shadow: 0 0 0 2px ${color.primary};
}
`;
