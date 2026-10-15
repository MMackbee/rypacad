'use strict';
// submitFeedback: the portal's Feedback button. fetch is a stand-in - no
// test reaches Slack - and Firestore is fake-firestore's map.
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const {fakeDb} = require('./fake-firestore');
const feedback = require('./feedback');

const NOW = new Date('2026-10-15T14:41:00Z');
const TOKEN = 'xoxb-test-token-never-logged';
const ENV = {SLACK_FEEDBACK_TOKEN: TOKEN, SLACK_FEEDBACK_CHANNEL: 'C0FEEDBACK'};
const UPLOAD_URL = 'https://files.slack.com/upload/v1/abc123';
const AUTH = {uid: 'u-dana', token: {email: 'token@example.com'}};
const USER = {displayName: 'Dana Hart', role: 'parent',
  email: 'dana@example.com', householdId: 'hh'};

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(64, 7)]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 3)]);
const dataUrl = (type, bytes) =>
  `data:image/${type};base64,${bytes.toString('base64')}`;

/**
 * A stand-in Slack: answers each Web API method, takes the upload, and
 * records every request.
 * @param {!Object=} opts `{answers, uploadStatus, throws}`.
 * @return {{fetch: !Function, calls: !Array<!Object>}} The fake.
 */
function fakeSlack(opts) {
  const o = opts || {};
  const calls = [];
  const defaults = {
    'files.getUploadURLExternal': {ok: true, upload_url: UPLOAD_URL,
      file_id: 'F0SHOT'},
    'files.completeUploadExternal': {ok: true, files: [{id: 'F0SHOT'}]},
    'chat.postMessage': {ok: true, ts: '1760539260.000100'},
  };
  const fetch = async (url, init) => {
    calls.push({url, init});
    if (o.throws) throw new Error('getaddrinfo ENOTFOUND slack.com');
    if (url === UPLOAD_URL) {
      const status = o.uploadStatus || 200;
      return {ok: status === 200, status, json: async () => ({})};
    }
    const method = url.replace('https://slack.com/api/', '');
    const answer = (o.answers && o.answers[method]) || defaults[method];
    return {ok: true, status: 200, json: async () => answer};
  };
  return {fetch, calls};
}

/**
 * @param {!Object} call A recorded Slack call.
 * @return {!Object} Its form fields.
 */
const form = (call) => Object.fromEntries(new URLSearchParams(call.init.body));

/**
 * One call through the handler, with console output captured.
 * @param {*} data The payload.
 * @param {!Object=} opts `{docs, slack, env, auth, now}`.
 * @return {!Promise<!Object>} `{result, error, docs, calls, logs}`.
 */
async function send(data, opts) {
  const o = opts || {};
  const docs = o.docs || {'users/u-dana': Object.assign({}, USER)};
  const slack = o.slack || fakeSlack();
  const logs = [];
  const keep = {log: console.log, error: console.error};
  console.log = (...a) => logs.push(a.join(' '));
  console.error = (...a) => logs.push(a.join(' '));
  let result = null;
  let error = null;
  try {
    result = await feedback.submitFeedbackHandler(data,
        {auth: 'auth' in o ? o.auth : AUTH},
        {db: fakeDb(docs), fetch: slack.fetch, env: o.env || ENV,
          now: o.now || NOW});
  } catch (err) {
    error = err;
  } finally {
    console.log = keep.log;
    console.error = keep.error;
  }
  return {result, error, docs, calls: slack.calls, logs};
}

const NOTE = {note: 'The Book button did nothing.', page: '/portal/book',
  viewport: '390x844 @3x', appVersion: 'build 3f2a1b9c',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) ' +
    'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 ' +
    'Safari/604.1'};

test('signed out is refused before anything else', async () => {
  const r = await send(NOTE, {auth: null});
  assert.equal(r.error.code, 'unauthenticated');
  assert.equal(r.calls.length, 0);
});

