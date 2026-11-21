/**
 * The workshop card's "Add to your calendar" row (hq card 7), through the real hook with only Firestore, the
 * signed-in user and isLive faked, as EventCard.test.js does: absent before sign-up, after the start and on the
 * recording card; present after sign-up with its group label, both links (href, download, target, rel, hidden
 * hint, aria-describedby), its place in the order in each of the three cases, each event's own row, the file's
 * words, a link that stays the same across re-renders and re-reads, and links that stay usable while a write runs.
 * Plain functions, not jest.fn(): CRA's resetMocks would clear them.
 */
jest.mock('firebase/firestore', () => ({
  collection: (db, name) => ({ col: name }),
  doc: (db, col, id) => ({ col, id }),
  query: (ref, ...parts) => ({ col: ref.col, where: parts.filter((p) => p && p.kind === 'where') }),
  where: (field, op, value) => ({ kind: 'where', field, op, value }),
  serverTimestamp: () => 'SERVER_TIME',
  getDocs: async (q) => ({ docs: Object.entries(mockStore[q.col]).filter(([, d]) => q.where.every((w) => d[w.field] === w.value)).map(([id, d]) => ({ id, data: () => d })) }),
  getDoc: async (ref) => {
    const d = mockStore[ref.col][ref.id];
    return { exists: () => d !== undefined, data: () => d };
  },
  setDoc: async (ref, data) => {
    if (mockHold) await mockHold;
    mockStore[ref.col][ref.id] = data;
  },
  deleteDoc: async (ref) => {
    if (mockHold) await mockHold;
    delete mockStore[ref.col][ref.id];
  },
}));
jest.mock('../../hooks/live', () => ({
  ...jest.requireActual('../../hooks/live'),
  isLive: () => true,
  requireUser: () => ({ uid: 'u-probe', getIdTokenResult: async () => ({ claims: { email: 'probe@example.com' } }) }),
}));

let mockStore;
let mockHold;
const LINK = 'https://example.com/workshop-link-placeholder';
const OTHER_LINK = 'https://example.com/other-link-placeholder';
// Monday Nov 23 2026, 8:00 to 8:45 PM Central.
const START = Date.UTC(2026, 10, 24, 2, 0, 0);
const END = START + 45 * 60000;
const TITLE = 'RYP Academy Parent Workshop 1 of 4';
const event = (over = {}) => ({ enabled: true, title: TITLE, summary: 'A short text about the evening.', startsAt: new Date(START), endsAt: new Date(END), ...over });
const signedUp = (eventId = 'e1') => ({ eventId, uid: 'u-probe', email: 'probe@example.com', name: 'Probe Person', createdAt: new Date(0) });

import React, { act } from 'react';
import { renderScreen } from '../../screens/testRender';
import EventCard from './EventCard';
import { CALENDAR_APPLE, CALENDAR_GOOGLE, CALENDAR_LABEL, NEW_TAB_HINT } from '../../data/events';

const FILE_PREFIX = 'data:text/calendar;charset=utf-8,';

beforeEach(() => {
  jest.useFakeTimers('modern');
  jest.setSystemTime(START - 86400000);
  mockHold = null;
  mockStore = { events: { e1: event() }, eventSignups: {}, eventLinks: { e1: { meetUrl: LINK } }, users: { 'u-probe': { role: 'parent', displayName: 'Probe Person' } } };
});
afterEach(() => { jest.useRealTimers(); });

const render = (props) => renderScreen(<EventCard {...props} />);
const labelOf = (el) => el.textContent.replace(NEW_TAB_HINT, '').trim();
const labels = (c) => [...c.querySelectorAll('button, a')].map(labelOf);
const find = (c, label) => [...c.querySelectorAll('button, a')].find((b) => labelOf(b) === label);
const tap = (el) => act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
const fileText = (a) => decodeURIComponent(a.getAttribute('href').slice(FILE_PREFIX.length));
const googleParams = (a) => Object.fromEntries(new URL(a.getAttribute('href')).searchParams.entries());
const group = (c) => c.querySelector('[role="group"]');

