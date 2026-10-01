/**
 * The per-kind notice copy (contract v2.2, TEAM.md Sprint 14 "Kinds").
 *
 * One builder per kind, each returning `{title, body}` for
 * `notify.sendNotice`. Copy is built from the SESSION document (`label`,
 * `date`, `time`, `type`) and the athlete's name - never from a booking's
 * 2025 fields (`sessionData`, `sessionType`, `time`, `location`), which no
 * v1+ booking carries.
 *
 * `title` is the email subject line and the ledger row's label; `body` is
 * the sentence the pin's table fixes, and is what an SMS sends verbatim.
 *
 * NAMES: the pin asks for the athlete's `firstName`, but `athletes` has no
 * such field in DATA-MODEL (or anywhere in the tree) - `name` is the only
 * one, and it holds a first name on every seeded and provisioned athlete.
 * `firstNameOf` therefore reads `firstName` when some future document does
 * carry it and otherwise takes the first word of `name`, so the copy is
 * right either way and nothing has to be backfilled.
 */

'use strict';

/**
 * Display names for a session with no `label` of its own. The type id stays
 * 'tournament'; families read "Tour event" (owner naming rule, 2026-09-30).
 * @const
 */
const TYPE_LABELS = {
  training: 'Training',
  tournament: 'Tour event',
  phil: 'Phil 1-on-1',
  mental: 'Mental session',
  adult: 'Adult block',
};

const dayFormat = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

/**
 * An athlete's first name for copy.
 * @param {?Object} athlete An `athletes/{id}` document body.
 * @return {string} A first name, or 'Your athlete' when unknown.
 */
function firstNameOf(athlete) {
  const raw = (athlete && (athlete.firstName || athlete.name)) || '';
  const first = String(raw).trim().split(/\s+/)[0];
  return first || 'Your athlete';
}

/**
 * A `'YYYY-MM-DD'` date as `'Wed, Nov 11'`. Formatted off UTC noon so no
 * timezone can shift the day, the same arithmetic `lib.periodFor` uses.
 * @param {?string} dateISO `'YYYY-MM-DD'`.
 * @return {string} The formatted day, or '' when the input is unusable.
 */
