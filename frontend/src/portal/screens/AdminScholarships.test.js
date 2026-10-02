import React, { act } from 'react';
import { renderScreen } from './testRender';
import AdminScholarships from './AdminScholarships';

let mockScholarships;
let mockDecide;
let mockDecisions;
jest.mock('../hooks', () => ({ useScholarships: () => mockScholarships }));
jest.mock('../hooks/scholarships', () => ({ decideScholarship: (...args) => mockDecide(...args) }));
// Ages are counted on this day, whatever day the suite runs.
jest.mock('../data/calendar', () => ({ ...jest.requireActual('../data/calendar'), todayISO: () => '2026-10-01' }));

// Spelled in two halves so the lint rule against script URLs does not read these test strings as one.
const JS = ['java', 'script:'].join('');
const at = (day, hour, minute) => new Date(2026, 9, day, hour, minute).getTime();
const SAM = {
  id: 'app-sam', parent: 'Dana Hart', relationship: 'Parent', email: 'dana@example.com', phone: '612-555-0100', athlete: 'Sam Hart', dob: '2012-05-01',
  school: 'Lakeview Middle', grade: '8', average: '82.1', handicap: '11.4', events: 'State junior open, two county events', package: '12 tokens', level: 'Partial',
  need: 'One income this year.', statement: 'Sam tries hard, trains smart and backs his teammates.', season: '2026-27', status: 'new', submissions: 2,
  createdAtMs: at(1, 14, 5), updatedAtMs: at(3, 9, 0), email_status: 'sent', decidedAtMs: null,
};
const AVA = {
  id: 'app-ava', parent: 'Lee Park', relationship: 'Guardian', email: 'lee@example.com', phone: '(651) 555-0142', athlete: 'Ava Park', dob: '2010-11-20',
  school: '', grade: '', average: 'none yet', handicap: '', events: '', package: 'Elite', level: 'Full', need: '', statement: 'Ava wants to play college golf and works for it.',
  season: '2026-27', status: 'approved', submissions: 2, createdAtMs: at(1, 8, 0), updatedAtMs: at(2, 18, 30), email_status: 'failed', decidedBy: 'owner-1', decidedAtMs: at(2, 9, 0),
};
const KAI = {
  id: 'app-kai', parent: 'Jo Roy', relationship: 'Other', email: 'jo@example.com', phone: '763-555-0177', athlete: 'Kai Roy', dob: '2009-01-15',
  school: 'North High', grade: '11', average: '77', handicap: '6', events: '', package: 'Not sure yet', level: 'Partial', need: '', statement: 'Kai shows up early and stays late, every week.',
  season: '2026-27', status: 'declined', submissions: 1, createdAtMs: at(1, 7, 0), updatedAtMs: at(1, 7, 0), email_status: 'sent', decidedBy: 'owner-1', decidedAtMs: at(1, 12, 0),
};
// The hook's own order: newest first by the latest time the family sent it.
const loaded = (rows) => ({ loading: false, error: null, data: { rows, counts: {} } });
// A decision as the screen hands it to the hook: the status, and the version of the application that was on screen.
const decision = (app, status) => ({ id: app.id, status, updatedAtMs: app.updatedAtMs });
// The decision buttons in the order they sit on the page ("Approving" and the like while one is being written).
const DECISION_LABELS = ['Approve', 'Decline', 'Reopen', 'Approving', 'Declining', 'Reopening'];
const decisionButtons = (r) => [...r.container.querySelectorAll('button')].filter((b) => DECISION_LABELS.includes(b.textContent.trim()));
const slots = (r) => decisionButtons(r).map((b) => `${b.textContent.trim()}${b.disabled ? ' (off)' : ''}`);

beforeEach(() => {
  mockScholarships = loaded([SAM, AVA, KAI]);
  mockDecisions = [];
  mockDecide = async (args) => { mockDecisions.push(args); return args; };
});

