import React, { act } from 'react';
import { renderScreen } from '../screens/testRender';
import AssessmentFrame, { layoutFor, useLayoutClass } from './AssessmentFrame';

test('layout classes (spec 5): phone below 700 px, tablet 700-1100 px, desktop above 1100 px', () => {
  expect(layoutFor(390)).toBe('phone');
  expect(layoutFor(699)).toBe('phone');
  expect(layoutFor(700)).toBe('tablet');
  expect(layoutFor(1100)).toBe('tablet');
  expect(layoutFor(1101)).toBe('desktop');
  expect(layoutFor(undefined)).toBe('phone');
});

test('the frame drops the 430 px column above phone width', async () => {
  for (const [layout, width] of [['phone', '430px'], ['tablet', '1100px'], ['desktop', '1440px']]) {
    const r = await renderScreen(<AssessmentFrame bare layout={layout}>content</AssessmentFrame>);
    expect(r.container.querySelector('div').style.maxWidth).toBe(width);
    await r.unmount();
  }
});

test('the layout follows the window', async () => {
  const seen = [];
  function Probe() {
    seen.push(useLayoutClass());
    return null;
  }
  window.innerWidth = 390;
  const r = await renderScreen(<Probe />);
  await act(async () => { window.innerWidth = 1280; window.dispatchEvent(new Event('resize')); });
  expect(seen[0]).toBe('phone');
  expect(seen[seen.length - 1]).toBe('desktop');
  await r.unmount();
  window.innerWidth = 1024;
});
