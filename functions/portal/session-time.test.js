'use strict';
// The server's session start parser (booking changes, 2026-11-11): the
// callable decides "already started" on the academy clock, as the app does.
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const t = require('./session-time');

test('parseTimeToMinutes: the client parser; anything else is null', () => {
  const times = ['4:00 PM', '12:00 PM', '12:15 AM', '9:05 am', '4:00pm'];
  assert.deepEqual(times.map(t.parseTimeToMinutes), [960, 720, 15, 545, 960]);
  const junk = ['TBA', '', undefined, '16:00', '4 PM'];
  assert.deepEqual(junk.map(t.parseTimeToMinutes),
      [null, null, null, null, null]);
});
// 2026-11-10T18:00:00Z is noon Tue Nov 10 in Chicago.
const NOON = new Date('2026-11-10T18:00:00Z');
test('sessionStarted on the academy clock', () => {
  const s = (date, time) => ({date, time});
  assert.equal(t.sessionStarted(s('2026-11-09', '4:00 PM'), NOON), true);
  assert.equal(t.sessionStarted(s('2026-11-11', '9:00 AM'), NOON), false);
  assert.equal(t.sessionStarted(s('2026-11-10', '11:59 AM'), NOON), true);
  assert.equal(t.sessionStarted(s('2026-11-10', '12:00 PM'), NOON), true);
  assert.equal(t.sessionStarted(s('2026-11-10', '12:01 PM'), NOON), false);
  assert.equal(t.sessionStarted(s('2026-11-10', 'TBA'), NOON), false);
  assert.equal(t.sessionStarted(null, NOON), false);
  // 03:00Z on Nov 11 is 9 PM Nov 10 in Chicago: the Chicago date decides.
  const night = new Date('2026-11-11T03:00:00Z');
  assert.equal(t.sessionStarted(s('2026-11-10', '8:00 PM'), night), true);
  assert.equal(t.sessionStarted(s('2026-11-11', '9:00 AM'), night), false);
});

run();
