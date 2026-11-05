/**
 * Copy for the mental performance consent notices (spec 6.3; plan
 * 2026-10-30 Task 3): 'consent-needed', 'consent-reminder' and
 * 'consent-signed'. Builders only; portal/mental-consent.js and
 * portal/mental-consent-request.js decide when one is owed and send it
 * through notify.sendNotice. Kept out of portal/notices.js, which is near
 * the 500-line limit and whose bodies stay byte-identical.
 *
 * EMAIL ONLY (owner ruling 2026-11-05): every body ends with CONTACT_LINE,
 * which names Yannick by his email address. No phone number appears in
 * this file or in any copy it builds.
 *
 * Wording is gender-neutral ("the session", "yourself"). Emails are plain
 * text, so the link is written out; a push opens `notify.LINKS[kind]`.
 */

'use strict';

const {dayLabel, firstNameOf} = require('./notices');

/** The family's consent list. @const {string} */
const CONSENT_URL = 'https://portal.rypacademy.com/portal/consent/mental';
/** The last line of every consent body. @const {string} */
const CONTACT_LINE = 'Questions? Contact Yannick at yannick@rypgolf.com.';

/**
 * A body: the sentence, a blank line, the contact line.
 * @param {string} sentence The message.
 * @return {string} The body.
 */
function withContact(sentence) {
  return `${sentence}\n\n${CONTACT_LINE}`;
}

/**
 * kind `consent-needed` - a 1:1 with Yannick was booked (or Yannick pressed
 * "Send a reminder") and the athlete has no consent on file, or signed as a
 * minor and is 18 now.
 * @param {{athlete: ?Object, date: ?string, attendee: ?string,
 *     status: string, toAthlete: boolean}} args The athlete, the session's
 *     date (null when none is booked), who attends ('athlete' | 'parent'),
 *     the consent status ('unsigned' | 'needs-adult') and whether the
 *     notice goes to the athlete's own login.
 * @return {{title: string, body: string}} The copy.
 */
function consentNeeded(args) {
  const name = firstNameOf(args.athlete);
  const day = args.date ? dayLabel(args.date) : '';
  const on = day ? ` on ${day}` : '';
  const yours = day ? 'your session' : 'your next session';
  const theirs = day ? 'the session' : 'the next session';
  if (args.status === 'needs-adult') {
    if (args.toAthlete) {
      return {
        title: 'Your 18+ signature for Yannick',
        body: withContact(`You're 18 now, so please sign the mental ` +
            `performance consent yourself before ${yours} with Yannick` +
            `${on}: ${CONSENT_URL}`),
      };
    }
    return {
      title: `${name}'s 18+ signature for Yannick`,
      body: withContact(`${name} is 18 now, so ${name} signs the mental ` +
          `performance consent before ${theirs} with Yannick${on}: ` +
          CONSENT_URL),
    };
  }
  let before;
  if (args.toAthlete) {
    before = `Before ${yours} with Yannick${on}`;
  } else if (args.attendee === 'parent') {
    before = `Before ${yours} with Yannick about ${name}${on}`;
  } else {
    before = `Before ${name}'s ${day ? 'session' : 'next session'} with ` +
        `Yannick${on}`;
  }
  return {
    title: args.toAthlete ? 'Please sign Yannick\'s consent' :
        `Please sign Yannick's consent for ${name}`,
    body: withContact(`${before}, please sign the mental performance ` +
        `consent: ${CONSENT_URL}`),
  };
}

/**
 * kind `consent-reminder` - the day before a 1:1 with Yannick, the consent
 * is still not signed (or the athlete is 18 and has not signed themself).
 * @param {{athlete: ?Object, date: string, attendee: ?string,
 *     status: string, toAthlete: boolean}} args As `consentNeeded`.
 * @return {{title: string, body: string}} The copy.
 */
function consentReminder(args) {
  const name = firstNameOf(args.athlete);
  const day = dayLabel(args.date);
  const when = day ? ` (${day})` : '';
  const adult = args.status === 'needs-adult';
  let sentence;
  if (args.toAthlete) {
    sentence = `Your session with Yannick is tomorrow${when} and ` +
        (adult ? 'Yannick needs your own 18+ signature first' :
            'your mental performance consent is not signed yet');
  } else {
    const session = args.attendee === 'parent' ?
        `Your session with Yannick about ${name}` :
        `${name}'s session with Yannick`;
    let missing;
    if (adult) {
      missing = `Yannick needs ${name}'s own 18+ signature first`;
    } else if (args.attendee === 'parent') {
      missing = `${name}'s mental performance consent is not signed yet`;
    } else {
      missing = 'the mental performance consent is not signed yet';
    }
    sentence = `${session} is tomorrow${when} and ${missing}`;
  }
  return {
    title: args.toAthlete ? 'Tomorrow: your consent for Yannick' :
        `Tomorrow: Yannick's consent for ${name}`,
    body: withContact(`${sentence}: ${CONSENT_URL}`),
  };
}

/**
 * kind `consent-signed` - the receipt for a portal signature (never for a
 * paper record). An adult record told to the household drops the
 * change-choices sentence: the athlete manages it, not the parents.
 * @param {{athlete: ?Object, adultRecord: boolean, toAthlete: boolean}} args
 *     The athlete, whether the record is an adult's own (section 11) and
 *     whether the notice goes to the athlete's own login.
 * @return {{title: string, body: string}} The copy.
 */
function consentSigned(args) {
  const name = firstNameOf(args.athlete);
  if (args.toAthlete) {
    return {
      title: 'Your mental performance consent is signed',
      body: withContact('Thanks — your mental performance consent is ' +
          'signed. You can change the recording or location choice any ' +
          'time in the portal.'),
    };
  }
  const signed = `Thanks — ${name}'s mental performance consent is ` +
      'signed.';
  return {
    title: `${name}'s mental performance consent is signed`,
    body: withContact(args.adultRecord ? signed : `${signed} You can change ` +
        `the recording or location choice any time from ${name}'s card in ` +
        'the portal.'),
  };
}

module.exports = {
  CONSENT_URL,
  CONTACT_LINE,
  consentNeeded,
  consentReminder,
  consentSigned,
};
