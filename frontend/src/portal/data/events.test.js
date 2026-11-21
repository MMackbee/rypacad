/**
 * The workshop card's pure decisions (hq card 5): every row of the state table at its
 * boundaries (one second either side of the start, the two-hours mark and the end), the
 * Central time line from a phone in another zone, the https check and the ordering.
 */
import {
  BUTTON_BACK, BUTTON_CHECK, BUTTON_COME, BUTTON_JOIN, BUTTON_RECORDING, CHECK_FROM_MS, DEFAULT_NOTICE, HAPPENING_NOW,
  CALENDAR_APPLE, CALENDAR_GOOGLE, CALENDAR_LABEL, IN_NO_LINK_STARTED, IN_WITH_LINK, NEW_TAB_HINT, NO_LINK_YET, centralDay, eventView, inNoLinkLine, inviteLine, isHttps, nextChange, normalizeEvent,
  timeLine, toMs, visibleEvents, weekdayName,
} from './events';

// Monday Nov 23 2026, 8:00 to 8:45 PM Central (CST, UTC-6) = Tuesday 02:00 to 02:45 UTC.
const START = Date.UTC(2026, 10, 24, 2, 0, 0);
const END = START + 45 * 60 * 1000;
const SEC = 1000;
// Built in two pieces: eslint's no-script-url flags the literal.
const SCRIPT_URL = ['java', 'script:alert(1)'].join('');
const LINK = 'https://example.com/workshop-link-placeholder';
const doc = (over = {}) => ({ enabled: true, title: 'Probe workshop', startsAt: new Date(START), endsAt: new Date(END), ...over });
const ev = (over = {}) => normalizeEvent('e1', doc(over));
const view = (state, event = ev()) => eventView(event, { signedUp: false, meetUrl: null, ...state });

describe('timeLine', () => {
  it('writes the Central line the card shows', () => {
    expect(timeLine(START, END)).toBe('Mon, Nov 23 · 8:00 to 8:45 PM Central');
  });
  it('is the academy clock whatever zone the phone is in', () => {
    const was = process.env.TZ;
    try {
      for (const tz of ['Pacific/Auckland', 'Asia/Tokyo', 'America/Los_Angeles', 'UTC']) {
        process.env.TZ = tz;
        expect(timeLine(START, END)).toBe('Mon, Nov 23 · 8:00 to 8:45 PM Central');
        expect(centralDay(START)).toBe('2026-11-23');
        expect(weekdayName(START)).toBe('Monday');
      }
    } finally {
      if (was === undefined) delete process.env.TZ; else process.env.TZ = was;
    }
  });
  it('shows both AM/PM marks when the span crosses noon', () => {
    const noonish = Date.UTC(2026, 10, 23, 17, 30); // 11:30 AM Central
    expect(timeLine(noonish, noonish + 45 * 60000)).toBe('Mon, Nov 23 · 11:30 AM to 12:15 PM Central');
  });
  it('shows both dates when the ends fall on different Central days', () => {
    expect(timeLine(START, START + 5 * 3600000)).toBe('Mon, Nov 23, 8:00 PM to Tue, Nov 24, 1:00 AM Central');
  });
  it('follows daylight time: July is CDT', () => {
    const july = Date.UTC(2026, 6, 14, 1, 0); // 8:00 PM CDT Mon Jul 13
    expect(timeLine(july, july + 45 * 60000)).toBe('Mon, Jul 13 · 8:00 to 8:45 PM Central');
  });
});

describe('isHttps and toMs', () => {
  it.each([
    ['https://example.com/x', true], ['  https://example.com/x ', true], ['HTTPS://example.com/x', true],
    ['http://example.com/x', false], ['example.com/abc', false], [SCRIPT_URL, false], ['https://', false],
    ['https:// spaced', false], ['', false], [null, false], [undefined, false], [42, false], [{}, false],
  ])('%j -> %s', (url, ok) => expect(isHttps(url)).toBe(ok));
  it('reads a Timestamp, a Date and a number, and nothing else', () => {
    expect(toMs({ toMillis: () => 5 })).toBe(5);
    expect(toMs(new Date(7))).toBe(7);
    expect(toMs(9)).toBe(9);
    expect(Number.isNaN(toMs('2026-11-23'))).toBe(true);
    expect(Number.isNaN(toMs(null))).toBe(true);
  });
});

