import React from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import googleCalendarPlugin from '@fullcalendar/google-calendar';
import { color } from '../tokens';
import BottomTabBar from '../components/BottomTabBar';
import PhoneFrame from '../components/PhoneFrame';
import { Banner, Body, ScreenTitle } from '../components/Primitives';
import { GCAL, isGcalConfigured } from '../data/gcal';

/**
 * Season calendar — the academy's Google Calendar, rendered live.
 *
 * This is the schedule's source of truth on screen: whatever the academy puts
 * in the "RYP ACADEMY" calendar (training blocks, tournaments, camps,
 * closures) appears here with no app deploy. FullCalendar's google-calendar
 * plugin does all fetching; we do theming and the not-configured state.
 *
 * Distinct from Book a Session on purpose: this shows the season as published;
 * booking shows bookable capacity, which lives in Firestore. Until the two are
 * joined (a session-publication step), an event here is information, not a
 * reservation.
 *
 * `?date=YYYY-MM-DD` deep-links a month — useful while the 26/27 season is
 * still being entered and the interesting content is elsewhere in time.
 */
export default function SeasonSchedule({ bare = false }) {
  const params = new URLSearchParams(window.location.search);
  const initialDate = params.get('date') || undefined;

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '8px 22px 14px' }}>
          <ScreenTitle size={22}>Season calendar</ScreenTitle>
          <Body size={11} tone={color.textTertiary} style={{ marginTop: 4 }}>
            Live from the academy calendar — updated the moment the academy updates it.
          </Body>
        </div>
      }
      footer={<BottomTabBar role="athlete" active="schedule" />}
    >
      <div style={{ padding: '0 14px 24px' }}>
        {isGcalConfigured() ? <LiveCalendar initialDate={initialDate} /> : <NotConfigured />}
      </div>
    </PhoneFrame>
  );
}

function LiveCalendar({ initialDate }) {
  return (
    <div className="ryp-season-cal">
      <style>{SEASON_CSS}</style>
      <FullCalendar
        plugins={[dayGridPlugin, googleCalendarPlugin]}
        initialView="dayGridMonth"
        initialDate={initialDate}
        googleCalendarApiKey={GCAL.apiKey}
        events={{ googleCalendarId: GCAL.calendarId }}
        headerToolbar={{ left: 'prev,next', center: 'title', right: 'today' }}
        firstDay={1}
        dayHeaderFormat={{ weekday: 'narrow' }}
        fixedWeekCount={false}
        height="auto"
        dayMaxEventRows={3}
        // Stay in the app: the plugin's default click opens Google Calendar.
        eventClick={(info) => info.jsEvent.preventDefault()}
      />
    </div>
  );
}

function NotConfigured() {
  return (
    <div style={{ padding: '8px 8px 0' }}>
      <Banner tone="yellow" title="Calendar not connected">
        This checkout has no Google Calendar credentials. Add REACT_APP_GCAL_API_KEY and
        REACT_APP_GCAL_CALENDAR_ID to frontend/.env (see .env.example) and restart the dev server.
      </Banner>
    </div>
  );
}

/** The portal's dark language over FullCalendar's month view, events visible. */
const SEASON_CSS = `
.ryp-season-cal .fc {
  --fc-border-color: ${color.frameRule};
  --fc-page-bg-color: transparent;
  --fc-neutral-bg-color: ${color.dimmed};
  --fc-today-bg-color: rgba(0,175,81,.08);
  font-family: 'Work Sans', sans-serif;
}
.ryp-season-cal .fc .fc-toolbar-title {
  font: 700 17px Raleway, sans-serif;
  color: ${color.text};
}
.ryp-season-cal .fc .fc-button {
  background: ${color.surface};
  border: 1px solid ${color.border};
  color: ${color.textSecondary};
  font: 500 12px 'Work Sans', sans-serif;
  padding: 6px 10px;
  min-height: 32px;
}
.ryp-season-cal .fc .fc-button:disabled { opacity: .4; }
.ryp-season-cal .fc-col-header-cell {
  font: 500 10px 'Work Sans', sans-serif;
  color: ${color.textTertiary};
  text-transform: uppercase;
  padding: 6px 0;
}
.ryp-season-cal .fc-daygrid-day-number {
  font: 500 10px 'Work Sans', sans-serif;
  color: ${color.textSecondary};
  text-decoration: none;
  padding: 3px 5px;
}
.ryp-season-cal .fc-day-other .fc-daygrid-day-number { color: ${color.faintText}; }
.ryp-season-cal .fc-event {
  background: rgba(0,175,81,.16);
  border: 1px solid rgba(0,175,81,.45);
  border-radius: 4px;
  font: 500 9px 'Work Sans', sans-serif;
  color: #9ad9b6;
  padding: 0 3px;
  cursor: default;
}
.ryp-season-cal .fc-daygrid-more-link {
  font: 500 9px 'Work Sans', sans-serif;
  color: ${color.primary};
}
.ryp-season-cal .fc-popover {
  background: ${color.surface};
  border: 1px solid ${color.border};
}
.ryp-season-cal .fc-popover-header {
  background: ${color.dimmed};
  color: ${color.textSecondary};
  font: 600 11px 'Work Sans', sans-serif;
}
`;
