/**
 * Google Calendar — the academy schedule's source of truth.
 *
 * The academy keeps its season in a public Google Calendar ("RYP ACADEMY",
 * America/Chicago). FullCalendar's @fullcalendar/google-calendar plugin reads
 * it directly with a referer-restricted API key, so the app never fetches or
 * parses calendar data itself — the wheel stays bought.
 *
 * Configuration lives in the gitignored frontend/.env (see .env.example for
 * the variable names). The key is client-shippable by design: restricted to
 * the Calendar API and to this app's origins. `isGcalConfigured()` gates every
 * surface so an unconfigured checkout renders an honest "not connected" state
 * rather than a broken calendar.
 *
 * Boundary worth keeping sharp: the calendar carries WHEN and WHAT (blocks,
 * tournaments, camps, closures) for display. It does not carry capacity,
 * bookings, or allowances — bookable sessions remain Firestore's job, per the
 * data contract. And because the calendar is public, event titles never carry
 * athlete names or any personal information.
 */

export const GCAL = {
  apiKey: process.env.REACT_APP_GCAL_API_KEY || null,
  calendarId: process.env.REACT_APP_GCAL_CALENDAR_ID || null,
};

export function isGcalConfigured() {
  return Boolean(GCAL.apiKey && GCAL.calendarId);
}
