import React, { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { color, font } from '../tokens';
import Button from './Button';
import { Body, Card, SectionLabel } from './Primitives';
import { addDaysISO, windowOpensOn } from '../data/calendar';
import { firstRunningWeek, lastRunningWeek } from '../data/season';

/**
 * "Repeat weekly" on Book a Session's Slot reserved screen (rewritten
 * 2026-09-30 after "the button does nothing"). ONE offer - every week of
 * this slot the booking window holds right now - because the window, not a
 * preset end date, decides how far a repeat can reach, and nothing is held
 * past it (no standing reservations). When no further week is inside the
 * window the card says when the next one opens instead of offering a button
 * that would book nothing. Split out of BookSession.js, which is over the
 * 500-line guideline, so that file does not grow. The same card follows a
 * Phil booking on the specialist screen (owner 2026-09-30).
 *
 * @param {string} date        The booked session's date ('yyyy-MM-dd').
 * @param {string} time        Its start, '4:00 PM'.
 * @param {string} type        Its session type ('training', 'phil'): tells a holiday extra from a closure, and words the skipped weeks.
 * @param {string} windowEnd   The last bookable date for THIS athlete's package (openThrough).
 * @param {number} windowMonths  That package's window in months (windowMonthsFor), for the reach line and the day a locked week opens.
 * @param {boolean} elite      Elite spends no token, so no token line.
 * @param {string[]} [offeredDates]  The dates the screen's live read offers this slot on (offeredWeeks below; a hidden session is on no such read). Given, the card offers only those weeks; absent, the static season.
 * @param {(untilISO) => Promise} onRepeat  useBooking().bookRecurring for the booked slot.
 */
export default function RepeatWeekly({ date, time, type, windowEnd, windowMonths = 1, elite, offeredDates, onRepeat }) {
  // null (offer), 'working', or bookRecurring's result.
  const [repeat, setRepeat] = useState(null);
  const weeks = repeatWeeks({ date, time, type, windowEnd, offeredDates });
  // The season's last running week, or no offered week left, has nothing to repeat into.
  if (!weeks) return null;
  const { nextWeek, until } = weeks;
  const weekday = format(parseISO(date), 'EEEE');

  const run = async () => {
    setRepeat('working');
    try {
      setRepeat(await onRepeat(until));
    } catch (err) {
      setRepeat({ booked: [], skipped: [], failed: err?.message || 'Repeats did not go through.' });
    }
  };

  return (
    <Card large style={{ width: '100%', marginTop: 10 }}>
      <SectionLabel style={{ marginBottom: 10 }}>Repeat weekly</SectionLabel>
      {repeat === 'working' ? (
        <Body size={12}>Booking your repeats…</Body>
      ) : repeat ? (
        <RepeatSummary result={repeat} type={type} />
      ) : nextWeek > windowEnd ? (
        <Body size={12}>
          Next {weekday} ({shortDay(nextWeek)}) opens for booking at 7 AM on{' '}
          {shortDay(windowOpensOn(nextWeek, windowMonths))}.
        </Body>
      ) : (
        <>
          {/* Owner 2026-09-30: the window is the no-show control, so say
              plainly what it holds and when the rest opens. Owner 2026-11-02:
              the window is whole months, so the rest opens on the 1st. */}
          <Body size={12} style={{ marginBottom: 12 }}>
            Hold {weekday} at {time} every week through {shortDay(until)}, the furthest you can book
            today ({windowMonths === 2 ? 'two months ahead' : 'through next month'}). A further month
            opens at 7 AM on the 1st; come back then to extend.
            {elite ? '' : " Each week spends a token from that week's period."}
          </Body>
          <Button variant="outline" height={46} style={{ boxShadow: 'none' }} onClick={run}>
            Repeat every {weekday} through {shortDay(until)}
          </Button>
        </>
      )}
    </Card>
  );
}

/**
 * The dates a screen's live read offers the booked slot on (same type and
 * full time), for the card's offeredDates (owner 2026-11-05: a hidden
 * session is on no such read, data/hiddenSessions.js). undefined when the
 * read does not hold the booked session itself: it is then not the read the
 * booking came from (an older one), and the card keeps the static season.
 *
 * @param {Array<{id, date, time, type}>} rows  The read's rows, `time` the full '6:00 PM'.
 * @param {{id, time, type}} slot               The booked session.
 */
export function offeredWeeks(rows, slot) {
  if (!Array.isArray(rows) || !slot || !rows.some((r) => r.id === slot.id)) return undefined;
  return rows.filter((r) => r.type === slot.type && r.time === slot.time).map((r) => r.date);
}

/**
 * The week the card names next and the last week it offers, or null for no
 * card. The static season: the next week this slot runs (a closure - the
 * Dec 23 - Jan 3 break - is neither offered nor named as the week to come
 * back for) and the last one the window holds, stepped back over closures,
 * so a window ending Dec 31 reads "through Tue, Dec 22", not a date in the
 * Christmas break (review 2026-11-02). With offeredDates (owner 2026-11-05)
 * the weeks inside the window are only the ones the live read offers, so a
 * hidden week is neither offered nor the reach, and none left means no card
 * rather than an offer that books nothing. The "opens" line for the week
 * just past the window stays the static season's: no read reaches past it.
 */
export function repeatWeeks({ date, time, type, windowEnd, offeredDates }) {
  const nextWeek = firstRunningWeek(addDaysISO(date, 7), time, type);
  if (!nextWeek) return null;
  if (nextWeek > windowEnd || !offeredDates) {
    return { nextWeek, until: lastRunningWeek(nextWeek, windowEnd, time, type) ?? nextWeek };
  }
  const offered = new Set(offeredDates);
  const weeks = [];
  for (let week = addDaysISO(date, 7); week <= windowEnd; week = addDaysISO(week, 7)) {
    if (offered.has(week)) weeks.push(week);
  }
  return weeks.length ? { nextWeek: weeks[0], until: weeks[weeks.length - 1] } : null;
}

/** '2026-12-16' -> 'Wed, Dec 16'. */
function shortDay(iso) {
  return format(parseISO(iso), 'EEE, MMM d');
}

/** bookRecurring's skip reasons, in the order the summary lists them. */
const SKIP_COPY = [
  ['not open yet', 'not open for booking yet'],
  ['period limit', "no tokens left in that week's period"],
  ['full', 'full'],
  ['no session', 'no session that day'],
  ['already booked', 'already booked'],
  ['one per day', "there's already one booked that day (Elite includes one a day)"],
  // A week whose block is reserved by handicap (owner ruling 2026-10-02):
  // the skip's own message is the card's line and replaces this one.
  ['handicap-reserved', 'reserved for lower handicaps'],
  ['error', "didn't go through"],
];
const KNOWN_SKIPS = new Set(SKIP_COPY.map(([reason]) => reason));
/** The two reasons that name the session, as they read after a Phil booking. */
const PHIL_SKIP_COPY = {
  'no session': 'no Performance with Phil session at that time',
  'one per day': "there's already a Performance with Phil session booked that day (Elite includes one a day)",
};

/**
 * One line per skip reason, naming the weeks (all the same weekday, so the
 * date alone), plus the first week past the window and when it opens.
 */
function skipLines(skipped, type) {
  return SKIP_COPY.map(([reason, groupCopy]) => {
    const weeks = skipped.filter((s) => (KNOWN_SKIPS.has(s.reason) ? s.reason : 'error') === reason);
    if (!weeks.length) return null;
    const first = weeks[0];
    const copy = (reason === 'handicap-reserved' && first.message) || (type === 'phil' && PHIL_SKIP_COPY[reason]) || groupCopy;
    const detail =
      reason === 'not open yet' && first.opensOn
        ? ` - the first opens 7 AM on ${shortDay(first.opensOn)}`
        : reason === 'error' && first.message
          ? ` - ${first.message}`
          : '';
    const line = `${weeks.map((s) => format(parseISO(s.date), 'MMM d')).join(', ')}: ${copy}${detail}`;
    return /[.!?]$/.test(line) ? line : `${line}.`;
  }).filter(Boolean);
}

function RepeatSummary({ result, type }) {
  if (result.failed) {
    return (
      <Body size={12} tone={color.error}>
        {result.failed}
      </Body>
    );
  }
  const n = result.booked.length;
  const skipped = result.skipped ?? [];
  return (
    <>
      <div style={{ font: `700 17px ${font.head}`, color: n ? color.primary : color.text }}>
        {n ? `${n} more week${n === 1 ? '' : 's'} booked` : 'No extra weeks booked'}
      </div>
      {n && !skipped.length ? (
        <Body size={12} style={{ marginTop: 8 }}>
          Every week you can book right now is reserved.
        </Body>
      ) : null}
      {skipLines(skipped, type).map((line) => (
        <Body key={line} size={12} style={{ marginTop: 8 }}>
          {line}
        </Body>
      ))}
      {result.next ? (
        <Body size={12} style={{ marginTop: 8 }}>
          {shortDay(result.next.date)} opens 7 AM on {shortDay(result.next.opensOn)} - come back to add it.
        </Body>
      ) : null}
    </>
  );
}
