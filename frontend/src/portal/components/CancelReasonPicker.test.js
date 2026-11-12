/**
 * The reason a family gives when they cancel (spec 2026-11-11 §4): five
 * chips, and with Other a short note. The picker only reports what was
 * picked; MemberCancelSheet decides when that is a usable reason.
 */
import React from 'react';
import CancelReasonPicker from './CancelReasonPicker';
import { renderScreen } from '../screens/testRender';

async function mount(props) {
  const changes = [];
  const r = await renderScreen(
    <CancelReasonPicker value={{ category: null, note: '' }} onChange={(v) => changes.push(v)} {...props} />
  );
  return { ...r, changes };
}

const chips = (r) => [...r.container.querySelectorAll('[role="group"][aria-label="Reason"] button')];

test("asks why by first name, with the five reasons none of them picked", async () => {
  const r = await mount({ name: 'Jordan Whitfield' });
  expect(r.text()).toContain("Why can't Jordan make it?");
  expect(chips(r).map((b) => [b.textContent.trim(), b.getAttribute('aria-pressed')])).toEqual([
    ['Sick', 'false'],
    ['Injured', 'false'],
    ['School', 'false'],
    ['Family conflict', 'false'],
    ['Other', 'false'],
  ]);
  expect(r.container.querySelector('textarea')).toBeNull();
  await r.unmount();
});

test('an athlete\'s own login is asked "you"', async () => {
  const r = await mount({});
  expect(r.text()).toContain("Why can't you make it?");
  await r.unmount();
});

test('the staff cancel can ask its own question; families keep theirs', async () => {
  const r = await mount({ name: 'Jordan Whitfield', question: "Why couldn't Jordan make it?" });
  expect(r.text()).toContain("Why couldn't Jordan make it?");
  expect(r.text()).not.toContain("Why can't Jordan make it?");
  await r.unmount();
});

test('a tap reports the reason', async () => {
  const r = await mount({ name: 'Jordan Whitfield' });
  await r.click('Sick');
  expect(r.changes).toEqual([{ category: 'sick', note: '' }]);
  await r.unmount();
});

test('the picked one is pressed', async () => {
  const r = await mount({ value: { category: 'school', note: '' } });
  expect(chips(r).filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent.trim())).toEqual(['School']);
  await r.unmount();
});

test('Other opens a short note, at most 140 characters', async () => {
  const r = await mount({ value: { category: 'other', note: '' } });
  const box = r.container.querySelector('textarea');
  expect(box.maxLength).toBe(140);
  expect(box.getAttribute('placeholder')).toBe('A few words');
  await r.fill('A few words', 'dentist');
  expect(r.changes).toEqual([{ category: 'other', note: 'dentist' }]);
  await r.unmount();
});

test('disabled while the cancel runs', async () => {
  const r = await mount({ value: { category: 'other', note: 'dentist' }, disabled: true });
  expect(chips(r).every((b) => b.disabled)).toBe(true);
  expect(r.container.querySelector('textarea').disabled).toBe(true);
  await r.unmount();
});

test('never mentions a token', async () => {
  const r = await mount({ name: 'Jordan Whitfield', value: { category: 'other', note: '' } });
  expect(r.text()).not.toMatch(/token/i);
  await r.unmount();
});
