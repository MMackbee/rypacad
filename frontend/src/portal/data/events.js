/**
 * The workshop card's words and pure decisions (hq card 5, 2026-11-19): an
 * academy event held online, shown on the parent and athlete homes. The
 * documents (events/{id}, eventLinks/{id}, eventSignups/{id}_{uid}) are
 * written down in docs/portal/TEAM.md, "Academy events". Nothing about one
 * event is in the code: the title, times, summary, notice and links all come
 * from the documents, and only the sentences around them are here.
 *
 * Every time a person reads is the academy's (America/Chicago), whatever
 * zone the phone is in. No network, no React: hooks/events.js reads, the
 * card renders, this file decides.
 */

export const EVENT_TZ = 'America/Chicago';

export const CARD_HEADING = 'Academy event';
export const BUTTON_COME = "I'm coming";
export const BUTTON_BACK = "I can't come";
export const BUTTON_JOIN = 'Join on Google Meet';
export const BUTTON_CHECK = 'Check for the link';
export const BUTTON_RECORDING = 'Watch the recording';
export const HAPPENING_NOW = 'Happening now. Tap "I\'m coming" to get the Google Meet link.';
export const IN_WITH_LINK = "You're in.";
export const IN_NO_LINK_STARTED = "You're in. The link isn't here yet. Check again in a minute.";
export const WRITE_FAILED = "That didn't save. Check your connection and try again.";
/** The words beside the link when the event document has no notice of its own (the owner has yet to approve them). */
export const DEFAULT_NOTICE =
  'This workshop is recorded and the recording will be posted publicly on rypacademy.com. Microphones and cameras stay off; ask questions in the chat. Athletes under 18 join with a parent.';

/** "Check for the link" shows from this long before the start. */
export const CHECK_FROM_MS = 2 * 60 * 60 * 1000;

/** Before the event's Central day: the weekday is named. */
export const inviteLine = (weekday, onTheDay) =>
  `Tap "I'm coming" and the Google Meet link will show here ${onTheDay ? 'before we start' : `on ${weekday}`}.`;
export const inNoLinkLine = (weekday, onTheDay) =>
  `You're in. The link appears here ${onTheDay ? 'before we start' : `on ${weekday}`}.`;

/** An address the card may open: https only. Anything else counts as not set. */
export function isHttps(url) {
  return typeof url === 'string' && /^https:\/\/\S/i.test(url.trim());
}

/** A Firestore Timestamp, a Date or epoch milliseconds, as milliseconds; NaN for anything else. */
export function toMs(value) {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return NaN;
}

const nonEmpty = (v) => typeof v === 'string' && v.trim() !== '';

/**
 * One events/{id} document as the card uses it, or null when it must not show:
 * not enabled, no title, or times that are not a real span.
 */
export function normalizeEvent(id, data) {
  if (!data || data.enabled !== true || !nonEmpty(data.title)) return null;
  const startsMs = toMs(data.startsAt);
  const endsMs = toMs(data.endsAt);
  if (!Number.isFinite(startsMs) || !Number.isFinite(endsMs) || endsMs <= startsMs) return null;
  return {
    id,
    title: data.title,
    summary: nonEmpty(data.summary) ? data.summary : null,
    notice: nonEmpty(data.notice) ? data.notice : DEFAULT_NOTICE,
    startsMs,
    endsMs,
    recordingUrl: isHttps(data.recordingUrl) ? data.recordingUrl.trim() : null,
  };
}

function centralParts(ms, options) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: EVENT_TZ, ...options }).formatToParts(ms);
  return Object.fromEntries(parts.map((p) => [p.type, p.value]));
}

/** The Central calendar day, 'YYYY-MM-DD'. */
export function centralDay(ms) {
  const p = centralParts(ms, { year: 'numeric', month: '2-digit', day: '2-digit' });
  return `${p.year}-${p.month}-${p.day}`;
}