function dayLabel(dateISO) {
  const [y, m, d] = String(dateISO || '').split('-').map(Number);
  if (!y || !m || !d) return '';
  return dayFormat.format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/**
 * What to call a session in copy: its real event name when it has one,
 * otherwise a plain label for its type.
 * @param {?Object} session A `sessions/{id}` document body.
 * @return {string} A display label.
 */
function sessionLabel(session) {
  const s = session || {};
  return s.label || TYPE_LABELS[s.type] || 'Training';
}

/**
 * The session's start time exactly as stored (e.g. '3:00 PM').
 * @param {?Object} session A `sessions/{id}` document body.
 * @return {string} The time string, or ''.
 */
function timeLabel(session) {
  return (session && session.time) || '';
}

/**
 * "<label>, <day> at <time>", dropping whichever parts are missing.
 * @param {?Object} session A `sessions/{id}` document body.
 * @return {string} The session phrase.
 */
function sessionPhrase(session) {
  const day = dayLabel(session && session.date);
  const time = timeLabel(session);
  const when = [day, time].filter(Boolean).join(' at ');
  return [sessionLabel(session), when].filter(Boolean).join(', ');
}

/**
 * The clause naming who is actually walking in. Only a Yannick 1:1 can
 * carry `attendee: 'parent'` (contract v2.1, and the rules enforce it), so
 * this is '' for every other booking and that copy is unchanged.
 * @param {?Object} booking A `bookings/{id}` document body.
 * @return {string} The clause, or ''.
 */
function attendeeNote(booking) {
  return booking && booking.attendee === 'parent' ?
      ' A parent is attending this one.' : '';
}

/**
 * kind `booking-confirmed`.
 * @param {{athlete: ?Object, session: ?Object, booking: (?Object|undefined)}}
 *     args Copy inputs.
 * @return {{title: string, body: string}} The notice.
 */
function bookingConfirmed(args) {
  const name = firstNameOf(args.athlete);
  return {
    title: 'Session booked',
    body: `${name} is booked: ${sessionPhrase(args.session)}.` +
        attendeeNote(args.booking),
  };
}

/**
 * kind `promoted` - a waitlist spot opened and was auto-confirmed.
 * @param {{athlete: ?Object, session: ?Object, booking: (?Object|undefined)}}
 *     args Copy inputs.
 * @return {{title: string, body: string}} The notice.
 */
function promoted(args) {
  const name = firstNameOf(args.athlete);
  return {
    title: 'A spot opened up',
    body: `A spot opened — ${name} is now booked for ` +
        `${sessionPhrase(args.session)}.` + attendeeNote(args.booking),
  };
}

/**
 * kind `booking-cancelled` - the FAMILY cancelled it themselves (owner
 * ruling, 2026-09-22: send a receipt, so the other parent sees it too).
 * Deliberately plain: the screen already confirmed it, so this is a record,
 * not news. Says the token came back, because that is the thing a family
 * wants confirmed in writing.
 * @param {{athlete: ?Object, session: ?Object}} args Copy inputs.
 * @return {{title: string, body: string}} The notice.
 */
function bookingCancelled(args) {
  const name = firstNameOf(args.athlete);
  return {
    title: 'Booking cancelled',
    body: `${name}'s booking for ${sessionPhrase(args.session)} was ` +
        'cancelled. The token is back in this period.',
  };
}

/**
 * kind `session-cancelled` - the academy cancelled the block. The grace
 * token sentence is omitted when no token was minted for this session.
 * @param {{athlete: ?Object, session: ?Object, graceExpiresAt: ?string}}
 *     args Copy inputs.
 * @return {{title: string, body: string}} The notice.
 */
function sessionCancelled(args) {
  const name = firstNameOf(args.athlete);
  const day = dayLabel(args.session && args.session.date);
  const where = day ? ` on ${day}` : '';
  let body = `${sessionLabel(args.session)}${where} was cancelled by the ` +
      'academy.';
  if (args.graceExpiresAt) {
    body += ` A bonus token was added to ${name}'s account ` +
        `(expires ${dayLabel(args.graceExpiresAt)}).`;
  }
  return {title: 'Session cancelled', body};
}

/**
 * kind `booking-revoked` - ONE notice per household per billing event, not
 * one per booking.
 * @param {{count: number, reason: ?string}} args The batch the revoke
 *     cancelled and why ('lapsed' | 'downgrade').
 * @return {{title: string, body: string}} The notice.
 */
function bookingRevoked(args) {
  const count = Number(args.count || 0);
  const noun = count === 1 ? 'booking was' : 'bookings were';
  const why = args.reason === 'downgrade' ?
      'the membership plan changed' :
      'the membership lapsed';
  return {
    title: 'Upcoming bookings released',
    body: `${count} upcoming ${noun} released because ${why}. ` +
        'Book again once payment resumes.',
  };
}

/**
 * kind `reminder-24h` - tomorrow's confirmed booking.
 * @param {{athlete: ?Object, session: ?Object, booking: (?Object|undefined)}}
 *     args Copy inputs.
 * @return {{title: string, body: string}} The notice.
 */
function reminder24h(args) {
  const name = firstNameOf(args.athlete);
  const time = timeLabel(args.session);
  const when = time ? ` at ${time}` : '';
  return {
    title: 'Session tomorrow',
    body: `Reminder: ${name} has ${sessionLabel(args.session)} ` +
        `tomorrow${when}.` + attendeeNote(args.booking),
  };
}

/**
 * kind `tokens-expiring` - the period ends in EXPIRY_LEAD_DAYS days (7
 * since the 2026-09-22 ruling) with tokens left.
 * @param {{athlete: ?Object, left: number, periodEnd: string}} args Copy
 *     inputs.
 * @return {{title: string, body: string}} The notice.
 */
function tokensExpiring(args) {
  const name = firstNameOf(args.athlete);
  const left = Number(args.left || 0);
  const noun = left === 1 ? 'token' : 'tokens';
  return {
    title: 'Tokens expiring soon',
    body: `${name} has ${left} ${noun} left that expire ` +
        `${dayLabel(args.periodEnd)}. Book before then.`,
  };
}

/**
 * kind `grace-expiring` - an unconsumed bonus token expires in
 * EXPIRY_LEAD_DAYS days (7).
 * @param {{athlete: ?Object, expiresAt: string}} args Copy inputs.
 * @return {{title: string, body: string}} The notice.
 */
function graceExpiring(args) {
  const name = firstNameOf(args.athlete);
  return {
    title: 'Bonus token expiring',
    body: `${name}'s bonus token expires ${dayLabel(args.expiresAt)}.`,
  };
}

/**
 * kind `membership` - the three bodies the pin fixes, one per status the
 * household moved to.
 * @param {{status: string}} args The NEW `households.membership.status`.
 * @return {?{title: string, body: string}} The notice, or null for a status
 *     with no member-facing message.
 */
function membership(args) {
  const status = args && args.status;
  if (status === 'past_due') {
    return {
      title: 'Payment problem',
      body: 'A payment didn\'t go through — new bookings are paused until ' +
          'it clears.',
    };
  }
  if (status === 'lapsed') {
    return {
      title: 'Membership lapsed',
      body: 'Membership lapsed — upcoming bookings were released.',
    };
  }
  if (status === 'active') {
    return {
      title: 'Payment received',
      body: 'Payment received — booking is open again.',
    };
  }
  return null;
}

/**
 * kind `waitlist-expired` - the session passed without a spot. Owner
 * ruling 2026-10-01: nothing is minted; the token the entry held is free
 * again. Elite holds no token, so that sentence is left off.
 * @param {{athlete: ?Object, session: ?Object}} args Copy inputs.
 * @return {{title: string, body: string}} The notice.
 */
function waitlistExpired(args) {
  const name = firstNameOf(args.athlete);
  return {
    title: 'Waitlist closed',
    body: `The waitlist for ${sessionPhrase(args.session)} closed without ` +
        `a spot for ${name}.` +
        ((args.athlete && args.athlete.packageId) === 'elite' ? '' :
          ' The token held for it is free to use again.'),
  };
}

/**
 * kind `membership`, subject `${athleteId}_paid` - an athlete's first
 * `billing.status: 'active'` (spec 4.3). Copy 9.5.
 * @param {{bookingOpen: boolean}} args Whether `lib.bookingOpen` is true
 *     for this athlete's package right now.
 * @return {{title: string, body: string}} The notice.
 */
function paymentReceived(args) {
  const open = Boolean(args && args.bookingOpen);
  // QA 2026-09-30: a family paying for several children got identical
  // notices, so the child is named when known.
  const name = args && args.athleteName ?
      firstNameOf({name: args.athleteName}) : null;
  const who = name ? `Payment received for ${name}` : 'Payment received';
  const ready = name ? `${name} is all set to book.` :
      'you\'re all set to book.';
  return {
    title: who,
    body: open ? `${who} — ${ready}` :
      `${who} — booking opens Sat, Oct 10 at 7 AM.`,
  };
}

module.exports = {
  TYPE_LABELS,
  attendeeNote,
  bookingCancelled,
  bookingConfirmed,
  bookingRevoked,
  dayLabel,
  firstNameOf,
  graceExpiring,
  membership,
  paymentReceived,
  promoted,
  reminder24h,
  sessionCancelled,
  sessionLabel,
  sessionPhrase,
  timeLabel,
  tokensExpiring,
  waitlistExpired,
};