describe('normalizeEvent', () => {
  it('keeps the document\'s own words and falls back to the default notice', () => {
    const e = ev({ summary: 'A short text.' });
    expect(e).toMatchObject({ id: 'e1', title: 'Probe workshop', summary: 'A short text.', notice: DEFAULT_NOTICE, startsMs: START, endsMs: END, recordingUrl: null });
    expect(ev({ notice: 'Our own words.' }).notice).toBe('Our own words.');
    expect(ev({ notice: '   ' }).notice).toBe(DEFAULT_NOTICE);
    expect(ev({ summary: '' }).summary).toBeNull();
  });
  it.each([
    ['not enabled', { enabled: false }], ['enabled missing', { enabled: undefined }], ['enabled not a boolean', { enabled: 'true' }],
    ['no title', { title: '' }], ['title not a string', { title: 7 }], ['no start', { startsAt: null }], ['no end', { endsAt: 'soon' }],
    ['ends before it starts', { endsAt: new Date(START - 1) }], ['ends when it starts', { endsAt: new Date(START) }],
  ])('is null when %s', (_label, over) => expect(ev(over)).toBeNull());
  it('is null for no document', () => expect(normalizeEvent('e1', undefined)).toBeNull());
  it('treats a recording address that is not https as not set', () => {
    expect(ev({ recordingUrl: 'http://example.com/r' }).recordingUrl).toBeNull();
    expect(ev({ recordingUrl: 'https://example.com/r' }).recordingUrl).toBe('https://example.com/r');
  });
});

describe('visibleEvents', () => {
  const at = (id, start, over = {}) => normalizeEvent(id, doc({ startsAt: new Date(start), endsAt: new Date(start + 45 * 60000), ...over }));
  it('orders by start, earliest first, ties by id', () => {
    const list = [at('c', START + 5000), at('b', START), at('a', START), at('d', START - 9000)];
    expect(visibleEvents(list, START - 99999999).map((e) => e.id)).toEqual(['d', 'a', 'b', 'c']);
  });
  it('drops an event once it has ended, to the second', () => {
    const e = at('a', START);
    expect(visibleEvents([e], END - SEC)).toHaveLength(1);
    expect(visibleEvents([e], END)).toHaveLength(0);
  });
  it('keeps an ended event that has a recording', () => {
    const e = at('a', START, { recordingUrl: 'https://example.com/r' });
    expect(visibleEvents([e], END + 86400000)).toHaveLength(1);
  });
  it('ignores nulls', () => expect(visibleEvents([null, at('a', START)], START)).toHaveLength(1));
});