test('a note alone goes out as one chat.postMessage', async () => {
  const r = await send(NOTE);
  assert.equal(r.error, null);
  assert.deepEqual(r.result, {ok: true});
  assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0].url, 'https://slack.com/api/chat.postMessage');
  assert.equal(r.calls[0].init.headers.Authorization, `Bearer ${TOKEN}`);
  const f = form(r.calls[0]);
  assert.equal(f.channel, 'C0FEEDBACK');
  const lines = f.text.split('\n');
  assert.equal(lines[0],
      '*Portal feedback* from Dana Hart (parent, dana@example.com)');
  assert.equal(lines[1], 'Page: /portal/book');
  assert.equal(lines[2],
      'Device: iPhone (iOS 17.5), Safari 17 · 390x844 @3x');
  assert.match(lines[3],
      /^App: build 3f2a1b9c · Oct 15, 2026, 9:41\s?AM CDT$/);
  assert.equal(lines[4], '');
  assert.equal(lines[5], 'The Book button did nothing.');
});

test('with a screenshot: upload URL, the bytes, then complete with the ' +
    'message as its comment', async () => {
  const r = await send(Object.assign({}, NOTE,
      {image: {dataUrl: dataUrl('jpeg', JPEG), width: 1170, height: 2532}}));
  assert.equal(r.error, null);
  assert.deepEqual(r.calls.map((c) => c.url), [
    'https://slack.com/api/files.getUploadURLExternal',
    UPLOAD_URL,
    'https://slack.com/api/files.completeUploadExternal',
  ]);
  const ticket = form(r.calls[0]);
  assert.equal(ticket.length, String(JPEG.length));
  assert.equal(ticket.filename, 'portal-feedback-2026-10-15-14-41.jpg');
  // The pre-signed upload URL gets the bytes and never the token.
  assert.ok(Buffer.from(r.calls[1].init.body).equals(JPEG));
  assert.equal(JSON.stringify(r.calls[1].init.headers).includes(TOKEN), false);
  const done = form(r.calls[2]);
  assert.equal(done.channel_id, 'C0FEEDBACK');
  assert.deepEqual(JSON.parse(done.files), [{id: 'F0SHOT',
    title: 'Screenshot'}]);
  assert.match(done.initial_comment, /^\*Portal feedback\* from Dana Hart/);
  assert.match(done.initial_comment, /The Book button did nothing\.$/);
});

test('a PNG screenshot with no note is enough', async () => {
  const r = await send({page: '/portal/family',
    image: {dataUrl: dataUrl('png', PNG)}});
  assert.equal(r.error, null);
  assert.equal(form(r.calls[0]).filename.endsWith('.png'), true);
  assert.match(form(r.calls[2]).initial_comment,
      /_No note - screenshot only\._$/);
});

test('who sent it comes from users/{uid}, never the payload', async () => {
  const r = await send(Object.assign({}, NOTE, {displayName: 'The Owner',
    role: 'owner', email: 'owner@example.com', uid: 'someone-else'}));
  const text = form(r.calls[0]).text;
  assert.match(text, /from Dana Hart \(parent, dana@example\.com\)/);
  assert.equal(text.includes('The Owner'), false);
  assert.equal(text.includes('owner@example.com'), false);
});

test('a users doc with no email falls back to the verified token', async () => {
  const r = await send(NOTE, {docs: {'users/u-dana': {role: 'coach'}}});
  assert.match(form(r.calls[0]).text,
      /from Unknown \(coach, token@example\.com\)/);
});

test('the token\'s name claim is never the sender\'s name', async () => {
  // Any user can set their own Auth display name from the browser.
  const auth = {uid: 'u-dana',
    token: {email: 'token@example.com', name: 'The Owner'}};
  const r = await send(NOTE, {auth,
    docs: {'users/u-dana': {role: 'parent', email: 'dana@example.com'}}});
  const text = form(r.calls[0]).text;
  assert.match(text, /from Unknown \(parent, dana@example\.com\)/);
  assert.equal(text.includes('The Owner'), false);
});

