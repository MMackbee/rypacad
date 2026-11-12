import React from 'react';
import { color, font, radius, tint } from '../tokens';
import Button from './Button';
import { capMonthCopy, capOpensCopy, capPickCopy, reasonCopy } from './BookingReasons';
import { Banner, Body, Card, SectionLabel } from './Primitives';
import { NextPeriodLine, nextPeriodHeld, nextPeriodName, nextPeriodOpen, nextPeriodOpensAt, spentTitle } from './AllowancePools';
import { calendlyLinkFor, CALENDLY_NOTE, CALENDLY_NOTE_UNLIMITED } from '../data/calendly';
import { todayISO } from '../data/calendar';
import { attendeeContact, calendlyBlockReason } from '../data/specialistGate';

/** The token reasons (specialistGate calendlyBlockReason). */
const TOKEN_REASONS = ['no-tokens-left', 'no-session-token', 'next-period-not-open', 'next-period-spent'];

/**
 * The line beside the button when today's month is closed and a later day
 * is open (review 2026-11-04). Today's cap booked: the month to pick and why
 * not before it (capPickCopy). Else this period spent with the next one
 * open (2026-11-01; AllowancePools nextPeriodOpen - from 7 AM Chicago on
 * its 1st, never before): a time before it would go over the package.
 */
function pickLine({ tokens, reach, now }) {
  const thisMonth = todayISO().slice(0, 7);
  const openMonth = reach && reach.openDay ? reach.openDay.date.slice(0, 7) : null;
  if (openMonth && openMonth > thisMonth && reach.capMonths.includes(thisMonth)) {
    return capPickCopy(reach.capMonths.filter((m) => m < openMonth), reach.openDay.date);
  }
  const next = nextPeriodOpen(tokens, now);
  if (!next) return null;
  const when = next.periodKey.endsWith('-01') ? `in ${nextPeriodName(next)}` : `from ${nextPeriodName(next)}`;
  return `This period's tokens are used. Pick a time ${when}: a time before then would go over your package.`;
}

/**
 * The hidden button's banner (review 2026-11-04). The cap: the 1st after the
 * last booked month in a row, or the season's end (capOpensCopy). The next
 * period counted but not open yet: when it opens. The next period spent
 * where the cap is free: no tokens there. A token reason with a later
 * month's cap booked as well names that month too - the line beneath may
 * still count tokens there.
 */
function blockCopy(reason, { tokens, reach, now }) {
  if (reason === 'cap-reached') return capOpensCopy(todayISO(), reach ? reach.capMonths : []);
  let copy;
  if (reason === 'next-period-not-open') {
    const held = nextPeriodHeld(tokens);
    copy = `${spentTitle(held, tokens.reserved)}. ${nextPeriodName(held)} opens for booking at ${nextPeriodOpensAt(held, now)}.`;
  } else if (reason === 'next-period-spent') {
    const name = nextPeriodName(tokens.nextPeriod);
    copy = tokens.nextPeriod.periodKey.endsWith('-01')
      ? `No ${name} tokens left - a ${name} time would go over your package.`
      : `No tokens left from ${name} - a time from then would go over your package.`;
  } else {
    copy = reasonCopy(reason);
  }
  if (!TOKEN_REASONS.includes(reason) || !reach || !reach.capOpenDay) return copy;
  const later = reach.capMonths.filter((m) => m > reach.capOpenDay.date.slice(0, 7));
  return later.length ? `${copy} ${capMonthCopy(later[0], reach.capMonths)}` : copy;
}

/**
 * Yannick via Calendly (spec 6.1): one button, gated exactly like an in-app
 * booking, opening a prefilled link in a new tab. Calendly takes any date,
 * so this panel owns the Calendly guidance (review 2026-11-04): with today's
 * month closed - its cap booked, or its tokens spent - the button stays while
 * a later day in reach is open (`reach`: specialistGate calendlyReach - each
 * day's month cap and its own tokens, inside the season) and one line says
 * which month to pick and why not before; with nothing open the banner says
 * why. A next period counts as open only from 7 AM Chicago on its 1st
 * (AllowancePools nextPeriodOpen). `capReached` (today's month) stands in
 * when no days are in hand; `now` is for tests.
 */
export default function CalendlyPanel({ data, tokens, capReached, reach = null, attendee, onAttendee, householdId, now = new Date(), open = (url) => window.open(url, '_blank', 'noopener') }) {
  const reason = calendlyBlockReason({ billingStatus: data.billingStatus, bookingOpen: data.bookingOpen, tokens, capReached, reach, now });
  // Only beside the button: a hidden button's banner says why instead.
  const pick = reason ? null : pickLine({ tokens, reach, now });
  const contact = attendeeContact({ attendee, athlete: data.athlete, guardian: data.guardian });
  const link = calendlyLinkFor({ url: data.calendlyUrl, athleteId: data.athlete?.id ?? '', athleteName: data.athlete?.name ?? '', householdId: householdId ?? '', ...contact });
  return (
    <Card large>
      <SectionLabel>Who is attending?</SectionLabel>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        {[['athlete', 'The athlete'], ['parent', 'A parent']].map(([value, label]) => {
          const on = attendee === value;
          return (
            <button key={value} type="button" aria-pressed={on} onClick={() => onAttendee(value)}
              style={{ flex: 1, minHeight: 44, cursor: 'pointer', borderRadius: radius.input, border: `1px solid ${on ? color.primary : color.controlBorder}`, background: on ? tint.green : 'transparent', color: on ? color.primary : color.textSecondary, font: `600 13px ${font.body}` }}>
              {label}
            </button>
          );
        })}
      </div>
      {reason ? (
        <Banner tone="yellow" title="Not yet" style={{ marginTop: 14 }}>{blockCopy(reason, { tokens, reach, now })}</Banner>
      ) : (
        <Button height={50} onClick={() => open(link)} style={{ marginTop: 14 }}>Book with Yannick</Button>
      )}
      {pick ? (
        <Body size={12} tone={color.textSecondary} style={{ marginTop: 10 }}>
          {pick}
        </Body>
      ) : null}
      <NextPeriodLine tokens={tokens} style={{ marginTop: pick ? 4 : 10 }} />
      <Body size={11} tone={color.textTertiary} style={{ marginTop: 10 }}>{tokens?.unlimited ? CALENDLY_NOTE_UNLIMITED : CALENDLY_NOTE}</Body>
    </Card>
  );
}