describe('where the row shows', () => {
  it('is not there before sign-up', async () => {
    const { container } = await render();
    expect(group(container)).toBeNull();
    expect(container.textContent).not.toContain(CALENDAR_LABEL);
    expect(labels(container)).toEqual(["I'm coming"]);
  });
  it('is there once "I\'m coming" is tapped, and goes again when the take-back is tapped', async () => {
    const { container } = await render();
    await tap(find(container, "I'm coming"));
    expect(group(container)).not.toBeNull();
    expect(labels(container)).toEqual(['Join on Google Meet', CALENDAR_APPLE, CALENDAR_GOOGLE, "I can't come"]);
    await tap(find(container, "I can't come"));
    expect(group(container)).toBeNull();
    expect(labels(container)).toEqual(["I'm coming"]);
  });
  it('is not there after the start, to the second', async () => {
    mockStore.eventSignups['e1_u-probe'] = signedUp();
    jest.setSystemTime(START - 1000);
    const { container } = await render();
    expect(group(container)).not.toBeNull();
    jest.setSystemTime(START);
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(group(container)).toBeNull();
    expect(labels(container)).toEqual(['Join on Google Meet']);
  });
  it('is not there on the recording card', async () => {
    mockStore.events.e1 = event({ recordingUrl: 'https://example.com/r' });
    mockStore.eventSignups['e1_u-probe'] = signedUp();
    jest.setSystemTime(END + 3600000);
    const { container } = await render();
    expect(labels(container)).toEqual(['Watch the recording']);
    expect(group(container)).toBeNull();
  });
});

describe('the row', () => {
  const signedUpCard = async () => {
    mockStore.eventSignups['e1_u-probe'] = signedUp();
    return render();
  };

  it('is a group named by a small line of text in the secondary tone', async () => {
    const { container } = await signedUpCard();
    const g = group(container);
    const label = document.getElementById(g.getAttribute('aria-labelledby'));
    expect(label.textContent).toBe(CALENDAR_LABEL);
    // The 13 px size is the card's Body size={13}; jsdom drops the size from the font shorthand, so only the tone is read here.
    expect(label.firstChild.style.color).toBe('rgb(204, 204, 204)');
    expect(g.contains(label)).toBe(true);
  });
  it('holds the two controls side by side, wrapping when the card is narrow', async () => {
    const { container } = await signedUpCard();
    const g = group(container);
    const links = [...g.querySelectorAll('a')];
    expect(links.map(labelOf)).toEqual([CALENDAR_APPLE, CALENDAR_GOOGLE]);
    expect(g.querySelectorAll('button').length).toBe(0);
    const row = links[0].parentElement;
    expect(row).toBe(links[1].parentElement);
    expect(row.style.display).toBe('flex');
    expect(row.style.flexWrap).toBe('wrap');
    expect(row.style.gap).toBe('10px');
    for (const a of links) {
      expect(a.style.flex).toBe('1 1 140px');
      expect(a.style.height).toBe('46px');
      expect(a.style.justifyContent).toBe('center');
    }
  });
  it('keeps each label on one centred line when side by side: 8 px of side padding and centred text', async () => {
    const { container } = await signedUpCard();
    for (const label of [CALENDAR_APPLE, CALENDAR_GOOGLE]) {
      const a = find(container, label);
      expect(a.style.paddingLeft).toBe('8px');
      expect(a.style.paddingRight).toBe('8px');
      expect(a.style.paddingTop).toBe('0px');
      expect(a.style.paddingBottom).toBe('0px');
      expect(a.style.textAlign).toBe('center');
      expect(a.style.whiteSpace).toBe('');
    }
  });

  it('"Apple or Outlook" is a plain download link: a calendar file, no new tab, no handler', async () => {
    const { container } = await signedUpCard();
    const a = find(container, CALENDAR_APPLE);
    expect(a.tagName).toBe('A');
    expect(a.getAttribute('href').startsWith(FILE_PREFIX)).toBe(true);
    expect(a.getAttribute('download')).toBe('ryp-academy-event.ics');
    expect(a.hasAttribute('target')).toBe(false);
    expect(a.onclick).toBeNull();
    expect(a.textContent).toBe(CALENDAR_APPLE);
  });
  it('"Google Calendar" opens in a new tab and says so to a screen reader only', async () => {
    const { container } = await signedUpCard();
    const a = find(container, CALENDAR_GOOGLE);
    expect(a.tagName).toBe('A');
    expect(a.getAttribute('href').startsWith('https://calendar.google.com/calendar/render?')).toBe(true);
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    expect(a.hasAttribute('download')).toBe(false);
    expect(a.textContent).toBe(`${CALENDAR_GOOGLE}${NEW_TAB_HINT}`);
    const hint = a.querySelector('span');
    expect(hint.textContent).toBe(NEW_TAB_HINT);
    expect(hint.style.position).toBe('absolute');
  });
  it('looks like the card\'s quiet buttons: the outline look at 600 14 px', async () => {
    const { container } = await signedUpCard();
    const back = find(container, "I can't come");
    for (const label of [CALENDAR_APPLE, CALENDAR_GOOGLE]) {
      const a = find(container, label);
      for (const prop of ['background', 'border', 'color', 'borderRadius', 'font']) expect(a.style[prop]).toBe(back.style[prop]);
      expect(a.style.textDecoration).toBe('none');
    }
  });
  it('names its event: each control and the take-back point at the card\'s title', async () => {
    const { container } = await signedUpCard();
    for (const label of [CALENDAR_APPLE, CALENDAR_GOOGLE]) {
      const id = find(container, label).getAttribute('aria-describedby');
      const title = document.getElementById(id);
      expect(title.tagName).toBe('H3');
      expect(title.textContent).toBe(TITLE);
    }
  });
  it('is quiet: no control of the row has the green fill', async () => {
    const { container } = await signedUpCard();
    for (const label of [CALENDAR_APPLE, CALENDAR_GOOGLE]) {
      expect(find(container, label).style.boxShadow).toBe('');
      expect(find(container, label).style.color).not.toBe('rgb(0, 0, 0)');
    }
  });
});

