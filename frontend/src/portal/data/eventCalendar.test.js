/**
 * The calendar entry for an academy event (hq card 7): the text of one iCalendar file and the
 * Google Calendar address, built from what the workshop card already holds. Whole-string
 * comparisons for a made-up event with and without a link, the UTC stamps (and the same answer
 * under another TZ), the format's escaping, folding at 75 octets, no input able to add a line,
 * the https rule, and the Google address round trip.
 */
import {
  calendarFile, calendarFileHref, calendarSentence, googleCalendarUrl, utcStamp,
} from './eventCalendar';

// Monday Nov 23 2026, 8:00 to 8:45 PM Central (UTC-6) = Tuesday 02:00 to 02:45 UTC.
const START = Date.UTC(2026, 10, 24, 2, 0, 0);
const END = START + 45 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 20, 15, 30, 5);
const LINK = 'https://example.com/meet-placeholder';
const APP = 'https://portal.example.com/portal';
const base = { id: 'workshop-1', title: 'Probe workshop', startsMs: START, endsMs: END, appUrl: APP, nowMs: NOW };
// Built in two pieces: eslint's no-script-url flags the literal.
const SCRIPT_URL = ['java', 'script:alert(1)'].join('');

const NAMES = [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//RYP Academy//Portal//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT', 'UID',
  'DTSTAMP', 'DTSTART', 'DTEND', 'SUMMARY', 'DESCRIPTION', 'LOCATION', 'URL', 'END:VEVENT', 'END:VCALENDAR',
];
/** The file with its folds taken out, as a list of lines. */
const unfold = (text) => text.replace(/\r\n /g, '').split('\r\n');
const octets = (s) => Buffer.from(s, 'utf8').length;
const nameOf = (line) => (NAMES.includes(line) ? line : line.split(/[:;]/)[0]);

const WITH_LINK = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//RYP Academy//Portal//EN',
  'CALSCALE:GREGORIAN',
  'METHOD:PUBLISH',
  'BEGIN:VEVENT',
  'UID:workshop-1@rypacademy.com',
  'DTSTAMP:20261120T153005Z',
  'DTSTART:20261124T020000Z',
  'DTEND:20261124T024500Z',
  'SUMMARY:Probe workshop',
  'DESCRIPTION:Join on Google Meet: https://example.com/meet-placeholder\\n\\nRY',
  ' P Academy app: https://portal.example.com/portal',
  'LOCATION:https://example.com/meet-placeholder',
  'URL:https://example.com/meet-placeholder',
  'END:VEVENT',
  'END:VCALENDAR',
  '',
].join('\r\n');

const WITHOUT_LINK = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//RYP Academy//Portal//EN',
  'CALSCALE:GREGORIAN',
  'METHOD:PUBLISH',
  'BEGIN:VEVENT',
  'UID:workshop-1@rypacademy.com',
  'DTSTAMP:20261120T153005Z',
  'DTSTART:20261124T020000Z',
  'DTEND:20261124T024500Z',
  'SUMMARY:Probe workshop',
  'DESCRIPTION:The Google Meet link shows in the RYP Academy app on the day: h',
  ' ttps://portal.example.com/portal',
  'LOCATION:Google Meet',
  'END:VEVENT',
  'END:VCALENDAR',
  '',
].join('\r\n');

describe('utcStamp', () => {
  it('writes an instant as UTC in the calendar form', () => {
    expect(utcStamp(Date.UTC(2026, 10, 24, 2, 0))).toBe('20261124T020000Z');
    expect(utcStamp(Date.UTC(2026, 0, 5, 23, 59, 59))).toBe('20260105T235959Z');
  });
  it('gives the same answer under another TZ', () => {
    const was = process.env.TZ;
    try {
      for (const tz of ['Pacific/Auckland', 'Asia/Tokyo', 'America/Los_Angeles', 'UTC']) {
        process.env.TZ = tz;
        expect(utcStamp(Date.UTC(2026, 10, 24, 2, 0))).toBe('20261124T020000Z');
        expect(calendarFile({ ...base, meetUrl: LINK })).toBe(WITH_LINK);
      }
    } finally {
      if (was === undefined) delete process.env.TZ; else process.env.TZ = was;
    }
  });
});

