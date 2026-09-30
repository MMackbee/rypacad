/**
 * The month grid's weekday header scrolls with the grid (tester report
 * 2026-09-30, Teddy): with height="auto" FullCalendar's stickyHeaderDates
 * 'auto' pinned the M T W row to the screen's scroller - over the walkthrough's
 * Book a session step and the real Book a Session alike - and our transparent
 * page colour let the days show through it.
 */
import React from 'react';
import { renderScreen } from '../screens/testRender';
import ContractCalendar from './ContractCalendar';
import { SessionsCalendarCard } from './CalendarCard';

const sticky = (r) => r.container.querySelectorAll('.fc-scrollgrid-section-sticky, .fc-sticky');

test('the weekday header row is not sticky, in the grid and in the booking card', async () => {
  const g = await renderScreen(<ContractCalendar start="2026-11-01" dayStates={{ '2026-11-03': 'available' }} variant="booking" />);
  // The header still renders - Monday first, one letter.
  const heads = [...g.container.querySelectorAll('.fc-col-header-cell')].map((th) => th.textContent);
  expect(heads).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
  expect(sticky(g)).toHaveLength(0);
  await g.unmount();

  const c = await renderScreen(
    <SessionsCalendarCard
      monthISO="2026-11-01"
      changeMonth={() => {}}
      loading={false}
      dayStates={{ '2026-11-03': 'available' }}
      onSelectDay={() => {}}
      hint="HINT"
      emptyCopy={{ month: 'EMPTY', week: 'EMPTY' }}
    />
  );
  expect(c.container.querySelector('.fc')).not.toBeNull();
  expect(sticky(c)).toHaveLength(0);
  await c.unmount();
});