describe('its place in the order', () => {
  it('with "Join on Google Meet": Join, the row, "I can\'t come"', async () => {
    mockStore.eventSignups['e1_u-probe'] = signedUp();
    const { container } = await render();
    expect(labels(container)).toEqual(['Join on Google Meet', CALENDAR_APPLE, CALENDAR_GOOGLE, "I can't come"]);
  });
  it('with "Check for the link": Check, the row, "I can\'t come"', async () => {
    mockStore.eventSignups['e1_u-probe'] = signedUp();
    mockStore.eventLinks = {};
    jest.setSystemTime(START - 3600000);
    const { container } = await render();
    expect(labels(container)).toEqual(['Check for the link', CALENDAR_APPLE, CALENDAR_GOOGLE, "I can't come"]);
  });
  it('with neither: the row, "I can\'t come"', async () => {
    mockStore.eventSignups['e1_u-probe'] = signedUp();
    mockStore.eventLinks = {};
    const { container } = await render();
    expect(labels(container)).toEqual([CALENDAR_APPLE, CALENDAR_GOOGLE, "I can't come"]);
  });
});

describe('what the entry holds', () => {
  it('the file has the title, the times and, when the link is readable, the link', async () => {
    mockStore.eventSignups['e1_u-probe'] = signedUp();
    const { container } = await render();
    const text = fileText(find(container, CALENDAR_APPLE));
    expect(text).toContain(`SUMMARY:${TITLE}`);
    expect(text).toContain('DTSTART:20261124T020000Z');
    expect(text).toContain('DTEND:20261124T024500Z');
    expect(text).toContain(`LOCATION:${LINK}`);
    expect(text).toContain(`URL:${LINK}`);
    expect(text).toContain(`${window.location.origin}/portal`);
    const google = googleParams(find(container, CALENDAR_GOOGLE));
    expect(google).toMatchObject({ action: 'TEMPLATE', text: TITLE, dates: '20261124T020000Z/20261124T024500Z', location: LINK });
    expect(google.details).toContain(LINK);
  });
  it('without a readable link the entry says the link shows in the app on the day, and never holds the link', async () => {
    mockStore.eventSignups['e1_u-probe'] = signedUp();
    mockStore.eventLinks = {};
    const { container } = await render();
    const text = fileText(find(container, CALENDAR_APPLE));
    expect(text).toContain('LOCATION:Google Meet');
    expect(text).not.toContain('URL:');
    expect(text.replace(/\r\n /g, '')).toContain('The Google Meet link shows in the RYP Academy app on the day');
    const google = googleParams(find(container, CALENDAR_GOOGLE));
    expect(google.location).toBe('Google Meet');
    expect(google.details).toContain('The Google Meet link shows in the RYP Academy app on the day');
  });
  it('a link that is not https is no link', async () => {
    mockStore.eventSignups['e1_u-probe'] = signedUp();
    mockStore.eventLinks = { e1: { meetUrl: 'http://example.com/plain' } };
    const { container } = await render();
    expect(fileText(find(container, CALENDAR_APPLE))).not.toContain('http://example.com/plain');
    expect(googleParams(find(container, CALENDAR_GOOGLE)).location).toBe('Google Meet');
  });
  it('with two events each row describes its own title and carries its own event\'s times and link', async () => {
    mockStore.events.e0 = event({ title: 'Earlier one', startsAt: new Date(START - 12 * 3600000), endsAt: new Date(END - 12 * 3600000) });
    mockStore.eventLinks.e0 = { meetUrl: OTHER_LINK };
    mockStore.eventSignups['e1_u-probe'] = signedUp('e1');
    mockStore.eventSignups['e0_u-probe'] = signedUp('e0');
    const { container } = await render();
    const groups = [...container.querySelectorAll('[role="group"]')];
    expect(groups.length).toBe(2);
    const [first, second] = groups.map((g) => g.querySelector('a'));
    const describedTitle = (a) => document.getElementById(a.getAttribute('aria-describedby')).textContent;
    expect(describedTitle(first)).toBe('Earlier one');
    expect(describedTitle(second)).toBe(TITLE);
    expect(fileText(first)).toContain('SUMMARY:Earlier one');
    expect(fileText(first)).toContain('DTSTART:20261123T140000Z');
    expect(fileText(first)).toContain(`LOCATION:${OTHER_LINK}`);
    expect(fileText(second)).toContain(`SUMMARY:${TITLE}`);
    expect(fileText(second)).toContain('DTSTART:20261124T020000Z');
    expect(fileText(second)).toContain(`LOCATION:${LINK}`);
    const labelIds = groups.map((g) => g.getAttribute('aria-labelledby'));
    expect(new Set(labelIds).size).toBe(2);
  });
});

