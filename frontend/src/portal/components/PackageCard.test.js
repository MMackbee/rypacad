import React from 'react';
import { renderScreen } from '../screens/testRender';
import PackageCard from './PackageCard';
import { ELITE, TOKEN_PACKAGES } from '../data/packages';

/**
 * Tester report S4 (2026-09-30): the box lit up but the dot did not, and two
 * boxes could look picked with one dot. On a pickable card the outline, the
 * tint and the dot are one state; emphasis never borrows the green.
 */
const green = (value) => value === '#00af51' || value === 'rgb(0, 175, 81)';
const marks = (card) => ({
  box: green(card.style.borderColor),
  tint: card.style.backgroundColor === 'rgba(0, 175, 81, 0.12)',
  glow: card.style.boxShadow !== 'none',
  dot: green(card.querySelector('[aria-hidden="true"]')?.style.backgroundColor),
});

test('a pickable card lights box, tint and dot from `selected` alone - emphasis adds nothing', async () => {
  const r = await renderScreen(
    <div>
      <PackageCard pkg={ELITE} emphasised onSelect={() => {}} />
      <PackageCard pkg={TOKEN_PACKAGES[1]} selected onSelect={() => {}} />
    </div>
  );
  expect(marks(r.button('Elite'))).toEqual({ box: false, tint: false, glow: false, dot: false });
  expect(marks(r.button('12 tokens'))).toEqual({ box: true, tint: true, glow: false, dot: true });
  await r.unmount();
});

test('a display-only card keeps the Elite emphasis (outline and glow, no dot)', async () => {
  const r = await renderScreen(<PackageCard pkg={ELITE} emphasised />);
  const card = r.button('Elite');
  expect(card.getAttribute('aria-disabled')).toBe('true');
  expect(marks(card)).toEqual({ box: true, tint: false, glow: true, dot: false });
  await r.unmount();
});
