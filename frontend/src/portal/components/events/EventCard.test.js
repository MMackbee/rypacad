/**
 * The workshop card (hq card 5), through the real hook with only Firestore, the signed-in user and isLive
 * faked: nothing in seed and practice modes and on a failed read; the words and buttons of each state in the
 * table; a tap on "I'm coming" writes the sign-up and shows Join; a late arrival; take-back; a failed write
 * says so; a double tap sends one write; a link that is not https shows no Join; text from the documents is
 * text, never HTML; every button is at least 44 px tall and the status lines are live regions.
 * Plain functions, not jest.fn(): CRA's resetMocks would clear them.
 */
jest.mock('firebase/firestore', () => ({
  collection: (db, name) => ({ col: name }),
  doc: (db, col, id) => ({ col, id }),
  query: (ref, ...parts) => ({ col: ref.col, where: parts.filter((p) => p && p.kind === 'where') }),
  where: (field, op, value) => ({ kind: 'where', field, op, value }),
  serverTimestamp: () => 'SERVER_TIME',
  getDocs: async (q) => {
    if (mockFail === q.col) throw new Error('denied');
    return { docs: Object.entries(mockStore[q.col]).filter(([, d]) => q.where.every((w) => d[w.field] === w.value)).map(([id, d]) => ({ id, data: () => d })) };
  },
  getDoc: async (ref) => {
    if (mockFail === ref.col) throw new Error('denied');
    if (mockHoldLink && ref.col === 'eventLinks') await mockHoldLink;
    const d = mockStore[ref.col][ref.id];
    return { exists: () => d !== undefined, data: () => d };
  },
  setDoc: async (ref, data) => {
    mockWrites.push(['set', `${ref.col}/${ref.id}`, data]);
    if (mockHold) await mockHold;
    if (mockFail === 'setDoc') throw new Error('offline');
    mockStore[ref.col][ref.id] = data;
  },
  deleteDoc: async (ref) => {
    mockWrites.push(['delete', `${ref.col}/${ref.id}`]);
    delete mockStore[ref.col][ref.id];
  },
}));
jest.mock('../../hooks/live', () => ({
  ...jest.requireActual('../../hooks/live'),
  isLive: () => mockLive,
  requireUser: () => ({ uid: 'u-probe', getIdTokenResult: async () => ({ claims: { email: 'probe@example.com' } }) }),
}));

let mockLive;
let mockStore;
let mockFail;
let mockWrites;
let mockHold;
let mockHoldLink;
const LINK = 'https://example.com/workshop-link-placeholder';
// Monday Nov 23 2026, 8:00 to 8:45 PM Central.
const START = Date.UTC(2026, 10, 24, 2, 0, 0);
const END = START + 45 * 60000;
const event = (over = {}) => ({ enabled: true, title: 'RYP Academy Parent Workshop 1 of 4', summary: 'A short text about the evening.', startsAt: new Date(START), endsAt: new Date(END), ...over });
const signedUp = () => ({ eventId: 'e1', uid: 'u-probe', email: 'probe@example.com', name: 'Probe Person', createdAt: new Date(0) });

import React, { act } from 'react';
import { renderScreen } from '../../screens/testRender';
import EventCard from './EventCard';
import { DEFAULT_NOTICE, NEW_TAB_HINT, NO_LINK_YET, WRITE_FAILED } from '../../data/events';

beforeEach(() => {
  jest.useFakeTimers('modern');
  jest.setSystemTime(START - 86400000);
  mockLive = true;
  mockFail = null;
  mockWrites = [];
  mockHold = null;
  mockHoldLink = null;
  mockStore = { events: { e1: event() }, eventSignups: {}, eventLinks: { e1: { meetUrl: LINK } }, users: { 'u-probe': { role: 'parent', displayName: 'Probe Person' } } };
});
afterEach(() => { jest.useRealTimers(); });

