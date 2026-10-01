'use strict';
// submitScholarship: the public website's scholarship form. Anyone can call
// it, so the tests pin what it refuses as much as what it stores.
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const scholarship = require('./scholarship');

const NOW = new Date('2026-10-02T15:00:00Z');
const SITE = 'https://www.rypacademy.com';
const GOOD = {
  parent: ' Dana Hart ', relationship: 'Parent', email: 'Dana@Example.com',
  phone: '612-555-0100', athlete: 'Sam Hart', dob: '2012-05-01',
  school: '', grade: '8', average: '82.1', handicap: '', events: '',
  package: '12 tokens', level: 'Partial', need: '',
  statement: 'Sam tries hard, trains smart and backs his teammates.',
  confirmed: true,
};

/**
 * A stand-in store.
 * @param {!Object} docs `{'collection/id': body}`, written in place.
 * @return {!Object} The store.
 */
function fakeStore(docs) {
  return {collection: (c) => ({doc: (id) => ({
    get: async () => ({exists: `${c}/${id}` in docs,
      data: () => docs[`${c}/${id}`]}),
    set: async (body) => {
      docs[`${c}/${id}`] = body;
    },
  })})};
}

/**
 * One request through the handler.
 * @param {*} body The request body.
 * @param {!Object=} opts `{method, origin, docs, db, now, mail}`.
 * @return {!Promise<!Object>} `{status, json, headers, docs, mails}`.
 */
async function post(body, opts) {
  const o = opts || {};
  const docs = o.docs || {};
  const mails = [];
  const headers = {};
  const out = {status: null, json: null};
  const req = {method: o.method || 'POST', body,
    get: (h) => (h.toLowerCase() === 'origin' ?
        ('origin' in o ? o.origin : SITE) : null)};
  const res = {
    set: (k, v) => {
      headers[k] = v;
    },
    status: (s) => {
      out.status = s;
      return res;
    },
    json: (j) => {
      out.json = j;
    },
    send: () => {},
  };
  await scholarship.submitScholarshipHandler(req, res, {
    db: o.db || fakeStore(docs), now: o.now || NOW,
    sendEmail: async (m) => {
      mails.push(m);
      return o.mail || {status: 'sent'};
    },
  });
  return {status: out.status, json: out.json, headers, docs, mails};
}

test('a good application is stored once and emailed to the director',
    async () => {
      const r = await post(GOOD);
      assert.equal(r.status, 200);
      assert.deepEqual(r.json, {ok: true});
      assert.equal(r.headers['Access-Control-Allow-Origin'], SITE);
      const id = scholarship.applicationId(scholarship.validate(GOOD, NOW));
      const row = r.docs[`scholarshipApplications/${id}`];
      assert.equal(row.parent, 'Dana Hart'); // trimmed
      assert.equal(row.email, 'dana@example.com'); // lower-cased
      assert.deepEqual([row.season, row.status, row.submissions,
        row.email_status], ['2026-27', 'new', 1, 'sent']);
      assert.equal(row.confirmed, undefined); // the tick is not data
      assert.equal(r.mails.length, 1);
      assert.equal(r.mails[0].to, 'makel@rypgolf.com');
      assert.equal(r.mails[0].subject, 'Scholarship application - Sam Hart');
      assert.match(r.mails[0].text, /Email: dana@example\.com/);
      assert.match(r.mails[0].text, /School: not given/);
      assert.match(r.mails[0].text, /Sam tries hard/);
      assert.equal(r.docs['scholarshipMeta/2026-10-02'].count, 1);
    });

test('each bad field is refused by name; nothing is stored or emailed',
    async () => {
      const bad = [
        [{parent: ''}, 'parent'], [{email: 'nope'}, 'email'],
        [{phone: '555'}, 'phone'], [{athlete: '  '}, 'athlete'],
        [{dob: '2099-01-01'}, 'dob'], [{dob: 'May 1'}, 'dob'],
        [{average: ''}, 'average'], [{statement: 'Too short.'}, 'statement'],
        [{confirmed: 'yes'}, 'confirm'], [{package: 'Platinum'}, 'package'],
        [{level: 'All of it'}, 'level'],
        [{relationship: 'Coach'}, 'relationship'],
        [{statement: 'x'.repeat(6001)}, 'statement'],
        [{need: 'x'.repeat(3001)}, 'need'],
      ];
      for (const [over, field] of bad) {
        const r = await post(Object.assign({}, GOOD, over));
        assert.equal(r.status, 400, field);
        assert.equal(r.json.field, field);
        assert.equal(Object.keys(r.docs).length, 0, field);
        assert.equal(r.mails.length, 0, field);
      }
    });

test('other sites, other methods, oversize bodies and bots are turned away',
    async () => {
      const other = await post(GOOD, {origin: 'https://evil.example'});
      assert.equal(other.status, 403);
      assert.equal(other.headers['Access-Control-Allow-Origin'], undefined);
      assert.equal(Object.keys(other.docs).length, 0);
      assert.equal((await post(GOOD, {method: 'GET'})).status, 405);
      const pre = await post(null, {method: 'OPTIONS'});
      assert.equal(pre.status, 204);
      assert.equal(pre.headers['Access-Control-Allow-Methods'], 'POST');
      const big = await post(Object.assign({}, GOOD,
          {extra: 'x'.repeat(21000)}));
      assert.equal(big.status, 400);
      assert.equal((await post('not json')).status, 400);
      // The honeypot: told it worked, nothing kept, nobody emailed.
      const bot = await post(Object.assign({}, GOOD, {website: 'http://x'}));
      assert.deepEqual([bot.status, bot.json], [200, {ok: true}]);
      assert.equal(Object.keys(bot.docs).length, 0);
      assert.equal(bot.mails.length, 0);
      // No Origin (not a browser): same checks, no CORS header.
      const bare = await post(GOOD, {origin: null});
      assert.equal(bare.status, 200);
      assert.equal(bare.headers['Access-Control-Allow-Origin'], undefined);
    });

test('a resubmission replaces the row; inside a minute it is refused',
    async () => {
      const first = await post(GOOD);
      const soon = await post(GOOD, {docs: first.docs,
        now: new Date(NOW.getTime() + 20000)});
      assert.equal(soon.status, 429);
      assert.equal(soon.mails.length, 0);
      const later = await post(Object.assign({}, GOOD, {average: '79.0'}),
          {docs: first.docs, now: new Date(NOW.getTime() + 3600000)});
      assert.equal(later.status, 200);
      const rows = Object.keys(later.docs)
          .filter((k) => k.startsWith('scholarshipApplications/'));
      assert.equal(rows.length, 1);
      assert.deepEqual([later.docs[rows[0]].average,
        later.docs[rows[0]].submissions, later.docs[rows[0]].createdAtMs],
      ['79.0', 2, NOW.getTime()]);
    });

test('the daily cap, a failed email and a store failure', async () => {
  const full = await post(GOOD, {docs:
    {'scholarshipMeta/2026-10-02': {count: scholarship.DAILY_CAP}}});
  assert.equal(full.status, 429);
  assert.equal(full.mails.length, 0);
  // The email failing does not lose the application.
  const unsent = await post(GOOD, {mail: {status: 'failed'}});
  assert.equal(unsent.status, 200);
  const id = scholarship.applicationId(scholarship.validate(GOOD, NOW));
  assert.equal(unsent.docs[`scholarshipApplications/${id}`].email_status,
      'failed');
  const down = await post(GOOD, {db: {collection: () => {
    throw new Error('firestore down');
  }}});
  assert.equal(down.status, 500);
  assert.equal(down.json.ok, false);
});

run();
