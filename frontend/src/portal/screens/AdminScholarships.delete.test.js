import React, { act, useState } from 'react';
import { renderScreen } from './testRender';
import AdminScholarships from './AdminScholarships';
import { SETTLE_MS } from '../components/CancelSheet';

/*
 * Delete on the Scholarships screen (owner, 2026-10-01: the website's privacy
 * page tells a family "Ask us to delete yours at any time and we will delete
 * it from our database and from our email"). AdminScholarships.test.js has the
 * list, the application and the decision; this file has the delete: where the
 * control is, the confirmation in front of the write, and what the screen
 * does when the write lands, fails, or finds the application already gone.
 */
let mockScholarships;
let mockDecide;
let mockDecisions;
let mockDelete;
let mockDeletes;
// The clock is the test's: the confirm sheet takes no "Delete for good" in its first half second (SETTLE_MS).
let now;
jest.mock('../hooks', () => ({ useScholarships: () => mockScholarships }));
jest.mock('../hooks/scholarships', () => ({
  decideScholarship: (...args) => mockDecide(...args),
  deleteScholarship: (...args) => mockDelete(...args),
}));
// Ages are counted on this day, whatever day the suite runs.
jest.mock('../data/calendar', () => ({ ...jest.requireActual('../data/calendar'), todayISO: () => '2026-10-01' }));

const at = (day, hour, minute) => new Date(2026, 9, day, hour, minute).getTime();
const SAM = {
  id: 'app-sam', parent: 'Dana Hart', relationship: 'Parent', email: 'dana@example.com', phone: '612-555-0100', athlete: 'Sam Hart', dob: '2012-05-01',
  school: 'Lakeview Middle', grade: '8', average: '82.1', handicap: '11.4', events: '', package: '12 tokens', level: 'Partial', need: 'One income this year.',
  statement: 'Sam tries hard, trains smart and backs his teammates.', season: '2026-27', status: 'new', submissions: 2,
  createdAtMs: at(1, 14, 5), updatedAtMs: at(3, 9, 0), email_status: 'sent', decidedAtMs: null,
};
const AVA = {
  ...SAM, id: 'app-ava', parent: 'Lee Park', email: 'lee@example.com', athlete: 'Ava Park', dob: '2010-11-20', statement: 'Ava wants to play college golf and works for it.',
  status: 'approved', createdAtMs: at(1, 8, 0), updatedAtMs: at(2, 18, 30), decidedBy: 'owner-1', decidedAtMs: at(2, 9, 0),
};
const KAI = {
  ...SAM, id: 'app-kai', parent: 'Jo Roy', email: 'jo@example.com', athlete: 'Kai Roy', dob: '2009-01-15', statement: 'Kai shows up early and stays late, every week.',
  status: 'declined', submissions: 1, createdAtMs: at(1, 7, 0), updatedAtMs: at(1, 7, 0), decidedBy: 'owner-1', decidedAtMs: at(1, 12, 0),
};
const loaded = (rows) => ({ loading: false, error: null, data: { rows, counts: {} } });
const DECISION_LABELS = ['Approve', 'Decline', 'Reopen', 'Approving', 'Declining', 'Reopening'];
const decisionButtons = (r) => [...r.container.querySelectorAll('button')].filter((b) => DECISION_LABELS.includes(b.textContent.trim()));
const slots = (r) => decisionButtons(r).map((b) => `${b.textContent.trim()}${b.disabled ? ' (off)' : ''}`);
const ALL_OFF = ['Approve (off)', 'Decline (off)', 'Reopen (off)'];
// The control on the application, and the confirmation's two answers.
const [DELETE, KEEP, CONFIRM] = ['Delete application', 'Keep application', 'Delete for good'];
const ASKED = 'Delete this application?';
const PERMANENT = "Sam Hart's application will be deleted from the portal. This cannot be undone.";
const EMAILED = "Copies emailed to the director are not deleted. Delete them from the academy's email by hand.";
const NOT_DELETED = "That didn't delete. This application is still here. Try again.";
const tap = async (b) => { await act(async () => { b.click(); }); };
const follows = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
// A delete that stays unwritten until the test lands it, or fails it.
const pendingDelete = () => {
  const held = {};
  mockDelete = (args) => {
    mockDeletes.push(args);
    return new Promise((resolve, reject) => {
      held.land = () => resolve({ id: args.id });
      held.fail = () => reject(new Error('deleteScholarship: offline'));
    });
  };
  return held;
};
// The control is tapped and the question is read: the half second in which the sheet takes no confirm has passed.
const ask = async (r) => {
  await r.click(DELETE);
  now += SETTLE_MS;
};
const openAndAsk = async (r, name = 'Sam Hart') => {
  await r.click(name);
  await ask(r);
};