const render = (props) => renderScreen(<EventCard {...props} />);
// The label a person sees: the hidden "(opens in a new tab)" is tested on its own.
const labelOf = (el) => el.textContent.replace(NEW_TAB_HINT, '').trim();
const buttons = (c) => [...c.querySelectorAll('button, a')].map(labelOf);
const find = (c, label) => [...c.querySelectorAll('button, a')].find((b) => labelOf(b) === label);
const tap = (el) => act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

test('seed mode and the walkthrough show nothing at all', async () => {
  mockLive = false;
  const a = await render();
  expect(a.container.textContent).toBe('');
  mockLive = true;
  const b = await render({ practice: true });
  expect(b.container.textContent).toBe('');
});

test('a failed read shows nothing and no error', async () => {
  mockFail = 'events';
  const a = await render();
  expect(a.container.textContent).toBe('');
  mockFail = 'eventSignups';
  const b = await render();
  expect(b.container.textContent).toBe('');
});

test('a disabled event shows nothing', async () => {
  mockStore.events.e1 = event({ enabled: false });
  const a = await render();
  expect(a.container.textContent).toBe('');
});

test('not signed up, the day before: the card, the time line, the summary, the invite and the notice, one "I\'m coming"', async () => {
  const { container } = await render();
  const text = container.textContent;
  expect(text).toContain('Academy event');
  expect(text).toContain('RYP Academy Parent Workshop 1 of 4');
  expect(text).toContain('Mon, Nov 23 · 8:00 to 8:45 PM Central');
  expect(text).toContain('A short text about the evening.');
  expect(text).toContain('Tap "I\'m coming" and the Google Meet link will show here on Monday.');
  expect(text).toContain(DEFAULT_NOTICE);
  expect(buttons(container)).toEqual(["I'm coming"]);
});

test('on the day, before the start: "before we start"', async () => {
  jest.setSystemTime(START - 3600000);
  const { container } = await render();
  expect(container.textContent).toContain('will show here before we start.');
});

test('started, not signed up: "happening now"', async () => {
  jest.setSystemTime(START + 60000);
  const { container } = await render();
  expect(container.textContent).toContain('Happening now. Tap "I\'m coming" to get the Google Meet link.');
  expect(buttons(container)).toEqual(["I'm coming"]);
});

test('signed up, link set: "You\'re in.", Join as a new-tab link, "I can\'t come" until the start', async () => {
  mockStore.eventSignups[`e1_u-probe`] = signedUp();
  const { container } = await render();
  expect(container.textContent).toContain("You're in.");
  const join = find(container, 'Join on Google Meet');
  expect(join.tagName).toBe('A');
  expect(join.getAttribute('href')).toBe(LINK);
  expect(join.getAttribute('target')).toBe('_blank');
  expect(join.getAttribute('rel')).toBe('noopener noreferrer');
  expect(buttons(container)).toEqual(['Join on Google Meet', "I can't come"]);
  jest.setSystemTime(START + 1000);
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(buttons(container)).toEqual(['Join on Google Meet']);
});

test('signed up, no link yet, before the start: the line and "I can\'t come"', async () => {
  mockStore.eventSignups[`e1_u-probe`] = signedUp();
  delete mockStore.eventLinks.e1;
  const { container } = await render();
  expect(container.textContent).toContain("You're in. The link appears here on Monday.");
  expect(buttons(container)).toEqual(["I can't come"]);
});

test('signed up, no link, started: the "not here yet" line and "Check for the link", which finds it', async () => {
  jest.setSystemTime(START + 60000);
  mockStore.eventSignups[`e1_u-probe`] = signedUp();
  delete mockStore.eventLinks.e1;
  const { container } = await render();
  expect(container.textContent).toContain("You're in. The link isn't here yet. Check again in a minute.");
  expect(buttons(container)).toEqual(['Check for the link']);
  mockStore.eventLinks.e1 = { meetUrl: LINK };
  await tap(find(container, 'Check for the link'));
  expect(buttons(container)).toEqual(['Join on Google Meet']);
});

