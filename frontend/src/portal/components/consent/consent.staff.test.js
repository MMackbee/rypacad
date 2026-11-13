import React from 'react';
import { renderScreen } from '../../screens/testRender';

const mockRecordPaper = jest.fn();
const mockCorrectPaper = jest.fn();
let mockStaffData;
const mockUseStaffConsent = jest.fn(() => ({ data: mockStaffData, loading: false, error: null, recordPaper: mockRecordPaper, correctPaper: mockCorrectPaper }));
let mockTracker;
jest.mock('../../hooks/mentalConsentStaff', () => ({
  useStaffConsent: (...a) => mockUseStaffConsent(...a),
  useConsentTracker: () => mockTracker,
}));
const mockUseFamilyConsents = jest.fn(() => ({ data: null, loading: false, error: null }));
jest.mock('../../hooks/mentalConsent', () => ({ useFamilyConsents: (...a) => mockUseFamilyConsents(...a) }));
// "Today" for the paper date check: a fixed academy date.
jest.mock('../../data/calendar', () => ({ ...jest.requireActual('../../data/calendar'), academyDateISO: () => '2026-11-05' }));
import StaffConsentDetail from './StaffConsentDetail';
import ConsentDetailCard from './ConsentDetailCard';
import ConsentTrackerCard from './ConsentTrackerCard';
import { paperDateToStamp } from '../../data/mentalConsent';

const AVA = { id: 'ava', name: 'Ava Test', dob: '2012-05-14', householdId: 'hh' };
const unsigned = { status: 'unsigned', label: 'Not signed', summary: null, recording: 'Recording: no', canCountersign: false, canRemind: true, canWithdraw: false, audience: 'household' };
const SIGNED_AT = paperDateToStamp('2026-10-28');
const paperRecord = {
  id: 'ava', athleteId: 'ava', householdId: 'hh', version: '2026-10-30', method: 'paper', signedAt: SIGNED_AT, signedBy: 'u-ops',
  signer: { role: 'parent', name: 'Dana Whitfield' }, adult: false,
  assent: { name: 'Ava', audio: false, at: SIGNED_AT, readAloud: false, withdrawnBy: null },
  choices: { location: null, audio: false, driving: null, emergencyContact: { name: null, phone: null, relationship: null }, parentSessions: null, parentName: null },
  adultConfirm: null, adultSignature: null, countersign: null, history: [],
};
const signedSummary = { ...unsigned, status: 'signed', label: 'Signed', summary: 'Signed on paper Oct 28 by Dana Whitfield (parent) · recorded Nov 2', canRemind: false };

beforeEach(() => {
  mockRecordPaper.mockReset().mockResolvedValue({ status: 'signed' });
  mockCorrectPaper.mockReset().mockResolvedValue(undefined);
  // react-scripts resets every mock's implementation before each test (resetMocks).
  mockUseStaffConsent.mockImplementation(() => ({ data: mockStaffData, loading: false, error: null, recordPaper: mockRecordPaper, correctPaper: mockCorrectPaper }));
  mockUseFamilyConsents.mockImplementation(() => ({ data: null, loading: false, error: null }));
  mockStaffData = { athlete: AVA, record: null, summary: unsigned };
  mockTracker = { data: [], loading: false, error: null };
});

test('Record a paper signature: date, section, version, names and the choices as far as the paper shows', async () => {
  const r = await renderScreen(<StaffConsentDetail athleteId="ava" role="ops" />);
  expect(r.text()).toContain('Mental performance consent');
  expect(r.text()).toContain('Not signed');
  await r.click('Record a paper signature');
  await r.fill('Date signed', '2026-10-28');
  await r.click('Section 10');
  await r.fill("Signer's name", 'Dana Whitfield');
  await r.fill("Athlete's name", 'Ava');
  await r.click('Athlete recording: no');
  await r.click('Save');
  expect(mockRecordPaper).toHaveBeenCalledWith(expect.objectContaining({ section: '10', version: '2026-10-30', signerName: 'Dana Whitfield', assentName: 'Ava', assentAudio: false,
    choices: expect.objectContaining({ location: null }) }));
  expect(mockRecordPaper.mock.calls[0][0].signedAt.toISOString()).toBe('2026-10-28T05:00:00.000Z');
  expect(r.button('Save')).toBeNull(); // the sheet closed
  await r.unmount();
});

