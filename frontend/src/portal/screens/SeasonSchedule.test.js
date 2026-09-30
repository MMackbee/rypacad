import React, { act } from 'react';
import { renderScreen } from './testRender';
import SeasonSchedule from './SeasonSchedule';

/**
 * Month/Week toggle on the Season calendar (owner request 2026-09-30).
 * Month stays the default; the toggle switches FullCalendar between
 * dayGridMonth and dayGridWeek through its API. No test here touches the
 * network: the Google Calendar config is mocked, FullCalendar is a stub by
 * default, and the real-FullCalendar block swaps the google-calendar plugin
 * for a local event source.
 */

const KEY = 'ryp.calendarView';

let mockConfigured;
let mockReal;
let mockChangeView;
let mockLastProps;
let mockFetches;

jest.mock('../data/gcal', () => ({
  GCAL: { apiKey: 'k', calendarId: 'c' },
  isGcalConfigured: () => mockConfigured,
}));

jest.mock('@fullcalendar/react', () => {
  const React = require('react');
  const Real = jest.requireActual('@fullcalendar/react').default;
  // Like the real component, initialView is read once at mount; after that
  // only changeView moves the view.
  const Stub = React.forwardRef(function MockFullCalendar(props, ref) {
    const type = React.useRef(props.initialView);
    React.useImperativeHandle(ref, () => ({
      getApi: () => ({
        view: { type: type.current },
        changeView: (next) => {
          mockChangeView(next);
          type.current = next;
        },
      }),
    }));
    mockLastProps = props;
    return React.createElement('div', { 'data-initial-view': props.initialView });
  });
  return {
    __esModule: true,
    default: React.forwardRef(function MaybeRealFullCalendar(props, ref) {
      return React.createElement(mockReal ? Real : Stub, { ...props, ref });
    }),
  };
});

// A local stand-in for the Google feed: parses the same { googleCalendarId }
// source and records every range FullCalendar asks it for.
jest.mock('@fullcalendar/google-calendar', () => {
  const { createPlugin } = require('@fullcalendar/core');
  return {
    __esModule: true,
    default: createPlugin({
      name: 'mock-google-calendar',
      // The real plugin's option and source refiners, so the props parse the same.
      optionRefiners: { googleCalendarApiKey: String },
      eventSourceRefiners: { googleCalendarId: String },
      eventSourceDefs: [
        {
          parseMeta: (raw) => (raw && raw.googleCalendarId ? { googleCalendarId: raw.googleCalendarId } : null),
          fetch: (arg, onSuccess) => {
            mockFetches.push(arg.range.start.toISOString().slice(0, 10));
            onSuccess({ rawEvents: [{ title: 'Fall camp', start: '2026-10-14' }] });
          },
        },
      ],
    }),
  };
});

const initialView = (r) => r.container.querySelector('[data-initial-view]')?.getAttribute('data-initial-view') ?? null;
const pressed = (r, name) => r.button(name)?.getAttribute('aria-pressed');
const tap = async (el) => { await act(async () => { el.click(); }); };

beforeEach(() => {
  try { window.localStorage.clear(); } catch (e) { /* storage unavailable */ }
  mockConfigured = true;
  mockReal = false;
  mockChangeView = jest.fn();
  mockLastProps = null;
  mockFetches = [];
});

test('not configured: the honest banner and no toggle', async () => {
  mockConfigured = false;
  const r = await renderScreen(<SeasonSchedule bare />);
  expect(r.text()).toContain('Calendar not connected');
  expect(r.button('Week')).toBeNull();
  expect(r.button('Month')).toBeNull();
  await r.unmount();
});