beforeEach(() => {
  mockScholarships = loaded([SAM, AVA, KAI]);
  mockDecisions = [];
  mockDecide = async (args) => { mockDecisions.push(args); return args; };
  mockDeletes = [];
  mockDelete = async (args) => { mockDeletes.push(args); return { id: args.id }; };
  now = at(6, 9, 0);
  jest.spyOn(Date, 'now').mockImplementation(() => now);
});
afterEach(() => { jest.restoreAllMocks(); });

test('no Delete on the list under any filter; on an open application it is in a card of its own, after the decision', async () => {
  const r = await renderScreen(<AdminScholarships bare />);
  for (const pill of ['New 1', 'Approved 1', 'Declined 1', 'All 3']) {
    await r.click(pill);
    expect(r.text()).not.toMatch(/delete/i);
  }
  await r.click('Sam Hart');
  const control = r.button(DELETE);
  expect([control.tagName, control.disabled]).toEqual(['BUTTON', false]);
  // The three decisions share a card; Delete is in another one, below them, under its own heading and sentence.
  const card = (el) => el.closest('div[style*="border-radius"]');
  const [approve, decline, reopen] = decisionButtons(r);
  expect(card(reopen).textContent).toContain('A label for your records.');
  expect(card(approve)).toBe(card(reopen));
  expect(card(decline)).toBe(card(reopen));
  expect(card(control)).not.toBe(card(reopen));
  expect(card(control).contains(reopen)).toBe(false);
  expect(follows(reopen, control)).toBe(true);
  expect(card(control).textContent).toContain(
    'For when a family asks you to delete their application. It cannot be undone, and copies emailed to the director are not deleted with it.'
  );
  // Nothing is asked, and nothing written, until it is tapped.
  expect(r.text()).not.toContain(ASKED);
  expect(mockDeletes).toEqual([]);
  await r.unmount();
});

test('the first tap writes nothing: it asks, with both warnings; keeping the application writes nothing either', async () => {
  const r = await renderScreen(<AdminScholarships bare />);
  await openAndAsk(r);
  expect(mockDeletes).toEqual([]);
  for (const line of [ASKED, PERMANENT, EMAILED]) expect(r.text()).toContain(line);
  // Two real buttons. The safe one comes first and holds the focus, so the first stop is never the destructive one.
  const [keep, confirm] = [r.button(KEEP), r.button(CONFIRM)];
  expect([keep.tagName, confirm.tagName]).toEqual(['BUTTON', 'BUTTON']);
  expect(follows(keep, confirm)).toBe(true);
  expect(document.activeElement).toBe(keep);
  // The decisions under the sheet are off: a keyboard could still reach them.
  expect(slots(r)).toEqual(ALL_OFF);
  await r.click(KEEP);
  expect(r.text()).not.toContain(ASKED);
  expect(r.button(CONFIRM)).toBeNull();
  expect([mockDeletes, mockDecisions]).toEqual([[], []]);
  // Still the application, as it was, and the focus is back on the control that asked.
  expect(r.text()).toContain('Sam tries hard');
  expect(slots(r)).toEqual(['Approve', 'Decline', 'Reopen (off)']);
  expect(document.activeElement).toBe(r.button(DELETE));
  await r.click('‹ Scholarships');
  for (const pill of ['New 1', 'Approved 1', 'Declined 1', 'All 3']) expect(r.button(pill)).not.toBeNull();
  await r.unmount();
});