test('loading: says so, and nothing else', async () => {
  mockScholarships = { loading: true, error: null, data: null };
  const r = await renderScreen(<AdminScholarships bare />);
  expect(r.text()).toContain('Scholarships');
  expect(r.text()).toContain('Loading applications…');
  expect(r.text()).not.toContain('No applications');
  await r.unmount();
});

test('a load error says so and offers the retry the route wires', async () => {
  mockScholarships = { loading: false, error: new Error('fetchScholarshipApplications: Missing or insufficient permissions.'), data: null };
  const retried = [];
  const r = await renderScreen(<AdminScholarships bare onRetry={() => retried.push(1)} />);
  expect(r.text()).toContain("Applications didn't load");
  expect(r.text()).not.toMatch(/permission|fetchScholarship/i);
  expect(r.text()).not.toContain('No applications');
  await r.click('Try again');
  expect(retried).toEqual([1]);
  await r.unmount();
  // No retry wired: no dead button.
  const bare = await renderScreen(<AdminScholarships bare />);
  expect(bare.button('Try again')).toBeNull();
  await bare.unmount();
});

test('an empty list (and seed mode, which is one) is an honest "none yet"', async () => {
  mockScholarships = loaded([]);
  const r = await renderScreen(<AdminScholarships bare />);
  expect(r.text()).toContain('No applications yet.');
  for (const pill of ['New 0', 'Approved 0', 'Declined 0', 'All 0']) expect(r.button(pill)).not.toBeNull();
  await r.unmount();
});

test('an empty filter names the filter', async () => {
  mockScholarships = loaded([AVA]);
  const r = await renderScreen(<AdminScholarships bare />);
  expect(r.text()).toContain('No new applications.');
  expect(r.text()).not.toContain('Ava Park');
  await r.click('Declined 0');
  expect(r.text()).toContain('No declined applications.');
  await r.click('Approved 1');
  expect(r.text()).toContain('Ava Park');
  await r.unmount();
});

test('filters with counts open on New; each row carries the athlete, age, request, guardian, when and status', async () => {
  const left = [];
  const r = await renderScreen(<AdminScholarships bare onBack={() => left.push(1)} />);
  for (const pill of ['New 1', 'Approved 1', 'Declined 1', 'All 3']) expect(r.button(pill)).not.toBeNull();
  expect(r.text()).toContain('Sam Hart · 14');
  expect(r.text()).toContain('12 tokens · Partial assistance');
  expect(r.text()).toContain('Dana Hart · Parent');
  expect(r.text()).toContain('Sent again Sat, Oct 3, 2026 · 9:00 AM');
  expect(r.text()).not.toContain('Ava Park');
  expect(r.text()).not.toContain('Kai Roy');
  await r.click('All 3');
  // Newest first, as the hook hands them over.
  const order = ['Sam Hart · 14', 'Ava Park · 15', 'Kai Roy · 17'].map((line) => r.text().indexOf(line));
  expect(order.every((i) => i >= 0)).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  expect(r.text()).toContain('Elite · Full assistance');
  expect(r.text()).toContain('Package not chosen · Partial assistance');
  expect(r.text()).toContain('Sent Thu, Oct 1, 2026 · 7:00 AM');
  // Ava's family sent it again after it was approved; Kai's has not moved since it was declined.
  expect(r.text().match(/Updated since your decision/g)).toHaveLength(1);
  expect(r.button('Ava Park').textContent).toContain('Updated since your decision');
  expect(r.button('Ava Park').textContent).toContain('Approved');
  expect(r.button('Kai Roy').textContent).toContain('Declined');
  await r.click('‹ Admin');
  expect(left).toEqual([1]);
  await r.unmount();
});

