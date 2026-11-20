/**
 * The calendar entry for an academy event (hq card 7, 2026-11-20): the text of one
 * iCalendar file (RFC 5545) and Google Calendar's "new event" address, built from what the
 * workshop card already holds. Pure: no React, no DOM, no network.
 *
 * Times are exact instants in UTC (`20261124T020000Z`), never a local time or a zone name,
 * so the entry is right on a phone in any zone. Text is escaped by the format's rules and
 * lines are folded at 75 octets, so no title or link can add or break a line of the file.
 * A link counts only when it is https and has no whitespace or control character in it.
 */
import { isHttps } from './events';

/** The entry's description. The owner has yet to approve these words. */
export const calendarSentence = (meetUrl, appUrl) => {
  const app = typeof appUrl === 'string' ? appUrl : '';
  return meetUrl
    ? `Join on Google Meet: ${meetUrl}\n\nRYP Academy app: ${app}`
    : `The Google Meet link shows in the RYP Academy app on the day: ${app}`;
};

const PLACE_WITHOUT_LINK = 'Google Meet';
const GOOGLE_BASE = 'https://calendar.google.com/calendar/render';

/** `20261124T020000Z` for an instant in milliseconds. */
export function utcStamp(ms) {
  return new Date(ms).toISOString().replace(/[-:]|\.\d{3}/g, '');
}

/** Control characters: C0, DEL, C1 and the Unicode line and paragraph separators. */
const isControl = (c) => c <= 0x1f || (c >= 0x7f && c <= 0x9f) || c === 0x2028 || c === 0x2029;

/** The link when it may go in an entry, else null: https, trimmed, no whitespace or control character inside. */
function usableLink(url) {
  if (!isHttps(url)) return null;
  const trimmed = url.trim();
  for (const ch of trimmed) if (/\s/.test(ch) || isControl(ch.charCodeAt(0))) return null;
  return trimmed;
}

const REPLACEMENT = String.fromCharCode(0xfffd);

/** Replaces a lone surrogate (which encodeURIComponent refuses) with U+FFFD; whole pairs stay. */
function wellFormed(text) {
  let out = '';
  for (const ch of String(text)) {
    const c = ch.charCodeAt(0);
    out += ch.length === 1 && c >= 0xd800 && c <= 0xdfff ? REPLACEMENT : ch;
  }
  return out;
}

/** A text value by the format's rules: backslash, semicolon and comma get a backslash, a line break becomes the two characters \n, every other control character is dropped. */
function escapeText(text) {
  const clean = wellFormed(text).replace(/\r\n/g, '\n');
  let out = '';
  for (const ch of clean) {
    if (ch === '\\' || ch === ';' || ch === ',') out += `\\${ch}`;
    else if (ch === '\n' || ch === '\r') out += '\\n';
    else if (!isControl(ch.charCodeAt(0))) out += ch;
  }
  return out;
}

const utf8Length = (ch) => {
  const c = ch.codePointAt(0);
  if (c < 0x80) return 1;
  if (c < 0x800) return 2;
  return c < 0x10000 ? 3 : 4;
};

/** One line folded at 75 octets: CRLF and a space between the parts, never inside a character. */
function fold(line) {
  const parts = [];
  let part = '';
  let size = 0;
  let limit = 75;
  for (const ch of line) {
    const n = utf8Length(ch);
    if (size + n > limit) {
      parts.push(part);
      part = '';
      size = 0;
      limit = 74; // the leading space of a continuation takes the 75th octet
    }
    part += ch;
    size += n;
  }
  parts.push(part);
  return parts.join('\r\n ');
}

/** The sanitized id for a UID: A-Z a-z 0-9 . _ - kept, every other character a dash. */
const uidOf = (id) => `${String(id).replace(/[^A-Za-z0-9._-]/g, '-')}@rypacademy.com`;

/**
 * The text of one calendar file for the event.
 * @param {{id: string, title: string, startsMs: number, endsMs: number, meetUrl?: ?string, appUrl?: string, nowMs: number}} e
 * @returns {string} CRLF line ends, the last line ended too.
 */
export function calendarFile({ id, title, startsMs, endsMs, meetUrl, appUrl, nowMs }) {
  const link = usableLink(meetUrl);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//RYP Academy//Portal//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uidOf(id)}`,
    `DTSTAMP:${utcStamp(nowMs)}`,
    `DTSTART:${utcStamp(startsMs)}`,
    `DTEND:${utcStamp(endsMs)}`,
    `SUMMARY:${escapeText(title)}`,
    `DESCRIPTION:${escapeText(calendarSentence(link, appUrl))}`,
    `LOCATION:${escapeText(link || PLACE_WITHOUT_LINK)}`,
    ...(link ? [`URL:${link}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

/** Google Calendar's new-event address for the event; every value goes through encodeURIComponent. */
export function googleCalendarUrl({ title, startsMs, endsMs, meetUrl, appUrl }) {
  const link = usableLink(meetUrl);
  const query = [
    ['action', 'TEMPLATE'],
    ['text', wellFormed(title)],
    ['dates', `${utcStamp(startsMs)}/${utcStamp(endsMs)}`],
    ['details', wellFormed(calendarSentence(link, appUrl))],
    ['location', wellFormed(link || PLACE_WITHOUT_LINK)],
  ];
  return `${GOOGLE_BASE}?${query.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
}

/** A plain link's address for the file: no script runs and nothing is fetched. */
export const calendarFileHref = (text) => `data:text/calendar;charset=utf-8,${encodeURIComponent(text)}`;