describe('a link under a person\'s finger does not change', () => {
  const hrefs = (c) => [find(c, CALENDAR_APPLE), find(c, CALENDAR_GOOGLE)].map((a) => a.getAttribute('href'));

  it('a re-render with nothing changed leaves both hrefs identical', async () => {
    mockStore.eventSignups['e1_u-probe'] = signedUp();
    const view = await render();
    const before = hrefs(view.container);
    await view.rerender(<EventCard />);
    expect(hrefs(view.container)).toEqual(before);
  });
  it('time passing and a re-read with nothing changed leave both hrefs identical (the stamp is taken once per card)', async () => {
    mockStore.eventSignups['e1_u-probe'] = signedUp();
    const { container } = await render();
    const before = hrefs(container);
    jest.setSystemTime(START - 86400000 + 5 * 60000);
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(hrefs(container)).toEqual(before);
  });
  it('when the link turns up the entry gets it', async () => {
    mockStore.eventSignups['e1_u-probe'] = signedUp();
    mockStore.eventLinks = {};
    jest.setSystemTime(START - 3600000);
    const { container } = await render();
    expect(fileText(find(container, CALENDAR_APPLE))).not.toContain(LINK);
    mockStore.eventLinks = { e1: { meetUrl: LINK } };
    await tap(find(container, 'Check for the link'));
    expect(fileText(find(container, CALENDAR_APPLE))).toContain(`URL:${LINK}`);
  });
});

describe('while a write runs', () => {
  it('both links stay links, not disabled, with their addresses', async () => {
    mockStore.eventSignups['e1_u-probe'] = signedUp();
    let release;
    mockHold = new Promise((r) => { release = r; });
    const { container } = await render();
    const back = find(container, "I can't come");
    await tap(back);
    expect(find(container, "I can't come").disabled).toBe(true);
    for (const label of [CALENDAR_APPLE, CALENDAR_GOOGLE]) {
      const a = find(container, label);
      expect(a.tagName).toBe('A');
      expect(a.hasAttribute('aria-disabled')).toBe(false);
      expect(a.getAttribute('href')).toBeTruthy();
    }
    await act(async () => { release(); });
  });
});