test('an account with no users doc is refused', async () => {
  const r = await send(NOTE, {docs: {}});
  assert.equal(r.error.code, 'permission-denied');
  assert.equal(r.error.details.reason, 'not-provisioned');
  assert.equal(r.calls.length, 0);
});

test('Slack control characters in any field are escaped', async () => {
  const r = await send(Object.assign({}, NOTE,
      {note: 'Hi <!channel> & <@U123> <https://evil.example|click>'}),
  {docs: {'users/u-dana': Object.assign({}, USER,
      {displayName: 'Dana <!here>'})}});
  const text = form(r.calls[0]).text;
  assert.equal(/[<>]/.test(text.replace(/&lt;|&gt;/g, '')), false);
  assert.match(text, /from Dana &lt;!here&gt;/);
  assert.match(text,
      /Hi &lt;!channel&gt; &amp; &lt;@U123&gt; &lt;https:\/\/evil/);
});

test('validation: a note or a screenshot is required', async () => {
  for (const data of [{}, {note: '   '}, null, 'text', {note: ''}]) {
    const r = await send(data);
    assert.equal(r.error.code, 'invalid-argument');
    assert.equal(r.error.details.reason, 'empty');
  }
});

test('validation: the note is capped at 2000 characters', async () => {
  const ok = await send({note: 'x'.repeat(feedback.MAX_NOTE)});
  assert.equal(ok.error, null);
  const r = await send({note: 'x'.repeat(feedback.MAX_NOTE + 1)});
  assert.equal(r.error.details.reason, 'note-too-long');
  assert.equal((await send({note: 42})).error.details.reason, 'bad-note');
});

test('validation: the page is capped at 300 characters', async () => {
  const r = await send({note: 'hi', page: `/portal/${'a'.repeat(300)}`});
  assert.equal(r.error.details.reason, 'bad-page');
  assert.equal(r.calls.length, 0);
});

test('the page keeps path and query, never a fragment or a secret',
    async () => {
      const page = '/portal/signin?mode=verifyEmail&oobCode=SECRET1&' +
          'apiKey=SECRET2&Token=SECRET3&code=SECRET4&session=SECRET5&' +
          'cs=SECRET7&Session_Id=SECRET8&tab=2#access_token=SECRET6';
      const r = await send({note: 'hi', page});
      const text = form(r.calls[0]).text;
      assert.match(text,
          /^Page: \/portal\/signin\?mode=verifyEmail&amp;tab=2$/m);
      assert.equal(/SECRET/.test(text), false);
      assert.equal(feedback.cleanPage('https://portal.rypacademy.com/portal/' +
          'billing?paid=1#x'), '/portal/billing?paid=1');
      // The dashboards' return from Stripe Checkout (checkout.js).
      assert.equal(feedback.cleanPage('/portal/family?paid=a1&cs=cs_live_1'),
          '/portal/family?paid=a1');
      assert.equal(feedback.cleanPage(''), '');
    });

test('validation: the image must be a real JPEG or PNG', async () => {
  const cases = [
    {dataUrl: dataUrl('jpeg', PNG)}, // says JPEG, is a PNG
    {dataUrl: dataUrl('png', Buffer.from('not an image at all, honestly'))},
    {dataUrl: `data:image/gif;base64,${JPEG.toString('base64')}`},
    {dataUrl: 'data:image/jpeg;base64,@@@@'},
    {dataUrl: 42},
    'data:image/jpeg;base64,abcd',
  ];
  for (const image of cases) {
    const r = await send({note: 'hi', image});
    assert.equal(r.error.code, 'invalid-argument');
    assert.equal(r.error.details.reason, 'bad-image');
    assert.equal(r.calls.length, 0);
  }
});

