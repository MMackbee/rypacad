import React from 'react';
import { renderScreen } from '../screens/testRender';
import ChangePackageSheet, { ChangePackageLink } from './ChangePackageSheet';
import { CHANGEABLE_PACKAGE_IDS, canChangePackage } from '../data/packageChange';

/**
 * Tester S4 (2026-09-30): Elite picked by mistake for two children, and no
 * way to change it before paying. The pending row's link and the sheet it
 * opens; the write itself is mocked (hooks/packageChange -> live.js).
 */
const mockChange = jest.fn();
jest.mock('../hooks/packageChange', () => ({ useChangePackage: () => ({ change: mockChange }) }));

beforeEach(() => {
  mockChange.mockReset();
  mockChange.mockResolvedValue({ athleteId: 'a2', packageId: 't-6' });
});

const reese = { athleteId: 'a2', name: 'Reese', status: 'pending', packageId: 'elite', perPurchase: false };

test('only a never-paid athlete can change, and only to a monthly package', () => {
  expect(CHANGEABLE_PACKAGE_IDS).toEqual(['t-6', 't-12', 't-16', 'elite']);
  expect(['pending', 'lapsed', 'active', 'past_due', undefined].map(canChangePackage)).toEqual([true, false, false, false, false]);
});

test('the pending row names the package Pay now charges for; lapsed rows get no link', async () => {
  const opened = [];
  const r = await renderScreen(
    <div>
      <ChangePackageLink athlete={reese} onOpen={(a) => opened.push(a.athleteId)} />
      <ChangePackageLink athlete={{ ...reese, athleteId: 'a3', status: 'lapsed' }} onOpen={() => {}} />
    </div>
  );
  expect(r.text()).toBe('Elite · Change package');
  await r.click('Change package');
  expect(opened).toEqual(['a2']);
  await r.unmount();
});

test("each row's link is named for its athlete, so two unpaid children are two distinct buttons", async () => {
  const opened = [];
  const r = await renderScreen(
    <div>
      <ChangePackageLink athlete={reese} onOpen={(a) => opened.push(a.athleteId)} />
      <ChangePackageLink athlete={{ ...reese, athleteId: 'a3', name: 'Nico', packageId: 't-6' }} onOpen={(a) => opened.push(a.athleteId)} />
    </div>
  );
  const links = [...r.container.querySelectorAll('button')];
  expect(links.map((b) => b.getAttribute('aria-label'))).toEqual(['Change package for Reese', 'Change package for Nico']);
  expect(links.map((b) => b.textContent)).toEqual(['Change package', 'Change package']);
  await r.click('Change package for Nico');
  await r.click('Change package for Reese');
  expect(opened).toEqual(['a3', 'a2']);
  await r.unmount();
});

test('the sheet: monthly packages only, the current one picked, Save once another is picked', async () => {
  const closed = [];
  const r = await renderScreen(<ChangePackageSheet athlete={reese} onClose={() => closed.push(true)} />);
  expect(r.text()).toContain("Change Reese's package");
  expect(r.text()).toContain('Nothing has been charged yet. Pay now checks out the package you pick here.');
  expect(r.button('Single token')).toBeNull();
  const pressed = () => ['6 tokens', '12 tokens', '16 tokens', 'Elite'].filter((n) => r.button(n).getAttribute('aria-pressed') === 'true');
  expect(pressed()).toEqual(['Elite']);
  expect(r.button('Save package').disabled).toBe(true); // nothing changed yet
  await r.click('6 tokens');
  expect(pressed()).toEqual(['6 tokens']);
  expect(r.button('Save package').disabled).toBe(false);
  await r.click('Save package');
  expect(mockChange).toHaveBeenCalledWith('a2', 't-6');
  expect(closed).toEqual([true]);
  await r.unmount();
});

test('a refused save keeps the sheet open with the reason; Keep closes without writing', async () => {
  mockChange.mockRejectedValue(Object.assign(new Error('changePendingPackage: Missing or insufficient permissions.'), { code: 'permission-denied' }));
  const closed = [];
  const r = await renderScreen(<ChangePackageSheet athlete={reese} onClose={() => closed.push(true)} />);
  await r.click('12 tokens');
  await r.click('Save package');
  expect(r.text()).toContain("This package can't be changed any more. If you've just paid, it's already set - refresh the page to see it.");
  expect(r.text()).not.toContain('insufficient permissions');
  expect(closed).toEqual([]);
  mockChange.mockRejectedValue(Object.assign(new Error('offline'), { code: 'unavailable' }));
  await r.click('Save package');
  expect(r.text()).toContain("The package wasn't changed. Check your connection and try again.");
  await r.click('Keep Elite');
  expect(closed).toEqual([true]);
  expect(mockChange).toHaveBeenCalledTimes(2);
  await r.unmount();
});

test("the athlete's own sheet says 'your package'; no athlete, no sheet", async () => {
  const r = await renderScreen(<ChangePackageSheet athlete={{ ...reese, name: 'Sam' }} self onClose={() => {}} />);
  expect(r.text()).toContain('Change your package');
  await r.unmount();
  const none = await renderScreen(<ChangePackageSheet athlete={null} onClose={() => {}} />);
  expect(none.text()).toBe('');
  await none.unmount();
});