describe('eventView: the state table', () => {
  const T = { twoHours: START - CHECK_FROM_MS };

  it('before the end, not signed up: the invite and "I\'m coming" (any link)', () => {
    for (const now of [START - 86400000 * 3, START - SEC, END - SEC]) {
      const v = view({ now, meetUrl: LINK });
      expect(v.show).toBe(true);
      expect(v.kind).toBe('invite');
      expect(v.primary).toEqual({ action: 'come', label: BUTTON_COME });
      expect(v.quiet).toEqual([]);
      expect(v.title).toBe('Probe workshop');
      expect(v.timeLine).toBe('Mon, Nov 23 · 8:00 to 8:45 PM Central');
    }
  });
  it('names the weekday on an earlier day and says "before we start" on the day', () => {
    expect(view({ now: START - 86400000 }).status).toBe(inviteLine('Monday', false));
    expect(view({ now: START - 86400000 }).status).toBe('Tap "I\'m coming" and the Google Meet link will show here on Monday.');
    expect(view({ now: START - 3600000 }).status).toBe('Tap "I\'m coming" and the Google Meet link will show here before we start.');
  });
  it('the day is the Central day, not the phone\'s: 11:59 PM the night before is still the day before', () => {
    const lateSunday = Date.UTC(2026, 10, 23, 5, 59); // 11:59 PM Sunday Central
    expect(view({ now: lateSunday }).status).toContain('on Monday');
    expect(view({ now: lateSunday + 2 * 60000 }).status).toContain('before we start');
  });
  it('started, not ended, not signed up: "happening now" and "I\'m coming"', () => {
    for (const now of [START, START + SEC, END - SEC]) {
      const v = view({ now });
      expect(v.status).toBe(HAPPENING_NOW);
      expect(v.primary.action).toBe('come');
    }
    expect(view({ now: START - SEC }).status).not.toBe(HAPPENING_NOW);
  });
  it('signed up, no link, before the start: "You\'re in" and "I can\'t come"; "Check" only from two hours before', () => {
    const early = view({ signedUp: true, now: START - 86400000 });
    expect(early.status).toBe("You're in. The link appears here on Monday.");
    expect(early.primary).toBeNull();
    expect(early.quiet).toEqual([{ action: 'back', label: BUTTON_BACK }]);
    expect(view({ signedUp: true, now: T.twoHours - SEC }).quiet.map((q) => q.action)).toEqual(['back']);
    const near = view({ signedUp: true, now: T.twoHours });
    expect(near.status).toBe("You're in. The link appears here before we start.");
    expect(near.quiet).toEqual([{ action: 'check', label: BUTTON_CHECK }, { action: 'back', label: BUTTON_BACK }]);
    expect(view({ signedUp: true, now: START - SEC }).quiet.map((q) => q.action)).toEqual(['check', 'back']);
    expect(inNoLinkLine('Monday', true)).toBe("You're in. The link appears here before we start.");
  });
  it('signed up, link set, before the end: Join, and "I can\'t come" only until the start', () => {
    const before = view({ signedUp: true, meetUrl: LINK, now: START - SEC });
    expect(before.status).toBe(IN_WITH_LINK);
    expect(before.primary).toEqual({ action: 'join', label: BUTTON_JOIN, href: LINK, fill: true });
    expect(before.quiet).toEqual([{ action: 'back', label: BUTTON_BACK }]);
    const started = view({ signedUp: true, meetUrl: LINK, now: START });
    expect(started.primary.action).toBe('join');
    expect(started.quiet).toEqual([]);
    expect(view({ signedUp: true, meetUrl: LINK, now: END - SEC }).primary.action).toBe('join');
    expect(view({ signedUp: true, meetUrl: LINK, now: START - 5 * 86400000 }).primary.action).toBe('join');
  });
  it('signed up, no link, started: the "not here yet" line and "Check for the link" only', () => {
    for (const now of [START, END - SEC]) {
      const v = view({ signedUp: true, now });
      expect(v.status).toBe(IN_NO_LINK_STARTED);
      expect(v.primary).toBeNull();
      expect(v.quiet).toEqual([{ action: 'check', label: BUTTON_CHECK }]);
    }
  });
  it('only Join takes the green fill: "I\'m coming" and "Watch the recording" do not', () => {
    expect(view({ signedUp: true, meetUrl: LINK, now: START - SEC }).primary.fill).toBe(true);
    expect(view({ now: START - SEC }).primary.fill).toBeUndefined();
    expect(view({ now: START + SEC }).primary.fill).toBeUndefined();
    expect(view({ now: END }, ev({ recordingUrl: 'https://example.com/r' })).primary.fill).toBeUndefined();
  });
  it('the words of this round: the quiet line and the hidden new-tab hint', () => {
    expect(NO_LINK_YET).toBe('No link yet. Check again in a few minutes.');
    expect(NEW_TAB_HINT).toBe(' (opens in a new tab)');
  });
  it('a late arrival: signed up after the start with a link readable shows Join at once', () => {
    expect(view({ signedUp: true, meetUrl: LINK, now: START + 20 * 60000 }).primary.action).toBe('join');
  });
  it('ended: nothing, to the second', () => {
    expect(view({ now: END }).show).toBe(false);
    expect(view({ now: END + 99999999, signedUp: true, meetUrl: LINK }).show).toBe(false);
    expect(view({ now: END - SEC }).show).toBe(true);
  });
  it('ended with a recording: title and "Watch the recording" for everyone', () => {
    const rec = ev({ recordingUrl: 'https://example.com/r' });
    for (const signedUp of [true, false]) {
      const v = view({ signedUp, now: END }, rec);
      expect(v).toMatchObject({ show: true, kind: 'recording', title: 'Probe workshop', notice: null, summary: null, timeLine: null });
      expect(v.primary).toEqual({ action: 'recording', label: BUTTON_RECORDING, href: 'https://example.com/r' });
    }
    expect(view({ now: END - SEC }, rec).kind).toBe('invite');
  });
  it('a link that is not https is not set', () => {
    for (const bad of ['http://example.com/x', 'example.com/x', SCRIPT_URL, '', null]) {
      const v = view({ signedUp: true, meetUrl: bad, now: START + SEC });
      expect(v.primary).toBeNull();
      expect(v.status).toBe(IN_NO_LINK_STARTED);
    }
  });
  it('the notice and the summary show in every state before the end, the notice words are the document\'s when it has them', () => {
    const e = ev({ summary: 'About it.', notice: 'Our own words.' });
    for (const s of [{ now: START - 86400000 }, { now: START + SEC }, { now: START - SEC, signedUp: true, meetUrl: LINK }, { now: START + SEC, signedUp: true }]) {
      const v = view(s, e);
      expect(v.notice).toBe('Our own words.');
      expect(v.summary).toBe('About it.');
    }
    expect(view({ now: START }).notice).toBe(DEFAULT_NOTICE);
  });
  it('no event shows nothing', () => expect(eventView(null, { signedUp: false, meetUrl: null, now: START })).toEqual({ show: false }));
});