test('validation: the image is at most 2 MB decoded', async () => {
  const big = Buffer.concat([JPEG,
    Buffer.alloc(feedback.MAX_IMAGE_BYTES - JPEG.length + 1, 1)]);
  const r = await send({note: 'hi', image: {dataUrl: dataUrl('jpeg', big)}});
  assert.equal(r.error.details.reason, 'image-too-large');
  const huge = 'data:image/jpeg;base64,' + 'A'.repeat(3 * 1024 * 1024);
  const r2 = await send({note: 'hi', image: {dataUrl: huge}});
  assert.equal(r2.error.details.reason, 'image-too-large');
  const exact = Buffer.concat([JPEG,
    Buffer.alloc(feedback.MAX_IMAGE_BYTES - JPEG.length, 1)]);
  const r3 = await send({image: {dataUrl: dataUrl('jpeg', exact)}});
  assert.equal(r3.error, null);
});

test('rate limit: ten an hour, the eleventh refused, room again an hour ' +
    'later', async () => {
  const docs = {'users/u-dana': Object.assign({}, USER)};
  for (let i = 0; i < feedback.RATE_LIMIT; i += 1) {
    const at = new Date(NOW.getTime() + i * 60 * 1000);
    const r = await send({note: `n${i}`}, {docs, now: at});
    assert.equal(r.error, null, `send ${i + 1}`);
  }
  assert.equal(docs['feedbackLimits/u-dana'].sentAtMs.length, 10);
  const late = new Date(NOW.getTime() + 30 * 60 * 1000);
  const refused = await send({note: 'one more'}, {docs, now: late});
  assert.equal(refused.error.code, 'resource-exhausted');
  assert.equal(refused.error.details.reason, 'rate-limited');
  assert.match(refused.error.message, /Try again a little later\./);
  assert.equal(refused.calls.length, 0);
  // An hour after the first send, its slot is free again.
  const later = new Date(NOW.getTime() + feedback.RATE_WINDOW_MS + 1);
  const again = await send({note: 'later'}, {docs, now: later});
  assert.equal(again.error, null);
  assert.equal(docs['feedbackLimits/u-dana'].sentAtMs.length, 10);
  assert.equal(docs['feedbackLimits/u-dana'].sentAtMs.includes(
      NOW.getTime()), false);
});

test('rate limit: parallel sends that commit out of clock order still ' +
    'count (review 2026-10-15)', async () => {
  // Each request reads its clock before the users read, so a request with
  // an earlier clock can commit after one with a later clock.
  const docs = {'users/u-dana': Object.assign({}, USER)};
  for (let i = 0; i < feedback.RATE_LIMIT; i += 1) {
    const at = new Date(NOW.getTime() + (feedback.RATE_LIMIT - i) * 1000);
    const r = await send({note: `n${i}`}, {docs, now: at});
    assert.equal(r.error, null, `send ${i + 1}`);
  }
  assert.equal(docs['feedbackLimits/u-dana'].sentAtMs.length, 10);
  const eleventh = await send({note: 'one more'}, {docs, now: NOW});
  assert.equal(eleventh.error.code, 'resource-exhausted');
  assert.equal(eleventh.calls.length, 0);
});

test('a refused send gives back its own slot, never a later one',
    async () => {
      const later = NOW.getTime() + 5000;
      const docs = {'users/u-dana': Object.assign({}, USER),
        'feedbackLimits/u-dana': {sentAtMs: [later], updatedAtMs: later}};
      const slack = fakeSlack({answers: {'chat.postMessage':
          {ok: false, error: 'not_in_channel'}}});
      const r = await send(NOTE, {docs, slack, now: NOW});
      assert.equal(r.error.code, 'unavailable');
      assert.deepEqual(docs['feedbackLimits/u-dana'].sentAtMs, [later]);
    });

