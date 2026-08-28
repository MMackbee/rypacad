import React from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import { color } from '../tokens';

/**
 * The Commitment Contract month grid, drawn by FullCalendar.
 *
 * FullCalendar owns everything calendrical — month shape, weekday offsets,
 * leap years, locale — replacing the hand-rolled Monday-first grid that
 * rendered a 28-cell February over whatever month it actually was. We supply
 * only the domain layer: a date→state map painted onto day cells, and the
 * handoff's visual language for each state.
 *
 * Read-only by design: tapping a logged or missed day opens a sheet rather
 * than editing inline, so a mis-tap while walking cannot silently change a
 * record. Weekend and closure cells are visually recessive so the eye reads
 * only contract days.
 *
 * When the academy's schedule moves into Google Calendar, this same component
 * takes @fullcalendar/google-calendar as an event source — the domain painting
 * stays, the feed changes.
 */
export default function ContractCalendar({ start, dayStates = {}, onSelectDay }) {
  const stateFor = (date) => {
    // FullCalendar hands back a local Date; format without UTC shifting.
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate()
    ).padStart(2, '0')}`;
    return { iso, state: dayStates[iso] ?? 'weekend' };
  };

  // Plain event delegation instead of the interaction plugin: every day cell
  // carries data-date, so one listener on the wrapper covers the whole grid
  // and works for any click or tap the platform produces.
  const handleClick = (e) => {
    const cell = e.target.closest('[data-date]');
    if (!cell || !onSelectDay) return;
    const iso = cell.getAttribute('data-date');
    const state = dayStates[iso];
    if (state === 'logged' || state === 'missed') {
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
        dayCellClassNames={(arg) => [`ryp-day-${stateFor(arg.date).state}`]}
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
.ryp-contract-cal .ryp-day-closed .fc-daygrid-day-frame {
  background: repeating-linear-gradient(45deg, #141414 0 3px, #1f1f1f 3px 6px);
  border-color: ${color.ruleFaint}; color: ${color.faintText};
}
.ryp-contract-cal .ryp-day-weekend .fc-daygrid-day-frame {
  background: transparent; border-color: #1c1c1c; color: #3a3a3a;
}
`;