test('a link that is not https shows no Join', async () => {
  jest.setSystemTime(START + 60000);
  mockStore.eventSignups[`e1_u-probe`] = signedUp();
  mockStore.eventLinks.e1 = { meetUrl: 'http://example.com/not-secure' };
  const { container } = await render();
  expect(buttons(container)).toEqual(['Check for the link']);
  expect(container.querySelector('a')).toBeNull();
});

test('tapping "I\'m coming" writes the sign-up and shows Join', async () => {
  const { container } = await render();
  await tap(find(container, "I'm coming"));
  expect(mockWrites).toEqual([['set', 'eventSignups/e1_u-probe', { eventId: 'e1', uid: 'u-probe', email: 'probe@example.com', name: 'Probe Person', createdAt: 'SERVER_TIME' }]]);
  expect(buttons(container)).toEqual(['Join on Google Meet', "I can't come"]);
});

test('a late arrival: after the start, one tap and Join is there at once', async () => {
  jest.setSystemTime(START + 15 * 60000);
  const { container } = await render();
  await tap(find(container, "I'm coming"));
  expect(find(container, 'Join on Google Meet').getAttribute('href')).toBe(LINK);
});

test('taking it back returns the invite', async () => {
  mockStore.eventSignups[`e1_u-probe`] = signedUp();
  const { container } = await render();
  await tap(find(container, "I can't come"));
  expect(mockWrites).toEqual([['delete', 'eventSignups/e1_u-probe']]);
  expect(buttons(container)).toEqual(["I'm coming"]);
});

test('a failed write says so under the button and leaves the card as it was', async () => {
  mockFail = 'setDoc';
  const { container } = await render();
  await tap(find(container, "I'm coming"));
  expect(container.textContent).toContain(WRITE_FAILED);
  expect(buttons(container)).toEqual(["I'm coming"]);
  mockFail = null;
  await tap(find(container, "I'm coming"));
  expect(container.textContent).not.toContain(WRITE_FAILED);
});

test('a double tap sends one write and the button is disabled while it runs', async () => {
  let release;
  mockHold = new Promise((r) => { release = r; });
  const { container } = await render();
  const button = find(container, "I'm coming");
  await tap(button);
  await tap(button);
  expect(mockWrites).toHaveLength(1);
  expect(find(container, "I'm coming").disabled).toBe(true);
  await act(async () => { release(); });
  expect(mockWrites).toHaveLength(1);
});

test('after the end the card goes, by timer', async () => {
  jest.setSystemTime(END - 1000);
  const { container } = await render();
  expect(buttons(container)).toEqual(["I'm coming"]);
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(container.textContent).toBe('');
});

test('after the end with a recording address: the title and "Watch the recording" for a family that never signed up', async () => {
  jest.setSystemTime(END + 3600000);
  mockStore.events.e1 = event({ recordingUrl: 'https://example.com/recording-placeholder' });
  const { container } = await render();
  expect(container.textContent).toContain('RYP Academy Parent Workshop 1 of 4');
  expect(container.textContent).not.toContain('Central');
  expect(container.textContent).not.toContain(DEFAULT_NOTICE);
  const watch = find(container, 'Watch the recording');
  expect(watch.getAttribute('href')).toBe('https://example.com/recording-placeholder');
  expect(watch.getAttribute('target')).toBe('_blank');
  expect(watch.getAttribute('rel')).toBe('noopener noreferrer');
  expect(buttons(container)).toEqual(['Watch the recording']);
});

test('the notice is the document\'s own words when it has them', async () => {
  mockStore.events.e1 = event({ notice: 'Bring a notebook.' });
  const { container } = await render();
  expect(container.textContent).toContain('Bring a notebook.');
  expect(container.textContent).not.toContain(DEFAULT_NOTICE);
});

