import React from 'react';
import { renderScreen } from '../screens/testRender';
import { ReservedBlocks, ReservedChip } from './Reserved';
import SessionCard from './SessionCard';
import { reservedTag } from '../data/reserved';

// Owner ruling 2026-10-02: a handicap-reserved block carries one tag, the
// same on Book a Session and on every staff list.
const text = async (element) => {
  const r = await renderScreen(element);
  const out = r.text();
  await r.unmount();
  return out;
};

test('the chip prints the tag, and nothing at all on an open block', async () => {
  expect(await text(<ReservedChip tag={reservedTag({ maxHandicap: 5 })} />)).toBe('Handicap 5 or better');
  expect(await text(<ReservedChip tag={reservedTag({})} />)).toBe('');
  expect(await text(<ReservedChip tag={null} />)).toBe('');
});

test('a session card shows the tag after its type chip; without one it is the card it was', async () => {
  const card = { time: '3:00', meridiem: 'PM', type: 'training', name: 'Training block' };
  expect(await text(<SessionCard {...card} reserved={reservedTag({ maxHandicap: 5 })} />)).toBe('3:00PMTrainingHandicap 5 or betterTraining block');
  const plain = await renderScreen(<SessionCard {...card} />);
  const none = await renderScreen(<SessionCard {...card} reserved={null} />);
  expect(plain.text()).toBe('3:00PMTrainingTraining block');
  expect(none.container.innerHTML).toBe(plain.container.innerHTML);
  await plain.unmount();
  await none.unmount();
});

test("the admin's reserved blocks: one row each with the day, time, tag and bookings; none renders nothing", async () => {
  const blocks = [
    { sessionId: '2026-11-03-0', date: '2026-11-03', day: 'Tue', time: '3:00 PM', maxHandicap: 5, booked: 2, capacity: 6 },
    { sessionId: '2026-11-05-0', date: '2026-11-05', day: 'Thu', time: '4:00 PM', maxHandicap: 10, booked: 0, capacity: 6 },
  ];
  expect(await text(<ReservedBlocks blocks={blocks} />)).toBe('Tue 3:00 PMHandicap 5 or better2 of 6 bookedThu 4:00 PMHandicap 10 or better0 of 6 booked');
  expect(await text(<ReservedBlocks blocks={[]} />)).toBe('');
});
