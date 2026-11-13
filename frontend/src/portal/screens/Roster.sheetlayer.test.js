import React from 'react';
import { renderScreen } from './testRender';
import { SessionAttendance } from './Roster';
import { SHEET_Z } from '../tokens';

// The walkthrough's roster (2026-11-13): a staff sheet opened from a roster
// row, with greyed "Cancelled or moved" rows below it. Their opacity makes
// each of them its own layer, painted in page order after the sheet, so the
// sheet's overlay carries a z-index (SHEET_Z) - and nothing between it and
// the frame may trap that z-index in a stacking context of its own. jsdom
// neither paints nor hit-tests, so this reads the styles; components/
// sheetLayer.test.js pins SHEET_Z against every other z-index in the portal.
// The mock block is Roster.staffbooking.test.js's; each sheet is a stand-in
// inside the real shell it uses (StaffSheet, or CancelSheet for the cancel).
let mockRows;
jest.mock('../hooks', () => ({
  useCoachRoster: () => ({ data: [], loading: false, error: null, retry: () => {} }),
  useSession: () => ({ data: { type: 'training', blockLabel: 'Block 1 of 3', name: 'Training block', meta: '3:00-4:00 PM', startsIn: 'Starts in 12 min' } }),
  useSessionAttendance: () => ({
    data: mockRows,
    loading: false,
    error: null,
    mark: async () => {},
    setReason: async () => {},
    setSessionNote: async () => {},
    cancelSession: async () => {},
    sessionNote: null,
    sessionStatus: 'scheduled',
    sessionMaxHandicap: null,
    sessionUnresolved: false,
    sessionBooked: null,
    sessionCapacity: null,
  }),
  useTournamentResults: () => ({ data: null, loading: false, error: null, saveResults: async () => {} }),
  genericSessionName: () => 'Training block',
}));
jest.mock('../hooks/live', () => ({ ...jest.requireActual('../hooks/live'), __esModule: true, isLive: () => true }));
jest.mock('../hooks/assessments', () => ({ useOpenAssessmentWindows: () => ({ data: null, loading: false, error: null }) }));
jest.mock('../hooks/cancelledBookings', () => ({
  __esModule: true,
  useCancelledBookings: () => ({
    data: [
      { bookingId: 'c1', name: 'Avery Whitfield', line: 'Cancelled · Sick' },
      { bookingId: 'c2', name: 'Quinn Whitfield', line: 'Moved to Thu Nov 19' },
    ],
    loading: false,
    error: null,
  }),
  markOrRecheck: async () => false,
}));
jest.mock('../components/staffBooking/AthletePicker', () => {
  const StaffSheet = jest.requireActual('../components/staffBooking/StaffSheet').default;
  return { __esModule: true, default: (p) => <StaffSheet title="Add an athlete" onClose={p.onClose}><div data-sheet="athlete" /></StaffSheet> };
});
jest.mock('../components/staffBooking/StaffMoveSheet', () => {
  const StaffSheet = jest.requireActual('../components/staffBooking/StaffSheet').default;
  return { __esModule: true, default: (p) => <StaffSheet title="Move" onClose={p.onClose}><div data-sheet="move" /></StaffSheet> };
});
jest.mock('../components/StaffCancelSheet', () => {
  const CancelSheet = jest.requireActual('../components/CancelSheet').default;
  return {
    __esModule: true,
    default: (p) => <CancelSheet summary={<span data-sheet="cancel">summary</span>} onClose={p.onClose} onConfirm={async () => {}} onCancelled={() => {}} />,
  };
});

const row = (bookingId, athleteId, name, status) => ({
  bookingId, athleteId, name, status, attendee: 'athlete', noshowReason: null,
  householdId: 'hh1', source: null, type: 'training', date: '2026-11-17', periodKey: null, chargedFrom: 'period', comp: false, graceTokenId: null,
});
const BLOCK = { date: '2026-11-17', time: '4:00 PM', type: 'training', name: 'Training block', meta: '3 of 14 booked' };
const roster = () => renderScreen(<SessionAttendance bare sessionId="s2" block={BLOCK} role="owner" onBack={() => {}} />);

/** What starts a stacking context on an element, from its inline style (the portal styles inline). */
function trapsZIndex(el) {
  const s = el.style;
  const set = (v) => v !== undefined && v !== null && v !== '' && v !== 'none' && v !== 'auto' && v !== 'normal';
  return (
    (set(s.opacity) && Number(s.opacity) < 1) ||
    set(s.transform) || set(s.filter) || set(s.backdropFilter) || set(s.perspective) || set(s.clipPath) || set(s.mask) ||
    set(s.zIndex) || s.position === 'fixed' || s.position === 'sticky' ||
    s.isolation === 'isolate' || set(s.willChange) || set(s.mixBlendMode) || /paint|layout|strict|content/.test(s.contain || '')
  );
}

beforeEach(() => {
  mockRows = [row('b1', 'a1', 'Jordan Whitfield', 'confirmed'), row('b2', 'a2', 'Riley Whitfield', 'noshow')];
});

test.each([
  ['Move Jordan', 'move'],
  ["Cancel Riley's booking", 'cancel'],
  ['Add athlete', 'athlete'],
])('%s: the sheet paints over the greyed rows below it', async (opener, kind) => {
  const r = await roster();
  await r.click(opener);
  const sheet = r.container.querySelector(`[data-sheet="${kind}"]`);
  const overlay = sheet.closest('[data-portal-overlay]');
  const greyed = r.container.querySelector('[role="group"][aria-label="Cancelled or moved"]');
  // The walkthrough's order: the sheet first, the greyed rows after it, each its own layer.
  expect(greyed.querySelectorAll('[style*="opacity"]').length).toBe(2);
  expect(overlay.compareDocumentPosition(greyed) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  // So the overlay needs its z-index...
  expect(overlay.style.zIndex).toBe(String(SHEET_Z));
  // ...and every element between it and the top of the page leaves it free.
  const trapping = [];
  for (let el = overlay.parentElement; el && el !== document.body; el = el.parentElement) {
    if (trapsZIndex(el)) trapping.push(el.outerHTML.slice(0, 120));
  }
  expect(trapping).toEqual([]);
  await r.unmount();
});