test('the date on the paper: not in the future and not before 2026', async () => {
  const r = await renderScreen(<StaffConsentDetail athleteId="ava" role="ops" />);
  await r.click('Record a paper signature');
  await r.click('Section 10');
  await r.fill("Signer's name", 'Dana Whitfield');
  await r.fill("Athlete's name", 'Ava');
  for (const bad of ['2026-11-06', '2025-12-31', '']) {
    await r.fill('Date signed', bad);
    expect(r.button('Use the date on the paper form').disabled).toBe(true);
  }
  await r.fill('Date signed', '2026-11-05');
  expect(r.button('Save').disabled).toBe(false);
  await r.unmount();
});

test('a refused save keeps the sheet and says so', async () => {
  mockRecordPaper.mockRejectedValueOnce(new Error('permission-denied'));
  const r = await renderScreen(<StaffConsentDetail athleteId="ava" role="ops" />);
  await r.click('Record a paper signature');
  await r.fill('Date signed', '2026-10-28'); await r.click('Section 10');
  await r.fill("Signer's name", 'Dana Whitfield'); await r.fill("Athlete's name", 'Ava');
  await r.click('Save');
  expect(r.text()).toContain("This couldn't be saved. Check your connection and try again.");
  expect(r.button('Save')).not.toBeNull();
  await r.unmount();
});

test('only the owner corrects a paper record; nobody edits a portal one', async () => {
  mockStaffData = { athlete: AVA, record: paperRecord, summary: signedSummary };
  const ops = await renderScreen(<StaffConsentDetail athleteId="ava" role="ops" />);
  expect(ops.text()).toContain('Signed on paper Oct 28 by Dana Whitfield (parent)');
  expect(ops.button('Correct the paper record')).toBeNull();
  expect(ops.button('Record a paper signature')).toBeNull();
  await ops.unmount();

  const owner = await renderScreen(<StaffConsentDetail athleteId="ava" role="owner" />);
  await owner.click('Correct the paper record');
  expect(owner.container.querySelector('[aria-label="Date signed"]').value).toBe('2026-10-28');
  expect(owner.container.querySelector("[aria-label=\"Signer's name\"]").value).toBe('Dana Whitfield');
  await owner.fill('Version', '2026-09-01');
  await owner.click('Save');
  expect(mockCorrectPaper).toHaveBeenCalledWith(expect.objectContaining({ version: '2026-09-01', section: '10', signerName: 'Dana Whitfield', assentName: 'Ava', assentAudio: false }));
  expect(mockCorrectPaper.mock.calls[0][0].signedAt.toISOString()).toBe('2026-10-28T05:00:00.000Z');
  await owner.unmount();

  mockStaffData = { athlete: AVA, record: { ...paperRecord, method: 'portal' }, summary: signedSummary };
  const portal = await renderScreen(<StaffConsentDetail athleteId="ava" role="owner" />);
  expect(portal.button('Correct the paper record')).toBeNull();
  await portal.unmount();

  // A withdrawn record: the athlete's recording answer cannot be turned back on here.
  mockStaffData = { athlete: AVA, record: { ...paperRecord, assent: { ...paperRecord.assent, withdrawnBy: 'u-mental' } }, summary: signedSummary };
  const withdrawn = await renderScreen(<StaffConsentDetail athleteId="ava" role="owner" />);
  await withdrawn.click('Correct the paper record');
  expect(withdrawn.button('Athlete recording: yes').disabled).toBe(true);
  await withdrawn.unmount();
});

test('an athlete now 18 with a minor-era record: the paper re-sign is section 11', async () => {
  const max = { id: 'max', name: 'Max Test', dob: '2007-03-02', householdId: 'hh' };
  mockStaffData = { athlete: max, record: paperRecord, summary: { ...signedSummary, status: 'needs-adult', label: 'Needs 18+' } };
  const r = await renderScreen(<StaffConsentDetail athleteId="max" role="ops" />);
  await r.click('Record a paper signature');
  expect(r.button('Section 10')).toBeNull();
  await r.fill('Date signed', '2026-11-01');
  await r.fill("Signer's name", 'Max Test');
  await r.click('Recording: yes');
  await r.click('Parent sessions: no');
  await r.fill('Emergency contact name', 'Lee Test'); await r.fill('Emergency contact mobile', 'test-phone');
  await r.click('Save');
  expect(mockRecordPaper).toHaveBeenCalledWith(expect.objectContaining({ section: '11', signerName: 'Max Test',
    choices: expect.objectContaining({ audio: true, parentSessions: false, emergencyContact: { name: 'Lee Test', phone: 'test-phone', relationship: null } }) }));
  await r.unmount();
});