test('opening a row shows the whole application, with contact as mailto: and tel: links', async () => {
  const left = [];
  const r = await renderScreen(<AdminScholarships bare onBack={() => left.push(1)} />);
  await r.click('Sam Hart');
  for (const line of [
    'Sam Hart', '12 tokens', 'Partial', 'Sat, Oct 3, 2026 · 9:00 AM', 'Sent 2 times', 'first on Thu, Oct 1, 2026 · 2:05 PM', 'Email to the director', '2012-05-01 · age 14',
    'Lakeview Middle', '82.1', '11.4', 'State junior open, two county events', 'Dana Hart · Parent', 'dana@example.com', '612-555-0100',
    'One income this year.', 'Sam tries hard, trains smart and backs his teammates.',
  ]) expect(r.text()).toContain(line);
  const links = [...r.container.querySelectorAll('a')].map((a) => [a.getAttribute('href'), a.textContent]);
  expect(links).toEqual([['mailto:dana@example.com', 'dana@example.com'], ['tel:6125550100', '612-555-0100']]);
  // Each contact link is a full 44px touch target, taken back out of the layout by its margins.
  for (const a of r.container.querySelectorAll('a')) {
    expect([a.style.display, a.style.minHeight, a.style.marginTop, a.style.marginBottom]).toEqual(['inline-flex', '44px', '-12.25px', '-12.25px']);
  }
  // New: it can be approved or declined, and there is nothing to reopen.
  expect(slots(r)).toEqual(['Approve', 'Decline', 'Reopen (off)']);
  // Back goes to the list, not out of the screen.
  await r.click('‹ Scholarships');
  expect(left).toEqual([]);
  expect(r.button('New 1')).not.toBeNull();
  // What the family left blank reads "Not given"; a failed director email reads "Not sent".
  await r.click('Approved 1');
  await r.click('Ava Park');
  expect(r.text()).toContain('Not sent');
  expect(r.text().match(/Not given/g)).toHaveLength(5); // school, grade, handicap, events, family situation
  expect(r.text()).toContain('Updated since your decision');
  await r.unmount();
});

