/**
 * The mental performance consent notices' copy, pinned row by row.
 *   node portal/consent-notices.test.js
 */
'use strict';
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const C = require('./consent-notices');

const ava = {name: 'Ava Test'};
const max = {name: 'Max Test'};
const U = 'https://portal.rypacademy.com/portal/consent/mental';
const CONTACT = 'Questions? Contact Yannick at yannick@rypgolf.com.';

/**
 * One builder's arguments: the defaults with a row's overrides.
 * @param {!Object} over The row's inputs.
 * @return {!Object} The arguments.
 */
function input(over) {
  return Object.assign({date: '2026-11-12', attendee: 'athlete',
    status: 'unsigned', toAthlete: false}, over);
}

const ROWS = [
  ['consentNeeded', input({athlete: ava}),
    'Please sign Yannick\'s consent for Ava',
    `Before Ava's session with Yannick on Thu, Nov 12, please sign the ` +
      `mental performance consent: ${U}`],
  ['consentNeeded', input({athlete: ava, attendee: 'parent'}),
    'Please sign Yannick\'s consent for Ava',
    `Before your session with Yannick about Ava on Thu, Nov 12, please ` +
      `sign the mental performance consent: ${U}`],
  ['consentNeeded', input({athlete: ava, date: null}),
    'Please sign Yannick\'s consent for Ava',
    `Before Ava's next session with Yannick, please sign the mental ` +
      `performance consent: ${U}`],
  ['consentNeeded', input({athlete: max, toAthlete: true}),
    'Please sign Yannick\'s consent',
    `Before your session with Yannick on Thu, Nov 12, please sign the ` +
      `mental performance consent: ${U}`],
  ['consentNeeded', input({athlete: max, status: 'needs-adult'}),
    'Max\'s 18+ signature for Yannick',
    `Max is 18 now, so Max signs the mental performance consent before the ` +
      `session with Yannick on Thu, Nov 12: ${U}`],
  ['consentNeeded', input({athlete: max, status: 'needs-adult',
    toAthlete: true}),
  'Your 18+ signature for Yannick',
  `You're 18 now, so please sign the mental performance consent yourself ` +
    `before your session with Yannick on Thu, Nov 12: ${U}`],
  ['consentReminder', input({athlete: ava}),
    'Tomorrow: Yannick\'s consent for Ava',
    `Ava's session with Yannick is tomorrow (Thu, Nov 12) and the mental ` +
      `performance consent is not signed yet: ${U}`],
  ['consentReminder', input({athlete: ava, attendee: 'parent'}),
    'Tomorrow: Yannick\'s consent for Ava',
    `Your session with Yannick about Ava is tomorrow (Thu, Nov 12) and ` +
      `Ava's mental performance consent is not signed yet: ${U}`],
  ['consentReminder', input({athlete: ava, status: 'needs-adult'}),
    'Tomorrow: Yannick\'s consent for Ava',
    `Ava's session with Yannick is tomorrow (Thu, Nov 12) and Yannick ` +
      `needs Ava's own 18+ signature first: ${U}`],
  ['consentReminder', input({athlete: max, toAthlete: true}),
    'Tomorrow: your consent for Yannick',
    `Your session with Yannick is tomorrow (Thu, Nov 12) and your mental ` +
      `performance consent is not signed yet: ${U}`],
  ['consentSigned', {athlete: ava, adultRecord: false, toAthlete: false},
    'Ava\'s mental performance consent is signed',
    'Thanks — Ava\'s mental performance consent is signed. You can ' +
      'change the recording or location choice any time from Ava\'s card ' +
      'in the portal.'],
  ['consentSigned', {athlete: max, adultRecord: true, toAthlete: false},
    'Max\'s mental performance consent is signed',
    'Thanks — Max\'s mental performance consent is signed.'],
  ['consentSigned', {athlete: max, adultRecord: true, toAthlete: true},
    'Your mental performance consent is signed',
    'Thanks — your mental performance consent is signed. You can ' +
      'change the recording or location choice any time in the portal.'],
];

test('the constants', () => {
  assert.equal(C.CONSENT_URL, U);
  assert.equal(C.CONTACT_LINE, CONTACT);
});

ROWS.forEach(([builder, args, title, body], i) => {
  test(`row ${i + 1}: ${builder} ${title}`, () => {
    assert.deepEqual(C[builder](args), {title, body: `${body}\n\n${CONTACT}`});
  });
});

test('no phone number anywhere; every body ends with the contact line', () => {
  for (const [builder, args] of ROWS) {
    const {title, body} = C[builder](args);
    assert.ok(!/\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/.test(title + body), title);
    assert.ok(body.endsWith(C.CONTACT_LINE), title);
  }
});

run();