const MAX = { id: 'max', name: 'Max Test', dob: '2007-03-02', householdId: 'hh' };

test('section 11 is never offered for an athlete under 18, nor on a correction of a withdrawn record', async () => {
  mockStaffData = { athlete: MAX, record: null, summary: unsigned };
  const adult = await renderScreen(<StaffConsentDetail athleteId="max" role="ops" />);
  await adult.click('Record a paper signature');
  expect(adult.button('Section 11').disabled).toBe(false);
  await adult.unmount();

  mockStaffData = { athlete: AVA, record: null, summary: unsigned };
  const minor = await renderScreen(<StaffConsentDetail athleteId="ava" role="ops" />);
  await minor.click('Record a paper signature');
  expect(minor.button('Section 11').disabled).toBe(true);
  expect(minor.text()).toContain('Ava is under 18, so the form is section 10.');
  // Section 10 starts chosen for a minor, so its fields show without a tap.
  expect(minor.button('Section 10').getAttribute('aria-pressed')).toBe('true');
  expect(minor.container.querySelector("[aria-label=\"Athlete's name\"]")).not.toBeNull();
  expect(minor.button('Driving: yes')).not.toBeNull();
  await minor.unmount();

  // An 18-year-old's minor-era paper record, withdrawn: the correction stays section 10 (the re-sign is the 18+ path).
  mockStaffData = { athlete: MAX, record: { ...paperRecord, athleteId: 'max', assent: { ...paperRecord.assent, withdrawnBy: 'u-mental' } }, summary: signedSummary };
  const withdrawn = await renderScreen(<StaffConsentDetail athleteId="max" role="owner" />);
  await withdrawn.click('Correct the paper record');
  expect(withdrawn.button('Section 11').disabled).toBe(true);
  expect(withdrawn.text()).toContain('Max withdrew the recording answer, so this record stays section 10.');
  await withdrawn.unmount();
});

test('a section 11 on paper must be dated on or after the 18th birthday (2026-11-05)', async () => {
  const turned = { id: 'tia', name: 'Tia Test', dob: '2008-11-03', householdId: 'hh' }; // 18 on Nov 3
  mockStaffData = { athlete: turned, record: null, summary: unsigned };
  const r = await renderScreen(<StaffConsentDetail athleteId="tia" role="ops" />);
  await r.click('Record a paper signature');
  await r.fill('Date signed', '2026-11-02'); await r.click('Section 11'); await r.fill("Signer's name", 'Tia Test');
  expect(r.button('Section 11 must be dated on or after the 18th birthday').disabled).toBe(true);
  await r.fill('Date signed', '2026-11-03');
  expect(r.button('Save').disabled).toBe(false);
  await r.unmount();
});

test('the paper sheet names what the rules would refuse instead of failing on Save', async () => {
  mockStaffData = { athlete: MAX, record: null, summary: unsigned };
  const r = await renderScreen(<StaffConsentDetail athleteId="max" role="ops" />);
  await r.click('Record a paper signature');
  await r.fill('Date signed', '2026-10-28'); await r.click('Section 11'); await r.fill("Signer's name", 'Max Test');
  expect(r.button('Save').disabled).toBe(false);
  await r.fill('Version', 'v2');
  expect(r.button('Version is a date, like 2026-10-30').disabled).toBe(true);
  await r.fill('Version', '2026-10-30');
  await r.fill('Emergency contact name', 'Lee Test');
  expect(r.button('Emergency contact needs a name and a mobile, or neither').disabled).toBe(true);
  await r.fill('Emergency contact mobile', 'test-phone');
  await r.click('Parent sessions: yes');
  expect(r.button('Add the parent/guardian name').disabled).toBe(true);
  await r.fill('Parent/guardian name', 'Dana Test');
  await r.click('Save');
  expect(mockRecordPaper).toHaveBeenCalledWith(expect.objectContaining({ version: '2026-10-30', choices: expect.objectContaining({ parentSessions: true, parentName: 'Dana Test',
    emergencyContact: { name: 'Lee Test', phone: 'test-phone', relationship: null } }) }));
  await r.unmount();
});