test('what an applicant typed is only ever text: no markup, no script link, no injected mail header', async () => {
  const hostile = {
    ...SAM, athlete: '<img src=x onerror=alert(1)>', parent: '<script>alert(2)</script>', email: `${JS}alert(3)`, phone: `${JS}alert(4)`,
    school: '<a href="https://evil.example">school</a>', statement: 'Line one\n<b>bold</b> <iframe src="https://evil.example"></iframe>', need: '"><svg onload=alert(5)>',
  };
  mockScholarships = loaded([hostile, { ...AVA, status: 'new', email: 'lee@example.com?bcc=x@evil.example', phone: '651-555-0142,,,900' },
    { ...KAI, status: 'new', email: 'jo@example.com?subject=Hi&body=x', phone: '763-555-0177;ext=9' }]);
  const r = await renderScreen(<AdminScholarships bare />);
  expect(r.container.querySelector('img, script, iframe, svg, b')).toBeNull();
  expect(r.text()).toContain('<img src=x onerror=alert(1)>');
  await r.click('<img src=x onerror=alert(1)>');
  expect(r.container.querySelector('img, script, iframe, svg, b, a')).toBeNull();
  for (const typed of ['<script>alert(2)</script>', `${JS}alert(3)`, `${JS}alert(4)`, '<a href="https://evil.example">school</a>', '<b>bold</b>', '"><svg onload=alert(5)>']) {
    expect(r.text()).toContain(typed);
  }
  await r.click('‹ Scholarships');
  await r.click('Ava Park');
  // A second address in the query is not an address at all: text, no link. The pause-and-dial tail is never dialled.
  expect([...r.container.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['tel:6515550142']);
  expect(r.text()).toContain('lee@example.com?bcc=x@evil.example');
  await r.click('‹ Scholarships');
  await r.click('Kai Roy');
  expect([...r.container.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['mailto:jo@example.com%3Fsubject%3DHi%26body%3Dx', 'tel:7635550177']);
  await r.unmount();
});

test('approve, decline and reopen each write that decision and the row moves with it', async () => {
  const r = await renderScreen(<AdminScholarships bare />);
  await r.click('Sam Hart');
  await r.click('Approve');
  expect(mockDecisions).toEqual([decision(SAM, 'approved')]);
  expect(r.text()).not.toContain("didn't save");
  // Approved now: the two other moves are on offer, each where it was.
  expect(slots(r)).toEqual(['Approve (off)', 'Decline', 'Reopen']);
  await r.click('Decline');
  expect(slots(r)).toEqual(['Approve', 'Decline (off)', 'Reopen']);
  await r.click('Reopen');
  expect(mockDecisions).toEqual([decision(SAM, 'approved'), decision(SAM, 'declined'), decision(SAM, 'new')]);
  expect(slots(r)).toEqual(['Approve', 'Decline', 'Reopen (off)']);
  await r.click('Decline');
  await r.click('‹ Scholarships');
  // The list and its counts follow: Sam left New for Declined.
  for (const pill of ['New 0', 'Approved 1', 'Declined 2', 'All 3']) expect(r.button(pill)).not.toBeNull();
  expect(r.text()).toContain('No new applications.');
  await r.click('Declined 2');
  expect(r.button('Sam Hart').textContent).toContain('Declined');
  // Reopening Ava drops her decision, so nothing is "updated since" it any more.
  await r.click('Approved 1');
  await r.click('Ava Park');
  await r.click('Reopen');
  await r.click('‹ Scholarships');
  await r.click('New 1');
  expect(r.button('Ava Park').textContent).not.toContain('Updated since your decision');
  await r.unmount();
});

test('a decision that fails: the application keeps its status and says it did not save', async () => {
  mockDecide = async (args) => { mockDecisions.push(args); throw new Error('decideScholarship: Missing or insufficient permissions.'); };
  const r = await renderScreen(<AdminScholarships bare />);
  await r.click('Sam Hart');
  await r.click('Approve');
  expect(mockDecisions).toEqual([decision(SAM, 'approved')]);
  expect(r.text()).toContain("That decision didn't save. This application is still new. Try again.");
  expect(r.text()).not.toMatch(/permission|decideScholarship/i);
  // The cause is not known here, so the note names none.
  expect(r.text()).not.toMatch(/connection/i);
  // Still new: the same two moves, and it can be tried again.
  expect(slots(r)).toEqual(['Approve', 'Decline', 'Reopen (off)']);
  await r.click('‹ Scholarships');
  for (const pill of ['New 1', 'Approved 1', 'Declined 1']) expect(r.button(pill)).not.toBeNull();
  expect(r.button('Sam Hart').textContent).toContain('New');
  expect(r.button('Sam Hart').textContent).toContain("Your decision didn't save.");
  // The retry lands: the note goes and the row moves.
  mockDecide = async (args) => { mockDecisions.push(args); return args; };
  await r.click('Sam Hart');
  await r.click('Approve');
  expect(r.text()).not.toContain("didn't save");
  await r.click('‹ Scholarships');
  expect(r.button('New 0')).not.toBeNull();
  expect(r.text()).not.toContain("didn't save");
  await r.unmount();
});

test('while a decision is being written, no button takes a second tap - on this application or on another', async () => {
  let land;
  mockDecide = (args) => { mockDecisions.push(args); return new Promise((resolve) => { land = () => resolve(args); }); };
  const r = await renderScreen(<AdminScholarships bare />);
  await r.click('Sam Hart');
  await r.click('Approve');
  expect(r.button('Approving').disabled).toBe(true);
  expect(r.button('Decline').disabled).toBe(true);
  expect(slots(r)).toEqual(['Approving (off)', 'Decline (off)', 'Reopen (off)']);
  await r.click('Decline');
  expect(mockDecisions).toHaveLength(1);
  // Another application opened meanwhile: its buttons are off too, not live-looking buttons that swallow the tap.
  await r.click('‹ Scholarships');
  await r.click('Approved 1');
  await r.click('Ava Park');
  expect(slots(r)).toEqual(['Approve (off)', 'Decline (off)', 'Reopen (off)']);
  for (const label of ['Decline', 'Reopen']) await r.click(label);
  expect(mockDecisions).toHaveLength(1);
  // The write lands: Ava's buttons come back, and Sam's show the decision.
  await act(async () => { land(); });
  expect(slots(r)).toEqual(['Approve (off)', 'Decline', 'Reopen']);
  await r.click('‹ Scholarships');
  await r.click('Sam Hart');
  expect(r.button('Decline').disabled).toBe(false);
  expect(slots(r)).toEqual(['Approve (off)', 'Decline', 'Reopen']);
  await r.unmount();
});

test('a second tap that arrives just after a decision lands writes nothing: no button moves or changes meaning', async () => {
  const r = await renderScreen(<AdminScholarships bare />);
  await r.click('Sam Hart');
  const first = decisionButtons(r);
  const [approve, decline, reopen] = first;
  const tap = async (b) => { await act(async () => { b.click(); }); };
  const wrote = () => mockDecisions.map((d) => d.status);
  // The very same three elements, in the same order: nothing is swapped in under a second tap.
  const unmoved = () => {
    const now = decisionButtons(r);
    return now.length === 3 && now.every((b, i) => b === first[i]);
  };
  expect(first).toHaveLength(3);
  // Approve, and the same button again once the write has landed (a double tap, or a tap on a spinner that looked stuck).
  await tap(approve);
  await tap(approve);
  expect(wrote()).toEqual(['approved']);
  expect(unmoved()).toBe(true);
  expect(slots(r)).toEqual(['Approve (off)', 'Decline', 'Reopen']);
  await tap(decline);
  await tap(decline);
  expect(wrote()).toEqual(['approved', 'declined']);
  expect(unmoved()).toBe(true);
  expect(slots(r)).toEqual(['Approve', 'Decline (off)', 'Reopen']);
  await tap(reopen);
  await tap(reopen);
  expect(wrote()).toEqual(['approved', 'declined', 'new']);
  expect(unmoved()).toBe(true);
  expect(slots(r)).toEqual(['Approve', 'Decline', 'Reopen (off)']);
  await r.unmount();
});

test('the family sent it again while it was open: the decision is refused, says why, and the application keeps its status', async () => {
  mockDecide = async (args) => { mockDecisions.push(args); throw Object.assign(new Error('decideScholarship: the application was sent again after it was read.'), { reason: 'resubmitted' }); };
  const r = await renderScreen(<AdminScholarships bare />);
  await r.click('Sam Hart');
  await r.click('Approve');
  expect(mockDecisions).toEqual([decision(SAM, 'approved')]);
  expect(r.text()).toContain("That decision didn't save. The family sent this again while you had it open, and it is still new. Read it again, then decide.");
  expect(r.text()).not.toMatch(/decideScholarship|Try again/);
  expect(slots(r)).toEqual(['Approve', 'Decline', 'Reopen (off)']);
  // The hook reads again; the new answers replace the old ones under the same note, and that version can be decided.
  const again = { ...SAM, statement: 'Sam rewrote this after his best round of the year.', submissions: 3, updatedAtMs: at(5, 9, 0) };
  mockScholarships = loaded([again, AVA, KAI]);
  mockDecide = async (args) => { mockDecisions.push(args); return args; };
  await r.click('‹ Scholarships');
  expect(r.button('Sam Hart').textContent).toContain("Your decision didn't save.");
  expect(r.button('Sam Hart').textContent).toContain('New');
  await r.click('Sam Hart');
  expect(r.text()).toContain('Sam rewrote this');
  expect(r.text()).toContain('The family sent this again while you had it open');
  await r.click('Decline');
  expect(mockDecisions[1]).toEqual(decision(again, 'declined'));
  expect(r.text()).not.toContain("didn't save");
  expect(slots(r)).toEqual(['Approve', 'Decline (off)', 'Reopen']);
  await r.unmount();
});

test('a reload that fails after a decision saved keeps the application open; the load error waits on the list', async () => {
  const retried = [];
  // The write lands, the hook reads again, and that read fails.
  mockDecide = async (args) => {
    mockDecisions.push(args);
    mockScholarships = { loading: false, error: new Error('fetchScholarshipApplications: offline'), data: null };
    return args;
  };
  const r = await renderScreen(<AdminScholarships bare onRetry={() => retried.push(1)} />);
  await r.click('Sam Hart');
  await r.click('Approve');
  expect(mockDecisions).toEqual([decision(SAM, 'approved')]);
  // Still the application, as it was saved: no load error over it, nothing saying the decision failed.
  expect(r.text()).toContain('Sam tries hard');
  expect(r.text()).not.toContain("didn't load");
  expect(r.text()).not.toContain("didn't save");
  expect(slots(r)).toEqual(['Approve (off)', 'Decline', 'Reopen']);
  // Back on the list the failed read says so, and its retry is the route's.
  await r.click('‹ Scholarships');
  expect(r.text()).toContain("Applications didn't load");
  expect(r.text()).not.toContain('Sam tries hard');
  await r.click('Try again');
  expect(retried).toEqual([1]);
  mockScholarships = loaded([{ ...SAM, status: 'approved', decidedBy: 'owner-1', decidedAtMs: at(4, 9, 0) }, AVA, KAI]);
  await r.click('Approved');
  for (const pill of ['New 0', 'Approved 2', 'Declined 1', 'All 3']) expect(r.button(pill)).not.toBeNull();
  await r.unmount();
});

test("with a route: opening and closing an application are the route's to do, and it says which one is open", async () => {
  const calls = [];
  const routed = (openId) => <AdminScholarships bare openId={openId} onOpen={(id) => calls.push(['open', id])} onClose={() => calls.push(['close'])} />;
  const list = await renderScreen(routed(null));
  await list.click('Sam Hart');
  // The screen opened nothing itself: the route's history entry decides.
  expect(calls).toEqual([['open', 'app-sam']]);
  expect(list.button('‹ Scholarships')).toBeNull();
  await list.unmount();
  const detail = await renderScreen(routed('app-sam'));
  expect(detail.text()).toContain('Sam tries hard');
  await detail.click('‹ Scholarships');
  expect(calls).toEqual([['open', 'app-sam'], ['close']]);
  await detail.unmount();
  // An id that matches nothing (a stale history entry) is just the list.
  const stale = await renderScreen(routed('app-gone'));
  expect(stale.button('New 1')).not.toBeNull();
  await stale.unmount();
});

test('the list reloading after a decision keeps the open application on screen, then shows what was stored', async () => {
  const r = await renderScreen(<AdminScholarships bare />);
  await r.click('Sam Hart');
  await r.click('Approve');
  // The hook reads again (data: null while it does): no flash back to the list or to "Loading".
  mockScholarships = { loading: true, error: null, data: null };
  await r.click('Decline');
  expect(r.text()).not.toContain('Loading applications…');
  expect(r.text()).toContain('Sam tries hard');
  expect(slots(r)).toEqual(['Approve', 'Decline (off)', 'Reopen']);
  // The fresh read is the truth, whatever this screen assumed.
  mockScholarships = loaded([{ ...SAM, status: 'approved', decidedBy: 'owner-1', decidedAtMs: at(4, 9, 0) }, AVA, KAI]);
  await r.click('‹ Scholarships');
  for (const pill of ['New 0', 'Approved 2', 'Declined 1']) expect(r.button(pill)).not.toBeNull();
  await r.unmount();
});
