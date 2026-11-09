import React from 'react';
import { renderScreen } from '../../screens/testRender';
import { ERR, LiveDataError } from '../../hooks/live';

const mockCountersign = jest.fn();
const mockWithdraw = jest.fn();
const mockSend = jest.fn();
jest.mock('../../hooks/mentalConsent', () => ({
  countersignConsent: (...a) => mockCountersign(...a),
  withdrawRecording: (...a) => mockWithdraw(...a),
  sendConsentReminder: (...a) => mockSend(...a),
}));
import ConsentCard from './ConsentCard';

/** A staffConsentSummary result (plan Task 8). */
const summary = (over = {}) => ({
  status: 'signed', label: 'Signed', recording: 'Recording: yes (both)', canCountersign: false, canRemind: false, canWithdraw: false, audience: 'household',
  summary: 'Signed Oct 30 by Dana Whitfield (parent) · Ava agreed · Recording: yes (both) · Location: Eden Prairie · Version 2026-10-30', ...over,
});
const consent = (over) => ({ record: {}, summary: summary(over), unavailable: false });
const card = (c, props = {}) => <ConsentCard athleteId="ava" firstName="Ava" familyLabel="Dana Whitfield" consent={c} {...props} />;
const refusal = (reason) => new LiveDataError(reason === 'test-household' || reason === 'no-dob' ? ERR.INVALID : ERR.UNKNOWN, 'refused', null, reason);

beforeEach(() => {
  mockCountersign.mockReset().mockResolvedValue({ athleteId: 'ava' });
  mockWithdraw.mockReset().mockResolvedValue({ athleteId: 'ava' });
  mockSend.mockReset();
});

test('signed, not countersigned: Countersign, then no Countersign button', async () => {
  const r = await renderScreen(card(consent({ canCountersign: true })));
  expect(r.text()).toContain('Signed Oct 30 by Dana Whitfield (parent)');
  await r.click('Countersign');
  expect(mockCountersign).toHaveBeenCalledWith('ava');
  expect(r.button('Countersign')).toBeNull();
  expect(r.text()).toContain('Complete');
  await r.unmount();
});

test('unsigned, a minor: the reminder sheet names the family; Sent, then Sent today', async () => {
  const c = { record: null, summary: summary({ status: 'unsigned', label: 'Not signed', summary: null, recording: 'Recording: no', canRemind: true }), unavailable: false };
  mockSend.mockResolvedValueOnce({ status: 'sent' });
  const r = await renderScreen(card(c));
  expect(r.text()).toContain('Not signed');
  await r.click('Send a reminder');
  expect(r.text()).toContain("Send Ava's family a reminder to sign? Dana Whitfield gets an email and a push.");
  await r.click('Send');
  expect(mockSend).toHaveBeenCalledWith('ava');
  expect(r.text()).toContain('Sent');
  expect(r.text()).not.toContain('Sent today');
  expect(r.button('Send a reminder')).toBeNull();
  await r.unmount();

  mockSend.mockResolvedValueOnce({ status: 'duplicate' });
  const again = await renderScreen(card(c));
  await again.click('Send a reminder'); await again.click('Send');
  expect(again.text()).toContain('Sent today');
  await again.unmount();
});

test('18+ with a login: the reminder goes to the athlete; a household with no guardian name is "the family"', async () => {
  const unsigned = { status: 'unsigned', label: 'Not signed', summary: null, canRemind: true };
  const r = await renderScreen(<ConsentCard athleteId="max" firstName="Max" familyLabel="Dana Whitfield" consent={consent({ ...unsigned, audience: 'athlete' })} />);
  await r.click('Send a reminder');
  expect(r.text()).toContain('Send Max a reminder to sign? Max gets an email and a push.');
  await r.unmount();
  const none = await renderScreen(card(consent(unsigned), { familyLabel: null }));
  await none.click('Send a reminder');
  expect(none.text()).toContain("Send Ava's family a reminder to sign? The family gets an email and a push.");
  await none.unmount();
});

test('refusals by reason keep the sheet open and say why', async () => {
  const cases = [
    ['test-household', 'This is a test family; reminders never go to test families.'],
    ['disabled', 'Reminders are off until the academy turns them on.'],
    ['already-signed', 'Already signed.'],
    ['no-dob', "Add Ava's date of birth first (ops can add it)."],
    ['no-household', 'No family on file for Ava (ops can fix it).'],
    ['send-failed', "Couldn't send the reminder. Try again."],
    [null, "Couldn't send the reminder. Try again."],
  ];
  for (const [reason, copy] of cases) {
    mockSend.mockRejectedValueOnce(refusal(reason));
    const r = await renderScreen(card(consent({ status: 'unsigned', label: 'Not signed', summary: null, canRemind: true })));
    await r.click('Send a reminder'); await r.click('Send');
    expect(r.text()).toContain(copy);
    expect(r.button('Send')).not.toBeNull();
    expect(r.text()).not.toContain('Sent today');
    await r.unmount();
  }
});

test('Recording withdrawn (a minor, assent yes): the sheet, then the one-way write', async () => {
  const r = await renderScreen(card(consent({ canWithdraw: true })));
  await r.click('Recording withdrawn');
  expect(r.text()).toContain('Record that Ava withdrew the recording answer? Recording stops until the family changes it.');
  await r.click('Record it');
  expect(mockWithdraw).toHaveBeenCalledWith('ava');
  expect(r.button('Recording withdrawn')).toBeNull();
  await r.unmount();
});

test("Yannick's withdrawal sheet: Cancel first with the focus; Escape closes it", async () => {
  const r = await renderScreen(card(consent({ canWithdraw: true })));
  await r.click('Recording withdrawn');
  const dialog = r.container.querySelector('[role="dialog"]');
  expect(document.getElementById(dialog.getAttribute('aria-labelledby')).textContent).toContain('Record that Ava withdrew');
  expect([...dialog.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Cancel', 'Record it']);
  expect(document.activeElement.textContent).toBe('Cancel');
  await r.act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
  expect(r.container.querySelector('[role="dialog"]')).toBeNull();
  expect(mockWithdraw).not.toHaveBeenCalled();
  await r.unmount();
});

test('needs 18+: the recording line says so, and a reminder can go', async () => {
  const r = await renderScreen(card(consent({ status: 'needs-adult', label: 'Needs 18+', recording: 'Recording: needs 18+ signature', canRemind: true,
    summary: 'Signed Oct 30 by Dana Whitfield (parent) · Ava agreed · Recording: needs 18+ signature · Version 2026-10-30' })));
  expect(r.text()).toContain('Recording: needs 18+ signature');
  expect(r.text()).toContain('Needs 18+');
  expect(r.button('Send a reminder')).not.toBeNull();
  await r.unmount();
});

test('unavailable: one line, no buttons', async () => {
  const r = await renderScreen(card({ record: undefined, summary: null, unavailable: true }));
  expect(r.text()).toContain('Consent status unavailable');
  expect(r.container.querySelector('button')).toBeNull();
  await r.unmount();
});
