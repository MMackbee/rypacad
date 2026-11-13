/**
 * The sheets' stacking contract (walkthrough 2026-11-13). A staff sheet opened
 * from a roster row painted under the greyed "Cancelled or moved" rows that
 * follow it - opacity 0.5 gives each of those rows its own layer, painted in
 * page order after the sheet - and they took the sheet's taps. jsdom neither
 * paints nor hit-tests, so these tests pin the contract instead of the pixels:
 * the overlay carries SHEET_Z, and SHEET_Z is above every z-index the portal's
 * screens use, read from the source. screens/Roster.sheetlayer.test.js checks
 * that nothing between a roster sheet and its frame traps that z-index.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { renderScreen } from '../screens/testRender';
import { SHEET_Z } from '../tokens';
import CancelSheet from './CancelSheet';
import StaffSheet from './staffBooking/StaffSheet';

const PORTAL = path.resolve(__dirname, '..');
// The Feedback button, its toast and its sheet: fixed, portaled to <body>,
// over every screen. The button steps aside while a sheet is open
// (hooks/feedback.js OVERLAY_ATTR), so it never sits on one.
const FEEDBACK_CHROME = ['components/FeedbackButton.js', 'components/FeedbackSheet.js'];

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.js$/.test(entry.name) && !/\.test\.js$/.test(entry.name) ? [full] : [];
  });
}

/** Every numeric z-index in the portal's source: `zIndex: 5` and `z-index: 5`, by file. */
function zIndexesBy(filter) {
  const found = [];
  for (const file of sourceFiles(PORTAL)) {
    const rel = path.relative(PORTAL, file).split(path.sep).join('/');
    if (!filter(rel)) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(/(?:zIndex|z-index)\s*:\s*['"]?(-?\d+)/g)) found.push([rel, Number(m[1])]);
  }
  return found;
}

test('SHEET_Z is above every z-index a screen uses', () => {
  const screens = zIndexesBy((rel) => !FEEDBACK_CHROME.includes(rel));
  // The scan is not empty: the roster's sticky status line and the consent sheet are in it.
  expect(screens).toEqual(expect.arrayContaining([['screens/Roster.js', 1], ['components/consent/ConfirmSheet.js', 5]]));
  expect(typeof SHEET_Z).toBe('number');
  for (const [rel, z] of screens) expect([rel, z < SHEET_Z]).toEqual([rel, true]);
});

test('and below the Feedback chrome, which sits over every screen', () => {
  const chrome = zIndexesBy((rel) => FEEDBACK_CHROME.includes(rel));
  expect(chrome.length).toBeGreaterThan(0);
  for (const [rel, z] of chrome) expect([rel, z > SHEET_Z]).toEqual([rel, true]);
});

test("the staff sheets' shell and CancelSheet put their overlay on SHEET_Z", async () => {
  for (const el of [
    <StaffSheet title="Move Jordan to another Training block" onClose={() => {}}>
      <p>content</p>
    </StaffSheet>,
    <CancelSheet summary="Tue Nov 17 · 4:00 PM · Training block" onClose={() => {}} onConfirm={async () => {}} onCancelled={() => {}} />,
  ]) {
    const r = await renderScreen(el);
    const overlay = r.container.querySelector('[data-portal-overlay]');
    expect(overlay.style.position).toBe('absolute');
    expect(overlay.style.zIndex).toBe(String(SHEET_Z));
    expect(window.getComputedStyle(overlay).zIndex).toBe(String(SHEET_Z));
    await r.unmount();
  }
});