test('configured: Month is the default; Week switches FullCalendar through its API and is stored', async () => {
  const r = await renderScreen(<SeasonSchedule bare />);
  expect(pressed(r, 'Month')).toBe('true');
  expect(pressed(r, 'Week')).toBe('false');
  expect(initialView(r)).toBe('dayGridMonth');
  expect(mockChangeView).not.toHaveBeenCalled();
  // The props the screen had before the toggle are unchanged.
  expect(mockLastProps.dayHeaderFormat).toEqual({ weekday: 'narrow' });
  expect(mockLastProps.headerToolbar).toEqual({ left: 'prev,next', center: 'title', right: 'today' });
  expect(mockLastProps.events).toEqual({ googleCalendarId: 'c' });
  expect(mockLastProps.googleCalendarApiKey).toBe('k');
  const jsEvent = { preventDefault: jest.fn() };
  mockLastProps.eventClick({ jsEvent });
  expect(jsEvent.preventDefault).toHaveBeenCalled();

  await r.click('Week');
  expect(mockChangeView).toHaveBeenCalledTimes(1);
  expect(mockChangeView).toHaveBeenCalledWith('dayGridWeek');
  expect(pressed(r, 'Week')).toBe('true');
  expect(window.localStorage.getItem(KEY)).toBe('week');

  await r.click('Month');
  expect(mockChangeView).toHaveBeenLastCalledWith('dayGridMonth');
  expect(window.localStorage.getItem(KEY)).toBe('month');
  await r.unmount();
});

test('a stored Week choice opens FullCalendar in dayGridWeek', async () => {
  window.localStorage.setItem(KEY, 'week');
  const r = await renderScreen(<SeasonSchedule bare />);
  expect(pressed(r, 'Week')).toBe('true');
  expect(initialView(r)).toBe('dayGridWeek');
  expect(mockChangeView).not.toHaveBeenCalled();
  await r.unmount();
});

describe('with the real FullCalendar', () => {
  beforeEach(() => {
    mockReal = true;
    jest.useFakeTimers('modern');
    jest.setSystemTime(new Date('2026-10-14T15:00:00'));
  });
  afterEach(() => { jest.useRealTimers(); });

  const title = (r) => r.container.querySelector('.fc-toolbar-title')?.textContent ?? null;
  const headers = (r) => [...r.container.querySelectorAll('.fc-col-header-cell')].map((c) => c.textContent.trim());

  test('Week keeps the visible date, dates the column headers and keeps the feed', async () => {
    const r = await renderScreen(<SeasonSchedule bare />);
    expect(r.container.querySelector('.fc-dayGridMonth-view')).not.toBeNull();
    expect(title(r)).toBe('October 2026');
    expect(headers(r)).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
    expect(r.text()).toContain('Fall camp');
    expect(mockFetches).toEqual(['2026-09-28']);

    await r.click('Week');
    expect(r.container.querySelector('.fc-dayGridWeek-view')).not.toBeNull();
    expect(r.container.querySelector('.fc-dayGridMonth-view')).toBeNull();
    expect(title(r)).toBe('Oct 12 – 18, 2026');
    expect(headers(r)).toEqual(['M 10/12', 'T 10/13', 'W 10/14', 'T 10/15', 'F 10/16', 'S 10/17', 'S 10/18']);
    expect(r.text()).toContain('Fall camp');
    // The week sits inside the month range already fetched (FullCalendar's
    // lazyFetching), and the feed is not dropped and re-added on the
    // toggle's re-render, so there is no second fetch.
    expect(mockFetches).toEqual(['2026-09-28']);

    // FullCalendar's own arrows still navigate, now by week.
    await tap(r.container.querySelector('.fc-next-button'));
    expect(title(r)).toBe('Oct 19 – 25, 2026');

    await r.click('Month');
    expect(r.container.querySelector('.fc-dayGridMonth-view')).not.toBeNull();
    expect(title(r)).toBe('October 2026');
    expect(headers(r)).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
    await r.unmount();
  });

  test('a stored Week choice mounts the real calendar in the week view', async () => {
    window.localStorage.setItem(KEY, 'week');
    const r = await renderScreen(<SeasonSchedule bare />);
    expect(r.container.querySelector('.fc-dayGridWeek-view')).not.toBeNull();
    expect(title(r)).toBe('Oct 12 – 18, 2026');
    expect(mockFetches).toEqual(['2026-10-12']);
    await r.unmount();
  });
});
