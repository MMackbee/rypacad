'use strict';
// openBillingPortal: "Manage billing in Stripe" on the Billing screen.
// Stripe is a stand-in - no test reaches Stripe - and Firestore is
// fake-firestore's map.
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const {fakeDb} = require('./fake-firestore');
const portal = require('./billing-portal');

const NOW = new Date('2026-11-17T15:00:00Z');
const PROD = 'https://portal.rypacademy.com';
const STAGING = 'https://rypacad.ryptest.com';
const SESSION_URL = 'https://billing.stripe.com/p/session/test_SECRETSESSION';
const CUSTOMER = 'cus_TESTPARENT9f3a';
const SELF_CUSTOMER = 'cus_TESTSELFb7c2';

/**
 * Two families and the staff: hh-a (a parent, a child's own login, Stripe
 * customer), hh-self (an 18+ athlete who signed up for themselves), hh-b
 * (a parent, never paid, only an older customer id).
 * @return {!Object} `{'collection/id': body}`.
 */
function world() {
  return {
    'users/u-parent': {role: 'parent', householdId: 'hh-a', athleteId: null},
    'users/u-child': {role: 'athlete', householdId: 'hh-a',
      athleteId: 'ath-child'},
    'users/u-self': {role: 'athlete', householdId: 'hh-self',
      athleteId: 'ath-self'},
    'users/u-other': {role: 'parent', householdId: 'hh-b', athleteId: null},
    'users/u-owner': {role: 'owner', householdId: 'hh-a'},
    'users/u-ops': {role: 'ops', householdId: 'hh-a'},
    'users/u-coach': {role: 'coach'},
    'users/u-specialist': {role: 'specialist', specialistId: 'sp-1'},
    'users/u-nohh': {role: 'parent', householdId: null},
    'athletes/ath-child': {householdId: 'hh-a', name: 'Child A'},
    'athletes/ath-self': {householdId: 'hh-self', name: 'Adult Self'},
    'households/hh-a': {name: 'Family A', createdBy: 'u-parent',
      stripeCustomerId: CUSTOMER, stripeCustomerIds: ['cus_OLDERa111']},
    'households/hh-self': {name: 'Self', createdBy: 'u-self',
      stripeCustomerId: SELF_CUSTOMER},
    'households/hh-b': {name: 'Family B', createdBy: 'u-other',
      stripeCustomerId: null, stripeCustomerIds: ['cus_OLDERb222']},
  };
}

/**
 * A stand-in Stripe: records each billingPortal.sessions.create.
 * @param {?Error=} throws What create throws, if anything.
 * @return {{client: !Object, calls: !Array<!Object>}} The fake.
 */
function fakeStripe(throws) {
  const calls = [];
  const client = {billingPortal: {sessions: {create: async (params) => {
    calls.push(params);
    if (throws) throw throws;
    return {id: 'bps_test_1', url: SESSION_URL, customer: params.customer};
  }}}};
  return {client, calls};
}

/**
 * A Stripe SDK error as the SDK throws it.
 * @param {string} type e.g. 'StripeInvalidRequestError'.
 * @param {string} message Stripe's message.
 * @param {string=} code Stripe's code.
 * @return {!Error} The error.
 */
function stripeError(type, message, code) {
  return Object.assign(new Error(message), {type, code,
    rawType: 'invalid_request_error'});
}

/**
 * One call through the handler, with console output captured.
 * @param {*} data The payload.
 * @param {!Object=} opts `{uid, docs, stripe, origin, env, now, raw}`.
 * @return {!Promise<!Object>} `{result, error, docs, calls, logs}`.
 */