/** 'Monday' for the weekday the event starts on, in Central time. */
export function weekdayName(ms) {
  return centralParts(ms, { weekday: 'long' }).weekday;
}

function dateWords(ms) {
  const p = centralParts(ms, { weekday: 'short', month: 'short', day: 'numeric' });
  return `${p.weekday}, ${p.month} ${p.day}`;
}

function clock(ms) {
  const p = centralParts(ms, { hour: 'numeric', minute: '2-digit', hour12: true });
  return { time: `${p.hour}:${p.minute}`, period: String(p.dayPeriod).toUpperCase() };
}

/**
 * 'Mon, Nov 23 · 8:00 to 8:45 PM Central'. When the two ends fall on different
 * Central days both dates show; when they are in different halves of the day
 * both AM/PM marks show.
 */
export function timeLine(startsMs, endsMs) {
  const a = clock(startsMs);
  const b = clock(endsMs);
  if (centralDay(startsMs) !== centralDay(endsMs)) {
    return `${dateWords(startsMs)}, ${a.time} ${a.period} to ${dateWords(endsMs)}, ${b.time} ${b.period} Central`;
  }
  const from = a.period === b.period ? a.time : `${a.time} ${a.period}`;
  return `${dateWords(startsMs)} · ${from} to ${b.time} ${b.period} Central`;
}

/** Events that show at `now`, earliest start first: not ended, or ended with a recording link. */
export function visibleEvents(events, now) {
  return events
    .filter((e) => e && (now < e.endsMs || e.recordingUrl))
    .sort((x, y) => x.startsMs - y.startsMs || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}

/** The next moment the card changes by itself (a state boundary after `now`), or null. */
export function nextChange(event, now, signedUp) {
  const marks = [event.startsMs, event.endsMs];
  if (signedUp) marks.push(event.startsMs - CHECK_FROM_MS);
  const later = marks.filter((m) => m > now);
  return later.length ? Math.min(...later) : null;
}

/**
 * What the card renders for one event.
 *
 * @param {object} event  normalizeEvent's answer.
 * @param {{signedUp: boolean, meetUrl: ?string, now: number}} state
 * @returns {{show: boolean, kind?: string, title?: string, timeLine?: ?string, summary?: ?string, notice?: ?string,
 *   status?: ?string, primary?: ?{action: string, label: string, href?: string}, quiet?: Array<{action: string, label: string}>}}
 */
export function eventView(event, { signedUp, meetUrl, now }) {
  if (!event) return { show: false };
  if (now >= event.endsMs) {
    if (!event.recordingUrl) return { show: false };
    return {
      show: true, kind: 'recording', title: event.title, timeLine: null, summary: null, notice: null, status: null,
      primary: { action: 'recording', label: BUTTON_RECORDING, href: event.recordingUrl }, quiet: [],
    };
  }
  const started = now >= event.startsMs;
  const onTheDay = centralDay(now) === centralDay(event.startsMs);
  const weekday = weekdayName(event.startsMs);
  const base = { show: true, title: event.title, timeLine: timeLine(event.startsMs, event.endsMs), summary: event.summary, notice: event.notice };
  if (!signedUp) {
    return {
      ...base, kind: 'invite', status: started ? HAPPENING_NOW : inviteLine(weekday, onTheDay),
      primary: { action: 'come', label: BUTTON_COME }, quiet: [],
    };
  }
  const quiet = [];
  if (!started) quiet.push({ action: 'back', label: BUTTON_BACK });
  if (isHttps(meetUrl)) {
    return { ...base, kind: 'in', status: IN_WITH_LINK, primary: { action: 'join', label: BUTTON_JOIN, href: meetUrl.trim() }, quiet };
  }
  if (started || event.startsMs - now <= CHECK_FROM_MS) quiet.push({ action: 'check', label: BUTTON_CHECK });
  return { ...base, kind: 'in', status: started ? IN_NO_LINK_STARTED : inNoLinkLine(weekday, onTheDay), primary: null, quiet };
}