test('text from the document is text, never HTML', async () => {
  mockStore.events.e1 = event({ title: '<img src=x onerror=alert(1)>Workshop', summary: '<b>bold</b>' });
  const { container } = await render();
  expect(container.querySelector('img')).toBeNull();
  expect(container.querySelector('b')).toBeNull();
  expect(container.textContent).toContain('<img src=x onerror=alert(1)>Workshop');
});

test('two events get a card each, earliest start first', async () => {
  mockStore.events.e0 = event({ title: 'Earlier one', startsAt: new Date(START - 12 * 3600000), endsAt: new Date(END - 12 * 3600000) });
  const { container } = await render();
  const text = container.textContent;
  expect(text.indexOf('Earlier one')).toBeGreaterThan(-1);
  expect(text.indexOf('Earlier one')).toBeLessThan(text.indexOf('RYP Academy Parent Workshop'));
  expect(buttons(container)).toEqual(["I'm coming", "I'm coming"]);
});

test('every button and link is at least 44 px tall, and the status lines are live regions', async () => {
  mockStore.eventSignups[`e1_u-probe`] = signedUp();
  const { container } = await render();
  const els = [...container.querySelectorAll('button, a')];
  expect(els.length).toBeGreaterThanOrEqual(2);
  for (const el of els) expect(parseInt(el.style.minHeight || el.style.height, 10)).toBeGreaterThanOrEqual(44);
  const live = container.querySelector('[role="status"]');
  expect(live).not.toBeNull();
  expect(live.textContent).toContain("You're in.");
});