async function open(data, opts) {
  const o = opts || {};
  const docs = o.docs || world();
  const stripe = o.stripe || fakeStripe();
  const logs = [];
  const keep = {log: console.log, error: console.error, warn: console.warn};
  console.log = (...a) => logs.push(a.join(' '));
  console.error = (...a) => logs.push(a.join(' '));
  console.warn = (...a) => logs.push(a.join(' '));
  const uid = 'uid' in o ? o.uid : 'u-parent';
  const context = {auth: uid ? {uid, token: {}} : null};
  if (o.raw !== undefined) context.rawRequest = o.raw;
  else {
    context.rawRequest = {headers: {origin: 'origin' in o ? o.origin :
      PROD}};
  }
  let result = null;
  let error = null;
  try {
    result = await portal.openBillingPortalHandler(data, context,
        {db: fakeDb(docs), stripe: stripe.client, env: o.env || {},
          now: o.now || NOW});
  } catch (err) {
    error = err;
  } finally {
    console.log = keep.log;
    console.error = keep.error;
    console.warn = keep.warn;
  }
  return {result, error, docs, calls: stripe.calls, logs};
}

/**
 * @param {!Object} r A result of open().
 * @param {string} code The HttpsError code.
 * @param {string} reason The details.reason.
 */
function refused(r, code, reason) {
  assert.ok(r.error, `expected a refusal (${reason})`);
  assert.equal(r.error.code, code);
  assert.equal(r.error.details && r.error.details.reason, reason);
  assert.equal(typeof r.error.message, 'string');
  assert.ok(r.error.message.length > 10, 'a plain-language message');
}

// ---- who ------------------------------------------------------------------

test('signed out is refused before anything is read or called', async () => {
  const r = await open({}, {uid: null});
  refused(r, 'unauthenticated', 'signed-out');
  assert.equal(r.calls.length, 0);
});

test('the household parent gets a portal session for its own customer',
    async () => {
      const r = await open({});
      assert.equal(r.error, null);
      assert.deepEqual(r.result, {url: SESSION_URL});
      assert.equal(r.calls.length, 1);
      assert.deepEqual(r.calls[0], {customer: CUSTOMER,
        return_url: `${PROD}/portal/billing`});
    });

test('the 18+ athlete who signed up for themselves (household createdBy) ' +
    'gets their own household\'s portal', async () => {
  const r = await open({}, {uid: 'u-self'});
  assert.equal(r.error, null);
  assert.deepEqual(r.result, {url: SESSION_URL});
  assert.equal(r.calls[0].customer, SELF_CUSTOMER);
});

test('a child\'s own login in a parent\'s household is refused (the payer ' +
    'is the parent)', async () => {
  const r = await open({}, {uid: 'u-child'});
  refused(r, 'permission-denied', 'not-payer');
  assert.equal(r.calls.length, 0);
});

test('a parent of ANOTHER household never reaches this one\'s customer, ' +
    'whatever the payload names', async () => {
  const r = await open({householdId: 'hh-a', customer: CUSTOMER},
      {uid: 'u-other'});
  // hh-b has never paid (only an older id): refused, and Stripe never
  // sees hh-a's customer.
  refused(r, 'failed-precondition', 'no-customer');
  assert.equal(r.calls.length, 0);
  assert.ok(!r.logs.join('\n').includes('hh-a'));
});

test('a parent of another household that HAS a customer gets only its own',
    async () => {
      const docs = world();
      docs['households/hh-b'].stripeCustomerId = 'cus_TESTOTHERd4e5';
      const r = await open({householdId: 'hh-a'}, {uid: 'u-other', docs});
      assert.equal(r.error, null);
      assert.equal(r.calls[0].customer, 'cus_TESTOTHERd4e5');
    });

test('staff roles are refused, even with a householdId on their users doc',
    async () => {
      for (const uid of ['u-owner', 'u-ops', 'u-coach', 'u-specialist']) {
        const r = await open({}, {uid});
        refused(r, 'permission-denied', 'not-payer');
        assert.equal(r.calls.length, 0, uid);
      }
    });

test('a login with no users doc, or a parent with no household, is refused',
    async () => {
      refused(await open({}, {uid: 'u-ghost'}), 'permission-denied',
          'not-payer');
      refused(await open({}, {uid: 'u-nohh'}), 'permission-denied',
          'not-payer');
    });