test('a paper entry that lost a race with a portal signature keeps the sheet and says nothing was recorded', async () => {
  mockRecordPaper.mockResolvedValueOnce({ status: 'already', record: paperRecord });
  const r = await renderScreen(<StaffConsentDetail athleteId="ava" role="ops" />);
  await r.click('Record a paper signature');
  await r.fill('Date signed', '2026-10-28'); await r.click('Section 10');
  await r.fill("Signer's name", 'Dana Whitfield'); await r.fill("Athlete's name", 'Ava');
  await r.click('Save');
  expect(r.text()).toContain('Already signed, so nothing was recorded. The card shows the record on file.');
  expect(r.button('Save')).not.toBeNull();
  await r.unmount();
});

test("a paper record re-signed at 18 is not corrected here: its section 11 answers are the athlete's", async () => {
  const adultSignature = { signedAt: SIGNED_AT, signedBy: 'u-ops', name: 'Max Test', version: '2026-10-30', method: 'paper' };
  mockStaffData = { athlete: MAX, record: { ...paperRecord, athleteId: 'max', adultSignature }, summary: signedSummary };
  const r = await renderScreen(<StaffConsentDetail athleteId="max" role="owner" />);
  expect(r.button('Correct the paper record')).toBeNull();
  await r.unmount();
});

test('ConsentDetailCard reads only what the role may read, and survives the role resolving late', async () => {
  for (const role of ['coach', 'mental']) {
    const r = await renderScreen(<ConsentDetailCard athleteId="ava" role={role} />);
    expect(r.container.textContent).toBe('');
    await r.unmount();
  }
  expect(mockUseFamilyConsents).not.toHaveBeenCalled();
  expect(mockUseStaffConsent).not.toHaveBeenCalled();
  const r = await renderScreen(<ConsentDetailCard athleteId="ava" role="parent" />);
  expect(mockUseFamilyConsents).toHaveBeenCalled();
  expect(mockUseStaffConsent).not.toHaveBeenCalled();
  await r.rerender(<ConsentDetailCard athleteId="ava" role="ops" />);
  expect(mockUseStaffConsent).toHaveBeenCalledWith('ava');
  expect(r.text()).toContain('Record a paper signature');
  await r.unmount();
});

test('ConsentTrackerCard: every athlete with a mental booking, not signed with a 1:1 ahead first, each opens the athlete', async () => {
  mockTracker = { data: [
    { athleteId: 'reese', name: 'Reese Whitfield', familyName: 'Whitfield family', nextMental: '2026-11-12', lastMental: null, status: 'unsigned', label: 'Not signed' },
    { athleteId: 'nico', name: 'Nico Whitfield', familyName: 'Whitfield family', nextMental: null, lastMental: '2026-10-29', status: 'unsigned', label: 'Not signed' },
    { athleteId: 'jordan', name: 'Jordan Whitfield', familyName: 'Whitfield family', nextMental: '2026-11-19', lastMental: null, status: 'signed', label: 'Signed' },
  ], loading: false, error: null };
  const onOpenAthlete = jest.fn();
  const r = await renderScreen(<ConsentTrackerCard onOpenAthlete={onOpenAthlete} />);
  expect(r.text()).toContain('Mental consent');
  const lines = [...r.container.querySelectorAll('button')].map((b) => b.textContent);
  expect(lines).toEqual(['Reese Whitfield · Thu, Nov 12 · Not signed', 'Nico Whitfield · last Oct 29 · Not signed', 'Jordan Whitfield · Thu, Nov 19 · Signed']);
  await r.click('Reese Whitfield · Thu, Nov 12 · Not signed');
  expect(onOpenAthlete).toHaveBeenCalledWith('reese');
  await r.unmount();

  mockTracker = { data: [], loading: false, error: null };
  const empty = await renderScreen(<ConsentTrackerCard onOpenAthlete={onOpenAthlete} />);
  expect(empty.text()).toContain('No athlete has a mental 1:1 yet.');
  await empty.unmount();
});