describe("the design reviewer's round (fix round 3)", () => {
  const holdWrites = () => {
    let release;
    mockHold = new Promise((r) => { release = r; });
    return release;
  };
  const spinner = (el) => el.querySelector('[aria-hidden="true"]');

  test("while a check runs the tapped button keeps the app's loading look and only the others are disabled", async () => {
    mockStore.eventSignups['e1_u-probe'] = signedUp();
    jest.setSystemTime(START - 3600000);
    delete mockStore.eventLinks.e1;
    const { container } = await render();
    expect(buttons(container).sort()).toEqual(['Check for the link', "I can't come"]);
    const check = find(container, 'Check for the link');
    const back = find(container, "I can't come");
    let release;
    mockHoldLink = new Promise((r) => { release = r; });
    await tap(check);
    // The tapped one has the spinner and the label's own ink; the other has the disabled look.
    expect(spinner(check)).not.toBeNull();
    expect(spinner(back)).toBeNull();
    expect(back.disabled).toBe(true);
    expect(check.style.color).not.toBe(back.style.color);
    await act(async () => { release(); });
  });

  test("\"I'm coming\" while it saves has a spinner and the secondary look's own ink", async () => {
    const release = holdWrites();
    const { container } = await render();
    const come = find(container, "I'm coming");
    const ink = come.style.color;
    await tap(come);
    expect(spinner(come)).not.toBeNull();
    expect(come.style.color).toBe(ink);
    await act(async () => { release(); });
  });

  test("\"I'm coming\" and \"Watch the recording\" are quiet; only \"Join on Google Meet\" keeps the fill and the glow", async () => {
    const a = await render();
    const come = find(a.container, "I'm coming");
    expect(come.style.boxShadow).toBe('');
    expect(come.style.background).not.toContain('0, 175, 81');
    mockStore.eventSignups['e1_u-probe'] = signedUp();
    const b = await render();
    const join = find(b.container, 'Join on Google Meet');
    expect(join.style.boxShadow).not.toBe('');
    expect(join.style.background).toContain('0, 175, 81');
    jest.setSystemTime(END + 3600000);
    mockStore.events.e1 = event({ recordingUrl: 'https://example.com/recording-placeholder' });
    const c = await render();
    const watch = find(c.container, 'Watch the recording');
    expect(watch.style.boxShadow).toBe('');
    expect(watch.style.background).toBe(come.style.background);
    expect(watch.style.color).toBe(come.style.color);
  });

  test('the title is 16 px', async () => {
    const { container } = await render();
    const h3 = container.querySelector('h3');
    expect(h3.style.fontSize).toBe('16px');
  });

  test("within two hours \"Check for the link\" comes before \"I can't come\"", async () => {
    mockStore.eventSignups['e1_u-probe'] = signedUp();
    delete mockStore.eventLinks.e1;
    jest.setSystemTime(START - 3600000);
    const { container } = await render();
    expect(buttons(container)).toEqual(['Check for the link', "I can't come"]);
  });

  test('a check that finds nothing: a quiet line in the live region and focus back on the same button', async () => {
    mockStore.eventSignups['e1_u-probe'] = signedUp();
    delete mockStore.eventLinks.e1;
    jest.setSystemTime(START + 60000);
    const { container } = await render();
    document.body.appendChild(container);
    const check = find(container, 'Check for the link');
    check.focus();
    // A browser drops focus from a button that goes disabled and jsdom does not: blur it as the browser would.
    let release;
    mockHoldLink = new Promise((r) => { release = r; });
    await tap(check);
    document.activeElement.blur();
    await act(async () => { release(); });
    expect(document.activeElement).toBe(find(container, 'Check for the link'));
    const live = [...container.querySelectorAll('[role="status"]')].pop();
    expect(live.textContent).toBe(NO_LINK_YET);
    expect(live.firstChild.style.color).toBe('rgb(204, 204, 204)');
    mockHoldLink = null;
    mockStore.eventLinks.e1 = { meetUrl: LINK };
    await tap(find(container, 'Check for the link'));
    expect(container.textContent).not.toContain(NO_LINK_YET);
    container.remove();
  });

  test("when the tapped button is gone, focus goes to the status line as before", async () => {
    const { container } = await render();
    document.body.appendChild(container);
    const come = find(container, "I'm coming");
    come.focus();
    const release = holdWrites();
    await tap(come);
    document.activeElement.blur();
    await act(async () => { release(); });
    // "I'm coming" is gone (Join and "I can't come" took its place): focus is on the status line.
    expect(find(container, "I'm coming")).toBeUndefined();
    expect(document.activeElement).toBe(container.querySelector('[role="status"][tabindex="-1"]'));
    container.remove();
  });

  test("every button and link names its event: aria-describedby points at that card's title", async () => {
    mockStore.eventSignups['e1_u-probe'] = signedUp();
    mockStore.events.e0 = event({ title: 'Earlier one', startsAt: new Date(START - 12 * 3600000), endsAt: new Date(END - 12 * 3600000) });
    const { container } = await render();
    const els = [...container.querySelectorAll('button, a')];
    expect(els.length).toBeGreaterThanOrEqual(3);
    const ids = new Set();
    for (const el of els) {
      const id = el.getAttribute('aria-describedby');
      expect(id).toBeTruthy();
      const targets = container.querySelectorAll(`[id="${id}"]`);
      expect(targets).toHaveLength(1);
      expect(targets[0].tagName).toBe('H3');
      ids.add(id);
    }
    expect([...ids].map((id) => container.querySelector(`[id="${id}"]`).textContent).sort())
      .toEqual(['Earlier one', 'RYP Academy Parent Workshop 1 of 4']);
  });

  test('the two links that open a new tab say so to a screen reader and not to the eye', async () => {
    mockStore.eventSignups['e1_u-probe'] = signedUp();
    const a = await render();
    const hint = find(a.container, 'Join on Google Meet').querySelector('span');
    expect(hint.textContent).toBe(NEW_TAB_HINT);
    expect(hint.style.position).toBe('absolute');
    expect(hint.style.width).toBe('1px');
    jest.setSystemTime(END + 3600000);
    mockStore.events.e1 = event({ recordingUrl: 'https://example.com/recording-placeholder' });
    const b = await render();
    expect(find(b.container, 'Watch the recording').querySelector('span').textContent).toBe(NEW_TAB_HINT);
  });
});
