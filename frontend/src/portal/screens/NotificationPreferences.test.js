import React from 'react';
import { renderScreen } from './testRender';
import NotificationPreferences from './NotificationPreferences';
import { NOTIFICATION_CATEGORIES } from '../data/parent';

/**
 * K31: only billing EMAIL is locked on. Billing push is a real toggle, and
 * every save writes billing email true whatever the local state says.
 */

let mockSave;
let mockCategories;
jest.mock('../components/PushCard', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/ProfileCard', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/RecentNotices', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/BottomTabBar', () => ({ __esModule: true, default: () => null }));
jest.mock('../hooks', () => ({
  useNotificationPrefs: () => ({ data: { categories: mockCategories, note: '', saved: false }, save: mockSave }),
}));

beforeEach(() => {
  mockSave = jest.fn(async () => ({}));
  mockCategories = NOTIFICATION_CATEGORIES;
});

test('billing push is a live toggle; billing email stays locked on', async () => {
  const r = await renderScreen(<NotificationPreferences bare />);
  const push = r.button('Membership & tokens push');
  expect(push).not.toBeNull();
  expect(push.getAttribute('aria-disabled')).toBeNull();
  expect(push.getAttribute('aria-checked')).toBe('true');

  const email = r.button('Membership & tokens email — always on');
  expect(email).not.toBeNull();
  expect(email.getAttribute('aria-disabled')).toBe('true');
  expect(r.button('Membership & tokens email')).toBeNull();
  await r.unmount();
});

test('switching billing push off saves the full map with billing email still true', async () => {
  const r = await renderScreen(<NotificationPreferences bare />);
  await r.click('Membership & tokens push');
  expect(mockSave).toHaveBeenCalledTimes(1);
  expect(mockSave).toHaveBeenCalledWith({
    billing: { email: true, push: false },
    schedule: { email: true, push: true },
    progress: { email: true, push: false },
  });
  expect(r.button('Membership & tokens push').getAttribute('aria-checked')).toBe('false');
  await r.unmount();
});

test('a locked channel is written true even if the loaded value says off', async () => {
  // Belt and braces: the loader forces billing email on, but persist() does
  // not trust that - any save writes the locked channel true.
  mockCategories = NOTIFICATION_CATEGORIES.map((c) => (c.id === 'billing' ? { ...c, email: false } : c));
  const r = await renderScreen(<NotificationPreferences bare />);
  await r.click('Sessions push');
  expect(mockSave.mock.calls[0][0]).toEqual({
    billing: { email: true, push: true },
    schedule: { email: true, push: false },
    progress: { email: true, push: false },
  });
  await r.unmount();
});

test('practice (the walkthrough): the toggle flips locally and nothing saves', async () => {
  const r = await renderScreen(<NotificationPreferences bare practice />);
  await r.click('Sessions push');
  expect(r.button('Sessions push').getAttribute('aria-checked')).toBe('false');
  expect(mockSave).not.toHaveBeenCalled();
  expect(r.text()).not.toContain('Preferences saved');
  expect(r.text()).not.toContain('Replay the walkthrough');
  await r.unmount();
});
