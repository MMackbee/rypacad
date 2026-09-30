import React, { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { color, font } from '../tokens';
import Button from './Button';
import { Body, Card, SectionLabel } from './Primitives';
import { addDaysISO, windowOpensOn } from '../data/calendar';
import { SEASON_BOUNDS, firstRunningWeek } from '../data/season';

/**
 * "Repeat weekly" on Book a Session's Slot reserved screen (rewritten
 * 2026-09-30 after "the button does nothing"). ONE offer - every week of
 * this slot the booking window holds right now - because the window, not a
 * preset end date, decides how far a repeat can reach, and nothing is held
 * past it (no standing reservations). When no further week is inside the
 * window the card says when the next one opens instead of offering a button
 * that would book nothing. Split out of BookSession.js, which is over the
 * 500-line guideline, so that file does not grow.
 *
 * @param {string} date        The booked session's date ('yyyy-MM-dd').
 * @param {string} time        Its start, '4:00 PM'.
 * @param {string} type        Its session type ('training'), to tell a holiday extra from a closure.
 * @param {string} windowEnd   The last bookable date for THIS athlete's package (openThrough).
 * @param {number} windowDays  That package's window, for the "N days ahead" line.
 * @param {boolean} elite      Elite spends no token, so no token line.
 * @param {(untilISO) => Promise} onRepeat  useBooking().bookRecurring for the booked slot.
 */
export default function RepeatWeekly({ date, time, type, windowEnd, windowDays, elite, onRepeat }) {
  // null (offer), 'working', or bookRecurring's result.
  const [repeat, setRepeat] = useState(null);
  // The next week this slot actually runs: a closure (the Dec 23 - Jan 3
  // break) is neither offered nor named as the week to come back for.
  const nextWeek = firstRunningWeek(addDaysISO(date, 7), time, type);
  // The season's last running week has nothing to repeat into.
  if (!nextWeek) return null;
  const weekday = format(parseISO(date), 'EEEE');
  const until = windowEnd < SEASON_BOUNDS.end ? windowEnd : SEASON_BOUNDS.end;

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
        <RepeatSummary result={repeat} />
      ) : nextWeek > windowEnd ? (
        <Body size={12}>
          Next {weekday} ({shortDay(nextWeek)}) opens for booking at 7 AM on{' '}
          {shortDay(windowOpensOn(nextWeek, windowDays))}.
        </Body>
      ) : (
        <>
          <Body size={12} style={{ marginBottom: 12 }}>
            Hold {weekday} at {time} every week you can book right now. Later weeks open one day at a
            time at 7 AM, {windowDays} days ahead.{elite ? '' : " Each week spends a token from that week's period."}
          </Body>
          <Button variant="outline" height={46} style={{ boxShadow: 'none' }} onClick={run}>
            Repeat every {weekday} through {shortDay(until)}
          </Button>
        </>
      )}
    </Card>
  );
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
  ['error', "didn't go through"],
];
const KNOWN_SKIPS = new Set(SKIP_COPY.map(([reason]) => reason));

/**
 * One line per skip reason, naming the weeks (all the same weekday, so the
 * date alone), plus the first week past the window and when it opens.
 */
function skipLines(skipped) {
  return SKIP_COPY.map(([reason, copy]) => {
    const weeks = skipped.filter((s) => (KNOWN_SKIPS.has(s.reason) ? s.reason : 'error') === reason);
    if (!weeks.length) return null;
    const first = weeks[0];
    const detail =
      reason === 'not open yet' && first.opensOn
        ? ` — the first opens 7 AM on ${shortDay(first.opensOn)}`
        : reason === 'error' && first.message
          ? ` — ${first.message}`
          : '';
    const line = `${weeks.map((s) => format(parseISO(s.date), 'MMM d')).join(', ')}: ${copy}${detail}`;
    return /[.!?]$/.test(line) ? line : `${line}.`;
  }).filter(Boolean);
}

function RepeatSummary({ result }) {
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
      {skipLines(skipped).map((line) => (
        <Body key={line} size={12} style={{ marginTop: 8 }}>
          {line}
        </Body>
      ))}
      {result.next ? (
        <Body size={12} style={{ marginTop: 8 }}>
          {shortDay(result.next.date)} opens 7 AM on {shortDay(result.next.opensOn)} — come back to add it.
        </Body>
      ) : null}
    </>
  );
}