describe('calendarFile', () => {
  it('is the exact file for a made-up event with a link', () => {
    expect(calendarFile({ ...base, meetUrl: LINK })).toBe(WITH_LINK);
  });
  it('is the exact file for a made-up event without a link: no URL line, "Google Meet" as the place', () => {
    expect(calendarFile({ ...base, meetUrl: null })).toBe(WITHOUT_LINK);
    expect(calendarFile({ ...base })).toBe(WITHOUT_LINK);
  });
  it('ends every line with CRLF and the file with exactly one', () => {
    for (const built of [calendarFile({ ...base, meetUrl: LINK }), calendarFile(base), calendarFile({ ...base, meetUrl: LINK, title: 'A, B; C\\D\nE' })]) {
      expect(built.endsWith('\r\n')).toBe(true);
      expect(built.endsWith('\r\n\r\n')).toBe(false);
      expect(built.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    }
  });
  it('makes the UID from the id, every character outside A-Z a-z 0-9 . _ - replaced by a dash', () => {
    expect(unfold(calendarFile({ ...base, id: 'a b/c_d.e-F9' }))).toContain('UID:a-b-c_d.e-F9@rypacademy.com');
    expect(unfold(calendarFile({ ...base, id: 'x\r\ny;z' }))).toContain('UID:x--y-z@rypacademy.com');
  });
  it.each([
    ['comma', 'Putting, drills', 'SUMMARY:Putting\\, drills'],
    ['semicolon', 'Putting; drills', 'SUMMARY:Putting\\; drills'],
    ['backslash', 'Putting\\drills', 'SUMMARY:Putting\\\\drills'],
    ['CRLF', 'One\r\nTwo', 'SUMMARY:One\\nTwo'],
    ['CR', 'One\rTwo', 'SUMMARY:One\\nTwo'],
    ['LF', 'One\nTwo', 'SUMMARY:One\\nTwo'],
    ['other control characters', 'A\u0000B\u0007C\tD\u007fE', 'SUMMARY:ABCDE'],
    ['all together', 'a\\b,c;d\r\ne', 'SUMMARY:a\\\\b\\,c\\;d\\ne'],
  ])('escapes %s in the title', (_label, title, line) => {
    expect(unfold(calendarFile({ ...base, title }))).toContain(line);
  });
  it('lets no title add a line: every unfolded line starts with one of the sixteen expected names', () => {
    for (const title of ['Workshop\r\nATTENDEE:mailto:x@example.com', 'Workshop\rEND:VEVENT\nBEGIN:VEVENT', 'Workshop\u2028X:Y\u0085Z:1']) {
      for (const meetUrl of [LINK, null]) {
        const lines = unfold(calendarFile({ ...base, title, meetUrl })).filter((l) => l !== '');
        expect(lines.length).toBe(meetUrl ? 16 : 15);
        for (const l of lines) expect(NAMES).toContain(nameOf(l));
        expect(lines.filter((l) => l.startsWith('ATTENDEE')).length).toBe(0);
        expect(lines.filter((l) => l === 'END:VEVENT').length).toBe(1);
      }
    }
  });
  it('lets no link add a line either: whitespace or control characters in it make it no link', () => {
    for (const bad of ['https://example.com/a\r\nATTENDEE:mailto:x@example.com', 'https://example.com/a\nB:1', 'https://example.com/a b', 'https://example.com/a\u0007b']) {
      const text = calendarFile({ ...base, meetUrl: bad });
      expect(text).toBe(WITHOUT_LINK);
    }
  });
  it('folds every line longer than 75 octets, never inside a multi-byte character, and the unfolded text is the original', () => {
    const title = 'Ólafur Darri Ólafsson 王秀英 Đặng Thị Ngọc Hân 👩🏽‍💻 Priya 🦊 Fox and the long evening of putting, chipping and Putting';
    const text = calendarFile({ ...base, title });
    const folded = text.split('\r\n').filter((l) => l !== '');
    expect(folded.some((l) => l.startsWith(' '))).toBe(true);
    for (const l of folded) {
      expect(octets(l)).toBeLessThanOrEqual(75);
      // A valid UTF-8 string: it survives a round trip through bytes.
      expect(Buffer.from(l, 'utf8').toString('utf8')).toBe(l);
      expect(l).not.toContain('�');
    }
    expect(unfold(text)).toContain(`SUMMARY:${title.replace(/,/g, '\\,')}`);
  });
  it('folds a title of three-byte characters at the last whole character that fits', () => {
    const title = '王'.repeat(40);
    const text = calendarFile({ ...base, title });
    const all = text.split('\r\n');
    const at = all.findIndex((l) => l.startsWith('SUMMARY'));
    const summary = all.slice(at, at + 2);
    expect(all[at + 2]).toMatch(/^DESCRIPTION:/);
    expect(summary[0]).toBe(`SUMMARY:${'王'.repeat(22)}`); // 8 + 66 = 74 octets: a 23rd would make 77
    expect(summary[1]).toBe(` ${'王'.repeat(18)}`);
    for (const l of summary) expect(octets(l)).toBeLessThanOrEqual(75);
  });
  it('treats a link that is not https as no link', () => {
    for (const bad of ['http://example.com/x', SCRIPT_URL, 'example.com/x', 'meet', '', null, undefined, 42]) {
      expect(calendarFile({ ...base, meetUrl: bad })).toBe(WITHOUT_LINK);
    }
    expect(calendarFile({ ...base, meetUrl: `  ${LINK} ` })).toBe(WITH_LINK);
  });
  it('repairs a lone surrogate instead of throwing', () => {
    const text = calendarFile({ ...base, title: 'Half \ud83e pair' });
    expect(unfold(text)).toContain('SUMMARY:Half � pair');
    expect(() => calendarFileHref(text)).not.toThrow();
  });
});

describe('googleCalendarUrl', () => {
  const parse = (args) => new URL(googleCalendarUrl({ ...base, ...args }));
  const params = (u) => Object.fromEntries([...u.searchParams.entries()]);

  it('is Google Calendar\'s own new-event address with the five parameters and nothing else', () => {
    const u = parse({ meetUrl: LINK });
    expect(`${u.origin}${u.pathname}`).toBe('https://calendar.google.com/calendar/render');
    expect([...u.searchParams.keys()]).toEqual(['action', 'text', 'dates', 'details', 'location']);
    expect(params(u)).toEqual({
      action: 'TEMPLATE',
      text: 'Probe workshop',
      dates: '20261124T020000Z/20261124T024500Z',
      details: `Join on Google Meet: ${LINK}\n\nRYP Academy app: ${APP}`,
      location: LINK,
    });
  });
  it('without a link: the sentence for no link and "Google Meet" as the place', () => {
    expect(params(parse({ meetUrl: null }))).toMatchObject({
      details: `The Google Meet link shows in the RYP Academy app on the day: ${APP}`,
      location: 'Google Meet',
    });
  });
  it('encodes every value: a title with &, #, + and a space decodes to the exact title', () => {
    const title = 'Putting & chipping #1 + more, "quotes" 50% off?';
    const raw = googleCalendarUrl({ ...base, title, meetUrl: LINK });
    expect(raw).toContain(`text=${encodeURIComponent(title)}`);
    expect(raw.split('?')[1].split('&').length).toBe(5);
    expect(params(parse({ title }))).toMatchObject({ text: title });
  });
  it('treats a link that is not https as no link', () => {
    for (const bad of ['http://example.com/x', SCRIPT_URL, 'meet', '', null, 'https://example.com/a b']) {
      expect(params(parse({ meetUrl: bad })).location).toBe('Google Meet');
    }
  });
  it('does not throw on a lone surrogate', () => {
    expect(() => googleCalendarUrl({ ...base, title: 'Half \ud83e pair' })).not.toThrow();
  });
});

describe('calendarFileHref', () => {
  it('is a text/calendar data address that decodes back to the file text', () => {
    const text = calendarFile({ ...base, title: 'A, B & C #1 王', meetUrl: LINK });
    const href = calendarFileHref(text);
    expect(href.startsWith('data:text/calendar;charset=utf-8,')).toBe(true);
    expect(href.slice('data:text/calendar;charset=utf-8,'.length)).toBe(encodeURIComponent(text));
    expect(decodeURIComponent(href.slice('data:text/calendar;charset=utf-8,'.length))).toBe(text);
    expect(href).not.toMatch(/[\r\n\s]/);
  });
});

describe('calendarSentence', () => {
  it('is the entry\'s description: with a link, a blank line, then the app address', () => {
    expect(calendarSentence(LINK, APP)).toBe(`Join on Google Meet: ${LINK}\n\nRYP Academy app: ${APP}`);
    expect(calendarSentence(null, APP)).toBe(`The Google Meet link shows in the RYP Academy app on the day: ${APP}`);
  });
});