test('a double tap on "Delete application" whose second tap lands on "Delete for good" deletes nothing: the question has to have been on screen', async () => {
  const r = await renderScreen(<AdminScholarships bare />);
  await r.click('Sam Hart');
  await r.click(DELETE);
  // The sheet opened under the finger: a tap on its confirm at once, and another just inside the half second.
  await r.click(CONFIRM);
  now += SETTLE_MS - 1;
  await r.click(CONFIRM);
  expect(mockDeletes).toEqual([]);
  // Still asking, with both answers live, and nothing said to have failed.
  expect(r.text()).toContain(ASKED);
  expect([r.button(KEEP).disabled, r.button(CONFIRM).disabled]).toEqual([false, false]);
  expect(r.text()).not.toMatch(/didn't/);
  expect(r.text()).toContain('Sam tries hard');
  // Read, then confirmed: one delete.
  now += 1;
  await r.click(CONFIRM);
  expect(mockDeletes).toStrictEqual([{ id: 'app-sam' }]);
  for (const pill of ['New 0', 'Approved 1', 'Declined 1', 'All 2']) expect(r.button(pill)).not.toBeNull();
  await r.unmount();
});

test('confirming deletes once, even on a double tap; then the list, with the application gone from every filter and count', async () => {
  const write = pendingDelete();
  const r = await renderScreen(<AdminScholarships bare />);
  await openAndAsk(r);
  const confirm = r.button(CONFIRM);
  await tap(confirm);
  await tap(confirm);
  // The id and nothing else: no version, no status - whatever is stored under it goes.
  expect(mockDeletes).toStrictEqual([{ id: 'app-sam' }]);
  // While it is being written, everything on this application is off: both answers, the control and the decisions.
  expect(confirm.textContent.trim()).toBe('Deleting');
  expect([confirm.disabled, r.button(KEEP).disabled, r.button(DELETE).disabled]).toEqual([true, true, true]);
  expect(slots(r)).toEqual(ALL_OFF);
  for (const label of ['Approve', 'Decline', 'Reopen', KEEP, DELETE]) await r.click(label);
  expect([mockDeletes.length, mockDecisions.length]).toEqual([1, 0]);
  expect(r.text()).toContain('Sam tries hard');
  await act(async () => { write.land(); });
  // Back on the list, on the filter it was left on, before any fresh read.
  expect(r.button('‹ Scholarships')).toBeNull();
  for (const pill of ['New 0', 'Approved 1', 'Declined 1', 'All 2']) expect(r.button(pill)).not.toBeNull();
  expect(r.text()).toContain('No new applications.');
  await r.click('All 2');
  expect(r.button('Sam Hart')).toBeNull();
  expect(r.text()).not.toMatch(/Sam Hart|didn't/);
  // The fresh read agrees, and the applications that are left can be decided and deleted again.
  mockScholarships = loaded([AVA, KAI]);
  await r.click('Ava Park');
  expect(r.button(DELETE).disabled).toBe(false);
  expect(slots(r)).toEqual(['Approve (off)', 'Decline', 'Reopen']);
  await r.click('‹ Scholarships');
  for (const pill of ['New 0', 'Approved 1', 'Declined 1', 'All 2']) expect(r.button(pill)).not.toBeNull();
  expect(mockDeletes).toHaveLength(1);
  await r.unmount();
});

test('a delete that fails changes nothing and says it did not delete; the application stays open and it can be tried again', async () => {
  mockDelete = async (args) => { mockDeletes.push(args); throw new Error('deleteScholarship: Missing or insufficient permissions.'); };
  const r = await renderScreen(<AdminScholarships bare />);
  await openAndAsk(r);
  await r.click(CONFIRM);
  expect(mockDeletes).toStrictEqual([{ id: 'app-sam' }]);
  expect(r.text()).toContain(NOT_DELETED);
  // The screen's own words: never the raw error, and no cause it does not know.
  expect(r.text()).not.toMatch(/permission|deleteScholarship|connection/i);
  // Still this application, with the question still up and both answers live again.
  expect(r.text()).toContain('Sam tries hard');
  expect(r.text()).toContain(ASKED);
  expect([r.button(KEEP).disabled, r.button(CONFIRM).disabled]).toEqual([false, false]);
  await r.click(KEEP);
  expect(slots(r)).toEqual(['Approve', 'Decline', 'Reopen (off)']);
  expect(r.button(DELETE).disabled).toBe(false);
  // Kept: the application's Delete card goes on saying it. The decision card, which had no part in it, says nothing.
  expect(r.text()).toContain(NOT_DELETED);
  expect(r.text()).not.toContain("decision didn't save");
  await r.click('‹ Scholarships');
  for (const pill of ['New 1', 'Approved 1', 'Declined 1', 'All 3']) expect(r.button(pill)).not.toBeNull();
  expect(r.button('Sam Hart')).not.toBeNull();
  // So does its row, and only its row.
  expect(r.button('Sam Hart').textContent).toContain("That didn't delete.");
  expect(r.text()).not.toContain("decision didn't save");
  await r.click('All 3');
  expect(r.text().match(/didn't/g)).toHaveLength(1);
  await r.click('New 1');
  // The retry lands: gone, and nothing says it failed.
  mockDelete = async (args) => { mockDeletes.push(args); return { id: args.id }; };
  await openAndAsk(r);
  expect(r.text()).not.toContain(NOT_DELETED);
  await r.click(CONFIRM);
  for (const pill of ['New 0', 'All 2']) expect(r.button(pill)).not.toBeNull();
  expect(r.text()).not.toMatch(/didn't/);
  await r.unmount();
});

test('an application already deleted in another tab: the delete is done, not an error', async () => {
  // The hook's delete is a plain one, so it resolves whether or not the document is still there
  // (hooks/scholarships.test.js); the read that follows it has no Sam, as the other tab left it.
  mockDelete = async (args) => { mockDeletes.push(args); mockScholarships = loaded([AVA, KAI]); return { id: args.id }; };
  const r = await renderScreen(<AdminScholarships bare />);
  await openAndAsk(r);
  await r.click(CONFIRM);
  expect(mockDeletes).toStrictEqual([{ id: 'app-sam' }]);
  expect(r.button('‹ Scholarships')).toBeNull();
  expect(r.text()).not.toMatch(/didn't|Sam Hart/);
  for (const pill of ['New 0', 'Approved 1', 'Declined 1', 'All 2']) expect(r.button(pill)).not.toBeNull();
  await r.unmount();
});

test('one write at a time: while a decision is being written Delete is off, on this application and on any other', async () => {
  let land;
  mockDecide = (args) => { mockDecisions.push(args); return new Promise((resolve) => { land = () => resolve(args); }); };
  const r = await renderScreen(<AdminScholarships bare />);
  await r.click('Sam Hart');
  await r.click('Approve');
  expect(r.button(DELETE).disabled).toBe(true);
  await r.click(DELETE);
  expect(r.text()).not.toContain(ASKED);
  await r.click('‹ Scholarships');
  await r.click('Approved 1');
  await r.click('Ava Park');
  expect(r.button(DELETE).disabled).toBe(true);
  await r.click(DELETE);
  expect(r.text()).not.toContain(ASKED);
  // The decision lands: Delete is live again, and asks.
  await act(async () => { land(); });
  expect(r.button(DELETE).disabled).toBe(false);
  await ask(r);
  expect(r.text()).toContain("Ava Park's application will be deleted from the portal. This cannot be undone.");
  expect(mockDeletes).toEqual([]);
  // Confirmed, it is Ava who goes - the open application, not the first on the list - and Sam, approved a moment ago, stays.
  await r.click(CONFIRM);
  expect(mockDeletes).toStrictEqual([{ id: 'app-ava' }]);
  for (const pill of ['New 0', 'Approved 1', 'Declined 1', 'All 2']) expect(r.button(pill)).not.toBeNull();
  expect(r.button('Ava Park')).toBeNull();
  expect(r.button('Sam Hart').textContent).toContain('Approved');
  await r.click('All 2');
  expect(r.button('Kai Roy')).not.toBeNull();
  expect(r.text()).not.toContain('Ava Park');
  await r.unmount();
});

test('the confirmation is asked about the open application only, and what the family typed is still only text in it', async () => {
  mockScholarships = loaded([{ ...SAM, athlete: '<img src=x onerror=alert(1)>' }, AVA, { ...KAI, athlete: '   ' }]);
  const r = await renderScreen(<AdminScholarships bare />);
  await openAndAsk(r, '<img src=x onerror=alert(1)>');
  expect(r.container.querySelector('img, script')).toBeNull();
  expect(r.text()).toContain("<img src=x onerror=alert(1)>'s application will be deleted from the portal. This cannot be undone.");
  // Left without answering: the next application opens with nothing asked.
  await r.click('‹ Scholarships');
  await r.click('Declined 1');
  await r.click('Application');
  expect(r.text()).not.toContain(ASKED);
  await r.click(DELETE);
  expect(r.text()).toContain('This application will be deleted from the portal. This cannot be undone.');
  expect(r.text()).toContain(EMAILED);
  expect(mockDeletes).toEqual([]);
  await r.unmount();
});

describe('with a route (openId, onOpen, onClose)', () => {
  // The route as PortalRoutes wires it: which application is open is the route's, and Back is one step of its history.
  function Routed({ calls }) {
    const [openId, setOpenId] = useState(null);
    return (
      <>
        <AdminScholarships bare openId={openId} onOpen={(id) => { calls.push(['open', id]); setOpenId(id); }} onClose={() => { calls.push(['close']); setOpenId(null); }} />
        <button type="button" onClick={() => setOpenId(null)}>phone back</button>
      </>
    );
  }

  test('a delete closes the open application the same way Back does: one step, and the route takes it', async () => {
    const calls = [];
    const r = await renderScreen(<Routed calls={calls} />);
    await r.click('Sam Hart');
    await r.click('‹ Scholarships');
    expect(calls).toEqual([['open', 'app-sam'], ['close']]);
    await openAndAsk(r);
    // Asking and keeping are the screen's own: the route hears nothing.
    await r.click(KEEP);
    await ask(r);
    expect(calls).toEqual([['open', 'app-sam'], ['close'], ['open', 'app-sam']]);
    await r.click(CONFIRM);
    expect(mockDeletes).toStrictEqual([{ id: 'app-sam' }]);
    expect(calls).toEqual([['open', 'app-sam'], ['close'], ['open', 'app-sam'], ['close']]);
    for (const pill of ['New 0', 'Approved 1', 'Declined 1', 'All 2']) expect(r.button(pill)).not.toBeNull();
    await r.unmount();
  });

  test('a route that has not moved yet still shows the list: the open id matches nothing once the application is deleted', async () => {
    const calls = [];
    const r = await renderScreen(<AdminScholarships bare openId="app-sam" onOpen={(id) => calls.push(['open', id])} onClose={() => calls.push(['close'])} />);
    await ask(r);
    await r.click(CONFIRM);
    expect(calls).toEqual([['close']]);
    expect(r.button('‹ Scholarships')).toBeNull();
    for (const pill of ['New 0', 'All 2']) expect(r.button(pill)).not.toBeNull();
    await r.unmount();
  });

  test('gone back while the delete was being written: it still leaves the list when it lands, and the route is not sent back a second step', async () => {
    const write = pendingDelete();
    const calls = [];
    const r = await renderScreen(<Routed calls={calls} />);
    await openAndAsk(r);
    await r.click(CONFIRM);
    await r.click('phone back');
    // The list, with Sam still on it and nothing live while the write is out.
    expect(r.button('New 1')).not.toBeNull();
    expect(r.button('Sam Hart')).not.toBeNull();
    await act(async () => { write.land(); });
    for (const pill of ['New 0', 'Approved 1', 'Declined 1', 'All 2']) expect(r.button(pill)).not.toBeNull();
    expect(calls).toEqual([['open', 'app-sam']]);
    await r.unmount();
  });

  test('gone back while the delete was being written, and it fails: nothing changed, and the row and the application say it did not delete', async () => {
    const write = pendingDelete();
    const calls = [];
    const r = await renderScreen(<Routed calls={calls} />);
    await openAndAsk(r);
    await r.click(CONFIRM);
    await r.click('phone back');
    // The sheet that would have said so went with the application. While the write is out the row says nothing yet.
    expect(r.text()).not.toContain(ASKED);
    expect(r.button('Sam Hart').textContent).not.toMatch(/didn't/);
    await act(async () => { write.fail(); });
    // Every count as it was, the route not moved, and Sam's row - only Sam's - says what happened, in the screen's words.
    for (const pill of ['New 1', 'Approved 1', 'Declined 1', 'All 3']) expect(r.button(pill)).not.toBeNull();
    expect(calls).toEqual([['open', 'app-sam']]);
    expect(r.button('Sam Hart').textContent).toContain("That didn't delete.");
    await r.click('All 3');
    expect(r.text().match(/didn't/g)).toHaveLength(1);
    expect(r.text()).not.toMatch(/decision didn't|offline|deleteScholarship/);
    // Opened again: its Delete card says it, nothing is asked, the decision card says nothing, and every control is live.
    await r.click('Sam Hart');
    expect(r.text()).toContain(NOT_DELETED);
    expect(r.text()).not.toContain(ASKED);
    expect(r.text()).not.toContain("decision didn't save");
    expect(slots(r)).toEqual(['Approve', 'Decline', 'Reopen (off)']);
    expect(r.button(DELETE).disabled).toBe(false);
    // Tried again, it lands: gone, and nothing says it failed.
    mockDelete = async (args) => { mockDeletes.push(args); return { id: args.id }; };
    await ask(r);
    expect(r.text()).not.toContain(NOT_DELETED);
    await r.click(CONFIRM);
    expect(mockDeletes).toStrictEqual([{ id: 'app-sam' }, { id: 'app-sam' }]);
    for (const pill of ['New 0', 'Approved 1', 'Declined 1', 'All 2']) expect(r.button(pill)).not.toBeNull();
    expect(r.text()).not.toMatch(/Sam Hart|didn't/);
    await r.unmount();
  });

  test('a decision on an application deleted in another tab: nothing is left to decide, and it leaves the screen as a delete does', async () => {
    // hooks/scholarships.js: the decision finds no document, writes nothing, rejects with reason 'gone' and reads the list again.
    mockDecide = async (args) => { mockDecisions.push(args); throw Object.assign(new Error('decideScholarship: no such application.'), { reason: 'gone' }); };
    const calls = [];
    const r = await renderScreen(<Routed calls={calls} />);
    await r.click('Sam Hart');
    await r.click('Approve');
    expect(mockDecisions).toHaveLength(1);
    expect(mockDeletes).toEqual([]);
    // Back on the list by the one step Back takes, the application gone from every count, and nothing calling it "still new".
    expect(calls).toEqual([['open', 'app-sam'], ['close']]);
    expect(r.button('‹ Scholarships')).toBeNull();
    for (const pill of ['New 0', 'Approved 1', 'Declined 1', 'All 2']) expect(r.button(pill)).not.toBeNull();
    await r.click('All 2');
    expect(r.text()).not.toMatch(/Sam Hart|didn't|still new|decideScholarship/);
    // The fresh read agrees, and the applications that are left can still be decided.
    mockScholarships = loaded([AVA, KAI]);
    mockDecide = async (args) => { mockDecisions.push(args); return args; };
    await r.click('Kai Roy');
    await r.click('Approve');
    expect(slots(r)).toEqual(['Approve (off)', 'Decline', 'Reopen']);
    expect(r.text()).not.toMatch(/didn't/);
    await r.unmount();
  });
});
