/**
 * The waitlist's words (audit 2026-09-30): what really happens when a spot
 * opens, no number that the server did not give, and no token wording for an
 * Elite athlete.
 */
import React from 'react';
import { renderScreen } from '../screens/testRender';
import {
  JoinWaitlistButton,
  OnWaitlist,
  WaitlistedConfirmationBody,
  leaveFailureCopy,
  waitlistPromiseCopy,
  waitlistStatusCopy,
} from './WaitlistAction';

describe('copy', () => {
  test('the place in line shows only when it is known', () => {
    expect(waitlistStatusCopy(2)).toBe('On the waitlist - #2 in line');
    expect(waitlistStatusCopy(null)).toBe('On the waitlist');
    expect(waitlistStatusCopy(undefined)).toBe('On the waitlist');
  });

  test('what happens when a spot opens: booked automatically, one token used, cancel until the day before', () => {
    expect(waitlistPromiseCopy({ name: 'Ava' })).toBe(
      'If a spot opens, Ava is booked automatically and one token is used. You can cancel until the day before.'
    );
    expect(waitlistPromiseCopy({ name: 'Eli', unlimited: true })).toBe(
      'If a spot opens, Eli is booked automatically. You can cancel until the day before.'
    );
    // An athlete's own screen, where no name is in hand.
    expect(waitlistPromiseCopy({})).toBe(
      'If a spot opens, you are booked automatically and one token is used. You can cancel until the day before.'
    );
    expect(waitlistPromiseCopy({ unlimited: true })).not.toMatch(/token/i);
  });

  test('a refused leave: promoted names the athlete; anything else is plain', () => {
    expect(leaveFailureCopy({ reason: 'promoted', message: 'x' }, 'Ava')).toBe('Ava was just booked into this session.');
    expect(leaveFailureCopy({ reason: 'promoted' }, null)).toBe('You were just booked into this session.');
    expect(leaveFailureCopy({ reason: 'leave-failed', message: 'That waitlist place could not be removed. Your list has been refreshed.' }, 'Ava'))
      .toBe('That waitlist place could not be removed. Your list has been refreshed.');
    expect(leaveFailureCopy(new Error('leaveWaitlist: Missing or insufficient permissions.'), 'Ava'))
      .toBe('That waitlist place could not be removed. Try again.');
  });
});

describe('components', () => {
  test('the join button keeps "reserves one token" for a token athlete and drops it for Elite', async () => {
    const token = await renderScreen(<JoinWaitlistButton onClick={() => {}} />);
    expect(token.text()).toBe('Join waitlist · reserves one token');
    await token.unmount();
    const elite = await renderScreen(<JoinWaitlistButton onClick={() => {}} unlimited />);
    expect(elite.text()).toBe('Join waitlist');
    await elite.unmount();
  });

  test('already waiting: status, the honest sentence and Leave waitlist - never Join again', async () => {
    const left = [];
    const r = await renderScreen(<OnWaitlist position={3} name="Ava" onLeave={() => left.push(1)} />);
    expect(r.text()).toContain('On the waitlist - #3 in line');
    expect(r.text()).toContain('If a spot opens, Ava is booked automatically and one token is used.');
    expect(r.text()).not.toContain('Join waitlist');
    expect(r.text()).not.toMatch(/notif/i);
    await r.click('Leave waitlist');
    expect(left).toEqual([1]);
    await r.unmount();
  });

  test('already waiting, place unknown, Elite: no number and no token wording; a failed leave shows its message', async () => {
    const r = await renderScreen(<OnWaitlist position={null} name="Eli" unlimited onLeave={() => {}} error="Eli was just booked into this session." />);
    expect(r.text()).toContain('On the waitlist');
    expect(r.text()).not.toContain('#');
    expect(r.text()).not.toMatch(/token/i);
    expect(r.text()).toContain('Eli was just booked into this session.');
    await r.unmount();
  });

  test('on the day of the session the place can no longer become a booking, and the copy says so', async () => {
    const r = await renderScreen(<OnWaitlist position={1} name="Ava" closed onLeave={() => {}} />);
    expect(r.text()).toContain('On the waitlist');
    expect(r.text()).not.toContain('in line');
    expect(r.text()).not.toContain('If a spot opens');
    expect(r.text()).toContain('Nobody is booked from a waitlist on the day of the session. This place will close and its token will be free again.');
    expect(r.button('Leave waitlist')).not.toBeNull();
    await r.unmount();
    const elite = await renderScreen(<OnWaitlist position={1} name="Eli" closed unlimited onLeave={() => {}} />);
    expect(elite.text()).toContain('Nobody is booked from a waitlist on the day of the session. This place will close.');
    expect(elite.text()).not.toMatch(/token/i);
    await elite.unmount();
  });

  test('the waitlisted confirmation says what happens, not "you\'ll be notified"', async () => {
    const r = await renderScreen(<WaitlistedConfirmationBody name="Training block" when="Tue, Nov 17 · 4:00" position={null} athleteName="Ava" />);
    expect(r.text()).toContain('On the waitlist');
    expect(r.text()).toContain('If a spot opens, Ava is booked automatically and one token is used. You can cancel until the day before.');
    expect(r.text()).not.toMatch(/notif/i);
    await r.unmount();

    const elite = await renderScreen(<WaitlistedConfirmationBody name="Training block" when="Tue, Nov 17 · 4:00" position={1} athleteName="Eli" unlimited />);
    expect(elite.text()).toContain('On the waitlist - #1 in line');
    expect(elite.text()).not.toMatch(/token/i);
    await elite.unmount();
  });
});