test('Slack ok:false is unavailable, logs the code, never the token, and ' +
    'gives the slot back', async () => {
  const docs = {'users/u-dana': Object.assign({}, USER),
    'feedbackLimits/u-dana': {sentAtMs: [NOW.getTime() - 1000],
      updatedAtMs: NOW.getTime() - 1000}};
  const slack = fakeSlack({answers: {'chat.postMessage':
      {ok: false, error: 'not_in_channel'}}});
  const r = await send(NOTE, {docs, slack});
  assert.equal(r.error.code, 'unavailable');
  assert.equal(r.error.details.reason, 'slack-error');
  assert.equal(r.error.message,
      'Feedback could not be sent right now. Try again in a minute.');
  assert.ok(r.logs.some((l) => /chat\.postMessage failed: not_in_channel/
      .test(l)));
  assert.equal(r.logs.some((l) => l.includes(TOKEN)), false);
  assert.deepEqual(docs['feedbackLimits/u-dana'].sentAtMs,
      [NOW.getTime() - 1000]);
});

test('a failed upload step is unavailable too, and logs no image',
    async () => {
      const image = {dataUrl: dataUrl('jpeg', JPEG)};
      for (const slack of [
        fakeSlack({answers: {'files.getUploadURLExternal':
          {ok: false, error: 'missing_scope'}}}),
        fakeSlack({uploadStatus: 500}),
        fakeSlack({answers: {'files.completeUploadExternal':
          {ok: false, error: 'channel_not_found'}}}),
        fakeSlack({answers: {'files.getUploadURLExternal':
          {ok: true, upload_url: 'http://insecure.example/x', file_id: 'F1'}}}),
      ]) {
        const r = await send({note: 'hi', image}, {slack});
        assert.equal(r.error.code, 'unavailable');
        const b64 = JPEG.toString('base64');
        assert.equal(r.logs.some((l) => l.includes(b64) || l.includes(TOKEN)),
            false);
      }
    });

test('a network failure is unavailable', async () => {
  const r = await send(NOTE, {slack: fakeSlack({throws: true})});
  assert.equal(r.error.code, 'unavailable');
  assert.equal(r.logs.some((l) => l.includes(TOKEN)), false);
});

test('missing token or channel: failed-precondition, nothing touched',
    async () => {
      for (const env of [{SLACK_FEEDBACK_CHANNEL: 'C1'},
        {SLACK_FEEDBACK_TOKEN: TOKEN}, {SLACK_FEEDBACK_TOKEN: ' ',
          SLACK_FEEDBACK_CHANNEL: 'C1'}]) {
        const docs = {'users/u-dana': Object.assign({}, USER)};
        const r = await send(NOTE, {env, docs});
        assert.equal(r.error.code, 'failed-precondition');
        assert.equal(r.error.message, 'Feedback is not set up yet.');
        assert.equal(r.calls.length, 0);
        assert.equal('feedbackLimits/u-dana' in docs, false);
      }
    });

test('shortAgent names the common phones and browsers', () => {
  const a = feedback.shortAgent;
  assert.equal(a('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/' +
      '537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36'),
  'Android 14, Chrome 129');
  assert.equal(a('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/' +
      '537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 ' +
      'Edg/129.0.0.0'), 'Windows, Edge 129');
  assert.equal(a('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) ' +
      'AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0 Mobile/15E148 ' +
      'Safari/604.1'), 'iPhone (iOS 18.0), Chrome 129');
  assert.equal(a(''), 'unknown device');
  assert.equal(a('curl/8.4.0'), 'curl/8.4.0');
});

test('the export binds exactly the Slack token', () => {
  const ep = feedback.submitFeedback.__endpoint || {};
  assert.deepEqual((ep.secretEnvironmentVariables || []).map((s) => s.key),
      ['SLACK_FEEDBACK_TOKEN']);
  assert.ok(ep.callableTrigger, 'a callable');
});

run();