describe('eventView: the calendar entry (hq card 7)', () => {
  const calendarOf = (state, event = ev()) => view(state, event).calendar;

  it('is there when signed up and before the start: the id, title, both instants and the readable link', () => {
    expect(calendarOf({ signedUp: true, meetUrl: LINK, now: START - 86400000 })).toEqual({
      id: 'e1', title: 'Probe workshop', startsMs: START, endsMs: START + 45 * 60 * 1000, meetUrl: LINK,
    });
  });
  it('holds at the boundaries: one second before the start has it, the start itself does not', () => {
    expect(calendarOf({ signedUp: true, meetUrl: LINK, now: START - SEC })).toBeDefined();
    expect(view({ signedUp: true, meetUrl: LINK, now: START - SEC })).toHaveProperty('calendar');
    expect(view({ signedUp: true, meetUrl: LINK, now: START })).not.toHaveProperty('calendar');
    expect(view({ signedUp: true, meetUrl: LINK, now: START + SEC })).not.toHaveProperty('calendar');
  });
  it('is there with and without a link, from a week out to the last second before the start', () => {
    for (const now of [START - 7 * 86400000, START - CHECK_FROM_MS, START - SEC]) {
      expect(view({ signedUp: true, meetUrl: null, now })).toHaveProperty('calendar');
      expect(view({ signedUp: true, meetUrl: LINK, now })).toHaveProperty('calendar');
    }
  });
  it('has no meetUrl without a link, and none for a link that is not https', () => {
    expect(calendarOf({ signedUp: true, meetUrl: null, now: START - SEC }).meetUrl).toBeNull();
    for (const bad of ['http://example.com/x', 'example.com/x', SCRIPT_URL, '', undefined]) {
      expect(calendarOf({ signedUp: true, meetUrl: bad, now: START - SEC }).meetUrl).toBeNull();
    }
  });
  it('carries the trimmed link', () => {
    expect(calendarOf({ signedUp: true, meetUrl: `  ${LINK} `, now: START - SEC }).meetUrl).toBe(LINK);
  });
  it('is absent when not signed up, once started, once ended, and on the recording view', () => {
    expect(view({ signedUp: false, meetUrl: LINK, now: START - 86400000 })).not.toHaveProperty('calendar');
    expect(view({ signedUp: true, meetUrl: LINK, now: START + SEC })).not.toHaveProperty('calendar');
    expect(view({ signedUp: true, meetUrl: LINK, now: END })).toEqual({ show: false });
    const rec = ev({ recordingUrl: 'https://example.com/r' });
    for (const signedUp of [true, false]) {
      expect(view({ signedUp, meetUrl: LINK, now: END }, rec)).not.toHaveProperty('calendar');
      expect(view({ signedUp, meetUrl: LINK, now: START - SEC }, rec).calendar !== undefined).toBe(signedUp);
    }
  });
  it('the words: the row label and the two controls', () => {
    expect(CALENDAR_LABEL).toBe('Add to your calendar');
    expect(CALENDAR_APPLE).toBe('Apple or Outlook');
    expect(CALENDAR_GOOGLE).toBe('Google Calendar');
  });
});

describe('the notice', () => {
  it('says athletes are welcome to join too, in place of the line about under 18', () => {
    expect(DEFAULT_NOTICE).toBe(
      'This workshop is recorded and the recording will be posted publicly on rypacademy.com. Microphones and cameras stay off; ask questions in the chat. Athletes are welcome to join too.',
    );
    expect(DEFAULT_NOTICE).not.toContain('under 18');
    expect(view({ now: START - 86400000 }).notice).toBe(DEFAULT_NOTICE);
  });
});

describe('nextChange', () => {
  it('names the next boundary after now', () => {
    const e = ev();
    expect(nextChange(e, START - 86400000, false)).toBe(START);
    expect(nextChange(e, START - 86400000, true)).toBe(START - CHECK_FROM_MS);
    expect(nextChange(e, START - CHECK_FROM_MS, true)).toBe(START);
    expect(nextChange(e, START, true)).toBe(END);
    expect(nextChange(e, END - 1, false)).toBe(END);
    expect(nextChange(e, END, false)).toBeNull();
  });
});