test('an athlete login whose household was not created by them is refused ' +
    'even when it names itself the household', async () => {
  const docs = world();
  docs['households/hh-self'].createdBy = 'u-someone-else';
  const r = await open({}, {uid: 'u-self', docs});
  refused(r, 'permission-denied', 'not-payer');
});

// ---- the customer ---------------------------------------------------------

test('no primary stripeCustomerId: no-customer, and the older ' +
    'stripeCustomerIds are never used', async () => {
  const docs = world();
  docs['households/hh-a'].stripeCustomerId = null;
  const r = await open({}, {docs});
  refused(r, 'failed-precondition', 'no-customer');
  assert.equal(r.calls.length, 0);
  const blank = world();
  blank['households/hh-a'].stripeCustomerId = '  ';
  refused(await open({}, {docs: blank}), 'failed-precondition',
      'no-customer');
});

// ---- where Stripe sends them back -----------------------------------------

test('return_url: production and staging origins are kept', async () => {
  const prod = await open({}, {origin: PROD});
  assert.equal(prod.calls[0].return_url, `${PROD}/portal/billing`);
  const staging = await open({}, {origin: STAGING});
  assert.equal(staging.calls[0].return_url, `${STAGING}/portal/billing`);
});

test('return_url: a hostile or missing origin falls back to production',
    async () => {
      for (const origin of ['https://evil.example', 'https://portal.rypacademy.com.evil.example',
        'http://portal.rypacademy.com', 'null', '', undefined]) {
        const r = await open({}, {origin});
        assert.equal(r.calls[0].return_url, `${PROD}/portal/billing`,
            String(origin));
      }
      const noRaw = await open({}, {raw: null});
      assert.equal(noRaw.calls[0].return_url, `${PROD}/portal/billing`);
      const noHeaders = await open({}, {raw: {}});
      assert.equal(noHeaders.calls[0].return_url, `${PROD}/portal/billing`);
    });

test('return_url: localhost:3005 only under the Functions emulator',
    async () => {
      for (const origin of ['http://localhost:3005', 'http://127.0.0.1:3005']) {
        const live = await open({}, {origin});
        assert.equal(live.calls[0].return_url, `${PROD}/portal/billing`);
        const emu = await open({}, {origin, env: {FUNCTIONS_EMULATOR: 'true'}});
        assert.equal(emu.calls[0].return_url, `${origin}/portal/billing`);
      }
      const other = await open({}, {origin: 'http://localhost:3000',
        env: {FUNCTIONS_EMULATOR: 'true'}});
      assert.equal(other.calls[0].return_url, `${PROD}/portal/billing`);
    });

test('returnPath: a client URL is never trusted; the Billing path is used',
    async () => {
      for (const returnPath of ['https://evil.example/x', '//evil.example',
        '/portal/billing/../../x', '/portal/admin', '/portal/billing']) {
        const r = await open({returnPath});
        assert.equal(r.error, null, returnPath);
        assert.equal(r.calls[0].return_url, `${PROD}/portal/billing`);
      }
      refused(await open({returnPath: 42}), 'invalid-argument', 'bad-request');
      refused(await open({returnPath: {}}), 'invalid-argument', 'bad-request');
    });

// ---- Stripe ----------------------------------------------------------------

test('a Stripe failure is unavailable / stripe-error, with no retry',
    async () => {
      const stripe = fakeStripe(stripeError('StripeInvalidRequestError',
          `No such customer: '${CUSTOMER}'`, 'resource_missing'));
      const r = await open({}, {stripe});
      refused(r, 'unavailable', 'stripe-error');
      assert.equal(stripe.calls.length, 1);
      const down = fakeStripe(stripeError('StripeConnectionError',
          'An error occurred with our connection to Stripe.'));
      refused(await open({}, {stripe: down}), 'unavailable', 'stripe-error');
      assert.equal(down.calls.length, 1);
    });

test('no customer portal configured in Stripe: failed-precondition / ' +
    'portal-not-set-up, in plain words', async () => {
  const stripe = fakeStripe(stripeError('StripeInvalidRequestError',
      'No configuration provided and your live mode default configuration ' +
      'has not been created. Provide a configuration or create your ' +
      'default by saving your customer portal settings in live mode at ' +
      'https://dashboard.stripe.com/settings/billing/portal.'));
  const r = await open({}, {stripe});
  refused(r, 'failed-precondition', 'portal-not-set-up');
  assert.ok(!/dashboard\.stripe\.com|configuration/i.test(r.error.message),
      'the family never reads Stripe\'s dashboard instructions');
});

test('a Stripe answer with no https url is a stripe-error', async () => {
  const stripe = fakeStripe();
  stripe.client.billingPortal.sessions.create = async () => ({url: null});
  refused(await open({}, {stripe}), 'unavailable', 'stripe-error');
});

// ---- the rate limit --------------------------------------------------------

test('ten opens per login per ten minutes; the eleventh is refused, and ' +
    'the window rolls', async () => {
  const docs = world();
  const stripe = fakeStripe();
  for (let i = 0; i < 10; i += 1) {
    const r = await open({}, {docs, stripe,
      now: new Date(NOW.getTime() + i * 1000)});
    assert.equal(r.error, null, `open ${i + 1}`);
  }
  const eleventh = await open({}, {docs, stripe,
    now: new Date(NOW.getTime() + 11000)});
  refused(eleventh, 'resource-exhausted', 'rate-limited');
  assert.equal(stripe.calls.length, 10, 'no Stripe call when refused');
  const limit = docs['billingPortalLimits/u-parent'];
  assert.equal(limit.openedAtMs.length, 10);
  // Another login keeps its own ten.
  const self = await open({}, {docs, stripe, uid: 'u-self',
    now: new Date(NOW.getTime() + 12000)});
  assert.equal(self.error, null);
  // Ten minutes after the first, its slot is free again.
  const later = await open({}, {docs, stripe,
    now: new Date(NOW.getTime() + 10 * 60 * 1000 + 1)});
  assert.equal(later.error, null);
});

test('refusals before Stripe (no customer) take no slot', async () => {
  const docs = world();
  docs['households/hh-a'].stripeCustomerId = null;
  await open({}, {docs});
  assert.equal(docs['billingPortalLimits/u-parent'], undefined);
});

// ---- the log ----------------------------------------------------------------

test('one log line per call: never the session url, never the full ' +
    'customer id', async () => {
  const ok = await open({});
  assert.equal(ok.logs.length, 1);
  assert.match(ok.logs[0],
      /^openBillingPortal: ok uid=u-parent household=hh-a /);
  assert.ok(ok.logs[0].includes('9f3a'), 'the last 4 of the customer');
  const failing = await open({}, {stripe: fakeStripe(stripeError(
      'StripeInvalidRequestError', `No such customer: '${CUSTOMER}'`,
      'resource_missing'))});
  assert.equal(failing.logs.length, 1);
  assert.match(failing.logs[0], new RegExp('^openBillingPortal: error ' +
      'uid=u-parent household=hh-a .*reason=stripe-error'));
  const denied = await open({}, {uid: 'u-child'});
  assert.equal(denied.logs.length, 1);
  assert.match(denied.logs[0],
      /^openBillingPortal: error uid=u-child .*reason=not-payer/);
  for (const line of [...ok.logs, ...failing.logs, ...denied.logs]) {
    assert.ok(!line.includes(SESSION_URL), line);
    assert.ok(!line.includes('test_SECRETSESSION'), line);
    assert.ok(!line.includes(CUSTOMER), line);
    assert.ok(!line.includes('TESTPARENT'), line);
  }
});

test('the callable binds STRIPE_SECRET_KEY like createCheckoutSession',
    () => {
      const ep = portal.openBillingPortal.__endpoint || {};
      const got = (ep.secretEnvironmentVariables || []).map((s) => s.key);
      assert.deepEqual(got, ['STRIPE_SECRET_KEY']);
    });

run();
